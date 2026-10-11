import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LocationSettings } from "./location-settings";

export const metadata: Metadata = { title: "Lokasi · Social Finder", robots: { index: false } };

export default function LocationPage() {
  return (
    <AppShell width="max-w-xl">
      <LocationSettings />
    </AppShell>
  );
}
