import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth";

const valid = {
  email: "  Alex@Example.COM ",
  username: "alex_99",
  password: "a-long-enough-pass",
};

describe("registerSchema", () => {
  it("menormalisasi email ke lowercase tanpa spasi", () => {
    const result = registerSchema.parse(valid);
    expect(result.email).toBe("alex@example.com");
  });

  it("menolak field tak dikenal (mass assignment)", () => {
    expect(registerSchema.safeParse({ ...valid, status: "ADMIN" }).success).toBe(false);
  });

  it("menolak password pendek dan username tidak valid", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, username: "a b" }).success).toBe(false);
  });

  it("menolak email tidak valid", () => {
    expect(registerSchema.safeParse({ ...valid, email: "bukan-email" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("menerima password pendek (aturan panjang hanya saat registrasi)", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("menolak password kosong dan field tak dikenal", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x", admin: true }).success).toBe(
      false,
    );
  });
});
