import type { BlockedUserDto, ReportReasonValue } from "@social-finder/types";
import { normalizeUsername } from "@social-finder/validation";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import type { AuditEvent, AuditWriter } from "../auth/types";
import type { BlockedUserRecord, SafetyRepository } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const SAFETY_LIMITS = {
  /** Sesuai kontrak API: block 30/jam, report 10/jam. */
  block: { limit: 30, windowSec: 3600 },
  report: { limit: 10, windowSec: 3600 },
  /** Batas harian laporan: mencegah laporan massal untuk membungkam banyak orang. */
  reportPerDay: { limit: 30, windowSec: 86_400 },
  read: { limit: 120, windowSec: 60 },
} as const satisfies Record<string, LimitRule>;

/** Batas daftar blokir per pengguna (mencegah tabel membengkak dan daftar tak terbatas). */
export const MAX_BLOCKS = 500;

export interface SafetyDeps {
  repository: SafetyRepository;
  limiter: RateLimiter;
  audit: AuditWriter;
  hmacSecret: string;
}

export interface ReportCommand {
  username: string;
  reason: ReportReasonValue;
  details?: string | undefined;
}

export function toBlockedUserDto(record: BlockedUserRecord): BlockedUserDto {
  return { username: record.username, blockedAt: record.createdAt.toISOString() };
}

/**
 * Block dan report.
 *
 * Anti-enumerasi: memblokir atau melaporkan username yang tidak ada (atau tidak aktif) menghasilkan
 * respons yang sama dengan yang berhasil. Tanpa itu, endpoint ini menjadi alat untuk menguji apakah
 * sebuah username terdaftar. Konsekuensinya: tidak ada pesan "pengguna tidak ditemukan".
 *
 * Laporan tidak punya efek otomatis pada target (tidak ada auto-suspend): laporan massal tidak
 * boleh menjadi senjata. Efek hanya lewat peninjauan moderator (belum ada antarmukanya).
 */
export class SafetyService {
  private readonly deps: SafetyDeps;

  constructor(deps: SafetyDeps) {
    this.deps = deps;
  }

  async block(userId: string, username: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`block:${userId}`, SAFETY_LIMITS.block);
    const targetId = await this.deps.repository.findActiveUserId(normalizeUsername(username));
    if (targetId === null) return;
    if (targetId === userId) {
      throw new AppError("VALIDATION_ERROR", "Anda tidak bisa memblokir diri sendiri");
    }
    // Sudah diblokir: idempotent, tidak menyentuh batas maupun audit.
    if (await this.deps.repository.isBlocked(userId, targetId)) return;
    if ((await this.deps.repository.countBlocks(userId)) >= MAX_BLOCKS) {
      throw new AppError("CONFLICT", `Maksimal ${MAX_BLOCKS} pengguna yang diblokir`);
    }
    // addBlock tetap idempotent bila dua permintaan serentak lolos pengecekan di atas
    // (batas bisa terlampaui paling banyak sebanyak permintaan serentak; tidak ada kunci).
    if (await this.deps.repository.addBlock(userId, targetId)) {
      await this.audit(ctx, userId, "block.create", "User", targetId);
    }
  }

  async unblock(userId: string, username: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`block:${userId}`, SAFETY_LIMITS.block);
    const removed = await this.deps.repository.removeBlockByUsername(
      userId,
      normalizeUsername(username),
    );
    if (removed) {
      await this.audit(ctx, userId, "block.delete", "User", null);
    }
  }

  async listBlocks(userId: string): Promise<BlockedUserDto[]> {
    await this.enforce(`block:read:${userId}`, SAFETY_LIMITS.read);
    const records = await this.deps.repository.listBlocks(userId, MAX_BLOCKS);
    return records.map(toBlockedUserDto);
  }

  async report(userId: string, command: ReportCommand, ctx: RequestContext): Promise<void> {
    await this.enforce(`report:${userId}`, SAFETY_LIMITS.report);
    await this.enforce(`report:day:${userId}`, SAFETY_LIMITS.reportPerDay);

    const targetId = await this.deps.repository.findActiveUserId(normalizeUsername(command.username));
    if (targetId === null) return;
    if (targetId === userId) {
      throw new AppError("VALIDATION_ERROR", "Anda tidak bisa melaporkan diri sendiri");
    }
    // Satu laporan terbuka per pasangan: mengulang tidak menambah antrean moderasi.
    if (await this.deps.repository.hasOpenReport(userId, targetId)) return;

    await this.deps.repository.createReport({
      reporterId: userId,
      targetUserId: targetId,
      reason: command.reason,
      details: command.details && command.details.length > 0 ? command.details : null,
    });
    // Audit hanya mencatat alasan: isi laporan (teks bebas, bisa memuat data pribadi) tidak masuk log.
    await this.audit(ctx, userId, "report.create", "User", targetId, { reason: command.reason });
  }

  private async audit(
    ctx: RequestContext,
    actorId: string,
    action: string,
    entity: string,
    entityId: string | null,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const event: AuditEvent = {
      action,
      actorId,
      entity,
      entityId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
    };
    if (metadata) event.metadata = metadata;
    await this.deps.audit(event);
  }

  private async enforce(key: string, rule: LimitRule): Promise<void> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSec);
  }
}
