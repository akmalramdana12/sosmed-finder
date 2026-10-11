import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import type { AuditEvent } from "../auth/types";
import { MAX_BLOCKS, SAFETY_LIMITS, SafetyService } from "./safety-service";
import type { BlockedUserRecord, NewReport, SafetyRepository } from "./types";

const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const CTX = { ip: "203.0.113.7", userAgent: "vitest" };
const ME = "00000000-0000-4000-8000-000000000001";
const ALEX = "00000000-0000-4000-8000-000000000002";
const BOB = "00000000-0000-4000-8000-000000000003";

class FakeRepository implements SafetyRepository {
  /** normalizedUsername -> id, hanya pengguna ACTIVE. */
  users = new Map<string, string>([
    ["me", ME],
    ["alex", ALEX],
    ["bob", BOB],
  ]);
  /** Pengguna ada tapi tidak aktif (untuk unblock). */
  inactive = new Map<string, string>([["ghost", "00000000-0000-4000-8000-000000000009"]]);
  blocks: Array<{ blockerId: string; blockedId: string; username: string; createdAt: Date }> = [];
  reports: NewReport[] = [];
  extraBlocks = 0;
  readonly calls: string[] = [];

  async findActiveUserId(normalizedUsername: string) {
    this.calls.push(`find:${normalizedUsername}`);
    return this.users.get(normalizedUsername) ?? null;
  }
  async isBlocked(blockerId: string, blockedId: string) {
    return this.blocks.some((b) => b.blockerId === blockerId && b.blockedId === blockedId);
  }
  async countBlocks(blockerId: string) {
    return this.blocks.filter((b) => b.blockerId === blockerId).length + this.extraBlocks;
  }
  async addBlock(blockerId: string, blockedId: string) {
    if (await this.isBlocked(blockerId, blockedId)) return false;
    const username = [...this.users.entries()].find(([, id]) => id === blockedId)?.[0] ?? "?";
    this.blocks.push({ blockerId, blockedId, username, createdAt: new Date("2026-10-10T00:00:00Z") });
    return true;
  }
  async removeBlockByUsername(blockerId: string, normalizedUsername: string) {
    const before = this.blocks.length;
    this.blocks = this.blocks.filter((b) => !(b.blockerId === blockerId && b.username === normalizedUsername));
    return this.blocks.length < before;
  }
  async listBlocks(blockerId: string, limit: number): Promise<BlockedUserRecord[]> {
    return this.blocks
      .filter((b) => b.blockerId === blockerId)
      .slice(0, limit)
      .map((b) => ({ username: b.username, createdAt: b.createdAt }));
  }
  async hasOpenReport(reporterId: string, targetUserId: string) {
    return this.reports.some((r) => r.reporterId === reporterId && r.targetUserId === targetUserId);
  }
  async createReport(report: NewReport) {
    this.reports.push(report);
  }
}

function setup() {
  const repository = new FakeRepository();
  const audits: AuditEvent[] = [];
  const service = new SafetyService({
    repository,
    limiter: new MemoryRateLimiter(),
    audit: async (event) => {
      audits.push(event);
    },
    hmacSecret: SECRET,
  });
  return { repository, audits, service };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    return "OTHER";
  }
  return "NO_ERROR";
}

describe("SafetyService.block", () => {
  it("memblokir, dicatat di audit tanpa username, dan muncul di daftar", async () => {
    const { service, repository, audits } = setup();
    await service.block(ME, "Alex", CTX);
    expect(repository.blocks.length).toBe(1);
    expect(repository.blocks[0]?.blockerId).toBe(ME);
    expect(repository.blocks[0]?.blockedId).toBe(ALEX);
    expect(audits.length).toBe(1);
    expect(audits[0]?.action).toBe("block.create");
    expect(audits[0]?.actorId).toBe(ME);
    expect(JSON.stringify(audits[0])).not.toContain("alex");
    expect(JSON.stringify(audits[0])).not.toContain("203.0.113.7");
    expect(await service.listBlocks(ME)).toEqual([
      { username: "alex", blockedAt: "2026-10-10T00:00:00.000Z" },
    ]);
  });

  it("username dinormalkan (huruf besar tetap menemukan target)", async () => {
    const { service, repository } = setup();
    await service.block(ME, "ALEX", CTX);
    expect(repository.calls).toContain("find:alex");
  });

  it("idempotent: memblokir dua kali tidak menambah baris maupun audit", async () => {
    const { service, repository, audits } = setup();
    await service.block(ME, "alex", CTX);
    await service.block(ME, "alex", CTX);
    expect(repository.blocks.length).toBe(1);
    expect(audits.length).toBe(1);
  });

  it("username tidak ada: berhasil diam-diam, tanpa efek (tidak bisa dipakai menguji keberadaan)", async () => {
    const { service, repository, audits } = setup();
    await expect(service.block(ME, "tidak-ada", CTX)).resolves.toBeUndefined();
    await expect(service.block(ME, "alex", CTX)).resolves.toBeUndefined();
    expect(repository.blocks.length).toBe(1);
    expect(audits.length).toBe(1);
  });

  it("pengguna non-ACTIVE diperlakukan sama dengan tidak ada", async () => {
    const { service, repository } = setup();
    await expect(service.block(ME, "ghost", CTX)).resolves.toBeUndefined();
    expect(repository.blocks.length).toBe(0);
  });

  it("tidak bisa memblokir diri sendiri", async () => {
    const { service, repository } = setup();
    expect(await errorCode(service.block(ME, "me", CTX))).toBe("VALIDATION_ERROR");
    expect(repository.blocks.length).toBe(0);
  });

  it("batas jumlah blokir: ditolak bila penuh, tetapi memblokir ulang yang sudah ada tetap aman", async () => {
    const { service, repository } = setup();
    await service.block(ME, "alex", CTX);
    repository.extraBlocks = MAX_BLOCKS;
    expect(await errorCode(service.block(ME, "bob", CTX))).toBe("CONFLICT");
    expect(repository.blocks.length).toBe(1);
    expect(await errorCode(service.block(ME, "alex", CTX))).toBe("NO_ERROR");
  });

  it("dibatasi 30 per jam", async () => {
    const { service } = setup();
    for (let i = 0; i < SAFETY_LIMITS.block.limit; i += 1) await service.block(ME, "tidak-ada", CTX);
    await expect(service.block(ME, "tidak-ada", CTX)).rejects.toThrow(RateLimitedError);
  });

  it("pelaku selalu ID sesi: daftar pengguna lain tidak terpengaruh", async () => {
    const { service } = setup();
    await service.block(ME, "alex", CTX);
    expect(await service.listBlocks(BOB)).toEqual([]);
  });
});

