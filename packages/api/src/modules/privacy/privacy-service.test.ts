import { DEFAULT_LOCATION_VISIBILITY } from "@social-finder/types";
import { describe, expect, it } from "vitest";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import type { AuditEvent } from "../auth/types";
import { PRIVACY_LIMITS, PrivacyService, SAFE_PRIVACY_DEFAULTS } from "./privacy-service";
import type { PrivacyRecord, PrivacyRepository, PrivacyUpdate } from "./types";

class FakeRepository implements PrivacyRepository {
  readonly rows = new Map<string, PrivacyRecord>();
  readonly accountCounts = new Map<string, number>();
  /** Setiap userId yang pernah diminta ke repositori: bukti tidak ada akses lintas pengguna. */
  readonly touched: string[] = [];
  writes = 0;

  async find(userId: string): Promise<PrivacyRecord | null> {
    this.touched.push(userId);
    return this.rows.get(userId) ?? null;
  }

  async countDiscoverableAccounts(userId: string): Promise<number> {
    this.touched.push(userId);
    return this.accountCounts.get(userId) ?? 0;
  }

  async update(userId: string, update: PrivacyUpdate): Promise<PrivacyRecord> {
    this.touched.push(userId);
    this.writes += 1;
    const current = this.rows.get(userId) ?? SAFE_PRIVACY_DEFAULTS;
    const next: PrivacyRecord = {
      ...current,
      ...update,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    this.rows.set(userId, next);
    return next;
  }
}

const CTX = { ip: "203.0.113.7", userAgent: "vitest" };

function setup() {
  const repository = new FakeRepository();
  const events: AuditEvent[] = [];
  const service = new PrivacyService({
    repository,
    limiter: new MemoryRateLimiter(() => 0),
    audit: async (event) => {
      events.push(event);
    },
    hmacSecret: "test-secret-test-secret-test-secret-123",
  });
  return { service, repository, events };
}

describe("default aman (opt-in)", () => {
  it("tanpa baris di DB: tidak discoverable, lokasi PRIVATE", async () => {
    const { service } = setup();
    const privacy = await service.getPrivacy("user-a");
    expect(privacy.isDiscoverable).toBe(false);
    expect(privacy.isEffectivelyDiscoverable).toBe(false);
    expect(privacy.locationVisibility).toBe("PRIVATE");
    expect(privacy.updatedAt).toBeNull();
  });

  it("konstanta default memakai default lokasi dari paket types", () => {
    expect(SAFE_PRIVACY_DEFAULTS.locationVisibility).toBe(DEFAULT_LOCATION_VISIBILITY);
    expect(SAFE_PRIVACY_DEFAULTS.isDiscoverable).toBe(false);
  });

  it("patch yang sama dengan default tidak membuat baris dan tidak mengaudit", async () => {
    const { service, repository, events } = setup();
    await service.updatePrivacy("user-a", { isDiscoverable: false, showPlatforms: true }, CTX);
    expect(repository.writes).toBe(0);
    expect(repository.rows.size).toBe(0);
    expect(events).toHaveLength(0);
  });
});

describe("discoverability", () => {
  it("aktif tanpa akun discoverable: saklar hidup tetapi belum efektif", async () => {
    const { service } = setup();
    const privacy = await service.updatePrivacy("user-a", { isDiscoverable: true }, CTX);
    expect(privacy.isDiscoverable).toBe(true);
    expect(privacy.discoverableAccountCount).toBe(0);
    expect(privacy.isEffectivelyDiscoverable).toBe(false);
  });

  it("efektif bila ada minimal satu akun discoverable", async () => {
    const { service, repository } = setup();
    repository.accountCounts.set("user-a", 2);
    const privacy = await service.updatePrivacy("user-a", { isDiscoverable: true }, CTX);
    expect(privacy.discoverableAccountCount).toBe(2);
    expect(privacy.isEffectivelyDiscoverable).toBe(true);
  });

  it("akun discoverable tetapi saklar utama mati: tidak efektif", async () => {
    const { service, repository } = setup();
    repository.accountCounts.set("user-a", 3);
    const privacy = await service.getPrivacy("user-a");
    expect(privacy.isEffectivelyDiscoverable).toBe(false);
  });

  it("mematikan discoverability langsung berlaku", async () => {
    const { service, repository } = setup();
    repository.accountCounts.set("user-a", 1);
    await service.updatePrivacy("user-a", { isDiscoverable: true }, CTX);
    const off = await service.updatePrivacy("user-a", { isDiscoverable: false }, CTX);
    expect(off.isDiscoverable).toBe(false);
    expect(off.isEffectivelyDiscoverable).toBe(false);
    expect((await service.getPrivacy("user-a")).isDiscoverable).toBe(false);
  });

  it("mengubah saklar lain tidak menyalakan discoverability", async () => {
    const { service } = setup();
    const privacy = await service.updatePrivacy(
      "user-a",
      { searchableByUsername: false, showPlatforms: false },
      CTX,
    );
    expect(privacy.searchableByUsername).toBe(false);
    expect(privacy.showPlatforms).toBe(false);
    expect(privacy.isDiscoverable).toBe(false);
    expect(privacy.locationVisibility).toBe("PRIVATE");
  });

  it("tanpa perubahan nyata: tidak menulis dan tidak mengaudit", async () => {
    const { service, repository, events } = setup();
    await service.updatePrivacy("user-a", { isDiscoverable: true }, CTX);
    const writes = repository.writes;
    const auditCount = events.length;
    await service.updatePrivacy("user-a", { isDiscoverable: true }, CTX);
    expect(repository.writes).toBe(writes);
    expect(events).toHaveLength(auditCount);
  });
});

describe("IDOR", () => {
  it("update pengguna A tidak menyentuh pengguna B", async () => {
    const { service, repository } = setup();
    await service.updatePrivacy("user-b", { showPlatforms: false }, CTX);
    repository.touched.length = 0;

    await service.updatePrivacy("user-a", { isDiscoverable: true }, CTX);
    expect(repository.touched.every((id) => id === "user-a")).toBe(true);
    expect(repository.rows.get("user-b")?.isDiscoverable).toBe(false);
    expect(repository.rows.get("user-b")?.showPlatforms).toBe(false);
  });
});

describe("DTO dan audit", () => {
  it("DTO hanya field yang diizinkan", async () => {
    const { service } = setup();
    const privacy = await service.getPrivacy("user-a");
    expect(Object.keys(privacy).sort()).toEqual(
      [
        "discoverableAccountCount",
        "isDiscoverable",
        "isEffectivelyDiscoverable",
        "locationVisibility",
        "searchableByUsername",
        "showPlatforms",
        "updatedAt",
      ].sort(),
    );
    expect(JSON.stringify(privacy)).not.toContain("user-a");
  });

  it("audit mencatat nama field dan nilai saklar utama, tanpa IP mentah", async () => {
    const { service, events } = setup();
    await service.updatePrivacy("user-a", { isDiscoverable: true, showPlatforms: false }, CTX);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("privacy.update");
    expect(events[0]?.metadata).toEqual({
      fields: "isDiscoverable,showPlatforms",
      isDiscoverable: true,
    });
    expect(JSON.stringify(events)).not.toContain(CTX.ip);
  });

  it("audit tidak memuat nilai isDiscoverable bila saklar itu tidak berubah", async () => {
    const { service, events } = setup();
    await service.updatePrivacy("user-a", { showPlatforms: false }, CTX);
    expect(events[0]?.metadata).toEqual({ fields: "showPlatforms" });
  });
});

describe("rate limit", () => {
  it("baca dibatasi per pengguna", async () => {
    const { service } = setup();
    for (let i = 0; i < PRIVACY_LIMITS.read.limit; i += 1) await service.getPrivacy("user-a");
    await expect(service.getPrivacy("user-a")).rejects.toBeInstanceOf(RateLimitedError);
    await expect(service.getPrivacy("user-b")).resolves.toBeTruthy();
  });

  it("ubah dibatasi per pengguna", async () => {
    const { service } = setup();
    for (let i = 0; i < PRIVACY_LIMITS.update.limit; i += 1) {
      await service.updatePrivacy("user-a", { showPlatforms: i % 2 === 0 }, CTX);
    }
    await expect(
      service.updatePrivacy("user-a", { isDiscoverable: true }, CTX),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});
