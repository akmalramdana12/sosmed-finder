import { prisma } from "@social-finder/database";
import type { ReportReasonValue, ReportStatusValue } from "@social-finder/types";
import type {
  ApplyActionInput,
  ApplyResult,
  ListReportsParams,
  ModerationReportRecord,
  ModerationRepository,
  UserRoleValue,
} from "./types";

/** Dilempar di dalam transaksi untuk membatalkannya bila kondisi berubah di tengah jalan. */
class StaleError extends Error {
  constructor() {
    super("stale");
    this.name = "StaleError";
  }
}

const reportSelect = {
  id: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  moderatorNote: true,
  targetUserId: true,
  target: { select: { username: true, status: true, role: true } },
} as const;

interface ReportRow {
  id: string;
  reason: ReportReasonValue;
  details: string | null;
  status: ReportStatusValue;
  createdAt: Date;
  resolvedAt: Date | null;
  moderatorNote: string | null;
  targetUserId: string;
  target: { username: string; status: ModerationReportRecord["targetStatus"]; role: UserRoleValue };
}

const OPEN: ReportStatusValue[] = ["OPEN", "REVIEWING"];

export class PrismaModerationRepository implements ModerationRepository {
  async findRole(userId: string): Promise<UserRoleValue | null> {
    const user = await prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE", deletedAt: null },
      select: { role: true },
    });
    return user ? user.role : null;
  }

  async listReports(params: ListReportsParams): Promise<ModerationReportRecord[]> {
    const { status, after, limit } = params;
    // Antrean: terlama dulu. Keyset (createdAt, id) stabil walau ada laporan baru masuk.
    const rows: ReportRow[] = await prisma.report.findMany({
      where: {
        status,
        ...(after
          ? {
              OR: [
                { createdAt: { gt: after.createdAt } },
                { createdAt: after.createdAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      select: reportSelect,
    });
    return this.withCounts(rows);
  }

  async findReport(id: string): Promise<ModerationReportRecord | null> {
    const row: ReportRow | null = await prisma.report.findUnique({ where: { id }, select: reportSelect });
    if (!row) return null;
    const [record] = await this.withCounts([row]);
    return record ?? null;
  }

  async applyAction(input: ApplyActionInput): Promise<ApplyResult> {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.report.findUnique({
          where: { id: input.reportId },
          select: { targetUserId: true },
        });
        if (!current) throw new StaleError();

        const terminal = input.nextStatus === "RESOLVED" || input.nextStatus === "DISMISSED";
        const updated = await tx.report.updateMany({
          where: { id: input.reportId, status: input.expectedStatus },
          data: {
            status: input.nextStatus,
            reviewedById: input.moderatorId,
            ...(input.note !== null ? { moderatorNote: input.note } : {}),
            ...(terminal ? { resolvedAt: input.now } : {}),
          },
        });
        if (updated.count !== 1) throw new StaleError();

        if (input.targetEffect === "suspend") {
          // role USER dipaksa di WHERE: moderator tidak bisa menangguhkan moderator.
          const user = await tx.user.updateMany({
            where: { id: current.targetUserId, status: "ACTIVE", role: "USER", deletedAt: null },
            data: { status: "SUSPENDED" },
          });
          if (user.count !== 1) throw new StaleError();
          await tx.session.updateMany({
            where: { userId: current.targetUserId, revokedAt: null },
            data: { revokedAt: input.now },
          });
        } else if (input.targetEffect === "reinstate") {
          const user = await tx.user.updateMany({
            where: { id: current.targetUserId, status: "SUSPENDED", deletedAt: null },
            data: { status: "ACTIVE" },
          });
          if (user.count !== 1) throw new StaleError();
        }
      });
      return "applied";
    } catch (error) {
      if (error instanceof StaleError) return "stale";
      throw error;
    }
  }

  private async withCounts(rows: ReportRow[]): Promise<ModerationReportRecord[]> {
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((row) => row.targetUserId))];
    const groups: Array<{ targetUserId: string; _count: { _all: number } }> = await prisma.report.groupBy({
      by: ["targetUserId"],
      where: { status: { in: OPEN }, targetUserId: { in: ids } },
      _count: { _all: true },
    });
    const countById = new Map(groups.map((group) => [group.targetUserId, group._count._all] as const));
    return rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      moderatorNote: row.moderatorNote,
      targetUsername: row.target.username,
      targetStatus: row.target.status,
      targetRole: row.target.role,
      targetOpenReports: countById.get(row.targetUserId) ?? 0,
    }));
  }
}