describe("SafetyService.unblock", () => {
  it("mencabut blokir milik sendiri dan mengaudit", async () => {
    const { service, repository, audits } = setup();
    await service.block(ME, "alex", CTX);
    await service.unblock(ME, "alex", CTX);
    expect(repository.blocks.length).toBe(0);
    expect(audits.map((a) => a.action)).toEqual(["block.create", "block.delete"]);
  });

  it("tidak bisa mencabut blokir milik orang lain", async () => {
    const { service, repository } = setup();
    await service.block(BOB, "alex", CTX);
    await service.unblock(ME, "alex", CTX);
    expect(repository.blocks.length).toBe(1);
    expect(repository.blocks[0]?.blockerId).toBe(BOB);
  });

  it("idempotent dan seragam untuk username yang tidak diblokir atau tidak ada", async () => {
    const { service, audits } = setup();
    await expect(service.unblock(ME, "alex", CTX)).resolves.toBeUndefined();
    await expect(service.unblock(ME, "tidak-ada", CTX)).resolves.toBeUndefined();
    expect(audits.length).toBe(0);
  });
});

describe("SafetyService.report", () => {
  it("membuat laporan dengan pelapor dari sesi; audit hanya memuat alasan, bukan isi", async () => {
    const { service, repository, audits } = setup();
    await service.report(ME, { username: "alex", reason: "SPAM", details: "nomor pribadi 0812-xxxx" }, CTX);
    expect(repository.reports).toEqual([
      { reporterId: ME, targetUserId: ALEX, reason: "SPAM", details: "nomor pribadi 0812-xxxx" },
    ]);
    expect(audits.length).toBe(1);
    expect(audits[0]?.action).toBe("report.create");
    expect(audits[0]?.metadata).toEqual({ reason: "SPAM" });
    expect(JSON.stringify(audits[0])).not.toContain("0812");
  });

  it("details kosong disimpan sebagai null", async () => {
    const { service, repository } = setup();
    await service.report(ME, { username: "alex", reason: "SPAM", details: "" }, CTX);
    await service.report(ME, { username: "bob", reason: "SPAM" }, CTX);
    expect(repository.reports.map((r) => r.details)).toEqual([null, null]);
  });

  it("username tidak ada: berhasil diam-diam tanpa laporan atau audit", async () => {
    const { service, repository, audits } = setup();
    await expect(service.report(ME, { username: "tidak-ada", reason: "SPAM" }, CTX)).resolves.toBeUndefined();
    expect(repository.reports.length).toBe(0);
    expect(audits.length).toBe(0);
  });

  it("tidak bisa melaporkan diri sendiri", async () => {
    const { service, repository } = setup();
    expect(await errorCode(service.report(ME, { username: "me", reason: "SPAM" }, CTX))).toBe("VALIDATION_ERROR");
    expect(repository.reports.length).toBe(0);
  });

  it("laporan terbuka yang sama tidak digandakan, dan responsnya sama", async () => {
    const { service, repository, audits } = setup();
    await service.report(ME, { username: "alex", reason: "SPAM" }, CTX);
    await expect(service.report(ME, { username: "alex", reason: "HARASSMENT" }, CTX)).resolves.toBeUndefined();
    expect(repository.reports.length).toBe(1);
    expect(audits.length).toBe(1);
  });

  it("dibatasi 10 per jam", async () => {
    const { service } = setup();
    for (let i = 0; i < SAFETY_LIMITS.report.limit; i += 1) {
      await service.report(ME, { username: "tidak-ada", reason: "SPAM" }, CTX);
    }
    await expect(service.report(ME, { username: "alex", reason: "SPAM" }, CTX)).rejects.toThrow(RateLimitedError);
  });

  it("laporan tidak punya efek otomatis pada target: tidak mengubah blokir atau pengguna", async () => {
    const { service, repository } = setup();
    for (let i = 0; i < 3; i += 1) {
      await service.report(`00000000-0000-4000-8000-0000000001${i}0`, { username: "alex", reason: "SPAM" }, CTX);
    }
    expect(repository.users.get("alex")).toBe(ALEX);
    expect(repository.blocks.length).toBe(0);
  });
});
