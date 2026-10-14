import type { AccuracyLevel, LocationVisibility, ReportReasonValue, ReportStatusValue } from "@social-finder/types";

/** Data mentah milik pengguna untuk ekspor. Tidak memuat hash, token, sesi, atau koordinat. */
export interface AccountExportRecord {
  email: string;
  username: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  profile: { displayName: string; bio: string | null; avatarUrl: string | null } | null;
  privacy: {
    isDiscoverable: boolean;
    searchableByUsername: boolean;
    showPlatforms: boolean;
    locationVisibility: LocationVisibility;
  } | null;
  location: {
    isEnabled: boolean;
    accuracyLevel: AccuracyLevel;
    areaLabel: string | null;
    cityLabel: string | null;
    discoverableRadiusM: number;
    updatedAt: Date;
  } | null;
  socialAccounts: Array<{
    platformKey: string;
    username: string;
    profileUrl: string;
    isVerified: boolean;
    isDiscoverable: boolean;
  }>;
  blocks: Array<{ username: string; createdAt: Date }>;
  reportsMade: Array<{ reason: ReportReasonValue; status: ReportStatusValue; details: string | null; createdAt: Date }>;
}

export interface AccountRepository {
  /** Semua data milik pengguna ACTIVE yang belum dihapus; null bila tidak ada. */
  loadExport(userId: string): Promise<AccountExportRecord | null>;
  /** Hash password milik pengguna ACTIVE yang belum dihapus; null bila tidak ada. */
  getPasswordHash(userId: string): Promise<string | null>;
  /** Atomik: ganti hash dan cabut SEMUA sesi pengguna. */
  setPasswordAndRevokeSessions(userId: string, passwordHash: string, at: Date): Promise<void>;
  /**
   * Atomik: tandai PENDING_DELETION + deletedAt, cabut semua sesi, dan hapus data yang tidak perlu
   * disimpan lagi (lokasi, akun sosmed, blokir yang dibuat, bio/avatar); privasi dikembalikan ke aman.
   */
  markDeleted(userId: string, at: Date): Promise<void>;
  /** Hapus permanen akun yang deletedAt-nya lebih lama dari `cutoff`. Mengembalikan jumlah akun. */
  purgeDeletedBefore(cutoff: Date): Promise<number>;
}
