import type { MeDto } from "@social-finder/types";
import { normalizeUsername } from "@social-finder/validation";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import { UniqueViolationError, type AuditEvent, type AuditWriter } from "../auth/types";
import type { MeRecord, MeUpdate, ProfileRepository } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const PROFILE_LIMITS = {
  read: { limit: 120, windowSec: 60 },
  update: { limit: 30, windowSec: 60 },
  /** Batas ganti username: mencegah squatting, menghindari block, dan probing ketersediaan. */
  usernameChange: { limit: 3, windowSec: 86_400 },
} as const satisfies Record<string, LimitRule>;

export interface ProfileDeps {
  repository: ProfileRepository;
  limiter: RateLimiter;
  audit: AuditWriter;
  /** Secret untuk HMAC IP di audit log. */
  hmacSecret: string;
}

export interface ProfilePatch {
  displayName?: string | undefined;
  bio?: string | null | undefined;
  username?: string | undefined;
}

/**
 * Whitelist eksplisit: field baru di record tidak otomatis bocor ke klien,
 * dan field internal (passwordHash, status, ...) tidak pernah ikut walau repositori mengembalikannya.
 */
export function toMeDto(record: MeRecord): MeDto {
  return {
    id: record.id,
    email: record.email,
    emailVerified: record.emailVerifiedAt !== null,
    username: record.username,
    displayName: record.displayName,
    bio: record.bio,
    createdAt: record.createdAt.toISOString(),
  };
}

export class ProfileService {
  private readonly deps: ProfileDeps;

  constructor(deps: ProfileDeps) {
    this.deps = deps;
  }

  async getMe(userId: string): Promise<MeDto> {
    await this.enforce(`me:read:${userId}`, PROFILE_LIMITS.read);
    const record = await this.deps.repository.findMe(userId);
    if (!record) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan");
    return toMeDto(record);
  }

  async updateMe(userId: string, patch: ProfilePatch, ctx: RequestContext): Promise<MeDto> {
    await this.enforce(`me:update:${userId}`, PROFILE_LIMITS.update);

    const current = await this.deps.repository.findMe(userId);
    if (!current) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan");

    const update: MeUpdate = {};
    const changed: string[] = [];

    if (patch.displayName !== undefined && patch.displayName !== current.displayName) {
      update.displayName = patch.displayName;
      changed.push("displayName");
    }
    if (patch.bio !== undefined && patch.bio !== current.bio) {
      update.bio = patch.bio;
      changed.push("bio");
    }
    if (patch.username !== undefined && patch.username !== current.username) {
      const normalized = normalizeUsername(patch.username);
      // Ganti huruf besar/kecil saja (normalisasi sama) tidak dihitung sebagai pergantian username.
      if (normalized !== normalizeUsername(current.username)) {
        await this.enforce(`me:username:${userId}`, PROFILE_LIMITS.usernameChange);
      }
      update.username = patch.username;
      update.normalizedUsername = normalized;
      changed.push("username");
    }

    if (changed.length === 0) return toMeDto(current);

    let updated: MeRecord | null;
    try {
      updated = await this.deps.repository.update(userId, update);
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        throw new AppError("CONFLICT", "Username sudah dipakai");
      }
      throw error;
    }
    if (!updated) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan");

    await this.audit({
      action: "profile.update",
      actorId: userId,
      entity: "User",
      entityId: userId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
      // Hanya NAMA field yang berubah, tidak pernah nilainya (bio/nama bisa berisi data pribadi).
      metadata: { fields: changed.join(",") },
    });
    return toMeDto(updated);
  }

  private async enforce(key: string, rule: LimitRule): Promise<void> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSec);
  }

  private async audit(event: AuditEvent): Promise<void> {
    try {
      await this.deps.audit(event);
    } catch {
      console.error(
        JSON.stringify({ level: "error", msg: "audit write failed", action: event.action }),
      );
    }
  }
}
