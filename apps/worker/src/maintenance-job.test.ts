import { describe, expect, it } from "vitest";
import { handleMaintenance } from "./maintenance-job";

const ok = async (): Promise<number> => 0;
const deps = (fail: boolean) => ({
  repository: {
    deleteSessionsEndedBefore: fail ? async (): Promise<number> => { throw new Error("x"); } : ok,
    deleteTokensExpiredBefore: ok,
    deleteSearchLogsBefore: ok,
    deleteAuditLogsBefore: ok,
  },
  accounts: { purgeDeletedBefore: ok },
  now: () => new Date("2026-10-11T00:00:00Z"),
});

describe("handleMaintenance", () => {
  it("mengembalikan laporan bila semua tugas berhasil", async () => {
    const report = await handleMaintenance(deps(false));
    expect(report.failed).toEqual([]);
  });

  it("melempar bila ada tugas gagal, pesan hanya memuat nama tugas", async () => {
    await expect(handleMaintenance(deps(true))).rejects.toThrow("maintenance task failed: deleteEndedSessions");
  });
});
