export interface MaintenanceRepository {
  /** Hapus sesi yang kedaluwarsa atau dicabut sebelum `cutoff`. Mengembalikan jumlah baris. */
  deleteSessionsEndedBefore(cutoff: Date): Promise<number>;
  /** Hapus token verifikasi/reset yang kedaluwarsa sebelum `cutoff`. */
  deleteTokensExpiredBefore(cutoff: Date): Promise<number>;
  /** Hapus catatan pencarian yang dibuat sebelum `cutoff`. */
  deleteSearchLogsBefore(cutoff: Date): Promise<number>;
  /** Hapus audit log yang dibuat sebelum `cutoff`. */
  deleteAuditLogsBefore(cutoff: Date): Promise<number>;
}

export interface AccountPurger {
  /** Hapus permanen akun yang deletedAt-nya lebih lama dari `cutoff`. Mengembalikan jumlah akun. */
  purgeDeletedBefore(cutoff: Date): Promise<number>;
}

export type MaintenanceTask =
  | "purgeDeletedAccounts"
  | "deleteEndedSessions"
  | "deleteExpiredTokens"
  | "deleteOldSearchLogs"
  | "deleteOldAuditLogs";

export interface MaintenanceReport {
  /** Jumlah baris terhapus per tugas; tugas yang gagal tidak ada di sini. */
  counts: Partial<Record<MaintenanceTask, number>>;
  /** Tugas yang gagal. Pesan error sengaja tidak disertakan (bisa memuat data). */
  failed: MaintenanceTask[];
}
