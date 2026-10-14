import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import type { AuditEvent } from "../auth/types";
import { decodeModerationCursor, encodeModerationCursor } from "./cursor";
import { MODERATION_LIMITS, ModerationService, toModerationReportDto } from "./moderation-service";
import { planAction } from "./plan";
import type {
  ApplyActionInput,
  ApplyResult,
  ListReportsParams,
  ModerationReportRecord,
  ModerationRepository,
  UserRoleValue,
} from "./types";

const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const CTX = { ip: "203.0.113.7", userAgent: "vitest" };
const MOD = "00000000-0000-4000-8000-0000000000a1";
const USER = "00000000-0000-4000-8000-0000000000b1";
const R1 = "00000000-0000-4000-8000-0000000000c1";
const R2 = "00000000-0000-4000-8000-0000000000c2";
const R3 = "00000000-0000-4000-8000-0000000000c3";

function record(over: Partial<ModerationReportRecord> = {}): ModerationReportRecord {
  return {
    id: R1,
    reason: "SPAM",
    details: "spam berulang",
    status: "OPEN",
    createdAt: new Date("2026-10-10T00:00:00.000Z"),
    resolvedAt: null,
    moderatorNote: null,
    targetUsername: "alex",
    targetStatus: "ACTIVE",
    targetRole: "USER",
    targetOpenReports: 1,
    ...over,
  };
}

class FakeRepository implements ModerationRepository {
  roles = new Map<string, UserRoleValue>([[MOD, "MODERATOR"], [USER, "USER"]]);
  reports: ModerationReportRecord[] = [
    record({ id: R1, createdAt: new Date("2026-10-10T00:00:00.000Z") }),
    record({ id: R2, createdAt: new Date("2026-10-10T01:00:00.000Z") }),
    record({ id: R3, createdAt: new Date("2026-10-10T02:00:00.000Z") }),
  ];
  applied: ApplyActionInput[] = [];
  nextResult: ApplyResult = "applied";

  async findRole(userId: string) {
    return this.roles.get(userId) ?? null;
  }
  async listReports(params: ListReportsParams) {
    return this.reports
      .filter((r) => r.status === params.status)
      .filter((r) => !params.after || r.createdAt > params.after.createdAt || (r.createdAt.getTime() === params.after.createdAt.getTime() && r.id > params.after.id))
      .slice(0, params.limit);
  }
  async findReport(id: string) {
    return this.reports.find((r) => r.id === id) ?? null;
  }
  async applyAction(input: ApplyActionInput) {
    this.applied.push(input);
    if (this.nextResult === "applied") {
      const report = this.reports.find((r) => r.id === input.reportId);
      if (report) {
        report.status = input.nextStatus;
        if (input.note !== null) report.moderatorNote = input.note;
        if (input.targetEffect === "suspend") report.targetStatus = "SUSPENDED";
        if (input.targetEffect === "reinstate") report.targetStatus = "ACTIVE";
      }
    }
    return this.nextResult;
  }
}

function setup() {
  const repository = new FakeRepository();
  const audits: AuditEvent[] = [];
  const service = new ModerationService({
    repository,
    limiter: new MemoryRateLimiter(),
    audit: async (event) => {
      audits.push(event);
    },
    hmacSecret: SECRET,
    now: () => new Date("2026-10-11T00:00:00.000Z"),
  });
  return { repository, audits, service };
}

