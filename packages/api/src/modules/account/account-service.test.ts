import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import type { AuditEvent, PasswordHasher } from "../auth/types";
import { ACCOUNT_LIMITS, AccountService, DELETION_GRACE_DAYS } from "./account-service";
import type { AccountExportRecord, AccountRepository } from "./types";

const CTX = { ip: "203.0.113.7", userAgent: "vitest" };
const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const ME = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-10T00:00:00Z");

/** Hasher tiruan: hash = "h:" + password. */
const hasher: PasswordHasher = {
  hash: async (p) => `h:${p}`,
  verify: async (hash, p) => hash === `h:${p}`,
};

class FakeRepository implements AccountRepository {
  hash: string | null = "h:password-lama-12";
  revokedAt: Date | null = null;
  deletedAt: Date | null = null;
  purgeCutoff: Date | null = null;
  exportRecord: AccountExportRecord | null = {
    email: "me@example.test",
    username: "Me",
    emailVerifiedAt: new Date("2026-10-01T00:00:00Z"),
    createdAt: new Date("2026-09-01T00:00:00Z"),
    profile: { displayName: "Me Doe", bio: "halo", avatarUrl: null },
    privacy: { isDiscoverable: true, searchableByUsername: true, showPlatforms: false, locationVisibility: "AREA_ONLY" },
    location: { isEnabled: true, accuracyLevel: "AREA", areaLabel: "Sekupang", cityLabel: null, discoverableRadiusM: 5000, updatedAt: new Date("2026-10-02T00:00:00Z") },
    socialAccounts: [{ platformKey: "instagram", username: "me_ig", profileUrl: "https://instagram.com/me_ig", isVerified: false, isDiscoverable: true }],
    blocks: [{ username: "bob", createdAt: new Date("2026-10-03T00:00:00Z") }],
    reportsMade: [{ reason: "SPAM", status: "OPEN", details: "spam", createdAt: new Date("2026-10-04T00:00:00Z") }],
  };
  async loadExport() {
    return this.exportRecord;
  }
  async getPasswordHash() {
    return this.hash;
  }
  async setPasswordAndRevokeSessions(_u: string, passwordHash: string, at: Date) {
    this.hash = passwordHash;
    this.revokedAt = at;
  }
  async markDeleted(_u: string, at: Date) {
    this.deletedAt = at;
    this.revokedAt = at;
    this.hash = null;
  }
  async purgeDeletedBefore(cutoff: Date) {
    this.purgeCutoff = cutoff;
    return 2;
  }
}

function setup() {
  const repository = new FakeRepository();
  const audits: AuditEvent[] = [];
  const service = new AccountService({
    repository,
    hasher,
    limiter: new MemoryRateLimiter(),
    audit: async (e) => {
      audits.push(e);
    },
    now: () => NOW,
    hmacSecret: SECRET,
  });
  return { repository, audits, service };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof AppError ? e.code : "OTHER";
  }
  return "NO_ERROR";
}

describe("AccountService.changePassword", () => {
  it("mengganti hash, mencabut semua sesi, dan mengaudit tanpa password", async () => {
    const { service, repository, audits } = setup();
    await service.changePassword(ME, "password-lama-12", "password-baru-yang-panjang", CTX);
    expect(repository.hash).toBe("h:password-baru-yang-panjang");
    expect(repository.revokedAt).toEqual(NOW);
    expect(audits.map((a) => a.action)).toEqual(["account.password.change"]);
    const dump = JSON.stringify(audits);
    expect(dump).not.toContain("password-lama");
    expect(dump).not.toContain("password-baru");
    expect(dump).not.toContain("203.0.113.7");
  });

  it("password lama salah: ditolak, tidak ada perubahan", async () => {
    const { service, repository, audits } = setup();
    expect(await code(service.changePassword(ME, "salah", "password-baru-yang-panjang", CTX))).toBe("VALIDATION_ERROR");
    expect(repository.hash).toBe("h:password-lama-12");
    expect(repository.revokedAt).toBeNull();
    expect(audits.length).toBe(0);
  });

  it("password baru sama dengan yang lama ditolak", async () => {
    const { service, repository } = setup();
    expect(await code(service.changePassword(ME, "password-lama-12", "password-lama-12", CTX))).toBe("VALIDATION_ERROR");
    expect(repository.revokedAt).toBeNull();
  });

  it("akun tidak aktif (tanpa hash) diperlakukan sebagai gagal", async () => {
    const { service, repository } = setup();
    repository.hash = null;
    expect(await code(service.changePassword(ME, "x", "password-baru-yang-panjang", CTX))).toBe("VALIDATION_ERROR");
  });

  it("dibatasi 5 percobaan per 15 menit (mencegah menebak password lama dari sesi dibajak)", async () => {
    const { service } = setup();
    for (let i = 0; i < ACCOUNT_LIMITS.changePassword.limit; i += 1) {
      await code(service.changePassword(ME, "salah", "password-baru-yang-panjang", CTX));
    }
    await expect(service.changePassword(ME, "password-lama-12", "password-baru-yang-panjang", CTX)).rejects.toThrow(RateLimitedError);
  });
});

