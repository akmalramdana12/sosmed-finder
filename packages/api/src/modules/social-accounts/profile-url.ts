export class InvalidProfileUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidProfileUrlError";
  }
}

/** Sama dengan skema validasi, diulang di sini sebagai pertahanan berlapis. */
const SAFE_USERNAME = /^[A-Za-z0-9_](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$/;

/** https://HOST/PATH — placeholder hanya boleh di PATH, tidak pernah di host. */
const TEMPLATE_SHAPE = /^https:\/\/([^/?#{}@:]+)(\/[^?#]*)$/;

/**
 * Bangun profileUrl dari template platform. SATU-SATUNYA jalan membuat profileUrl:
 * URL tidak pernah berasal dari input pengguna, dan host selalu sama dengan host template.
 */
export function buildProfileUrl(template: string, username: string): string {
  if (!SAFE_USERNAME.test(username) || username.length > 50) {
    throw new InvalidProfileUrlError("username tidak aman");
  }
  const shape = TEMPLATE_SHAPE.exec(template);
  const host = shape?.[1];
  const path = shape?.[2];
  if (!host || !path || path.split("{username}").length !== 2) {
    throw new InvalidProfileUrlError("template platform tidak valid");
  }

  const url = new URL(`https://${host}${path.replace("{username}", encodeURIComponent(username))}`);
  if (url.protocol !== "https:" || url.hostname !== host.toLowerCase()) {
    throw new InvalidProfileUrlError("host URL tidak sesuai template");
  }
  return url.toString();
}
