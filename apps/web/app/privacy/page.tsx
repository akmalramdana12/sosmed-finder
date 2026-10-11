import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PrivacySettings } from "./privacy-settings";

export const metadata: Metadata = { title: "Privasi · Social Finder", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <AppShell width="max-w-xl">
      <PrivacySettings />
    </AppShell>
  );
}
