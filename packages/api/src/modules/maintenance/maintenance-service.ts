import { DELETION_GRACE_DAYS } from "../account";
import type { AccountPurger, MaintenanceReport, MaintenanceRepository, MaintenanceTask } from "./types";

/** Retensi data. Angka ini kebijakan produk/hukum: tinjau sebelum produksi. */
export const RETENTION = {
  /** Sesi kedaluwarsa/dicabut disimpan sebentar untuk investigasi, lalu dihapus. */
  sessionGraceDays: 7,
  tokenGraceDays: 1,
  /** SearchLog dipakai deteksi penyalahgunaan (jendela 1 jam); 30 hari lebih dari cukup. */
  searchLogDays: 30,
  /** Audit log berisi IP ter-HMAC dan aksi keamanan. */
  auditLogDays: 365,
} as const;

export interface MaintenanceDeps {
  repository: MaintenanceRepository;
  accounts: AccountPurger;
  now: () => Date;
}

const DAY_MS = 86_400_000;

/**
 * Menjalankan semua tugas retensi. Tiap tugas berdiri sendiri: kegagalan satu tugas tidak
 * menghentikan yang lain, dan dilaporkan di `failed` (tanpa pesan error, agar tidak membocorkan data).
 * Idempotent: aman dijalankan berulang atau bersamaan.
 */
export async function runMaintenance(deps: MaintenanceDeps): Promise<MaintenanceReport> {
  const now = deps.now().getTime();
  const before = (days: number): Date => new Date(now - days * DAY_MS);
  const report: MaintenanceReport = { counts: {}, failed: [] };

  const tasks: [MaintenanceTask, () => Promise<number>][] = [
    ["purgeDeletedAccounts", () => deps.accounts.purgeDeletedBefore(before(DELETION_GRACE_DAYS))],
    ["deleteEndedSessions", () => deps.repository.deleteSessionsEndedBefore(before(RETENTION.sessionGraceDays))],
    ["deleteExpiredTokens", () => deps.repository.deleteTokensExpiredBefore(before(RETENTION.tokenGraceDays))],
    ["deleteOldSearchLogs", () => deps.repository.deleteSearchLogsBefore(before(RETENTION.searchLogDays))],
    ["deleteOldAuditLogs", () => deps.repository.deleteAuditLogsBefore(before(RETENTION.auditLogDays))],
  ];

  for (const [name, run] of tasks) {
    try {
      report.counts[name] = await run();
    } catch {
      report.failed.push(name);
    }
  }
  return report;
}
