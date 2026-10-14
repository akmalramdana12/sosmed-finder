/**
 * Integrasi moderasi terhadap Postgres sungguhan: peran, antrean keyset, transaksi suspend/reinstate,
 * compare-and-set, pencabutan sesi. Butuh migrasi 20261012000000_moderation sudah diterapkan.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@social-finder/database";
import { AppError } from "../src/errors/app-error";
import { MemoryRateLimiter } from "../src/modules/auth/rate-limit";
import type { AuditEvent } from "../src/modules/auth/types";
import { ModerationService } from "../src/modules/moderation/moderation-service";
import { PrismaModerationRepository } from "../src/modules/moderation/prisma-moderation-repository";
import { resetAndSeed, scalar, uid } from "./db";

const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const CTX = { ip: "203.0.113.7", userAgent: "integration" };
const MOD = uid(1);
const PLAIN = uid(2);
const TARGET = uid(3); // alexa
const OTHER_MOD = uid(5); // alexc
const ALREADY_SUSPENDED = uid(8); // alexf
const rid = (n: number): string => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;

function service() {
  const audits: AuditEvent[] = [];
  const svc = new ModerationService({
    repository: new PrismaModerationRepository(),
    limiter: new MemoryRateLimiter(),
    audit: async (event) => {
      audits.push(event);
    },
    hmacSecret: SECRET,
  });
  return { svc, audits };
}
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof AppError ? e.code : `OTHER:${String(e)}`;
  }
  return "NO_ERROR";
}
const report = (n: number, target: string, minute: number): string =>
  `INSERT INTO "Report"("id","reporterId","targetUserId","reason","details","createdAt") VALUES ('${rid(n)}'::uuid,'${PLAIN}'::uuid,'${target}'::uuid,'SPAM'::"ReportReason",'detail ${n}','2026-10-10T00:${String(minute).padStart(2, "0")}:00Z')`;

beforeAll(async () => {
  await resetAndSeed();
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "role" = 'MODERATOR' WHERE "id" IN ('${MOD}'::uuid,'${OTHER_MOD}'::uuid)`);
  for (const statement of [
    report(1, TARGET, 1),
    report(2, TARGET, 2),
    report(3, OTHER_MOD, 3),
    report(4, ALREADY_SUSPENDED, 4),
    report(5, uid(6), 5),
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Session"("userId","tokenHash","expiresAt") VALUES ('${TARGET}'::uuid,'hash-integration-1', now() + interval '1 day')`,
  );
});

describe("integrasi: moderasi — akses dan antrean", () => {
  it("bukan moderator: NOT_FOUND; moderator: antrean terlama dulu dengan hitungan laporan terbuka per target", async () => {
    const { svc } = service();
    expect(await code(svc.listReports(PLAIN, { status: "OPEN", limit: 10 }))).toBe("NOT_FOUND");
    const list = await svc.listReports(MOD, { status: "OPEN", limit: 10 });
    expect(list.data.map((r) => r.id)).toEqual([rid(1), rid(2), rid(3), rid(4), rid(5)]);
    expect(list.data[0]?.target).toEqual({ username: "alexa", status: "ACTIVE", openReports: 2 });
    expect(JSON.stringify(list)).not.toMatch(/reporterId|email|passwordHash/);
  });

  it("keyset: halaman berurutan tanpa duplikat", async () => {
    const { svc } = service();
    const first = await svc.listReports(MOD, { status: "OPEN", limit: 2 });
    expect(first.data.map((r) => r.id)).toEqual([rid(1), rid(2)]);
    const second = await svc.listReports(MOD, { status: "OPEN", limit: 2, cursor: first.nextCursor ?? "" });
    expect(second.data.map((r) => r.id)).toEqual([rid(3), rid(4)]);
    const third = await svc.listReports(MOD, { status: "OPEN", limit: 2, cursor: second.nextCursor ?? "" });
    expect(third.data.map((r) => r.id)).toEqual([rid(5)]);
    expect(third.nextCursor).toBeNull();
  });

  it("peran dibaca dari database: dicabut = langsung tidak punya akses", async () => {
    const { svc } = service();
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "role" = 'USER' WHERE "id" = '${MOD}'::uuid`);
    try {
      expect(await code(svc.listReports(MOD, { status: "OPEN", limit: 1 }))).toBe("NOT_FOUND");
    } finally {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "role" = 'MODERATOR' WHERE "id" = '${MOD}'::uuid`);
    }
  });
});

describe("integrasi: moderasi — tindakan", () => {
  it("review lalu suspend: akun SUSPENDED, sesi dicabut, laporan RESOLVED dengan peninjau dan catatan, audit tanpa catatan", async () => {
    const { svc, audits } = service();
    expect((await svc.act(MOD, rid(1), { action: "review" }, CTX)).status).toBe("REVIEWING");
    const dto = await svc.act(MOD, rid(1), { action: "suspend", note: "spam terbukti" }, CTX);
    expect(dto.status).toBe("RESOLVED");
    expect(dto.target.status).toBe("SUSPENDED");
    expect(dto.moderatorNote).toBe("spam terbukti");
    expect(await scalar(`SELECT count(*)::int AS n FROM "User" WHERE "id" = '${TARGET}'::uuid AND "status" = 'SUSPENDED'`)).toBe(1);
    expect(await scalar(`SELECT count(*)::int AS n FROM "Session" WHERE "userId" = '${TARGET}'::uuid AND "revokedAt" IS NULL`)).toBe(0);
    expect(await scalar(`SELECT count(*)::int AS n FROM "Report" WHERE "id" = '${rid(1)}'::uuid AND "reviewedById" = '${MOD}'::uuid AND "resolvedAt" IS NOT NULL`)).toBe(1);
    expect(audits.map((a) => a.action)).toEqual(["moderation.report.review", "moderation.report.suspend"]);
    expect(JSON.stringify(audits)).not.toMatch(/spam terbukti/);
  });

  it("laporan lain terhadap akun yang sudah ditangguhkan: suspend ditolak (CONFLICT), dismiss tetap boleh", async () => {
    const { svc } = service();
    expect(await code(svc.act(MOD, rid(2), { action: "suspend", note: "sudah ditangguhkan" }, CTX))).toBe("CONFLICT");
    expect((await svc.act(MOD, rid(2), { action: "dismiss" }, CTX)).status).toBe("DISMISSED");
  });

  it("moderator tidak bisa ditangguhkan lewat laporan (FORBIDDEN); akunnya tetap ACTIVE", async () => {
    const { svc } = service();
    expect(await code(svc.act(MOD, rid(3), { action: "suspend", note: "uji perlindungan" }, CTX))).toBe("FORBIDDEN");
    expect(await scalar(`SELECT count(*)::int AS n FROM "User" WHERE "id" = '${OTHER_MOD}'::uuid AND "status" = 'ACTIVE'`)).toBe(1);
  });

  it("transaksi atomik: bila efek pada akun gagal, status laporan ikut dibatalkan (stale)", async () => {
    // Lewati planAction: paksa repositori menjalankan suspend pada akun yang sudah SUSPENDED.
    const repository = new PrismaModerationRepository();
    const result = await repository.applyAction({
      reportId: rid(4),
      moderatorId: MOD,
      expectedStatus: "OPEN",
      nextStatus: "RESOLVED",
      note: null,
      targetEffect: "suspend",
      now: new Date(),
    });
    expect(result).toBe("stale");
    expect(await scalar(`SELECT count(*)::int AS n FROM "Report" WHERE "id" = '${rid(4)}'::uuid AND "status" = 'OPEN'`)).toBe(1);
  });

  it("compare-and-set: status yang diharapkan sudah berubah = stale, tidak ada yang berubah", async () => {
    const repository = new PrismaModerationRepository();
    const result = await repository.applyAction({
      reportId: rid(1), // sudah RESOLVED
      moderatorId: MOD,
      expectedStatus: "OPEN",
      nextStatus: "DISMISSED",
      note: "menimpa",
      targetEffect: null,
      now: new Date(),
    });
    expect(result).toBe("stale");
    expect(await scalar(`SELECT count(*)::int AS n FROM "Report" WHERE "id" = '${rid(1)}'::uuid AND "status" = 'RESOLVED' AND "moderatorNote" = 'spam terbukti'`)).toBe(1);
  });

  it("reinstate dari laporan yang sudah selesai: akun ACTIVE lagi, status laporan tetap RESOLVED", async () => {
    const { svc } = service();
    expect(await code(svc.act(MOD, rid(1), { action: "reinstate" }, CTX))).toBe("VALIDATION_ERROR"); // catatan wajib
    const dto = await svc.act(MOD, rid(1), { action: "reinstate", note: "banding diterima" }, CTX);
    expect(dto.status).toBe("RESOLVED");
    expect(dto.target.status).toBe("ACTIVE");
    expect(await scalar(`SELECT count(*)::int AS n FROM "User" WHERE "id" = '${TARGET}'::uuid AND "status" = 'ACTIVE'`)).toBe(1);
    // sesi yang dicabut tidak dihidupkan kembali: pengguna harus login ulang
    expect(await scalar(`SELECT count(*)::int AS n FROM "Session" WHERE "userId" = '${TARGET}'::uuid AND "revokedAt" IS NULL`)).toBe(0);
  });
});
