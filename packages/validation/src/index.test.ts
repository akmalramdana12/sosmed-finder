import { describe, expect, it } from "vitest";
import {
  locationVisibilitySchema,
  normalizeUsername,
  passwordSchema,
  usernameSchema,
} from "./index";

describe("usernameSchema", () => {
  it.each(["alex", "Alex_99", "a.b_c"])("menerima %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it.each(["ab", ".alex", "alex.", "al ex", "alex!", "a".repeat(31)])("menolak %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("lowercase dan trim", () => {
    expect(normalizeUsername("  AleX ")).toBe("alex");
  });
});

describe("passwordSchema", () => {
  it("menolak password pendek", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
  });
  it("menerima password >= 12 karakter", () => {
    expect(passwordSchema.safeParse("a-long-enough-pass").success).toBe(true);
  });
});

describe("locationVisibilitySchema", () => {
  it("hanya menerima nilai yang dikenal", () => {
    expect(locationVisibilitySchema.safeParse("PRIVATE").success).toBe(true);
    expect(locationVisibilitySchema.safeParse("PUBLIC_GPS").success).toBe(false);
  });
});
