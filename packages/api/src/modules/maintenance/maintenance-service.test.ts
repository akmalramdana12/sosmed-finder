import { describe, expect, it } from "vitest";
import { DELETION_GRACE_DAYS } from "../account";
import { RETENTION, runMaintenance } from "./maintenance-service";
import type { MaintenanceRepository } from "./types";

const NOW = new Date("2026-10-11T00:00:00.000Z");
const DAY = 86_400_000;

function setup(failOn?: string) {
  const calls: Record<string, Date> = {};
  const rec = (name: string, n: number) => async (cutoff: Date): Promise<number> => {
    if (failOn === name) throw new Error("detail rahasia: user@example.com");
    calls[name] = cutoff;
    return n;
  };
  const repository: MaintenanceRepository = {
    deleteSessionsEndedBefore: rec("sessions", 3),
    deleteTokensExpiredBefore: rec("tokens", 2),
    deleteSearchLogsBefore: rec("search", 10),
    deleteAuditLogsBefore: rec("audit", 1),
  };
  const accounts = {
    purgeDeletedBefore: async (cutoff: Date): Promise<number> => {
      if (failOn === "accounts") throw new Error("boom");
      calls["accounts"] = cutoff;
      return 4;
    },
  };
  return { calls, deps: { repository, accounts, now: () => NOW } };
}

describe("runMaintenance", () => {
  it("menjalankan semua tugas dengan cutoff sesuai retensi", async () => {
    const { calls, deps } = setup();
    const report = await runMaintenance(deps);
    expect(report.failed).toEqual([]);
    expect(report.counts).toEqual({
      purgeDeletedAccounts: 4,
      deleteEndedSessions: 3,
      deleteExpiredTokens: 2,
      deleteOldSearchLogs: 10,
      deleteOldAuditLogs: 1,
    });
    expect(calls["accounts"]).toEqual(new Date(NOW.getTime() - DELETION_GRACE_DAYS * DAY));
    expect(calls["sessions"]).toEqual(new Date(NOW.getTime() - RETENTION.sessionGraceDays * DAY));
    expect(calls["tokens"]).toEqual(new Date(NOW.getTime() - RETENTION.tokenGraceDays * DAY));
    expect(calls["search"]).toEqual(new Date(NOW.getTime() - RETENTION.searchLogDays * DAY));
    expect(calls["audit"]).toEqual(new Date(NOW.getTime() - RETENTION.auditLogDays * DAY));
  });

  it("kegagalan satu tugas tidak menghentikan yang lain", async () => {
    const { deps } = setup("sessions");
    const report = await runMaintenance(deps);
    expect(report.failed).toEqual(["deleteEndedSessions"]);
    expect(report.counts.deleteOldSearchLogs).toBe(10);
    expect(report.counts.purgeDeletedAccounts).toBe(4);
  });

  it("laporan tidak memuat pesan error", async () => {
    const { deps } = setup("search");
    const report = await runMaintenance(deps);
    expect(JSON.stringify(report)).not.toContain("rahasia");
    expect(JSON.stringify(report)).not.toContain("@");
  });

  it("kegagalan purge akun dilaporkan, tugas lain jalan", async () => {
    const { deps } = setup("accounts");
    const report = await runMaintenance(deps);
    expect(report.failed).toEqual(["purgeDeletedAccounts"]);
    expect(report.counts.deleteEndedSessions).toBe(3);
  });
});
