import { createHash, createHmac, randomBytes } from "node:crypto";

/** Token sesi acak 256-bit (43 karakter base64url). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash yang disimpan di DB. Token berentropi tinggi, jadi SHA-256 cukup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * HMAC untuk pengenal yang tidak boleh tersimpan mentah (IP, email di key rate limit).
 * Memakai secret server agar tidak bisa dibalik dengan tabel IPv4.
 */
export function hashIdentifier(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
