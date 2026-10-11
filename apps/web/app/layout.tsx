import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Nonce CSP dibuat per request oleh middleware: halaman harus dirender dinamis agar Next menempelkannya.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Social Finder",
  description: "Temukan profil sosial media yang memilih untuk dapat ditemukan.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