describe("AccountService.deleteAccount", () => {
  it("menandai akun dihapus dan mengaudit", async () => {
    const { service, repository, audits } = setup();
    await service.deleteAccount(ME, "password-lama-12", CTX);
    expect(repository.deletedAt).toEqual(NOW);
    expect(repository.revokedAt).toEqual(NOW);
    expect(audits.map((a) => a.action)).toEqual(["account.delete"]);
    expect(JSON.stringify(audits)).not.toContain("password-lama");
  });

  it("password salah: akun tidak disentuh", async () => {
    const { service, repository } = setup();
    expect(await code(service.deleteAccount(ME, "salah", CTX))).toBe("VALIDATION_ERROR");
    expect(repository.deletedAt).toBeNull();
  });

  it("dibatasi 3 per jam", async () => {
    const { service } = setup();
    for (let i = 0; i < ACCOUNT_LIMITS.deleteAccount.limit; i += 1) await code(service.deleteAccount(ME, "salah", CTX));
    await expect(service.deleteAccount(ME, "password-lama-12", CTX)).rejects.toThrow(RateLimitedError);
  });
});

describe("AccountService.purgeExpired", () => {
  it("memakai batas masa tunggu 30 hari", async () => {
    const { service, repository } = setup();
    expect(await service.purgeExpired()).toBe(2);
    expect(repository.purgeCutoff).toEqual(new Date(NOW.getTime() - DELETION_GRACE_DAYS * 86_400_000));
    expect(DELETION_GRACE_DAYS).toBe(30);
  });
});

describe("exportData", () => {
  it("password salah ditolak dan tidak ada data dimuat atau diaudit", async () => {
    const { service, audits } = setup();
    await expect(service.exportData(ME, "salah", CTX)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(audits).toHaveLength(0);
  });

  it("mengembalikan data sendiri tanpa koordinat, hash, token, atau data moderasi; diaudit tanpa isi", async () => {
    const { service, audits } = setup();
    const dto = await service.exportData(ME, "password-lama-12", CTX);
    expect(dto.account).toEqual({ email: "me@example.test", username: "Me", emailVerified: true, createdAt: "2026-09-01T00:00:00.000Z" });
    expect(dto.location).toEqual({ isEnabled: true, accuracyLevel: "AREA", areaLabel: "Sekupang", cityLabel: null, discoverableRadiusKm: 5, updatedAt: "2026-10-02T00:00:00.000Z" });
    expect(dto.socialAccounts[0]?.platform).toBe("instagram");
    expect(dto.blocks).toEqual([{ username: "bob", blockedAt: "2026-10-03T00:00:00.000Z" }]);
    expect(Object.keys(dto).sort()).toEqual(["account", "blocks", "exportedAt", "location", "privacy", "profile", "reportsMade", "socialAccounts"]);
    expect(JSON.stringify(dto)).not.toMatch(/latitude|longitude|geography|passwordHash|token|moderatorNote|reporterId|"id"/i);
    expect(audits.map((a) => a.action)).toEqual(["account.export"]);
    expect(JSON.stringify(audits)).not.toMatch(/me@example|Sekupang|bob/);
  });

  it("akun tidak ada: NOT_FOUND; dibatasi 3 kali per jam", async () => {
    const { service, repository } = setup();
    repository.exportRecord = null;
    await expect(service.exportData(ME, "password-lama-12", CTX)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.exportData(ME, "password-lama-12", CTX)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.exportData(ME, "password-lama-12", CTX)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.exportData(ME, "password-lama-12", CTX)).rejects.toBeInstanceOf(RateLimitedError);
    expect(ACCOUNT_LIMITS.exportData.limit).toBe(3);
  });
});
