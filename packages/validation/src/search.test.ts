import { describe, expect, it } from "vitest";
import { publicUsernameSchema, searchQuerySchema } from "./search";

describe("searchQuerySchema", () => {
  it("nilai bawaan: exact, limit 20", () => {
    expect(searchQuerySchema.parse({ q: "alex" })).toEqual({ q: "alex", mode: "exact", limit: 20 });
  });

  it("q dinormalkan ke huruf kecil dan dipangkas", () => {
    expect(searchQuerySchema.parse({ q: "  AlEx_1 " }).q).toBe("alex_1");
  });

  it("parameter tak dikenal ditolak (tidak ada filter tersembunyi)", () => {
    expect(searchQuerySchema.safeParse({ q: "alex", email: "a@b.c" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "alex", userId: "x" }).success).toBe(false);
  });

  it("harus ada q atau radiusKm: tidak ada 'daftar semua orang'", () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
    expect(searchQuerySchema.safeParse({ platform: "instagram" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ mode: "prefix", limit: "50" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ radiusKm: "5" }).success).toBe(true);
  });

  it("q minimal 2 karakter dan hanya karakter username (tidak ada wildcard)", () => {
    for (const q of ["a", "", " ", "%", "a%", "a b", "a'b", "a;b", "*", "ab/", "-ab", "ab\u0000", "a\nb", "ab\\", "x' OR '1'='1"]) {
      expect(searchQuerySchema.safeParse({ q }).success).toBe(false);
    }
    for (const q of ["ab", "a_b", "a.b", "a-b", "_ab"]) {
      expect(searchQuerySchema.safeParse({ q }).success).toBe(true);
    }
    expect(searchQuerySchema.safeParse({ q: "a".repeat(51) }).success).toBe(false);
  });

  it("radiusKm bilangan bulat 1-50", () => {
    for (const radiusKm of ["0", "51", "1.5", "-1", "abc", "", "1e1", "0x10", "999"]) {
      expect(searchQuerySchema.safeParse({ radiusKm }).success).toBe(false);
    }
    expect(searchQuerySchema.parse({ radiusKm: "50" }).radiusKm).toBe(50);
    expect(searchQuerySchema.parse({ radiusKm: "1" }).radiusKm).toBe(1);
  });

  it("limit 1-50", () => {
    expect(searchQuerySchema.safeParse({ q: "ab", limit: "0" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "ab", limit: "51" }).success).toBe(false);
    expect(searchQuerySchema.parse({ q: "ab", limit: "50" }).limit).toBe(50);
  });

  it("sort=distance hanya dengan radiusKm", () => {
    expect(searchQuerySchema.safeParse({ q: "ab", sort: "distance" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ radiusKm: "5", sort: "distance" }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: "ab", sort: "username" }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: "ab", sort: "random" }).success).toBe(false);
  });

  it("mode hanya exact atau prefix", () => {
    expect(searchQuerySchema.safeParse({ q: "ab", mode: "contains" }).success).toBe(false);
    expect(searchQuerySchema.parse({ q: "ab", mode: "prefix" }).mode).toBe("prefix");
  });

  it("platform dinormalkan dan dibatasi himpunan aman", () => {
    expect(searchQuerySchema.parse({ q: "ab", platform: " Instagram " }).platform).toBe("instagram");
    expect(searchQuerySchema.safeParse({ q: "ab", platform: "a b" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "ab", platform: "x'--" }).success).toBe(false);
  });

  it("cursor dibatasi 512 karakter", () => {
    expect(searchQuerySchema.safeParse({ q: "ab", cursor: "a".repeat(513) }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "ab", cursor: "" }).success).toBe(false);
  });
});

describe("publicUsernameSchema", () => {
  it("menerima username valid dan menolak yang lain", () => {
    expect(publicUsernameSchema.safeParse("Alex_1").success).toBe(true);
    for (const bad of ["ab", "a b", "../x", "a%", "", ".abc", "abc.", "a".repeat(31)]) {
      expect(publicUsernameSchema.safeParse(bad).success).toBe(false);
    }
  });
});
