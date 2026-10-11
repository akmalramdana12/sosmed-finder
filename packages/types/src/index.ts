/** Level visibilitas lokasi. Default HARUS PRIVATE (opt-in). */
export const LOCATION_VISIBILITY = [
  "PRIVATE",
  "AREA_ONLY",
  "CITY_ONLY",
  "DISCOVERABLE_RADIUS",
] as const;

export type LocationVisibility = (typeof LOCATION_VISIBILITY)[number];

export const DEFAULT_LOCATION_VISIBILITY: LocationVisibility = "PRIVATE";

/** Ukuran sel grid tempat titik lokasi di-snap sebelum disimpan (AREA ~2 km, CITY ~10 km). */
export const ACCURACY_LEVELS = ["AREA", "CITY"] as const;

export type AccuracyLevel = (typeof ACCURACY_LEVELS)[number];

export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Data milik pengguna sendiri (GET/PATCH /api/me). Bukan DTO publik: memuat email. */
export interface MeDto {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string;
  displayName: string;
  bio: string | null;
  /** ISO 8601 */
  createdAt: string;
}

export interface PlatformDto {
  key: string;
  name: string;
}

/** Akun sosmed milik pengguna sendiri. `isVerified` hanya bisa true lewat verifikasi resmi (belum ada). */
export interface SocialAccountDto {
  id: string;
  platform: PlatformDto;
  username: string;
  profileUrl: string;
  isVerified: boolean;
  isDiscoverable: boolean;
  /** ISO 8601 */
  createdAt: string;
}

/** Pengaturan privasi milik pengguna sendiri (GET/PATCH /api/me/privacy). */
export interface PrivacyDto {
  /** Saklar utama. Default false: tidak ditemukan sampai pengguna mengaktifkan sendiri. */
  isDiscoverable: boolean;
  /** false: tidak muncul pada pencarian berdasarkan username (exact/prefix). */
  searchableByUsername: boolean;
  /** false: daftar platform disembunyikan dan pengguna tidak cocok pada filter platform. */
  showPlatforms: boolean;
  /** Hanya baca di sini; diubah lewat /api/me/location. */
  locationVisibility: LocationVisibility;
  /** Jumlah akun sosmed dengan isDiscoverable = true. */
  discoverableAccountCount: number;
  /** isDiscoverable dan minimal satu akun discoverable: apakah benar-benar bisa ditemukan sekarang. */
  isEffectivelyDiscoverable: boolean;
  /** ISO 8601; null bila belum pernah diubah. */
  updatedAt: string | null;
}

/**
 * Lokasi milik pengguna sendiri (GET/PUT/PATCH /api/me/location).
 * TIDAK PERNAH memuat koordinat, termasuk titik yang sudah di-snap.
 */
export interface LocationDto {
  isEnabled: boolean;
  accuracyLevel: AccuracyLevel;
  visibility: LocationVisibility;
  discoverableRadiusKm: number;
  areaLabel: string | null;
  cityLabel: string | null;
  /** ISO 8601 */
  updatedAt: string;
}

export const SEARCH_MODES = ["exact", "prefix"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const SEARCH_SORTS = ["distance", "username"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export interface SearchAccountDto {
  /** Key platform, mis. "instagram". */
  platform: string;
  username: string;
  /** Dibangun server dari template platform. */
  profileUrl: string;
  isVerified: boolean;
}

/**
 * Hasil pencarian / profil publik (GET /api/search, GET /api/users/:username).
 * Whitelist: tidak ada id internal, email, koordinat, atau metadata DB.
 * `area`/`city`/`distanceKm` hanya ada bila visibilitas lokasi target mengizinkan.
 */
export interface SearchResultDto {
  username: string;
  displayName: string;
  /** Kosong bila target menyembunyikan daftar platform. */
  accounts: SearchAccountDto[];
  area?: string;
  city?: string;
  /** Dibulatkan 0,5 km, minimal 1. */
  distanceKm?: number;
}

export interface SearchResponseDto {
  data: SearchResultDto[];
  nextCursor: string | null;
}

/** Sama dengan enum ReportReason di schema.prisma. */
export const REPORT_REASONS = [
  "SPAM",
  "IMPERSONATION",
  "HARASSMENT",
  "INAPPROPRIATE_CONTENT",
  "PRIVACY_VIOLATION",
  "OTHER",
] as const;
export type ReportReasonValue = (typeof REPORT_REASONS)[number];

/** Pengguna yang diblokir (GET /api/blocks). Hanya data milik pemblokir; tanpa id internal. */
export interface BlockedUserDto {
  username: string;
  /** ISO 8601 */
  blockedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown[];
    requestId: string;
  };
}
