/** Prefix __Host- mensyaratkan Secure, Path=/, tanpa Domain, sehingga tidak bisa ditimpa subdomain. */
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-sf_session" : "sf_session";
}

export function serializeSessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const parts = [
    `${sessionCookieName(secure)}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearedSessionCookie(secure: boolean): string {
  const parts = [
    `${sessionCookieName(secure)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

/** Ambil token sesi dari header Cookie. Mengembalikan null bila tidak ada atau bentuknya salah. */
export function readSessionToken(
  cookieHeader: string | null | undefined,
  secure: boolean,
): string | null {
  if (!cookieHeader) return null;
  const name = sessionCookieName(secure);
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : null;
  }
  return null;
}
