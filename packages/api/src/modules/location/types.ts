import type { AccuracyLevel, LocationVisibility } from "@social-finder/types";
import type { GeoPoint } from "./geo";

/** Lokasi milik pengguna. Sengaja TANPA koordinat: koordinat tidak pernah dibaca kembali ke aplikasi. */
export interface StoredLocation {
  accuracyLevel: AccuracyLevel;
  visibility: LocationVisibility;
  /** Meter. */
  discoverableRadiusM: number;
  areaLabel: string | null;
  cityLabel: string | null;
  isEnabled: boolean;
  updatedAt: Date;
}

export interface LocationWrite {
  /** Titik yang SUDAH di-snap. Hanya lewat repositori ke DB; tidak pernah dikembalikan atau dilog. */
  point: GeoPoint;
  accuracyLevel: AccuracyLevel;
  visibility: LocationVisibility;
  discoverableRadiusM: number;
  areaLabel: string | null;
  cityLabel: string | null;
}

/** Perubahan pengaturan tanpa mengganti titik. */
export interface LocationSettingsUpdate {
  visibility?: LocationVisibility;
  discoverableRadiusM?: number;
  areaLabel?: string | null;
  cityLabel?: string | null;
  isEnabled?: boolean;
}

/** Semua method menerima `userId` dari SESI, tidak pernah dari input klien. */
export interface LocationRepository {
  findMine(userId: string): Promise<StoredLocation | null>;
  /** Simpan titik (isEnabled = true) dan visibilitas dalam satu transaksi. */
  upsert(userId: string, write: LocationWrite): Promise<StoredLocation>;
  /** Null bila pengguna belum punya lokasi. */
  updateSettings(userId: string, update: LocationSettingsUpdate): Promise<StoredLocation | null>;
  /** Hapus titik dan kembalikan visibilitas ke PRIVATE. False bila memang tidak ada. */
  remove(userId: string): Promise<boolean>;
}
