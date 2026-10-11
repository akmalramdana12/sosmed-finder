import { describe, expect, it } from "vitest";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import { UniqueViolationError, type AuditEvent } from "../auth/types";
import { MAX_SOCIAL_ACCOUNTS, SOCIAL_LIMITS, SocialAccountService } from "./social-account-service";
import type {
  NewSocialAccount,
  OwnedSocialAccount,
  PlatformRecord,
  SocialAccountRecord,
  SocialAccountRepository,
  SocialAccountUpdate,
} from "./types";

interface Row {
  id: string;
  userId: string;
  platformId: string;
  username: string;
  normalizedUsername: string;
  profileUrl: string;
  isVerified: boolean;
  isDiscoverable: boolean;
  createdAt: Date;
}

const PLATFORMS: PlatformRecord[] = [
  {
    id: "p-ig",
    key: "instagram",
    name: "Instagram",
    urlTemplate: "https://www.instagram.com/{username}",
  },
  { id: "p-gh", key: "github", name: "GitHub", urlTemplate: "https://github.com/{username}" },
];

class FakeRepository implements SocialAccountRepository {
  readonly rows: Row[] = [];
  private counter = 0;

  private record(row: Row): SocialAccountRecord {
    const platform = PLATFORMS.find((candidate) => candidate.id === row.platformId);
    if (!platform) throw new Error("platform tidak ada");
    return {
      id: row.id,
      platformKey: platform.key,
      platformName: platform.name,
      username: row.username,
      profileUrl: row.profileUrl,
      isVerified: row.isVerified,
      isDiscoverable: row.isDiscoverable,
      createdAt: row.createdAt,
    };
  }

  async listByUser(userId: string): Promise<SocialAccountRecord[]> {
    return this.rows.filter((row) => row.userId === userId).map((row) => this.record(row));
  }

  async countByUser(userId: string): Promise<number> {
    return this.rows.filter((row) => row.userId === userId).length;
  }

  async listPlatforms(): Promise<PlatformRecord[]> {
    return PLATFORMS;
  }

  async findPlatformByKey(key: string): Promise<PlatformRecord | null> {
    return PLATFORMS.find((platform) => platform.key === key) ?? null;
  }

  async findOwned(userId: string, id: string): Promise<OwnedSocialAccount | null> {
    const row = this.rows.find((candidate) => candidate.id === id && candidate.userId === userId);
    if (!row) return null;
    const platform = PLATFORMS.find((candidate) => candidate.id === row.platformId);
    return { ...this.record(row), urlTemplate: platform?.urlTemplate ?? "" };
  }

