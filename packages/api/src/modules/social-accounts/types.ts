export interface PlatformRecord {
  id: string;
  key: string;
  name: string;
  urlTemplate: string;
}

export interface SocialAccountRecord {
  id: string;
  platformKey: string;
  platformName: string;
  username: string;
  profileUrl: string;
  isVerified: boolean;
  isDiscoverable: boolean;
  createdAt: Date;
}

/** Akun milik pengguna + template platform (untuk membangun ulang URL saat username berubah). */
export interface OwnedSocialAccount extends SocialAccountRecord {
  urlTemplate: string;
}

export interface NewSocialAccount {
  platformId: string;
  username: string;
  normalizedUsername: string;
  profileUrl: string;
}

export interface SocialAccountUpdate {
  username?: string;
  normalizedUsername?: string;
  profileUrl?: string;
  isVerified?: boolean;
  isDiscoverable?: boolean;
}

/**
 * Kepemilikan DIPAKSA DI QUERY: setiap method yang menyentuh satu akun menerima `userId`
 * (dari sesi) bersama `id`, dan `where` memuat keduanya. Tidak ada "ambil dulu lalu cek".
 */
export interface SocialAccountRepository {
  listByUser(userId: string): Promise<SocialAccountRecord[]>;
  countByUser(userId: string): Promise<number>;
  listPlatforms(): Promise<PlatformRecord[]>;
  /** Hanya platform aktif. */
  findPlatformByKey(key: string): Promise<PlatformRecord | null>;
  findOwned(userId: string, id: string): Promise<OwnedSocialAccount | null>;
  /** Melempar UniqueViolationError("username") bila akun yang sama sudah ada. */
  create(userId: string, input: NewSocialAccount): Promise<SocialAccountRecord>;
  /** Null bila tidak ada atau bukan milik userId. Melempar UniqueViolationError bila bentrok. */
  update(
    userId: string,
    id: string,
    update: SocialAccountUpdate,
  ): Promise<SocialAccountRecord | null>;
  /** False bila tidak ada atau bukan milik userId. */
  delete(userId: string, id: string): Promise<boolean>;
}
