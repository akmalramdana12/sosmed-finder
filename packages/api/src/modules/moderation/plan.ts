import type { ModerationAction } from "@social-finder/types";
import { AppError } from "../../errors/app-error";
import type { ActionPlan, ModerationReportRecord } from "./types";

const isOpen = (status: ModerationReportRecord["status"]): boolean =>
  status === "OPEN" || status === "REVIEWING";

/**
 * Aturan transisi, murni dan gagal tertutup. Tidak ada efek otomatis dari laporan: hanya tindakan
 * eksplisit moderator yang mengubah status laporan atau akun target.
 *
 * - review: OPEN -> REVIEWING.
 * - dismiss / resolve: laporan terbuka -> DISMISSED / RESOLVED, tanpa efek pada akun.
 * - suspend: laporan terbuka + target ACTIVE + target bukan moderator -> laporan RESOLVED, akun SUSPENDED.
 * - reinstate: target SUSPENDED -> ACTIVE; status laporan tidak berubah (boleh dari laporan yang sudah selesai).
 */
export function planAction(report: ModerationReportRecord, action: ModerationAction): ActionPlan {
  switch (action) {
    case "review":
      if (report.status !== "OPEN") throw new AppError("CONFLICT", "Laporan tidak lagi berstatus OPEN");
      return { nextStatus: "REVIEWING", targetEffect: null };
    case "dismiss":
    case "resolve":
      if (!isOpen(report.status)) throw new AppError("CONFLICT", "Laporan sudah ditutup");
      return { nextStatus: action === "dismiss" ? "DISMISSED" : "RESOLVED", targetEffect: null };
    case "suspend":
      if (!isOpen(report.status)) throw new AppError("CONFLICT", "Laporan sudah ditutup");
      if (report.targetRole !== "USER") {
        throw new AppError("FORBIDDEN", "Akun moderator tidak bisa ditindak lewat laporan");
      }
      if (report.targetStatus !== "ACTIVE") {
        throw new AppError("CONFLICT", "Akun target tidak berstatus ACTIVE");
      }
      return { nextStatus: "RESOLVED", targetEffect: "suspend" };
    case "reinstate":
      if (report.targetStatus !== "SUSPENDED") {
        throw new AppError("CONFLICT", "Akun target tidak sedang ditangguhkan");
      }
      return { nextStatus: report.status, targetEffect: "reinstate" };
  }
}