  async create(userId: string, input: NewSocialAccount): Promise<SocialAccountRecord> {
    const duplicate = this.rows.some(
      (row) =>
        row.userId === userId &&
        row.platformId === input.platformId &&
        row.normalizedUsername === input.normalizedUsername,
    );
    if (duplicate) throw new UniqueViolationError("username");
    this.counter += 1;
    const row: Row = {
      id: `acc-${this.counter}`,
      userId,
      platformId: input.platformId,
      username: input.username,
      normalizedUsername: input.normalizedUsername,
      profileUrl: input.profileUrl,
      isVerified: false,
      isDiscoverable: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    this.rows.push(row);
    return this.record(row);
  }

  async update(
    userId: string,
    id: string,
    update: SocialAccountUpdate,
  ): Promise<SocialAccountRecord | null> {
    const row = this.rows.find((candidate) => candidate.id === id && candidate.userId === userId);
    if (!row) return null;
    if (
      update.normalizedUsername !== undefined &&
      this.rows.some(
        (other) =>
          other.id !== id &&
          other.userId === userId &&
          other.platformId === row.platformId &&
          other.normalizedUsername === update.normalizedUsername,
      )
    ) {
      throw new UniqueViolationError("username");
    }
    if (update.username !== undefined) row.username = update.username;
    if (update.normalizedUsername !== undefined) row.normalizedUsername = update.normalizedUsername;
    if (update.profileUrl !== undefined) row.profileUrl = update.profileUrl;
    if (update.isVerified !== undefined) row.isVerified = update.isVerified;
    if (update.isDiscoverable !== undefined) row.isDiscoverable = update.isDiscoverable;
    return this.record(row);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.id === id && row.userId === userId);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

const CTX = { ip: "203.0.113.7", userAgent: "vitest" };

function setup() {
  const repository = new FakeRepository();
  const events: AuditEvent[] = [];
  const service = new SocialAccountService({
    repository,
    limiter: new MemoryRateLimiter(() => 0),
    audit: async (event) => {
      events.push(event);
    },
    hmacSecret: "test-secret-test-secret-test-secret-123",
  });
  return { service, repository, events };
}

describe("create", () => {
  it("profileUrl dibangun server dari template platform", async () => {
    const { service } = setup();
    const account = await service.create(
      "user-a",
      { platformKey: "instagram", username: "Alex" },
      CTX,
    );
    expect(account.profileUrl).toBe("https://www.instagram.com/Alex");
    expect(account.platform).toEqual({ key: "instagram", name: "Instagram" });
    expect(account.isVerified).toBe(false);
    expect(account.isDiscoverable).toBe(false);
  });

  it("platform tidak dikenal: VALIDATION_ERROR", async () => {
    const { service } = setup();
    await expect(
      service.create("user-a", { platformKey: "myspace", username: "alex" }, CTX),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("username tidak aman ditolak walau lolos lapisan validasi (pertahanan berlapis)", async () => {
    const { service, repository } = setup();
    await expect(
      service.create("user-a", { platformKey: "github", username: "a/../b" }, CTX),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.rows).toHaveLength(0);
  });

  it("akun yang sama dua kali: CONFLICT (huruf besar/kecil dianggap sama)", async () => {
    const { service } = setup();
    await service.create("user-a", { platformKey: "github", username: "Alex" }, CTX);
    await expect(
      service.create("user-a", { platformKey: "github", username: "alex" }, CTX),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("platform berbeda dengan username sama diperbolehkan", async () => {
    const { service } = setup();
    await service.create("user-a", { platformKey: "github", username: "alex" }, CTX);
    await expect(
      service.create("user-a", { platformKey: "instagram", username: "alex" }, CTX),
    ).resolves.toBeTruthy();
  });

  it("dibatasi jumlah akun per pengguna", async () => {
    const { service } = setup();
    for (let i = 0; i < MAX_SOCIAL_ACCOUNTS; i += 1) {
      await service.create("user-a", { platformKey: "github", username: `user_${i}` }, CTX);
    }
    await expect(
      service.create("user-a", { platformKey: "github", username: "satu_lagi" }, CTX),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("dibatasi laju pembuatan per jam", async () => {
    const { service, repository } = setup();
    // Percobaan gagal (platform tidak dikenal) tetap menghabiskan kuota, tanpa menyentuh batas jumlah akun.
    for (let i = 0; i < SOCIAL_LIMITS.create.limit; i += 1) {
      await service
        .create("user-a", { platformKey: "myspace", username: "x" }, CTX)
        .catch(() => undefined);
    }
    expect(repository.rows).toHaveLength(0);
    await expect(
      service.create("user-a", { platformKey: "github", username: "alex" }, CTX),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("audit hanya memuat key platform, bukan username", async () => {
    const { service, events } = setup();
    await service.create("user-a", { platformKey: "github", username: "rahasia_id" }, CTX);
    const serialized = JSON.stringify(events);
    expect(events[0]?.metadata).toEqual({ platform: "github" });
    expect(serialized).not.toContain("rahasia_id");
    expect(serialized).not.toContain(CTX.ip);
  });
});

describe("DTO", () => {
  it("hanya field publik; tanpa userId, platformId, normalizedUsername, urlTemplate", async () => {
    const { service } = setup();
    await service.create("user-a", { platformKey: "github", username: "alex" }, CTX);
    const [account] = await service.list("user-a");
    expect(Object.keys(account ?? {}).sort()).toEqual(
      [
        "createdAt",
        "id",
        "isDiscoverable",
        "isVerified",
        "platform",
        "profileUrl",
        "username",
      ].sort(),
    );
    const serialized = JSON.stringify(account);
    expect(serialized).not.toContain("urlTemplate");
    expect(serialized).not.toContain("user-a");
    expect(serialized).not.toContain("p-gh");
  });
});

describe("IDOR: dua pengguna", () => {
  async function twoUsers() {
    const ctx = setup();
    const a = await ctx.service.create("user-a", { platformKey: "github", username: "alice" }, CTX);
    const b = await ctx.service.create("user-b", { platformKey: "github", username: "bobby" }, CTX);
    return { ...ctx, a, b };
  }

  it("list hanya mengembalikan akun milik sendiri", async () => {
    const { service, a } = await twoUsers();
    const list = await service.list("user-a");
    expect(list.map((account) => account.id)).toEqual([a.id]);
  });

  it("update akun milik orang lain: NOT_FOUND, data tidak berubah", async () => {
    const { service, repository, b } = await twoUsers();
    await expect(
      service.update("user-a", b.id, { username: "dibajak", isDiscoverable: true }, CTX),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const row = repository.rows.find((candidate) => candidate.id === b.id);
    expect(row?.username).toBe("bobby");
    expect(row?.isDiscoverable).toBe(false);
  });

  it("respons 'bukan milik Anda' identik dengan 'tidak ada' (tidak membocorkan keberadaan)", async () => {
    const { service, b } = await twoUsers();
    const visible = (error: unknown) => {
      const e = error as { name: string; code: string; status: number; message: string };
      return { name: e.name, code: e.code, status: e.status, message: e.message };
    };
    const foreign = await service
      .update("user-a", b.id, { isDiscoverable: true }, CTX)
      .catch((error: unknown) => error);
    const missing = await service
      .update("user-a", "tidak-ada", { isDiscoverable: true }, CTX)
      .catch((error: unknown) => error);
    expect(visible(foreign)).toEqual(visible(missing));
    expect(visible(foreign).code).toBe("NOT_FOUND");
  });

  it("delete akun milik orang lain: NOT_FOUND, akun tetap ada", async () => {
    const { service, repository, b } = await twoUsers();
    await expect(service.delete("user-a", b.id, CTX)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.rows.some((row) => row.id === b.id)).toBe(true);
  });

  it("delete akun sendiri berhasil dan hanya menghapus itu", async () => {
    const { service, repository, a, b } = await twoUsers();
    await service.delete("user-a", a.id, CTX);
    expect(repository.rows.map((row) => row.id)).toEqual([b.id]);
  });
});

describe("update", () => {
  it("toggle isDiscoverable tidak mengubah URL maupun verifikasi", async () => {
    const { service, repository } = setup();
    const account = await service.create(
      "user-a",
      { platformKey: "github", username: "alex" },
      CTX,
    );
    const row = repository.rows[0];
    if (!row) throw new Error("row tidak ada");
    row.isVerified = true; // simulasi verifikasi resmi di masa depan

    const updated = await service.update("user-a", account.id, { isDiscoverable: true }, CTX);
    expect(updated.isDiscoverable).toBe(true);
    expect(updated.isVerified).toBe(true);
    expect(updated.profileUrl).toBe("https://github.com/alex");
  });

  it("ganti username: URL dibangun ulang dan verifikasi dicabut", async () => {
    const { service, repository, events } = setup();
    const account = await service.create(
      "user-a",
      { platformKey: "github", username: "alex" },
      CTX,
    );
    const row = repository.rows[0];
    if (!row) throw new Error("row tidak ada");
    row.isVerified = true;

    const updated = await service.update("user-a", account.id, { username: "alexander" }, CTX);
    expect(updated.profileUrl).toBe("https://github.com/alexander");
    expect(updated.isVerified).toBe(false);
    expect(events.at(-1)?.metadata).toEqual({ fields: "username", verificationReset: true });
  });

  it("ganti huruf besar/kecil saja mempertahankan verifikasi", async () => {
    const { service, repository } = setup();
    const account = await service.create(
      "user-a",
      { platformKey: "github", username: "alex" },
      CTX,
    );
    const row = repository.rows[0];
    if (!row) throw new Error("row tidak ada");
    row.isVerified = true;

    const updated = await service.update("user-a", account.id, { username: "Alex" }, CTX);
    expect(updated.username).toBe("Alex");
    expect(updated.isVerified).toBe(true);
  });

  it("ganti username jadi yang sudah ada di profil sendiri: CONFLICT, data tidak berubah", async () => {
    const { service, repository } = setup();
    await service.create("user-a", { platformKey: "github", username: "alex" }, CTX);
    const second = await service.create(
      "user-a",
      { platformKey: "github", username: "alexa" },
      CTX,
    );
    await expect(
      service.update("user-a", second.id, { username: "ALEX" }, CTX),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.rows.find((row) => row.id === second.id)?.username).toBe("alexa");
  });

  it("tanpa perubahan nyata: tidak menulis dan tidak mengaudit", async () => {
    const { service, events } = setup();
    const account = await service.create(
      "user-a",
      { platformKey: "github", username: "alex" },
      CTX,
    );
    const before = events.length;
    await service.update("user-a", account.id, { username: "alex", isDiscoverable: false }, CTX);
    expect(events).toHaveLength(before);
  });
});

describe("listPlatforms", () => {
  it("hanya key dan name (tanpa urlTemplate/id), dibatasi per IP", async () => {
    const { service } = setup();
    const platforms = await service.listPlatforms(CTX);
    expect(platforms).toEqual([
      { key: "instagram", name: "Instagram" },
      { key: "github", name: "GitHub" },
    ]);
    for (let i = 1; i < SOCIAL_LIMITS.platforms.limit; i += 1) await service.listPlatforms(CTX);
    await expect(service.listPlatforms(CTX)).rejects.toBeInstanceOf(RateLimitedError);
  });
});
