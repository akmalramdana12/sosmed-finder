import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import { decodeCursor } from "./cursor";
import { ACCOUNT, candidate } from "./fixtures";
import { SEARCH_LIMITS, SUSPICIOUS_SEARCH, SearchService, type SearchCommand } from "./search-service";
import type { AuditEvent } from "../auth/types";
import type {
  SearchCandidate,
  SearchCriteria,
  SearchLogEntry,
  SearchRepository,
} from "./types";

const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const ME = "99999999-9999-4999-8999-999999999999";

class FakeRepository implements SearchRepository {
  rows: SearchCandidate[] = [];
  profile: SearchCandidate | null = null;
  hasLocation = true;
  failLog = false;
  recentCount = 0;
  failCount = false;
  readonly criteria: SearchCriteria[] = [];
  readonly logs: SearchLogEntry[] = [];
  readonly profileLookups: Array<[string, string]> = [];

  async search(criteria: SearchCriteria): Promise<SearchCandidate[]> {
    this.criteria.push(criteria);
    return this.rows;
  }
  async findByUsername(searcherId: string, normalizedUsername: string) {
    this.profileLookups.push([searcherId, normalizedUsername]);
    return this.profile;
  }
  async hasEnabledLocation(): Promise<boolean> {
    return this.hasLocation;
  }
  async countRecentSearches(): Promise<number> {
    if (this.failCount) throw new Error("db down");
    return this.recentCount;
  }
  async logSearch(entry: SearchLogEntry): Promise<void> {
    if (this.failLog) throw new Error("db down");
    this.logs.push(entry);
  }
}

function setup() {
  const repository = new FakeRepository();
  const service = new SearchService({
    repository,
    limiter: new MemoryRateLimiter(),
    hmacSecret: SECRET,
  });
  return { repository, service };
}

const BY_NAME: SearchCommand = { q: "ale", mode: "prefix", limit: 20 };

function userN(n: number, overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return candidate({
    userId: id,
    username: `user${n}`,
    normalizedUsername: `user${n}`,
    distanceUnits: n + 2,
    distanceM: (n + 2) * 500,
    ...overrides,
  });
}

describe("SearchService.search: validasi permintaan", () => {
  it("menolak permintaan tanpa q dan tanpa radius (tidak ada 'daftar semua orang')", async () => {
    const { service, repository } = setup();
    await expect(service.search(ME, { mode: "exact", limit: 20 })).rejects.toThrow(AppError);
    expect(repository.criteria).toHaveLength(0);
  });

  it("sort=distance tanpa radius ditolak", async () => {
    const { service } = setup();
    await expect(service.search(ME, { ...BY_NAME, sort: "distance" })).rejects.toThrow(AppError);
  });

  it("pencarian radius butuh lokasi aktif milik pencari sendiri", async () => {
    const { service, repository } = setup();
    repository.hasLocation = false;
    await expect(service.search(ME, { mode: "exact", radiusKm: 5, limit: 20 })).rejects.toThrow(AppError);
    expect(repository.criteria).toHaveLength(0);
  });

  it("pencari adalah id dari sesi dan diteruskan apa adanya ke repositori", async () => {
    const { service, repository } = setup();
    await service.search(ME, BY_NAME);
    expect(repository.criteria[0]?.searcherId).toBe(ME);
  });

  it("radius km diubah ke meter, sort bawaan: jarak untuk radius, username untuk kata kunci", async () => {
    const { service, repository } = setup();
    await service.search(ME, { mode: "exact", radiusKm: 5, limit: 20 });
    await service.search(ME, BY_NAME);
    expect(repository.criteria[0]).toMatchObject({ radiusM: 5000, sort: "distance", query: null });
    expect(repository.criteria[1]).toMatchObject({
      radiusM: null,
      sort: "username",
      query: { text: "ale", mode: "prefix", includeHandles: true },
    });
  });
});

