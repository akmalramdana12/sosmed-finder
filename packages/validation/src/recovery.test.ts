import { describe, expect, it } from "vitest";
import { recoveryTokenSchema, requestPasswordResetSchema, resetPasswordSchema, verifyEmailSchema } from "./recovery";

const TOKEN = "A".repeat(43);

describe("skema pemulihan", () => {
  it("token: tepat 43 karakter base64url", () => {
    expect(recoveryTokenSchema.safeParse(TOKEN).success).toBe(true);
    for (const bad of ["", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}!`, `${"A".repeat(42)} `, "A".repeat(42) + "\n"]) {
      expect(recoveryTokenSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("reset: password baru memakai aturan registrasi (min 12) dan menolak kolom asing", () => {
    expect(resetPasswordSchema.safeParse({ token: TOKEN, newPassword: "panjang-sekali-123" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: TOKEN, newPassword: "pendek" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: TOKEN, newPassword: "panjang-sekali-123", userId: "x" }).success).toBe(false);
  });

  it("permintaan reset: email dinormalisasi; verifikasi: hanya token", () => {
    const parsed = requestPasswordResetSchema.parse({ email: "  ADA@Example.com " });
    expect(parsed.email).toBe("ada@example.com");
    expect(requestPasswordResetSchema.safeParse({ email: "bukan-email" }).success).toBe(false);
    expect(verifyEmailSchema.safeParse({ token: TOKEN }).success).toBe(true);
    expect(verifyEmailSchema.safeParse({ token: TOKEN, extra: 1 }).success).toBe(false);
  });
});
