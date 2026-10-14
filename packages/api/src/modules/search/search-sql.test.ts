import { describe, expect, it } from "vitest";
import { buildSearchQuery, escapeLike } from "./search-sql";
import type { SearchCriteria } from "./types";

const ME = "99999999-9999-4999-8999-999999999999";
const BASE: SearchCriteria = {
  searcherId: ME,
  query: null,
  platformKey: null,
  requireVerifiedEmail: true,
  radiusM: null,
  sort: "username",
  fetchLimit: 21,
  after: null,
};

describe("escapeLike", () => {
  it("meng-escape %, _, dan backslash", () => {
    expect(escapeLike("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
    expect(escapeLike("alex")).toBe("alex");
  });
});

describe("buildSearchQuery", () => {
  it("input pengguna tidak pernah masuk ke teks SQL, hanya ke values", () => {
    const evil = "x'; DROP TABLE \"User\"; --";
    const built = buildSearchQuery({
      ...BASE,
      query: { text: evil, mode: "prefix", includeHandles: true },
      platformKey: "p'--",
      radiusM: 12345,
      after: { sort: "username", value: "zz'--", userId: "00000000-0000-4000-8000-000000000001" },
    });
    for (const fragment of ["DROP TABLE", "p'--", "zz'--", "12345", "00000000-0000-4000", ME]) {
      expect(built.text).not.toContain(fragment);
    }
    expect(built.values).toContain("p'--");
    expect(built.values).toContain(12345);
    expect(built.values).toContain(`${escapeLike(evil)}%`);
  });

  it("tiap placeholder terisi dan tidak ada placeholder yang menggantung", () => {
    const built = buildSearchQuery({
      ...BASE,
      query: { text: "ale", mode: "prefix", includeHandles: true },
      platformKey: "instagram",
      radiusM: 5000,
      sort: "distance",
      after: { sort: "distance", value: 7, userId: "00000000-0000-4000-8000-000000000001" },
    });
    const used = new Set([...built.text.matchAll(/\$(\d+)::/g)].map((m) => Number(m[1])));
    expect(Math.max(...used)).toBe(built.values.length);
    for (let i = 1; i <= built.values.length; i += 1) expect(used.has(i)).toBe(true);
  });

  it("prefix: LIKE dengan ESCAPE dan pola yang di-escape; exact: sama dengan", () => {
    const prefix = buildSearchQuery({ ...BASE, query: { text: "a_b", mode: "prefix", includeHandles: true } });
    expect(prefix.text).toContain("LIKE");
    expect(prefix.text).toContain("ESCAPE");
    expect(prefix.values).toContain("a\\_b%");
    const exact = buildSearchQuery({ ...BASE, query: { text: "a_b", mode: "exact", includeHandles: true } });
    expect(exact.text).not.toContain("LIKE");
    expect(exact.values).toContain("a_b");
  });

  it("syarat privasi dasar selalu ada", () => {
    for (const criteria of [
      BASE,
      { ...BASE, query: { text: "ab", mode: "exact" as const, includeHandles: true } },
      { ...BASE, radiusM: 5000, sort: "distance" as const },
    ]) {
      const { text } = buildSearchQuery(criteria);
      for (const required of [
        `u."status" = 'ACTIVE'`,
        `u."deletedAt" IS NULL`,
        `ps."isDiscoverable"`,
        `NOT EXISTS (SELECT 1 FROM "Block"`,
        `sa."isDiscoverable"`,
        `sp."isActive"`,
      ]) {
        expect(text).toContain(required);
      }
    }
  });

  it("pencarian kata kunci memaksa searchableByUsername; handle hanya bila showPlatforms", () => {
    const { text } = buildSearchQuery({
      ...BASE,
      query: { text: "ab", mode: "exact", includeHandles: true },
    });
    expect(text).toContain(`ps."searchableByUsername"`);
    expect(text).toContain(`ps."showPlatforms" AND EXISTS`);
  });

  it("lookup profil (includeHandles=false) tidak mencocokkan handle sosmed sama sekali", () => {
    const { text } = buildSearchQuery({
      ...BASE,
      query: { text: "abc", mode: "exact", includeHandles: false },
    });
    expect(text).not.toContain(`sa."normalizedUsername" =`);
  });

  it("filter platform memaksa showPlatforms", () => {
    const { text } = buildSearchQuery({ ...BASE, query: { text: "ab", mode: "exact", includeHandles: true }, platformKey: "x" });
    expect(text).toContain(`sp."key" =`);
    expect(text.match(/ps\."showPlatforms"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("radius: DISCOVERABLE_RADIUS, lokasi aktif, kedua radius, dan lokasi pencari", () => {
    const { text } = buildSearchQuery({ ...BASE, radiusM: 5000, sort: "distance" });
    expect(text).toContain(`ps."locationVisibility" = 'DISCOVERABLE_RADIUS'`);
    expect(text).toContain(`l."isEnabled"`);
    expect(text).toContain(`sl."userId" IS NOT NULL`);
    expect(text).toContain(`l."discoverableRadius"::float8`);
  });

  it("tanpa radius tidak ada filter lokasi", () => {
    const { text } = buildSearchQuery({ ...BASE, query: { text: "ab", mode: "exact", includeHandles: true } });
    expect(text).not.toContain(`'DISCOVERABLE_RADIUS'`);
  });

  it("tidak pernah memilih koordinat mentah", () => {
    const { text } = buildSearchQuery({ ...BASE, radiusM: 5000, sort: "distance" });
    expect(text).not.toMatch(/ST_(X|Y|AsText|AsGeoJSON|AsEWKT|AsBinary)/i);
    expect(text).not.toContain(`l."geography" AS`);
  });

  it("keyset: urutan dan perbandingan cursor konsisten, ada tie-breaker id", () => {
    const byName = buildSearchQuery({
      ...BASE,
      query: { text: "ab", mode: "prefix", includeHandles: true },
      after: { sort: "username", value: "abc", userId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(byName.text).toContain(`ORDER BY "normalizedUsername" COLLATE "C" ASC, "userId" ASC`);
    expect(byName.text).toContain(`WHERE ("normalizedUsername" COLLATE "C", "userId") >`);
    const byDistance = buildSearchQuery({
      ...BASE,
      radiusM: 5000,
      sort: "distance",
      after: { sort: "distance", value: 4, userId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(byDistance.text).toContain(`ORDER BY "distanceUnits" ASC, "userId" ASC`);
    expect(byDistance.text).toContain(`WHERE ("distanceUnits", "userId") >`);
  });
  it("kata kunci: kandidat diambil lewat CTE berbasis indeks, bukan OR EXISTS atas semua pengguna", () => {
    const withHandles = buildSearchQuery({ ...BASE, query: { text: "ab", mode: "exact", includeHandles: true } });
    expect(withHandles.text).toContain("cand AS MATERIALIZED");
    expect(withHandles.text).toContain(`FROM cand JOIN "User" u ON u."id" = cand."id"`);
    expect(withHandles.text).toContain("UNION");
    const usernameOnly = buildSearchQuery({ ...BASE, query: { text: "ab", mode: "exact", includeHandles: false } });
    expect(usernameOnly.text).toContain("cand AS MATERIALIZED");
    expect(usernameOnly.text).not.toContain("UNION");
    // Tanpa kata kunci tidak ada CTE kandidat.
    expect(buildSearchQuery(BASE).text).not.toContain("cand");
  });

  it("daftar akun sosmed dihitung hanya untuk baris halaman (setelah LIMIT)", () => {
    const { text } = buildSearchQuery({ ...BASE, query: { text: "ab", mode: "prefix", includeHandles: true } });
    const limitAt = text.indexOf("LIMIT");
    const accountsAt = text.indexOf(`AS "accounts"`);
    expect(limitAt).toBeGreaterThan(-1);
    expect(accountsAt).toBeGreaterThan(limitAt);
  });

  it("requireVerifiedEmail: filter email terverifikasi hanya bila diminta; bendera selalu dipilih", () => {
    const strict = buildSearchQuery({ ...BASE, requireVerifiedEmail: true }).text;
    const loose = buildSearchQuery({ ...BASE, requireVerifiedEmail: false }).text;
    const count = (text: string) => text.split('u."emailVerifiedAt" IS NOT NULL').length - 1;
    expect(count(strict)).toBe(2); // kolom "emailVerified" + filter WHERE
    expect(count(loose)).toBe(1); // hanya kolom, untuk dicek ulang oleh evaluateCandidate
    expect(strict).toContain('AS "emailVerified"');
  });
});
