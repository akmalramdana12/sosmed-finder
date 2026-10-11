import { DEFAULT_LOCATION_VISIBILITY, type PrivacyDto } from "@social-finder/types";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import type { AuditEvent, AuditWriter } from "../auth/types";
import type { PrivacyRecord, PrivacyRepository, PrivacyUpdate } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const PRIVACY_LIMITS = {
  read: { limit: 120, windowSec: 60 },
  update: { limit: 30, windowSec: 60 },
} as const satisfies Record<string, LimitRule>;

/**
 * Nilai bila baris PrivacySettings belum ada. HARUS sama dengan default di schema.prisma
 * (dijaga oleh packages/database/src/privacy-defaults.test.ts): tidak ditemukan sampai
 * pengguna mengaktifkan sendiri.
 */
export const SAFE_PRIVACY_DEFAULTS: PrivacyRecord = {
  isDiscoverable: false,
  searchableByUsername: true,
  showPlatforms: true,
  locationVisibility: DEFAULT_LOCATION_VISIBILITY,
  updatedAt: null,
};

const FLAG_KEYS = ["isDiscoverable", "searchableByUsername", "showPlatforms"] as const;

export interface PrivacyDeps {
  repository: PrivacyRepository;
  limiter: RateLimiter;
  audit: AuditWriter;
  hmacSecret: string;
}

/** Whitelist eksplisit; tidak membocorkan userId atau field internal. */
export function toPrivacyDto(record: PrivacyRecord, discoverableAccountCount: number): PrivacyDto {
  return {
    isDiscoverable: record.isDiscoverable,
    searchableByUsername: record.searchableByUsername,
    showPlatforms: record.showPlatforms,
    locationVisibility: record.locationVisibility,
    discoverableAccountCount,
    // Saklar utama hidup DAN ada minimal satu akun yang boleh ditemukan.
    isEffectivelyDiscoverable: record.isDiscoverable && discoverableAccountCount > 0,
    updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
  };
}

export class PrivacyService {
  private readonly deps: PrivacyDeps;

  constructor(deps: PrivacyDeps) {
    this.deps = deps;
  }

  async getPrivacy(userId: string): Promise<PrivacyDto> {
    await this.enforce(`privacy:read:${userId}`, PRIVACY_LIMITS.read);
    const [record, count] = await Promise.all([
      this.deps.repository.find(userId),
      this.deps.repository.countDiscoverableAccounts(userId),
    ]);
    return toPrivacyDto(record ?? SAFE_PRIVACY_DEFAULTS, count);
  }

  async updatePrivacy(
    userId: string,
    patch: PrivacyUpdate,
    ctx: RequestContext,
  ): Promise<PrivacyDto> {
    await this.enforce(`privacy:update:${userId}`, PRIVACY_LIMITS.update);

    const current = (await this.deps.repository.find(userId)) ?? SAFE_PRIVACY_DEFAULTS;
    const update: PrivacyUpdate = {};
    const changed: string[] = [];
    for (const key of FLAG_KEYS) {
      const next = patch[key];
      if (next !== undefined && next !== current[key]) {
        update[key] = next;
        changed.push(key);
      }
    }

    if (changed.length === 0) {
      const count = await this.deps.repository.countDiscoverableAccounts(userId);
      return toPrivacyDto(current, count);
    }

    const updated = await this.deps.repository.update(userId, update);
    const count = await this.deps.repository.countDiscoverableAccounts(userId);

    await this.audit({
      action: "privacy.update",
      actorId: userId,
      entity: "PrivacySettings",
      entityId: userId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
      // Nilai boolean saklar utama dicatat: berguna untuk menelusuri kapan pengguna opt-in/opt-out.
      metadata: {
        fields: changed.join(","),
        ...(update.isDiscoverable !== undefined ? { isDiscoverable: update.isDiscoverable } : {}),
      },
    });
    return toPrivacyDto(updated, count);
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
