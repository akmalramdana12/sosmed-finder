export interface MeRecord {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  username: string;
  createdAt: Date;
  displayName: string;
  bio: string | null;
}

/** Perubahan yang sudah tervalidasi dan dihitung service. Hanya field ini yang pernah ditulis. */
export interface MeUpdate {
  displayName?: string;
  bio?: string | null;
  username?: string;
  normalizedUsername?: string;
}

/**
 * Semua method menerima `userId` dari SESI, tidak pernah dari input klien.
 * Tidak ada method yang mengambil id pengguna lain: mencegah IDOR secara struktural.
 */
export interface ProfileRepository {
  findMe(userId: string): Promise<MeRecord | null>;
  /** Null bila pengguna tidak ada. Melempar UniqueViolationError("username") bila bentrok. */
  update(userId: string, update: MeUpdate): Promise<MeRecord | null>;
}
