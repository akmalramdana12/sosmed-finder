import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce } from "@/lib/csp";

/**
 * CSP bernonce untuk halaman (bukan /api dan aset statis). Nonce dibuat per request dan dikirim lewat
 * header request `x-nonce` serta CSP request, yang dibaca Next.js untuk menempelkan nonce ke skripnya.
 * Halaman harus dirender dinamis (lihat `dynamic` di layout), kalau tidak skrip inline tanpa nonce diblokir.
 *
 * Saklar darurat: CSP_REPORT_ONLY=true mengirim header Report-Only (tidak memblokir, hanya melaporkan
 * di konsol browser). Dipakai bila CSP ini memecahkan halaman di lingkungan Anda.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp({ nonce, isProd: process.env["NODE_ENV"] === "production" });
  const header =
    process.env["CSP_REPORT_ONLY"] === "true"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(header, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
