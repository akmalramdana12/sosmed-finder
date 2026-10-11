import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Accounts } from "./accounts";

export const metadata: Metadata = { title: "Akun sosmed · Social Finder", robots: { index: false } };

export default function AccountsPage() {
  return (
    <AppShell>
      <Accounts />
    </AppShell>
  );
}
