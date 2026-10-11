"use client";

import { LOCATION_VISIBILITY, type AccuracyLevel, type LocationDto, type LocationVisibility } from "@social-finder/types";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice, Section, Select, SubmitButton, Toggle } from "@/components/ui";
import { apiRequest } from "@/lib/client/api";
import { useApiData } from "@/lib/client/use-api";

const VISIBILITY_LABEL: Record<LocationVisibility, string> = {
  PRIVATE: "Privat: tidak ditampilkan ke siapa pun",
  AREA_ONLY: "Hanya area (mis. nama kecamatan)",
  CITY_ONLY: "Hanya kota",
  DISCOVERABLE_RADIUS: "Bisa dicari berdasarkan radius (jarak dibulatkan)",
};

const ACCURACY_LABEL: Record<AccuracyLevel, string> = {
  AREA: "Area (±2 km)",
  CITY: "Kota (±10 km)",
};

type Msg = { kind: "success" | "error"; text: string };

/** Koordinat hanya hidup di variabel lokal fungsi ini: tidak masuk state, tidak ditampilkan, tidak dicatat. */
function readDevicePosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable")),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

const GEO_ERROR: Record<string, string> = {
  unsupported: "Perangkat atau browser ini tidak mendukung lokasi.",
  denied: "Izin lokasi ditolak. Anda bisa mengizinkannya lewat pengaturan situs di browser, lalu coba lagi.",
  unavailable: "Lokasi tidak bisa dibaca saat ini. Coba lagi.",
};

