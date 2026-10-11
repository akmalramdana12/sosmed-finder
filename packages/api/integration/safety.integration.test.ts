/**
 * Integrasi block/report terhadap Postgres sungguhan lewat repositori Prisma.
 * CATATAN: belum pernah dijalankan (butuh Prisma asli + database *_test). Kegagalan pertama di sini
 * kemungkinan besar menandai bug repositori yang tidak terjangkau tes unit.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "../src/modules/auth/rate-limit";
import type { AuditEvent } from "../src/modules/auth/types";
import { PrismaSafetyRepository } from "../src/modules/safety/prisma-safety-repository";
import { SafetyService } from "../src/modules/safety/safety-service";
import { PrismaSearchRepository } from "../src/modules/search/prisma-search-repository";
import { SearchService } from "../src/modules/search/search-service";
import { resetAndSeed, scalar, uid } from "./db";

const CTX = { ip: "203.0.113.7", userAgent: "integration" };
const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const ME = uid(1);
const ALEX = uid(2);
const ALEXC = uid(5); // sudah memblokir ME di seed
const ALEXD = uid(6); // sudah diblokir ME di seed

function services() {
  const audits: AuditEvent[] = [];
  const limiter = new MemoryRateLimiter();
  const safety = new SafetyService({
    repository: new PrismaSafetyRepository(),
    limiter,
    audit: async (event) => {
      audits.push(event);
    },
    hmacSecret: SECRET,
  });
  const search = new SearchService({ repository: new PrismaSearchRepository(), limiter, hmacSecret: SECRET });
  return { safety, search, audits };
}

beforeAll(async () => {
  await resetAndSeed();
});

describe("integrasi: block", () => {
  it("daftar blokir berisi username dan waktu saja", async () => {
    const { safety } = services();
    const list = await safety.listBlocks(ME);
    expect(list.map((b) => b.username)).toEqual(["alexd"]);
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(["blockedAt", "username"]);
  });

  it("memblokir lalu pencarian dan profil tidak lagi menampilkan target; idempotent", async () => {
    const { safety, search } = services();
    expect((await search.search(ME, { q: "alex", mode: "exact", limit: 20 })).data.map((d) => d.username)).toEqual(["Alex"]);
    await safety.block(ME, "alex", CTX);
    await safety.block(ME, "Alex", CTX);
    expect(await scalar(`SELECT count(*)::int AS n FROM "Block" WHERE "blockerId" = '${ME}'::uuid AND "blockedId" = '${ALEX}'::uuid`)).toBe(1);
    expect((await search.search(ME, { q: "alex", mode: "exact", limit: 20 })).data).toEqual([]);
    await expect(search.getPublicProfile(ME, "alex")).rejects.toThrow();
  });

  it("blokir berlaku dua arah: yang memblokir saya juga tidak muncul", async () => {
    const { search } = services();
    expect((await search.search(ME, { q: "alexc", mode: "exact", limit: 20 })).data).toEqual([]);
    // sebaliknya: dari sisi alexc, ME tidak boleh terlihat
    expect((await search.search(ALEXC, { q: "me", mode: "exact", limit: 20 })).data).toEqual([]);
  });

  it("mencabut blokir milik sendiri; milik orang lain tidak terpengaruh", async () => {
    const { safety, search } = services();
    await safety.unblock(ME, "alexc", CTX); // ME tidak memblokir alexc: tidak boleh menghapus blokir alexc->ME
    expect(await scalar(`SELECT count(*)::int AS n FROM "Block" WHERE "blockerId" = '${ALEXC}'::uuid`)).toBe(1);
    await safety.unblock(ME, "alex", CTX);
    expect((await search.search(ME, { q: "alex", mode: "exact", limit: 20 })).data.map((d) => d.username)).toEqual(["Alex"]);
  });

  it("username tidak ada atau tidak aktif: tidak ada baris baru", async () => {
    const { safety } = services();
    const before = await scalar(`SELECT count(*)::int AS n FROM "Block"`);
    await safety.block(ME, "tidak-ada", CTX);
    await safety.block(ME, "alexf", CTX); // SUSPENDED
    await safety.block(ME, "alexg", CTX); // dihapus
    expect(await scalar(`SELECT count(*)::int AS n FROM "Block"`)).toBe(before);
    expect(await scalar(`SELECT count(*)::int AS n FROM "Block" WHERE "blockerId" = '${ME}'::uuid AND "blockedId" = '${ALEXD}'::uuid`)).toBe(1);
  });
});

describe("integrasi: report", () => {
  it("membuat laporan OPEN dengan pelapor dari sesi; laporan terbuka yang sama tidak digandakan", async () => {
    const { safety, audits } = services();
    await safety.report(ME, { username: "alex", reason: "SPAM", details: "rincian pribadi" }, CTX);
    await safety.report(ME, { username: "alex", reason: "HARASSMENT" }, CTX);
    expect(await scalar(`SELECT count(*)::int AS n FROM "Report" WHERE "reporterId" = '${ME}'::uuid AND "targetUserId" = '${ALEX}'::uuid AND "status" = 'OPEN'`)).toBe(1);
    expect(audits.filter((a) => a.action === "report.create").length).toBe(1);
    expect(JSON.stringify(audits)).not.toContain("rincian pribadi");
  });

  it("laporan tidak mengubah status target dan tidak menyembunyikannya dari pencarian", async () => {
    const { search } = services();
    expect(await scalar(`SELECT count(*)::int AS n FROM "User" WHERE "id" = '${ALEX}'::uuid AND "status" = 'ACTIVE'`)).toBe(1);
    expect((await search.search(ME, { q: "alex", mode: "exact", limit: 20 })).data.length).toBe(1);
  });

  it("username tidak ada: tidak ada laporan", async () => {
    const { safety } = services();
    const before = await scalar(`SELECT count(*)::int AS n FROM "Report"`);
    await safety.report(ME, { username: "tidak-ada", reason: "SPAM" }, CTX);
    expect(await scalar(`SELECT count(*)::int AS n FROM "Report"`)).toBe(before);
  });
});
