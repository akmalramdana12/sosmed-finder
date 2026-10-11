import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PublicProfile } from "./public-profile";

export const metadata: Metadata = { title: "Profil · Social Finder", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <AppShell>
      <PublicProfile />
    </AppShell>
  );
}
