export type RecoveryTokenType = "PASSWORD_RESET" | "EMAIL_VERIFICATION";

export interface RecoveryUser {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
}

export interface NewRecoveryToken {
  userId: string;
  type: RecoveryTokenType;
  /** Hash token; token mentah hanya ada di email dan tidak pernah disimpan. */
  tokenHash: string;
  expiresAt: Date;
}

export interface RecoveryRepository {
  /** Pengguna ACTIVE dan belum dihapus berdasarkan email (sudah lowercase); null bila tidak ada. */
  findActiveByEmail(email: string): Promise<RecoveryUser | null>;
  /** Pengguna ACTIVE dan belum dihapus berdasarkan id; null bila tidak ada. */
  findActiveById(userId: string): Promise<RecoveryUser | null>;
  /** Atomik: tandai token lama jenis yang sama (belum dipakai) sebagai terpakai, lalu simpan yang baru. */
  replaceToken(token: NewRecoveryToken): Promise<void>;
  /** True bila token ada, jenis cocok, belum dipakai, dan belum kedaluwarsa. Tidak mengubah apa pun. */
  isTokenUsable(type: RecoveryTokenType, tokenHash: string, now: Date): Promise<boolean>;
  /**
   * Atomik: klaim token PASSWORD_RESET (sekali pakai), ganti hash password, cabut SEMUA sesi, dan
   * matikan token reset lain milik pengguna itu. Mengembalikan id pengguna, atau null bila token
   * tidak bisa diklaim (kedaluwarsa, sudah dipakai, atau akun tidak aktif); dalam kasus itu tidak ada yang berubah.
   */
  resetPasswordWithToken(tokenHash: string, passwordHash: string, now: Date): Promise<string | null>;
  /** Atomik: klaim token EMAIL_VERIFICATION dan set emailVerifiedAt. Id pengguna atau null. */
  verifyEmailWithToken(tokenHash: string, now: Date): Promise<string | null>;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
