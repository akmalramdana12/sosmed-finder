import { describe, expect, it } from "vitest";
import { blockUserSchema, createReportSchema } from "./safety";

describe("blockUserSchema", () => {
  it("menerima username valid", () => {
    expect(blockUserSchema.parse({ username: "alex_1" })).toEqual({ username: "alex_1" });
  });
  it("menolak field tambahan (mass assignment) dan username tidak valid", () => {
    expect(blockUserSchema.safeParse({ username: "alex", blockerId: "x" }).success).toBe(false);
    expect(blockUserSchema.safeParse({ userId: "x" }).success).toBe(false);
    for (const username of ["", "a", "a b", "a/b", "a'b", "a".repeat(31), "../x"]) {
      expect(blockUserSchema.safeParse({ username }).success).toBe(false);
    }
  });
});

describe("createReportSchema", () => {
  it("alasan harus salah satu dari enum", () => {
    expect(createReportSchema.safeParse({ username: "alex", reason: "SPAM" }).success).toBe(true);
    expect(createReportSchema.safeParse({ username: "alex", reason: "BORING" }).success).toBe(false);
    expect(createReportSchema.safeParse({ username: "alex" }).success).toBe(false);
  });
  it("status, reporterId, targetUserId tidak bisa diatur dari body", () => {
    for (const extra of [{ status: "RESOLVED" }, { reporterId: "x" }, { targetUserId: "x" }]) {
      expect(createReportSchema.safeParse({ username: "alex", reason: "SPAM", ...extra }).success).toBe(false);
    }
  });
  it("details dibersihkan dan dibatasi 1000 karakter", () => {
    const ok = createReportSchema.parse({ username: "alex", reason: "SPAM", details: "  halo\u202e dunia\u0000  " });
    expect(ok.details).toBe("halo dunia");
    expect(createReportSchema.safeParse({ username: "alex", reason: "SPAM", details: "a".repeat(1001) }).success).toBe(false);
  });
  it("alasan OTHER wajib disertai penjelasan minimal 10 karakter", () => {
    expect(createReportSchema.safeParse({ username: "alex", reason: "OTHER" }).success).toBe(false);
    expect(createReportSchema.safeParse({ username: "alex", reason: "OTHER", details: "pendek" }).success).toBe(false);
    expect(createReportSchema.safeParse({ username: "alex", reason: "OTHER", details: "penjelasan cukup panjang" }).success).toBe(true);
  });
});