describe("SearchService.search: hasil dan gerbang privasi", () => {
  it("mengembalikan DTO whitelist", async () => {
    const { service, repository } = setup();
    repository.rows = [userN(1)];
    const result = await service.search(ME, BY_NAME);
    expect(result.nextCursor).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(Object.keys(result.data[0] ?? {}).sort()).toEqual(
      ["accounts", "area", "city", "displayName", "distanceKm", "username"].sort(),
    );
  });

  it("baris yang lolos SQL tapi melanggar aturan (bug filter) dibuang oleh guard dan hanya jumlahnya yang dilog", async () => {
    const { service, repository } = setup();
    repository.rows = [
      userN(1),
      userN(2, { isDiscoverable: false }),
      userN(3, { blockedEitherWay: true }),
      userN(4, { status: "SUSPENDED" }),
      userN(5, { searchableByUsername: false }),
      userN(6, { userId: ME }),
    ];
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
    try {
      const result = await service.search(ME, BY_NAME);
      expect(result.data.map((r) => r.username)).toEqual(["user1"]);
    } finally {
      console.error = original;
    }
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('"rejected":5');
    expect(logged[0]).not.toContain("user2");
  });

  it("filter platform pada pengguna yang menyembunyikan platform tidak cocok", async () => {
    const { service, repository } = setup();
    repository.rows = [userN(1, { showPlatforms: false }), userN(2)];
    const result = await service.search(ME, { ...BY_NAME, platform: "instagram" });
    expect(result.data.map((r) => r.username)).toEqual(["user2"]);
  });

  it("platform diteruskan sebagai parameter ke repositori, bukan disambung ke apa pun", async () => {
    const { service, repository } = setup();
    await service.search(ME, { ...BY_NAME, platform: "instagram" });
    expect(repository.criteria[0]?.platformKey).toBe("instagram");
  });
});

describe("SearchService.search: paginasi", () => {
  it("meminta limit+1 baris, memotong halaman, dan membuat cursor dari baris terakhir halaman", async () => {
    const { service, repository } = setup();
    repository.rows = [userN(1), userN(2), userN(3)];
    const page = await service.search(ME, { ...BY_NAME, limit: 2 });
    expect(repository.criteria[0]?.fetchLimit).toBe(3);
    expect(page.data.map((r) => r.username)).toEqual(["user1", "user2"]);
    expect(page.nextCursor).not.toBeNull();

    const key = decodeCursor(
      page.nextCursor as string,
      { searcherId: ME, query: "ale", mode: "prefix", platformKey: null, radiusM: null, sort: "username" },
      SECRET,
    );
    expect(key).toEqual({ sort: "username", value: "user2", userId: userN(2).userId });
  });

  it("tidak ada cursor di halaman terakhir", async () => {
    const { service, repository } = setup();
    repository.rows = [userN(1), userN(2)];
    expect((await service.search(ME, { ...BY_NAME, limit: 2 })).nextCursor).toBeNull();
  });

  it("cursor dipakai kembali sebagai kunci 'after' dan cursor palsu ditolak", async () => {
    const { service, repository } = setup();
    repository.rows = [userN(1), userN(2), userN(3)];
    const page = await service.search(ME, { ...BY_NAME, limit: 2 });
    await service.search(ME, { ...BY_NAME, limit: 2, cursor: page.nextCursor as string });
    expect(repository.criteria[1]?.after).toEqual({
      sort: "username",
      value: "user2",
      userId: userN(2).userId,
    });
    await expect(service.search(ME, { ...BY_NAME, cursor: "palsu.palsu" })).rejects.toThrow(AppError);
    // cursor dari query lain tidak berlaku
    await expect(
      service.search(ME, { ...BY_NAME, q: "bob", cursor: page.nextCursor as string }),
    ).rejects.toThrow(AppError);
  });

  it("urutan jarak: cursor memakai satuan 0,5 km, bukan meter", async () => {
    const { service, repository } = setup();
    repository.rows = [userN(1), userN(2)];
    const page = await service.search(ME, { mode: "exact", radiusKm: 50, limit: 1 });
    const key = decodeCursor(
      page.nextCursor as string,
      { searcherId: ME, query: null, mode: null, platformKey: null, radiusM: 50_000, sort: "distance" },
      SECRET,
    );
    expect(key).toEqual({ sort: "distance", value: 3, userId: userN(1).userId });
  });
});

describe("SearchService.search: rate limit dan catatan", () => {
  it("30 per menit lalu 429", async () => {
    const { service } = setup();
    for (let i = 0; i < SEARCH_LIMITS.perMinute.limit; i += 1) await service.search(ME, BY_NAME);
    await expect(service.search(ME, BY_NAME)).rejects.toThrow(RateLimitedError);
  });

  it("batas dihitung per pengguna", async () => {
    const { service } = setup();
    for (let i = 0; i < SEARCH_LIMITS.perMinute.limit; i += 1) await service.search(ME, BY_NAME);
    await expect(service.search("88888888-8888-4888-8888-888888888888", BY_NAME)).resolves.toBeDefined();
  });

  it("catatan pencarian hanya berisi hash query dan filter ringkas", async () => {
    const { service, repository } = setup();
    repository.rows = [userN(1)];
    await service.search(ME, { ...BY_NAME, platform: "instagram" });
    const entry = repository.logs[0];
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain('"ale"');
    expect(entry?.queryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry?.filters).toEqual({
      mode: "prefix",
      platform: "instagram",
      radiusKm: null,
      sort: "username",
      hasQuery: true,
    });
    expect(entry?.resultCount).toBe(1);
  });

  it("gagal menulis catatan tidak menggagalkan pencarian", async () => {
    const { service, repository } = setup();
    repository.failLog = true;
    repository.rows = [userN(1)];
    const original = console.error;
    console.error = () => undefined;
    try {
      await expect(service.search(ME, BY_NAME)).resolves.toBeDefined();
    } finally {
      console.error = original;
    }
  });
});

