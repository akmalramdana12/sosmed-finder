export interface AccountRepository {
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
