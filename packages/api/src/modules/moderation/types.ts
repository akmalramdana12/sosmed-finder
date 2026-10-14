import type { ModerationAction, ReportReasonValue, ReportStatusValue } from "@social-finder/types";
import type { UserStatus } from "../auth/types";

export type UserRoleValue = "USER" | "MODERATOR";

/** Baris laporan untuk moderator. INTERNAL: dipetakan ke ModerationReportDto sebelum keluar. */
export interface ModerationReportRecord {
  id: string;
  reason: ReportReasonValue;
  details: string | null;
  status: ReportStatusValue;
  createdAt: Date;
  resolvedAt: Date | null;
  moderatorNote: string | null;
  targetUsername: string;
  targetStatus: UserStatus;
  targetRole: UserRoleValue;
  /** Laporan OPEN/REVIEWING terhadap target yang sama (termasuk laporan ini bila masih terbuka). */
  targetOpenReports: number;
}

export interface ReportKey {
  createdAt: Date;
  id: string;
}

export interface ListReportsParams {
  status: ReportStatusValue;
  after: ReportKey | null;
  limit: number;
}

/** Efek pada akun target yang dijalankan bersama perubahan status laporan, dalam satu transaksi. */
export type TargetEffect = "suspend" | "reinstate" | null;

export interface ApplyActionInput {
  reportId: string;
  moderatorId: string;
  /** Status laporan yang diharapkan: compare-and-set, supaya dua moderator tidak saling menimpa. */
  expectedStatus: ReportStatusValue;
  nextStatus: ReportStatusValue;
  /** Null = catatan lama dibiarkan. */
  note: string | null;
  targetEffect: TargetEffect;
  now: Date;
}

/** "stale" = laporan atau akun target sudah berubah sejak dibaca; tidak ada yang diubah. */
export type ApplyResult = "applied" | "stale";

export interface ModerationRepository {
  /** Peran pengguna ACTIVE yang tidak dihapus. Null untuk selainnya (tidak ada peran efektif). */
  findRole(userId: string): Promise<UserRoleValue | null>;
  listReports(params: ListReportsParams): Promise<ModerationReportRecord[]>;
  findReport(id: string): Promise<ModerationReportRecord | null>;
  applyAction(input: ApplyActionInput): Promise<ApplyResult>;
}

export interface ActionPlan {
  nextStatus: ReportStatusValue;
  targetEffect: TargetEffect;
}

export type { ModerationAction };
