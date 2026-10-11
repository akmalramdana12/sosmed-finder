import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SearchPage } from "./search-page";

export const metadata: Metadata = { title: "Cari · Social Finder", robots: { index: false } };

export default function Page() {
  return (
    <AppShell width="max-w-3xl">
      <SearchPage />
    </AppShell>
  );
}