describe("akses moderator", () => {
  it("bukan moderator, tidak dikenal, atau nonaktif: NOT_FOUND (bukan FORBIDDEN)", async () => {
    const { service, repository } = setup();
    for (const id of [USER, "00000000-0000-4000-8000-0000000000ff"]) {
      await expect(service.listReports(id, { status: "OPEN", limit: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(service.act(id, R1, { action: "review" }, CTX)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(repository.applied).toHaveLength(0);
  });

  it("batas laju dihitung sebelum cek peran (menebak endpoint ikut dibatasi)", async () => {
    const { service } = setup();
    for (let i = 0; i < MODERATION_LIMITS.read.limit; i += 1) {
      await expect(service.listReports(USER, { status: "OPEN", limit: 1 })).rejects.toBeInstanceOf(AppError);
    }
    await expect(service.listReports(USER, { status: "OPEN", limit: 1 })).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("daftar laporan", () => {
  it("terlama dulu, paginasi dengan cursor, dan DTO tanpa identitas pelapor", async () => {
    const { service } = setup();
    const first = await service.listReports(MOD, { status: "OPEN", limit: 2 });
    expect(first.data.map((r) => r.id)).toEqual([R1, R2]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.listReports(MOD, { status: "OPEN", limit: 2, cursor: first.nextCursor ?? "" });
    expect(second.data.map((r) => r.id)).toEqual([R3]);
    expect(second.nextCursor).toBeNull();
    expect(JSON.stringify(first)).not.toMatch(/reporter|email|passwordHash|targetUserId/i);
    expect(Object.keys(first.data[0] ?? {}).sort()).toEqual(
      ["createdAt", "details", "id", "moderatorNote", "reason", "resolvedAt", "status", "target"],
    );
  });

  it("cursor rusak, milik moderator/status lain, atau dimodifikasi ditolak", async () => {
    const { service } = setup();
    const first = await service.listReports(MOD, { status: "OPEN", limit: 1 });
    const cursor = first.nextCursor ?? "";
    await expect(service.listReports(MOD, { status: "OPEN", limit: 1, cursor: "abc" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.listReports(MOD, { status: "RESOLVED", limit: 1, cursor })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.listReports(MOD, { status: "OPEN", limit: 1, cursor: `${cursor}x` })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("cursor: round-trip dan terikat pada moderator + status", () => {
    const key = { createdAt: new Date("2026-10-10T00:00:00.000Z"), id: R1 };
    const binding = { moderatorId: MOD, status: "OPEN" as const };
    const cursor = encodeModerationCursor(key, binding, SECRET);
    expect(decodeModerationCursor(cursor, binding, SECRET)).toEqual(key);
    expect(decodeModerationCursor(cursor, { ...binding, moderatorId: USER }, SECRET)).toBeNull();
    expect(decodeModerationCursor(cursor, binding, `${SECRET}x`)).toBeNull();
  });
});

describe("aturan transisi (planAction)", () => {
  it("review hanya dari OPEN; dismiss/resolve dari laporan terbuka; tidak dari yang sudah ditutup", () => {
    expect(planAction(record(), "review")).toEqual({ nextStatus: "REVIEWING", targetEffect: null });
    expect(() => planAction(record({ status: "REVIEWING" }), "review")).toThrow(AppError);
    expect(planAction(record({ status: "REVIEWING" }), "dismiss").nextStatus).toBe("DISMISSED");
    expect(planAction(record(), "resolve").nextStatus).toBe("RESOLVED");
    for (const status of ["RESOLVED", "DISMISSED"] as const) {
      expect(() => planAction(record({ status }), "dismiss")).toThrow(AppError);
      expect(() => planAction(record({ status }), "resolve")).toThrow(AppError);
      expect(() => planAction(record({ status }), "suspend")).toThrow(AppError);
    }
  });

  it("suspend: hanya target ACTIVE berperan USER; moderator tidak bisa ditindak", () => {
    expect(planAction(record(), "suspend")).toEqual({ nextStatus: "RESOLVED", targetEffect: "suspend" });
    expect(() => planAction(record({ targetRole: "MODERATOR" }), "suspend")).toThrow(AppError);
    for (const targetStatus of ["SUSPENDED", "PENDING_DELETION"] as const) {
      expect(() => planAction(record({ targetStatus }), "suspend")).toThrow(AppError);
    }
  });

  it("reinstate: hanya target SUSPENDED, status laporan tetap, boleh dari laporan yang sudah selesai", () => {
    expect(planAction(record({ status: "RESOLVED", targetStatus: "SUSPENDED" }), "reinstate")).toEqual({
      nextStatus: "RESOLVED",
      targetEffect: "reinstate",
    });
    expect(() => planAction(record(), "reinstate")).toThrow(AppError);
  });
});

describe("tindakan", () => {
  it("suspend: transaksi dengan efek suspend, audit tanpa isi catatan", async () => {
    const { service, repository, audits } = setup();
    const dto = await service.act(MOD, R1, { action: "suspend", note: "akun spam pribadi 0812-xxxx" }, CTX);
    expect(repository.applied[0]).toMatchObject({
      reportId: R1,
      moderatorId: MOD,
      expectedStatus: "OPEN",
      nextStatus: "RESOLVED",
      targetEffect: "suspend",
      note: "akun spam pribadi 0812-xxxx",
    });
    expect(dto.status).toBe("RESOLVED");
    expect(dto.target.status).toBe("SUSPENDED");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "moderation.report.suspend", actorId: MOD, entity: "Report", entityId: R1 });
    expect(JSON.stringify(audits)).not.toMatch(/0812|alex|203\.0\.113/);
  });

  it("laporan tidak ada: NOT_FOUND; konflik status: CONFLICT; tidak ada audit untuk yang gagal", async () => {
    const { service, audits, repository } = setup();
    await expect(service.act(MOD, "00000000-0000-4000-8000-0000000000ee", { action: "review" }, CTX)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const first = repository.reports[0];
    if (first) first.status = "DISMISSED";
    await expect(service.act(MOD, R1, { action: "resolve" }, CTX)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(audits).toHaveLength(0);
  });

  it("stale (moderator lain lebih dulu): CONFLICT dan tidak diaudit", async () => {
    const { service, repository, audits } = setup();
    repository.nextResult = "stale";
    await expect(service.act(MOD, R1, { action: "dismiss" }, CTX)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(audits).toHaveLength(0);
  });

  it("catatan kosong tidak menimpa catatan lama", async () => {
    const { service, repository } = setup();
    await service.act(MOD, R1, { action: "review" }, CTX);
    expect(repository.applied[0]?.note).toBeNull();
  });

  it("DTO memetakan tanggal ke ISO", () => {
    expect(toModerationReportDto(record({ resolvedAt: new Date("2026-10-11T00:00:00.000Z") })).resolvedAt).toBe("2026-10-11T00:00:00.000Z");
  });

  it("suspend/reinstate tanpa catatan ditolak di service juga (bukan hanya skema)", async () => {
    const { service, repository } = setup();
    await expect(service.act(MOD, R1, { action: "suspend" }, CTX)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.act(MOD, R1, { action: "reinstate", note: "ab" }, CTX)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.applied).toHaveLength(0);
  });
});
