import type { LocationVisibility } from "@social-finder/types";

export interface PrivacyRecord {
  isDiscoverable: boolean;
  searchableByUsername: boolean;
  showPlatforms: boolean;
  locationVisibility: LocationVisibility;
  /** Null bila baris belum pernah dibuat (nilai default aman dipakai). */
  updatedAt: Date | null;
}

/** Hanya saklar yang boleh diubah pengguna lewat /api/me/privacy. */
export interface PrivacyUpdate {
  isDiscoverable?: boolean;
  searchableByUsername?: boolean;
  showPlatforms?: boolean;
}

/** Semua method menerima `userId` dari SESI, tidak pernah dari input klien. */
export interface PrivacyRepository {
  find(userId: string): Promise<PrivacyRecord | null>;
  /** Jumlah akun sosmed milik userId dengan isDiscoverable = true. */
  countDiscoverableAccounts(userId: string): Promise<number>;
  /** Upsert: bila baris belum ada, dibuat dengan default aman lalu `update` diterapkan. */
  update(userId: string, update: PrivacyUpdate): Promise<PrivacyRecord>;
}
