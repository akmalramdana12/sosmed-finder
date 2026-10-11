import type { PlatformDto, SocialAccountDto } from "@social-finder/types";
import { normalizeUsername } from "@social-finder/validation";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import { UniqueViolationError, type AuditEvent, type AuditWriter } from "../auth/types";
import { InvalidProfileUrlError, buildProfileUrl } from "./profile-url";
import type { SocialAccountRecord, SocialAccountRepository, SocialAccountUpdate } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const SOCIAL_LIMITS = {
  read: { limit: 120, windowSec: 60 },
  create: { limit: 20, windowSec: 3600 },
  mutate: { limit: 30, windowSec: 60 },
  platforms: { limit: 60, windowSec: 60 },
} as const satisfies Record<string, LimitRule>;

/** Batas jumlah akun per pengguna (mencegah spam klaim). */
export const MAX_SOCIAL_ACCOUNTS = 10;

export interface SocialAccountDeps {
  repository: SocialAccountRepository;
  limiter: RateLimiter;
  audit: AuditWriter;
  hmacSecret: string;
}

export interface CreateSocialAccountCommand {
  platformKey: string;
  username: string;
}

export interface UpdateSocialAccountCommand {
  username?: string | undefined;
  isDiscoverable?: boolean | undefined;
}

/** Whitelist eksplisit: tidak membocorkan userId, platformId, normalizedUsername, urlTemplate. */
export function toSocialAccountDto(record: SocialAccountRecord): SocialAccountDto {
  return {
    id: record.id,
    platform: { key: record.platformKey, name: record.platformName },
    username: record.username,
    profileUrl: record.profileUrl,
    isVerified: record.isVerified,
    isDiscoverable: record.isDiscoverable,
    createdAt: record.createdAt.toISOString(),
  };
}

const NOT_FOUND_MESSAGE = "Akun tidak ditemukan";

export class SocialAccountService {
  private readonly deps: SocialAccountDeps;

  constructor(deps: SocialAccountDeps) {
    this.deps = deps;
  }

  /** Daftar platform aktif (publik, dibatasi per IP). */
  async listPlatforms(ctx: RequestContext): Promise<PlatformDto[]> {
    const ipHash = hashIdentifier(ctx.ip, this.deps.hmacSecret);
    await this.enforce(`platforms:ip:${ipHash}`, SOCIAL_LIMITS.platforms);
    const platforms = await this.deps.repository.listPlatforms();
    return platforms.map((platform) => ({ key: platform.key, name: platform.name }));
  }

  async list(userId: string): Promise<SocialAccountDto[]> {
    await this.enforce(`social:read:${userId}`, SOCIAL_LIMITS.read);
    const records = await this.deps.repository.listByUser(userId);
    return records.map(toSocialAccountDto);
  }

  async create(
    userId: string,
    command: CreateSocialAccountCommand,
    ctx: RequestContext,
  ): Promise<SocialAccountDto> {
    await this.enforce(`social:create:${userId}`, SOCIAL_LIMITS.create);

    const platform = await this.deps.repository.findPlatformByKey(command.platformKey);
    if (!platform) throw new AppError("VALIDATION_ERROR", "Platform tidak didukung");

    const count = await this.deps.repository.countByUser(userId);
    if (count >= MAX_SOCIAL_ACCOUNTS) {
      throw new AppError("CONFLICT", `Maksimal ${MAX_SOCIAL_ACCOUNTS} akun per pengguna`);
    }

    const profileUrl = this.buildUrl(platform.urlTemplate, command.username);
    let created: SocialAccountRecord;
    try {
      created = await this.deps.repository.create(userId, {
        platformId: platform.id,
        username: command.username,
        normalizedUsername: normalizeUsername(command.username),
        profileUrl,
      });
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        throw new AppError("CONFLICT", "Akun ini sudah ada di profil Anda");
      }
      throw error;
    }

    await this.audit({
      action: "social_account.create",
      actorId: userId,
      entity: "SocialAccount",
      entityId: created.id,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
      metadata: { platform: platform.key },
    });
    return toSocialAccountDto(created);
  }

  async update(
    userId: string,
    id: string,
    command: UpdateSocialAccountCommand,
    ctx: RequestContext,
  ): Promise<SocialAccountDto> {
    await this.enforce(`social:mutate:${userId}`, SOCIAL_LIMITS.mutate);

    // "Tidak ada" dan "bukan milik Anda" sengaja tidak dibedakan (404 seragam).
    const owned = await this.deps.repository.findOwned(userId, id);
    if (!owned) throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);

    const update: SocialAccountUpdate = {};
    const changed: string[] = [];
    let verificationReset = false;

    if (command.username !== undefined && command.username !== owned.username) {
      const normalized = normalizeUsername(command.username);
      update.username = command.username;
      update.normalizedUsername = normalized;
      update.profileUrl = this.buildUrl(owned.urlTemplate, command.username);
      changed.push("username");
      // Handle yang berbeda = akun yang berbeda: verifikasi lama tidak berlaku lagi.
      // Ganti huruf besar/kecil saja (handle sama) mempertahankan verifikasi.
      if (owned.isVerified && normalized !== normalizeUsername(owned.username)) {
        update.isVerified = false;
        verificationReset = true;
      }
    }
    if (command.isDiscoverable !== undefined && command.isDiscoverable !== owned.isDiscoverable) {
      update.isDiscoverable = command.isDiscoverable;
      changed.push("isDiscoverable");
    }

    if (changed.length === 0) return toSocialAccountDto(owned);

    let updated: SocialAccountRecord | null;
    try {
      updated = await this.deps.repository.update(userId, id, update);
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        throw new AppError("CONFLICT", "Akun ini sudah ada di profil Anda");
      }
      throw error;
    }
    if (!updated) throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);

    await this.audit({
      action: "social_account.update",
      actorId: userId,
      entity: "SocialAccount",
      entityId: id,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
      metadata: { fields: changed.join(","), verificationReset },
    });
    return toSocialAccountDto(updated);
  }

  async delete(userId: string, id: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`social:mutate:${userId}`, SOCIAL_LIMITS.mutate);
    const removed = await this.deps.repository.delete(userId, id);
    if (!removed) throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    await this.audit({
      action: "social_account.delete",
      actorId: userId,
      entity: "SocialAccount",
      entityId: id,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
    });
  }

  private buildUrl(template: string, username: string): string {
    try {
      return buildProfileUrl(template, username);
    } catch (error) {
      if (error instanceof InvalidProfileUrlError) {
        throw new AppError("VALIDATION_ERROR", "Username tidak valid untuk platform ini");
      }
      throw error;
    }
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
