import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("ok tanpa dependency", async () => {
    expect(await checkHealth()).toEqual({ status: "ok", checks: {} });
  });

  it("degraded bila ada check yang gagal, tanpa membocorkan error", async () => {
    const report = await checkHealth({
      db: async () => {
        throw new Error("connection string postgres://user:secret@host");
      },
      redis: async () => undefined,
    });
    expect(report.status).toBe("degraded");
    expect(report.checks).toEqual({ db: "fail", redis: "ok" });
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it("menganggap check yang timeout sebagai fail", async () => {
    const report = await checkHealth({ slow: () => new Promise(() => undefined) }, 20);
    expect(report.checks.slow).toBe("fail");
  });
});
