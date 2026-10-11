import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profil · Social Finder", robots: { index: false } };

export default function ProfilePage() {
  return (
    <AppShell width="max-w-xl">
      <ProfileForm />
    </AppShell>
  );
}
