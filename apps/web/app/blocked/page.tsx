import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { BlockedList } from "./blocked-list";

export const metadata: Metadata = { title: "Diblokir · Social Finder", robots: { index: false } };

export default function BlockedPage() {
  return (
    <AppShell width="max-w-xl">
      <BlockedList />
    </AppShell>
  );
}
