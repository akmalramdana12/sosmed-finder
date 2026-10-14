import type {
  ModerationAction,
  ModerationListDto,
  ModerationReportDto,
  ReportStatusValue,
} from "@social-finder/types";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import type { AuditWriter } from "../auth/types";
import { decodeModerationCursor, encodeModerationCursor } from "./cursor";
import { planAction } from "./plan";
import type { ModerationReportRecord, ModerationRepository } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const MODERATION_LIMITS = {
  read: { limit: 120, windowSec: 60 },
  act: { limit: 60, windowSec: 60 },
} as const satisfies Record<string, LimitRule>;

export interface ModerationDeps {
  repository: ModerationRepository;
  limiter: RateLimiter;
  audit: AuditWriter;
  hmacSecret: string;
  now?: () => Date;
}

export interface ListReportsCommand {
  status: ReportStatusValue;
  limit: number;
  cursor?: string | undefined;
}

export interface ReportActionCommand {
  action: ModerationAction;
  note?: string | undefined;
}

export function toModerationReportDto(record: ModerationReportRecord): ModerationReportDto {
  return {
    id: record.id,
    reason: record.reason,
    details: record.details,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
    moderatorNote: record.moderatorNote,
    target: {
      username: record.targetUsername,
      status: record.targetStatus,
      openReports: record.targetOpenReports,
    },
  };
}

/**
 * Peninjauan laporan oleh moderator.
 *
 * - Peran dibaca dari DATABASE pada setiap permintaan (bukan dari cookie atau token): mencabut peran
 *   langsung berlaku. Peran tidak bisa diubah lewat API; hanya lewat SQL oleh operator.
 * - Bukan moderator = 404 yang sama dengan rute yang tidak ada: keberadaan fitur tidak dibuka.
 *   Batas laju dihitung SEBELUM cek peran, jadi menebak-nebak endpoint ini juga dibatasi.
 * - Setiap tindakan masuk audit (tanpa isi catatan). Tidak ada efek otomatis dari laporan.
 */
export class ModerationService {
  private readonly deps: ModerationDeps;

  constructor(deps: ModerationDeps) {
    this.deps = deps;
  }

  async listReports(moderatorId: string, command: ListReportsCommand): Promise<ModerationListDto> {
    await this.enforce(`mod:read:${moderatorId}`, MODERATION_LIMITS.read);
    await this.assertModerator(moderatorId);

    const binding = { moderatorId, status: command.status };
    let after = null;
    if (command.cursor !== undefined) {
      after = decodeModerationCursor(command.cursor, binding, this.deps.hmacSecret);
      if (!after) throw new AppError("VALIDATION_ERROR", "Cursor tidak valid");
    }
    const rows = await this.deps.repository.listReports({
      status: command.status,
      after,
      limit: command.limit + 1,
    });
    const hasMore = rows.length > command.limit;
    const page = rows.slice(0, command.limit);
    const last = page[page.length - 1];
    return {
      data: page.map(toModerationReportDto),
      nextCursor:
        hasMore && last
          ? encodeModerationCursor({ createdAt: last.createdAt, id: last.id }, binding, this.deps.hmacSecret)
          : null,
    };
  }

  async act(
    moderatorId: string,
    reportId: string,
    command: ReportActionCommand,
    ctx: RequestContext,
  ): Promise<ModerationReportDto> {
    await this.enforce(`mod:act:${moderatorId}`, MODERATION_LIMITS.act);
    await this.assertModerator(moderatorId);

    // Pertahanan kedua di luar skema: tindakan yang mengubah akun orang lain wajib bercatatan.
    if ((command.action === "suspend" || command.action === "reinstate") && (command.note?.trim().length ?? 0) < 5) {
      throw new AppError("VALIDATION_ERROR", "Catatan minimal 5 karakter untuk suspend dan reinstate");
    }

    const report = await this.deps.repository.findReport(reportId);
    if (!report) throw new AppError("NOT_FOUND", "Laporan tidak ditemukan");
    const plan = planAction(report, command.action);

    const note = command.note && command.note.length > 0 ? command.note : null;
    const result = await this.deps.repository.applyAction({
      reportId,
      moderatorId,
      expectedStatus: report.status,
      nextStatus: plan.nextStatus,
      note,
      targetEffect: plan.targetEffect,
      now: (this.deps.now ?? (() => new Date()))(),
    });
    if (result === "stale") {
      throw new AppError("CONFLICT", "Laporan sudah diubah moderator lain; muat ulang daftar");
    }

    // Catatan (teks bebas, bisa memuat data pribadi) tidak masuk audit; hanya aksi dan alasan laporan.
    await this.deps.audit({
      action: `moderation.report.${command.action}`,
      actorId: moderatorId,
      entity: "Report",
      entityId: reportId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
      metadata: { reason: report.reason, from: report.status, to: plan.nextStatus },
    });

    const updated = await this.deps.repository.findReport(reportId);
    if (!updated) throw new AppError("NOT_FOUND", "Laporan tidak ditemukan");
    return toModerationReportDto(updated);
  }

  private async assertModerator(userId: string): Promise<void> {
    const role = await this.deps.repository.findRole(userId);
    if (role !== "MODERATOR") throw new AppError("NOT_FOUND", "Tidak ditemukan");
  }

  private async enforce(key: string, rule: LimitRule): Promise<void> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSec);
  }
}
