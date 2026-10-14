import { describe, expect, it } from "vitest";
import { changePasswordSchema, deleteAccountSchema, exportDataSchema } from "./account";

describe("changePasswordSchema", () => {
  it("menerima password lama apa pun dan password baru >= 12 karakter", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "a".repeat(12) }).success).toBe(true);
  });
  it("menolak password baru pendek, field kosong, dan field tambahan", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "pendek" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "", newPassword: "a".repeat(12) }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "a".repeat(129) }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "a".repeat(12), userId: "1" }).success).toBe(false);
  });
});

describe("deleteAccountSchema", () => {
  it("wajib password dan penegasan DELETE persis", () => {
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "DELETE" }).success).toBe(true);
    for (const body of [{ password: "x" }, { password: "x", confirm: "delete" }, { password: "x", confirm: true }, { confirm: "DELETE" }, { password: "", confirm: "DELETE" }]) {
      expect(deleteAccountSchema.safeParse(body).success).toBe(false);
    }
  });
  it("menolak field tambahan", () => {
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "DELETE", userId: "1" }).success).toBe(false);
  });
});

describe("exportDataSchema", () => {
  it("hanya password; field lain ditolak", () => {
    expect(exportDataSchema.safeParse({ password: "apa-saja" }).success).toBe(true);
    expect(exportDataSchema.safeParse({}).success).toBe(false);
    expect(exportDataSchema.safeParse({ password: "x", userId: "y" }).success).toBe(false);
    expect(exportDataSchema.safeParse({ password: "x".repeat(129) }).success).toBe(false);
  });
});
