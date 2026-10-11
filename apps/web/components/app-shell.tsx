"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiRequest } from "@/lib/client/api";

const NAV = [
  { href: "/search", label: "Cari" },
  { href: "/profile", label: "Profil" },
  { href: "/accounts", label: "Akun sosmed" },
  { href: "/privacy", label: "Privasi" },
  { href: "/location", label: "Lokasi" },
  { href: "/blocked", label: "Diblokir" },
  { href: "/dashboard", label: "Akun" },
] as const;

/** Kerangka halaman untuk pengguna yang login: navigasi + keluar. Halaman anak memuat datanya sendiri. */
export function AppShell({ children, width = "max-w-2xl" }: { children: ReactNode; width?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-900">
            Social Finder
          </Link>
          <nav aria-label="Navigasi utama" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={active ? "font-semibold text-neutral-900 underline underline-offset-4" : "text-neutral-600 hover:text-neutral-900"}
                >
                  {item.label}
                </Link>
              );
            })}
            <button type="button" onClick={() => void logout()} className="text-neutral-600 hover:text-neutral-900">
              Keluar
            </button>
          </nav>
        </div>
      </header>
      <main className={`mx-auto w-full ${width} px-5 py-8`}>{children}</main>
    </div>
  );
}
