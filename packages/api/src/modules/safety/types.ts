import type { ReportReasonValue } from "@social-finder/types";

export interface BlockedUserRecord {
  username: string;
  createdAt: Date;
}

export interface NewReport {
  reporterId: string;
  targetUserId: string;
  reason: ReportReasonValue;
  details: string | null;
}

/**
 * Semua method menerima id pelaku dari SESI. Target selalu dicari lewat username di sisi server.
 * Id target tidak pernah dikembalikan ke klien.
 */
export interface SafetyRepository {
  /** Hanya pengguna ACTIVE dan tidak dihapus. Null bila tidak ada atau tidak aktif. */
  findActiveUserId(normalizedUsername: string): Promise<string | null>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  countBlocks(blockerId: string): Promise<number>;
  /** Idempotent. True bila baris baru dibuat, false bila sudah ada. */
  addBlock(blockerId: string, blockedId: string): Promise<boolean>;
  /** Idempotent. True bila ada yang dihapus. Berlaku juga untuk target non-ACTIVE. */
  removeBlockByUsername(blockerId: string, normalizedUsername: string): Promise<boolean>;
  listBlocks(blockerId: string, limit: number): Promise<BlockedUserRecord[]>;
  /** Laporan OPEN atau REVIEWING dari pelapor yang sama terhadap target yang sama. */
  hasOpenReport(reporterId: string, targetUserId: string): Promise<boolean>;
  createReport(report: NewReport): Promise<void>;
}