describe("SearchService.getPublicProfile", () => {
  it("mengembalikan profil yang boleh dilihat", async () => {
    const { service, repository } = setup();
    repository.profile = candidate();
    const profile = await service.getPublicProfile(ME, "alex");
    expect(profile.username).toBe("Alex");
    expect(repository.profileLookups).toEqual([[ME, "alex"]]);
  });

  it("'tidak ada' dan 'tidak boleh dilihat' menghasilkan error yang sama persis", async () => {
    const { service, repository } = setup();
    const messages = new Set<string>();
    const codes = new Set<string>();
    const cases: Array<SearchCandidate | null> = [
      null,
      candidate({ isDiscoverable: false }),
      candidate({ blockedEitherWay: true }),
      candidate({ searchableByUsername: false }),
      candidate({ accounts: [{ ...ACCOUNT, isDiscoverable: false }] }),
      candidate({ status: "SUSPENDED" }),
      candidate({ userId: ME }),
    ];
    for (const profile of cases) {
      repository.profile = profile;
      try {
        await service.getPublicProfile(ME, "alex");
        throw new Error("harus gagal");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        messages.add((error as AppError).message);
        codes.add((error as AppError).code);
      }
    }
    expect([...codes]).toEqual(["NOT_FOUND"]);
    expect(messages.size).toBe(1);
  });

  it("lookup profil tidak boleh cocok lewat handle sosmed orang lain", async () => {
    const { service, repository } = setup();
    repository.profile = candidate({ usernameMatched: false, handleMatched: true });
    await expect(service.getPublicProfile(ME, "alex")).rejects.toThrow(AppError);
  });

  it("dibatasi 60 per menit", async () => {
    const { service, repository } = setup();
    repository.profile = candidate();
    for (let i = 0; i < SEARCH_LIMITS.profilePerMinute.limit; i += 1) {
      await service.getPublicProfile(ME, "alex");
    }
    await expect(service.getPublicProfile(ME, "alex")).rejects.toThrow(RateLimitedError);
  });
});

describe("SearchService: deteksi pola scraping", () => {
  function withAudit() {
    const repository = new FakeRepository();
    repository.rows = [candidate()];
    const audits: AuditEvent[] = [];
    const service = new SearchService({
      repository,
      limiter: new MemoryRateLimiter(),
      hmacSecret: SECRET,
      audit: async (event) => {
        audits.push(event);
      },
    });
    return { repository, audits, service };
  }

  it("di bawah ambang: tidak ada tanda", async () => {
    const { service, repository, audits } = withAudit();
    repository.recentCount = SUSPICIOUS_SEARCH.threshold - 1;
    await service.search(ME, BY_NAME);
    expect(audits).toEqual([]);
  });

  it("mencapai ambang: ditandai sekali per jam, tanpa isi query dan tanpa memblokir", async () => {
    const { service, repository, audits } = withAudit();
    repository.recentCount = SUSPICIOUS_SEARCH.threshold;
    const first = await service.search(ME, BY_NAME);
    const second = await service.search(ME, BY_NAME);
    expect(first.data.length).toBe(1);
    expect(second.data.length).toBe(1); // pencarian tetap berjalan
    expect(audits.length).toBe(1);
    expect(audits[0]?.action).toBe("search.suspicious");
    expect(audits[0]?.actorId).toBe(ME);
    expect(audits[0]?.metadata).toEqual({ count: SUSPICIOUS_SEARCH.threshold, windowSec: 3600 });
    expect(JSON.stringify(audits[0])).not.toContain("ale");
  });

  it("tanpa audit writer: tidak ada pengecekan dan tidak error", async () => {
    const { service, repository } = setup();
    repository.rows = [candidate()];
    await expect(service.search(ME, BY_NAME)).resolves.toBeDefined();
  });

  it("kegagalan pengecekan tidak menggagalkan pencarian", async () => {
    const { service, repository } = withAudit();
    repository.failCount = true;
    const result = await service.search(ME, BY_NAME);
    expect(result.data.length).toBe(1);
  });
});
