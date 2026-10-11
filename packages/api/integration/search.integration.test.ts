/**
 * Tes integrasi pencarian terhadap Postgres sungguhan: SQL, join, EXISTS, json_agg, keyset, escape LIKE.
 * Jalankan: pnpm --filter @social-finder/api test:integration  (butuh database *_test yang sudah dimigrasi).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@social-finder/database";
import { AppError } from "../src/errors/app-error";
import { MemoryRateLimiter } from "../src/modules/auth/rate-limit";
import { PrismaSearchRepository } from "../src/modules/search/prisma-search-repository";
import { SearchService, type SearchCommand } from "../src/modules/search/search-service";
import { resetAndSeed, scalar, uid } from "./db";

const ME = uid(1);
const NO_LOCATION_USER = uid(17);
const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";

function service(): SearchService {
  return new SearchService({
    repository: new PrismaSearchRepository(),
    limiter: new MemoryRateLimiter(),
    hmacSecret: SECRET,
  });
}
const names = (r: { data: { username: string }[] }) => r.data.map((d) => d.username);
const cmd = (c: Partial<SearchCommand>): SearchCommand => ({ mode: "exact", limit: 20, ...c });
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof AppError ? e.code : `OTHER:${String(e)}`;
  }
  return "NO_ERROR";
}

beforeAll(async () => {
  await resetAndSeed();
});

describe("integrasi: pencarian kata kunci", () => {
  it("prefix 'alex': hanya yang lolos semua gerbang, urut username", async () => {
    const r = await service().search(ME, cmd({ q: "alex", mode: "prefix" }));
    expect(names(r)).toEqual(["Alex", "alexa", "alexi"]);
    const [alex, alexa, alexi] = r.data;
    expect(alex?.area).toBe("Sekupang");
    expect(alex?.city).toBe("Batam");
    expect(alex?.distanceKm).toBe(2.5);
    expect(alex?.accounts.map((a) => `${a.platform}:${a.username}`)).toEqual(["instagram:alex.ig", "x:alex_x"]);
    expect(alexa?.area).toBeUndefined(); // PRIVATE walau lokasi aktif
    expect(alexa?.city).toBeUndefined();
    expect(alexa?.distanceKm).toBeUndefined();
    expect(alexi?.accounts).toEqual([]); // showPlatforms=false
    expect(r.nextCursor).toBeNull();
  });
  it("exact hanya username persis", async () => {
    expect(names(await service().search(ME, cmd({ q: "alex" })))).toEqual(["Alex"]);
  });
  it("handle sosmed: hanya yang discoverable, platform aktif, dan platform tidak disembunyikan", async () => {
    expect(names(await service().search(ME, cmd({ q: "alex.ig" })))).toEqual(["Alex"]);
    for (const q of ["alex_private", "alexe_legacy", "secretig"]) {
      expect(names(await service().search(ME, cmd({ q })))).toEqual([]);
    }
    expect(names(await service().search(ME, cmd({ q: "secre", mode: "prefix" })))).toEqual([]);
  });
  it("filter platform", async () => {
    expect(names(await service().search(ME, cmd({ q: "alex", mode: "prefix", platform: "x" })))).toEqual(["Alex"]);
    expect(names(await service().search(ME, cmd({ q: "alex", mode: "prefix", platform: "instagram" })))).toEqual(["Alex", "alexa"]);
    expect(names(await service().search(ME, cmd({ q: "alex", mode: "prefix", platform: "legacy" })))).toEqual([]);
  });
  it("karakter khusus LIKE di-escape", async () => {
    expect(names(await service().search(ME, cmd({ q: "a_", mode: "prefix" })))).toEqual(["a_b"]);
    expect(names(await service().search(ME, cmd({ q: "a%", mode: "prefix" })))).toEqual([]);
    expect(names(await service().search(ME, cmd({ q: "a\\", mode: "prefix" })))).toEqual([]);
  });
  it("input berbahaya tidak menembus dan tidak merusak data", async () => {
    for (const q of ["x' OR '1'='1", "'; DROP TABLE \"User\"; --"]) {
      expect(names(await service().search(ME, cmd({ q, mode: "prefix" })))).toEqual([]);
    }
    expect(await scalar(`SELECT count(*)::int AS n FROM "User"`)).toBe(22);
  });
  it("paginasi keyset berdasarkan username", async () => {
    const s = service();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const r = await s.search(ME, cmd({ q: "page", mode: "prefix", limit: 2, ...(cursor ? { cursor } : {}) }));
      seen.push(...names(r));
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
    }
    expect(seen).toEqual(["page1", "page2", "page3", "page4", "page5"]);
  });
});

describe("integrasi: pencarian radius", () => {
  it("radius 5 km: hanya yang mengizinkan jarak, dalam radius sendiri, urut jarak", async () => {
    const r = await service().search(ME, cmd({ radiusKm: 5 }));
    expect(names(r)).toEqual(["alexi", "alexh", "Alex"]);
    expect(r.data.map((d) => d.distanceKm)).toEqual([1, 1.5, 2.5]);
  });
  it("radius 50 km menambah faruser tetapi tidak narrow", async () => {
    expect(names(await service().search(ME, cmd({ radiusKm: 50 })))).toEqual(["alexi", "alexh", "Alex", "faruser"]);
  });
  it("paginasi keyset berdasarkan jarak", async () => {
    const s = service();
    const p1 = await s.search(ME, cmd({ radiusKm: 50, limit: 2 }));
    expect(names(p1)).toEqual(["alexi", "alexh"]);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await s.search(ME, cmd({ radiusKm: 50, limit: 2, cursor: p1.nextCursor ?? "" }));
    expect(names(p2)).toEqual(["Alex", "faruser"]);
    expect(p2.nextCursor).toBeNull();
  });
  it("kata kunci + radius: urutan bawaan jarak", async () => {
    expect(names(await service().search(ME, cmd({ q: "alex", mode: "prefix", radiusKm: 5 })))).toEqual(["alexi", "Alex"]);
  });
  it("pencari tanpa lokasi aktif ditolak", async () => {
    expect(await code(service().search(NO_LOCATION_USER, cmd({ radiusKm: 5 })))).toBe("VALIDATION_ERROR");
  });
});

describe("integrasi: kebocoran, profil publik, catatan", () => {
  it("DTO tidak memuat id, email, koordinat, atau metadata DB", async () => {
    const all = JSON.stringify([
      await service().search(ME, cmd({ q: "alex", mode: "prefix" })),
      await service().search(ME, cmd({ radiusKm: 50 })),
    ]);
    for (const forbidden of ["@example.test", "latitude", "longitude", "geography", "passwordHash", "userId", "deletedAt", '"id"', "1.1", "104"]) {
      expect(all.includes(forbidden)).toBe(false);
    }
    expect(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(all)).toBe(false);
  });
  it("profil publik: yang boleh tampil", async () => {
    const r = await service().getPublicProfile(ME, "alex");
    expect(r.username).toBe("Alex");
    expect(r.distanceKm).toBe(2.5);
  });
  it("profil publik: semua penolakan 404 dengan pesan yang sama", async () => {
    const messages = new Set<string>();
    for (const u of ["me", "alexb", "alexc", "alexd", "alexe", "alexf", "alexg", "alexh", "alex.ig", "tidak-ada"]) {
      try {
        await service().getPublicProfile(ME, u);
        throw new Error(`harus 404: ${u}`);
      } catch (e) {
        expect(e instanceof AppError).toBe(true);
        if (e instanceof AppError) {
          expect(e.code).toBe("NOT_FOUND");
          messages.add(e.message);
        }
      }
    }
    expect(messages.size).toBe(1);
  });
  it("catatan pencarian: hanya hash query dan filter ringkas", async () => {
    await service().search(ME, cmd({ q: "secretquery", mode: "prefix" }));
    const rows = await prisma.$queryRawUnsafe<Array<{ line: string }>>(
      `SELECT "queryHash" || '|' || "filters"::text AS line FROM "SearchLog" WHERE "searcherId" = '${ME}'::uuid`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.line.includes("secretquery"))).toBe(false);
  });
});
