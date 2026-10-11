import type { MaintenanceDeps, MaintenanceReport } from "@social-finder/api/maintenance";
import { runMaintenance } from "@social-finder/api/maintenance";
import { logInfo } from "./log";

export const MAINTENANCE_QUEUE = "maintenance";
export const MAINTENANCE_JOB = "retention";
/** Sekali per jam. Tugasnya idempotent, jadi aman bila terlewat atau tumpang tindih. */
export const MAINTENANCE_EVERY_MS = 60 * 60 * 1000;

/** Menjalankan retensi lalu mencatat ringkasan (hanya angka dan nama tugas, tanpa data pengguna). */
export async function handleMaintenance(deps: MaintenanceDeps): Promise<MaintenanceReport> {
  const report = await runMaintenance(deps);
  logInfo("maintenance done", { counts: report.counts as Record<string, number>, failed: report.failed });
  if (report.failed.length > 0) {
    // Dilempar agar BullMQ menandai job gagal (terlihat di antrean) dan mencoba ulang.
    throw new Error(`maintenance task failed: ${report.failed.join(",")}`);
  }
  return report;
}
