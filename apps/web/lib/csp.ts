/**
 * Content-Security-Policy per request dengan nonce. Dengan 'nonce-…' + 'strict-dynamic', hanya skrip
 * yang membawa nonce (dan yang dimuatnya) yang boleh jalan: skrip inline hasil injeksi XSS ditolak.
 *
 * style-src masih 'unsafe-inline' (dibutuhkan Next/Tailwind untuk style inline). Risikonya jauh lebih
 * kecil daripada skrip inline, tetapi bukan nol: injeksi CSS bisa mengubah tampilan/menarik data lewat
 * selector. Diperketat bila UI sudah ada dan bisa diuji.
 */

export interface CspOptions {
  nonce: string;
  isProd: boolean;
}

/** Nonce acak 128-bit (UUID v4) dalam base64. Satu per request; tidak boleh dipakai ulang. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildCsp({ nonce, isProd }: CspOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  // Next dev memakai eval untuk source map/HMR. Tidak pernah di production.
  if (!isProd) scriptSrc.push("'unsafe-eval'");

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isProd) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
