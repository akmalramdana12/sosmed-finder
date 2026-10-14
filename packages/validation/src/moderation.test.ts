import { describe, expect, it } from "vitest";
import { listReportsQuerySchema, moderationActionSchema, reportIdSchema } from "./moderation";

describe("listReportsQuerySchema", () => {
  it("default: OPEN, limit 20", () => {
    expect(listReportsQuerySchema.parse({})).toEqual({ status: "OPEN", limit: 20 });
  });
  it("menolak status/limit tidak valid dan parameter tak dikenal", () => {
    expect(listReportsQuerySchema.safeParse({ status: "ALL" }).success).toBe(false);
    expect(listReportsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listReportsQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(listReportsQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    expect(listReportsQuerySchema.safeParse({ targetUserId: "x" }).success).toBe(false);
  });
});

describe("moderationActionSchema", () => {
  it("menerima aksi valid", () => {
    expect(moderationActionSchema.safeParse({ action: "review" }).success).toBe(true);
    expect(moderationActionSchema.safeParse({ action: "dismiss", note: "tidak melanggar" }).success).toBe(true);
  });
  it("suspend dan reinstate wajib bercatatan minimal 5 karakter", () => {
    for (const action of ["suspend", "reinstate"]) {
      expect(moderationActionSchema.safeParse({ action }).success).toBe(false);
      expect(moderationActionSchema.safeParse({ action, note: "abc" }).success).toBe(false);
      expect(moderationActionSchema.safeParse({ action, note: "pelanggaran jelas" }).success).toBe(true);
    }
  });
  it("menolak aksi tak dikenal dan field tambahan; catatan dibersihkan dan dibatasi", () => {
    expect(moderationActionSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(moderationActionSchema.safeParse({ action: "review", status: "ACTIVE" }).success).toBe(false);
    expect(moderationActionSchema.parse({ action: "resolve", note: " ok‮ " }).note).toBe("ok");
    expect(moderationActionSchema.safeParse({ action: "resolve", note: "a".repeat(1001) }).success).toBe(false);
  });
});

describe("reportIdSchema", () => {
  it("hanya UUID", () => {
    expect(reportIdSchema.safeParse("00000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(reportIdSchema.safeParse("1; DROP TABLE").success).toBe(false);
  });
});
