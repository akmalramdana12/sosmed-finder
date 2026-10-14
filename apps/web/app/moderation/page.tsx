import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ModerationQueue } from "./moderation-queue";

export const metadata: Metadata = { title: "Moderasi · Social Finder", robots: { index: false } };

export default function ModerationPage() {
  return (
    <AppShell width="max-w-3xl">
      <ModerationQueue />
    </AppShell>
  );
}