export function LocationSettings() {
  const { state, setData } = useApiData<LocationDto | null>("/api/me/location");
  const [message, setMessage] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.kind === "loading") return <Notice kind="info">Memuat…</Notice>;
  if (state.kind === "error") return <Notice kind="error">{state.message}</Notice>;
  const location = state.data;

  async function saveDevicePosition(accuracyLevel: AccuracyLevel, visibility: LocationVisibility | undefined) {
    setBusy(true);
    setMessage(null);
    try {
      const { latitude, longitude } = await readDevicePosition();
      const body: Record<string, unknown> = { latitude, longitude, accuracyLevel };
      if (visibility !== undefined) body["visibility"] = visibility;
      const result = await apiRequest<{ data: LocationDto }>("/api/me/location", { method: "PUT", body });
      if (result.ok) {
        setData(result.data.data);
        setMessage({ kind: "success", text: "Lokasi perkiraan disimpan. Titik tepat Anda tidak disimpan." });
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    } catch (error) {
      setMessage({ kind: "error", text: GEO_ERROR[error instanceof Error ? error.message : ""] ?? GEO_ERROR["unavailable"] ?? "Lokasi tidak bisa dibaca." });
    }
    setBusy(false);
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const result = await apiRequest<{ data: LocationDto }>("/api/me/location", { method: "PATCH", body });
    setBusy(false);
    if (result.ok) {
      setData(result.data.data);
      setMessage({ kind: "success", text: "Pengaturan lokasi disimpan." });
    } else {
      setMessage({ kind: "error", text: result.message });
    }
  }

  async function remove() {
    if (!window.confirm("Hapus lokasi Anda? Visibilitas kembali ke Privat.")) return;
    setBusy(true);
    setMessage(null);
    const result = await apiRequest("/api/me/location", { method: "DELETE" });
    setBusy(false);
    if (result.ok) {
      setData(null);
      setMessage({ kind: "success", text: "Lokasi dihapus." });
    } else {
      setMessage({ kind: "error", text: result.message });
    }
  }

  return (
    <div className="space-y-10">
      <Section title="Lokasi" description="Opsional dan mati secara bawaan. Anda memutuskan apakah dan seberapa jauh lokasi perkiraan Anda terlihat.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Server membulatkan titik Anda ke kotak besar (±2 km atau ±10 km) sebelum menyimpannya; titik tepat tidak disimpan.</li>
          <li>Koordinat tidak pernah ditampilkan, ke Anda maupun orang lain. Orang lain hanya melihat label atau jarak yang dibulatkan, sesuai pilihan Anda.</li>
          <li>Pembaruan titik dibatasi 5 kali per hari.</li>
        </ul>
        {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      </Section>

      {location === null ? (
        <FirstTimeForm busy={busy} onSubmit={saveDevicePosition} />
      ) : (
        <ExistingSettings location={location} busy={busy} onPatch={patch} onRefresh={saveDevicePosition} onRemove={remove} />
      )}
    </div>
  );
}

function FirstTimeForm({ busy, onSubmit }: { busy: boolean; onSubmit: (accuracy: AccuracyLevel, visibility: LocationVisibility | undefined) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const accuracy = String(form.get("accuracyLevel")) === "CITY" ? "CITY" : "AREA";
    void onSubmit(accuracy, undefined);
  }
  return (
    <Section title="Atur lokasi" description="Browser akan meminta izin lokasi hanya setelah Anda menekan tombol. Lokasi baru berstatus Privat sampai Anda mengubahnya.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Select id="accuracyLevel" label="Ketepatan" defaultValue="AREA">
          {(Object.keys(ACCURACY_LABEL) as AccuracyLevel[]).map((key) => (
            <option key={key} value={key}>
              {ACCURACY_LABEL[key]}
            </option>
          ))}
        </Select>
        <SubmitButton busy={busy}>Gunakan lokasi perangkat saya</SubmitButton>
      </form>
    </Section>
  );
}

function ExistingSettings({
  location,
  busy,
  onPatch,
  onRefresh,
  onRemove,
}: {
  location: LocationDto;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onRefresh: (accuracy: AccuracyLevel, visibility: LocationVisibility | undefined) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const visibility = String(form.get("visibility"));
    const body: Record<string, unknown> = {
      visibility,
      areaLabel: String(form.get("areaLabel") ?? "").trim() || null,
      cityLabel: String(form.get("cityLabel") ?? "").trim() || null,
    };
    if (visibility === "DISCOVERABLE_RADIUS") body["discoverableRadiusKm"] = Number(form.get("discoverableRadiusKm"));
    void onPatch(body);
  }

  return (
    <div className="space-y-10">
      <Section title="Pengaturan" description={`Ketepatan: ${ACCURACY_LABEL[location.accuracyLevel]}. Diperbarui ${new Date(location.updatedAt).toLocaleString("id-ID")}.`}>
        <Toggle
          id="isEnabled"
          label="Lokasi aktif"
          description="Mati = lokasi tidak dipakai di pencarian mana pun, tetapi pengaturan tetap tersimpan."
          checked={location.isEnabled}
          disabled={busy}
          onChange={(next) => void onPatch({ isEnabled: next })}
        />
        <form onSubmit={save} className="space-y-4" noValidate key={`${location.visibility}|${location.discoverableRadiusKm}|${location.areaLabel ?? ""}|${location.cityLabel ?? ""}`}>
          <Select id="visibility" label="Siapa yang melihat lokasi saya" defaultValue={location.visibility}>
            {LOCATION_VISIBILITY.map((value) => (
              <option key={value} value={value}>
                {VISIBILITY_LABEL[value]}
              </option>
            ))}
          </Select>
          <Field
            id="discoverableRadiusKm"
            label="Radius (km)"
            type="number"
            min={1}
            max={50}
            defaultValue={location.discoverableRadiusKm}
            hint="Dipakai bila memilih pencarian berdasarkan radius: Anda hanya muncul bagi pencari yang berada dalam jarak ini."
          />
          <Field id="areaLabel" label="Label area (opsional)" defaultValue={location.areaLabel ?? ""} maxLength={100} hint="Teks yang Anda tulis sendiri, mis. nama kecamatan. Hanya tampil bila visibilitas mengizinkan." />
          <Field id="cityLabel" label="Label kota (opsional)" defaultValue={location.cityLabel ?? ""} maxLength={100} />
          <SubmitButton busy={busy}>Simpan pengaturan</SubmitButton>
        </form>
      </Section>

      <Section title="Titik lokasi" description="Perbarui bila Anda pindah. Browser akan meminta izin lagi bila perlu.">
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void onRefresh(location.accuracyLevel, undefined)}>
            Perbarui dari perangkat
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void onRemove()}>
            Hapus lokasi
          </Button>
        </div>
      </Section>
    </div>
  );
}
