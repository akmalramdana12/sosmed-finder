import type { LocationVisibility, SearchMode, SearchSort } from "@social-finder/types";

/** Satu akun sosmed milik kandidat. Internal: belum tentu boleh tampil. */
export interface CandidateAccount {
  platformKey: string;
  username: string;
  profileUrl: string;
  isVerified: boolean;
  isDiscoverable: boolean;
  platformActive: boolean;
}

/**
 * Baris mentah dari repositori. INTERNAL: tidak pernah diserialisasi ke klien.
 * Membawa semua bendera yang dipakai `evaluateCandidate`, sehingga aturan privasi diperiksa dua kali
 * (di SQL dan lagi di service). Bug filter di salah satunya tidak otomatis menjadi kebocoran.
 */
export interface SearchCandidate {
  userId: string;
  username: string;
  normalizedUsername: string;
  displayName: string;
  status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION";
  deleted: boolean;
  /** Email pemilik sudah diverifikasi. Akun yang belum, tidak boleh ditemukan (anti akun sekali pakai). */
  emailVerified: boolean;
  isDiscoverable: boolean;
  searchableByUsername: boolean;
  showPlatforms: boolean;
  blockedEitherWay: boolean;
  visibility: LocationVisibility;
  locationEnabled: boolean;
  areaLabel: string | null;
  cityLabel: string | null;
  discoverableRadiusM: number | null;
  /** Jarak titik-ke-titik (centroid grid) dalam meter; null bila salah satu pihak tanpa lokasi aktif. */
  distanceM: number | null;
  /** Jarak dalam satuan 0,5 km (bulat ke atas dari .5), minimal 2. Dipakai untuk urutan dan cursor. */
  distanceUnits: number | null;
  usernameMatched: boolean;
  handleMatched: boolean;
  accounts: CandidateAccount[];
}

export interface SearchCriteria {
  searcherId: string;
  /**
   * Sudah lowercase. Null bila pencarian murni radius. `includeHandles` = ikut mencocokkan handle
   * sosmed (pencarian); false untuk lookup profil, yang hanya boleh cocok dengan username Social Finder.
   */
  query: { text: string; mode: SearchMode; includeHandles: boolean } | null;
  platformKey: string | null;
  /** Hanya pengguna dengan email terverifikasi yang boleh muncul. Default produksi: true. */
  requireVerifiedEmail: boolean;
  /** Meter. Null bila bukan pencarian radius. */
  radiusM: number | null;
  sort: SearchSort;
  /** Jumlah baris yang diambil (ukuran halaman + 1 untuk mendeteksi halaman berikutnya). */
  fetchLimit: number;
  after: CursorKey | null;
}

/** Kunci keyset. Jarak berupa satuan 0,5 km (bukan meter): cursor tidak membocorkan jarak halus. */
export type CursorKey =
  | { sort: "username"; value: string; userId: string }
  | { sort: "distance"; value: number; userId: string };

export interface SearchLogEntry {
  searcherId: string;
  queryHash: string;
  filters: Record<string, string | number | boolean | null>;
  resultCount: number;
}

/** Semua method menerima `searcherId` dari SESI, tidak pernah dari input klien. */
export interface SearchRepository {
  search(criteria: SearchCriteria): Promise<SearchCandidate[]>;
  findByUsername(
    searcherId: string,
    normalizedUsername: string,
    requireVerifiedEmail: boolean,
  ): Promise<SearchCandidate | null>;
  /** Pencari punya lokasi aktif (dibutuhkan untuk pencarian jarak). */
  hasEnabledLocation(searcherId: string): Promise<boolean>;
  /** Email pengguna ini sudah diverifikasi. Pencari tanpa verifikasi tidak boleh mencari. */
  isEmailVerified(userId: string): Promise<boolean>;
  logSearch(entry: SearchLogEntry): Promise<void>;
  /** Jumlah catatan pencarian oleh pencari ini dalam `windowSec` detik terakhir (termasuk yang baru dicatat). */
  countRecentSearches(searcherId: string, windowSec: number): Promise<number>;
}
