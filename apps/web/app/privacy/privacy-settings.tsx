"use client";

import type { LocationVisibility, PrivacyDto } from "@social-finder/types";
import Link from "next/link";
import { useState } from "react";
import { Notice, Section, Toggle } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { useApiData } from "@/lib/client/use-api";

const VISIBILITY_LABEL: Record<LocationVisibility, string> = {
  PRIVATE: "Privat (tidak ditampilkan)",
  AREA_ONLY: "Hanya area",
  CITY_ONLY: "Hanya kota",
  DISCOVERABLE_RADIUS: "Bisa dicari berdasarkan radius",
};

export function PrivacySettings() {
  const { state, setData } = useApiData<PrivacyDto>("/api/me/privacy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.kind === "loading") return <Notice kind="info">Memuat…</Notice>;
  if (state.kind === "error") return <Notice kind="error">{state.message}</Notice>;
  const privacy = state.data;

  async function update(patch: Partial<Pick<PrivacyDto, "isDiscoverable" | "searchableByUsername" | "showPlatforms">>) {
    setBusy(true);
    setError(null);
    const result = await apiRequest<{ data: PrivacyDto }>("/api/me/privacy", { method: "PATCH", body: patch });
    setBusy(false);
    if (result.ok) setData(result.data.data);
    else setError(result.message);
  }

  return (
    <div className="space-y-10">
      <Section title="Privasi" description="Secara bawaan Anda tidak bisa ditemukan siapa pun. Semua di bawah ini pilihan Anda dan berlaku segera.">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {privacy.isEffectivelyDiscoverable ? (
          <Notice kind="success">Anda bisa ditemukan sekarang.</Notice>
        ) : privacy.isDiscoverable ? (
          <Notice kind="info">Saklar utama aktif, tetapi belum ada akun sosmed yang diizinkan ditemukan, jadi Anda belum muncul di pencarian.</Notice>
        ) : (
          <Notice kind="info">Anda tidak bisa ditemukan. Aktifkan saklar utama untuk ikut.</Notice>
        )}
        <div className="space-y-5">
          <Toggle
            id="isDiscoverable"
            label="Izinkan saya ditemukan"
            description="Saklar utama. Mati = tidak muncul di pencarian mana pun."
            checked={privacy.isDiscoverable}
            disabled={busy}
            onChange={(next) => void update({ isDiscoverable: next })}
          />
          <Toggle
            id="searchableByUsername"
            label="Bisa dicari lewat username"
            description="Mati = pencarian username (persis atau awalan) tidak menemukan Anda."
            checked={privacy.searchableByUsername}
            disabled={busy}
            onChange={(next) => void update({ searchableByUsername: next })}
          />
          <Toggle
            id="showPlatforms"
            label="Tampilkan daftar platform saya"
            description="Mati = platform dan username sosmed Anda disembunyikan, dan Anda tidak cocok pada pencarian berdasarkan platform."
            checked={privacy.showPlatforms}
            disabled={busy}
            onChange={(next) => void update({ showPlatforms: next })}
          />
        </div>
        <p className="text-sm text-neutral-600">
          Akun sosmed yang boleh ditemukan: {privacy.discoverableAccountCount}.{" "}
          <Link href="/accounts" className="font-medium text-neutral-900 underline underline-offset-2">
            Atur akun
          </Link>
        </p>
      </Section>

      <Section title="Lokasi">
        <p className="text-sm text-neutral-700">Visibilitas saat ini: {VISIBILITY_LABEL[privacy.locationVisibility]}.</p>
        <p className="text-sm">
          <Link href="/location" className="font-medium text-neutral-900 underline underline-offset-2">
            Atur lokasi
          </Link>
        </p>
      </Section>
    </div>
  );
}
