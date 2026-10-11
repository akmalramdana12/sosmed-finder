import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = { title: "Akun saya · Social Finder", robots: { index: false } };

export default function DashboardPage() {
  return (
    <AppShell width="max-w-xl">
      <Dashboard />
    </AppShell>
  );
}
