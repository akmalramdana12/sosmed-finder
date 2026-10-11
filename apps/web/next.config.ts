import { resolve } from "node:path";
import type { NextConfig } from "next";

// CSP halaman (bernonce) dikirim oleh middleware.ts per request. Di sini hanya header statis.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Image Docker: server minimal (.next/standalone). Root tracing = root monorepo (build berjalan dari apps/web) agar paket workspace ikut.
  output: "standalone",
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@social-finder/api",
    "@social-finder/database",
    "@social-finder/types",
    "@social-finder/validation",
  ],
  // Paket native/server-only tidak boleh di-bundle oleh Next.
  serverExternalPackages: ["@node-rs/argon2", "ioredis", "@prisma/client"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Respons API (JSON) tidak boleh memuat atau menjalankan apa pun.
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
    ];
  },
};

export default nextConfig;
