interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Perlindungan CSRF untuk request yang mengubah state: Origin (atau Referer) harus
 * salah satu origin yang diizinkan. Request tanpa keduanya ditolak.
 * Berlapis dengan cookie SameSite=Lax.
 */
export function isSameOrigin(headers: HeaderReader, allowedOrigins: readonly string[]): boolean {
  const origin = headers.get("origin");
  if (origin) return allowedOrigins.includes(origin);
  const referer = headers.get("referer");
  if (referer) {
    try {
      return allowedOrigins.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * IP klien untuk rate limit. X-Forwarded-For hanya dipercaya bila `trustProxy`
 * (asumsi tepat satu reverse proxy tepercaya yang MENAMBAHKAN IP di akhir daftar,
 * sehingga entri terakhir adalah yang dilihat proxy, bukan yang dikirim klien).
 */
export function getClientIp(headers: HeaderReader, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = headers.get("x-forwarded-for");
    const last = forwarded?.split(",").at(-1)?.trim();
    if (last) return last;
  }
  return "unknown";
}
