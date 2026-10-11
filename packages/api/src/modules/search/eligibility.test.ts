import { describe, expect, it } from "vitest";
import { evaluateCandidate, type EvaluationRules } from "./eligibility";
import { ACCOUNT, candidate } from "./fixtures";
import type { SearchCandidate } from "./types";

const SEARCHER = "99999999-9999-4999-8999-999999999999";
const BASE: EvaluationRules = {
  searcherId: SEARCHER,
  usernameQuery: true,
  platformKey: null,
  radiusKm: null,
};

function reason(c: ReturnType<typeof candidate>, rules: Partial<EvaluationRules> = {}) {
  const result = evaluateCandidate(c, { ...BASE, ...rules });
  return result.ok ? "ok" : result.reason;
}

describe("evaluateCandidate: syarat dasar", () => {
  it("kandidat sehat lolos dan hasilnya sesuai contoh di spesifikasi", () => {
    const result = evaluateCandidate(candidate(), BASE);
    expect(result).toEqual({
      ok: true,
      result: {
        username: "Alex",
        displayName: "Alex Doe",
        accounts: [
          {
            platform: "instagram",
            username: "alex",
            profileUrl: "https://instagram.com/alex",
            isVerified: false,
          },
        ],
        area: "Sekupang",
        city: "Batam",
        distanceKm: 2.5,
      },
    });
  });

  it("allowHandleMatch=false menolak kecocokan lewat handle (lookup profil)", () => {
    const viaHandle = candidate({ usernameMatched: false, handleMatched: true });
    expect(reason(viaHandle, { allowHandleMatch: false })).toBe("no-match");
    expect(reason(candidate(), { allowHandleMatch: false })).toBe("ok");
  });

  it("menolak diri sendiri", () => {
    expect(reason(candidate({ userId: SEARCHER }))).toBe("self");
  });

  it("menolak akun tidak aktif (SUSPENDED, PENDING_DELETION, deleted)", () => {
    const overrides: Partial<SearchCandidate>[] = [
      { status: "SUSPENDED" },
      { status: "PENDING_DELETION" },
      { deleted: true },
    ];
    for (const override of overrides) {
      expect(reason(candidate(override))).toBe("inactive");
    }
  });

  it("menolak yang tidak discoverable", () => {
    expect(reason(candidate({ isDiscoverable: false }))).toBe("not-discoverable");
  });

  it("menolak yang diblokir dua arah", () => {
    expect(reason(candidate({ blockedEitherWay: true }))).toBe("blocked");
  });

  it("menolak tanpa akun sosmed discoverable (akun nonaktif atau platform nonaktif juga tidak dihitung)", () => {
    expect(reason(candidate({ accounts: [] }))).toBe("no-discoverable-account");
    expect(reason(candidate({ accounts: [{ ...ACCOUNT, isDiscoverable: false }] }))).toBe(
      "no-discoverable-account",
    );
    expect(reason(candidate({ accounts: [{ ...ACCOUNT, platformActive: false }] }))).toBe(
      "no-discoverable-account",
    );
  });

  it("akun yang tidak discoverable tidak ikut tampil walau ada akun lain yang discoverable", () => {
    const hidden = { ...ACCOUNT, platformKey: "x", username: "rahasia", isDiscoverable: false };
    const result = evaluateCandidate(candidate({ accounts: [ACCOUNT, hidden] }), BASE);
    expect(result.ok && result.result.accounts.map((a) => a.username)).toEqual(["alex"]);
    expect(JSON.stringify(result)).not.toContain("rahasia");
  });
});

describe("evaluateCandidate: pencarian username", () => {
  it("searchableByUsername=false: tidak muncul di pencarian username", () => {
    expect(reason(candidate({ searchableByUsername: false }))).toBe("username-search-off");
  });

  it("searchableByUsername=false tidak mempengaruhi pencarian radius murni", () => {
    expect(reason(candidate({ searchableByUsername: false }), { usernameQuery: false, radiusKm: 5 })).toBe("ok");
  });

  it("tidak cocok sama sekali ditolak", () => {
    expect(reason(candidate({ usernameMatched: false, handleMatched: false }))).toBe("no-match");
  });

  it("cocok lewat handle sosmed diizinkan bila platform ditampilkan", () => {
    expect(reason(candidate({ usernameMatched: false, handleMatched: true }))).toBe("ok");
  });

  it("cocok lewat handle sosmed DITOLAK bila showPlatforms=false (tidak membocorkan handle tersembunyi)", () => {
    expect(
      reason(candidate({ usernameMatched: false, handleMatched: true, showPlatforms: false })),
    ).toBe("handle-hidden");
  });

  it("cocok lewat username Social Finder tetap muncul bila showPlatforms=false, tanpa daftar akun", () => {
    const result = evaluateCandidate(candidate({ showPlatforms: false }), BASE);
    expect(result.ok && result.result.accounts).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("instagram");
  });
});

describe("evaluateCandidate: filter platform", () => {
  const rules = { platformKey: "instagram" };

  it("cocok bila punya akun discoverable di platform itu", () => {
    expect(reason(candidate(), rules)).toBe("ok");
  });

  it("tidak punya akun di platform itu: ditolak", () => {
    expect(reason(candidate(), { platformKey: "tiktok" })).toBe("platform-no-match");
  });

  it("showPlatforms=false: filter platform tidak boleh cocok (anti kebocoran lewat filter)", () => {
    expect(reason(candidate({ showPlatforms: false }), rules)).toBe("platform-hidden");
    expect(reason(candidate({ showPlatforms: false }), { platformKey: "tiktok" })).toBe("platform-hidden");
  });

  it("akun non-discoverable di platform itu tidak dihitung", () => {
    const c = candidate({
      accounts: [ACCOUNT, { ...ACCOUNT, platformKey: "tiktok", isDiscoverable: false }],
    });
    expect(reason(c, { platformKey: "tiktok" })).toBe("platform-no-match");
  });
});

describe("evaluateCandidate: lokasi dan jarak", () => {
  const radius = { usernameQuery: false, radiusKm: 5 };

  it("pencarian radius butuh DISCOVERABLE_RADIUS", () => {
    for (const visibility of ["PRIVATE", "CITY_ONLY", "AREA_ONLY"] as const) {
      expect(reason(candidate({ visibility }), radius)).toBe("radius-not-allowed");
    }
  });

  it("lokasi dinonaktifkan: tidak ikut radius walau visibilitas tersimpan DISCOVERABLE_RADIUS", () => {
    expect(reason(candidate({ locationEnabled: false }), radius)).toBe("radius-not-allowed");
  });

  it("tanpa jarak (pencari tanpa lokasi): ditolak pada pencarian radius", () => {
    expect(reason(candidate({ distanceM: null, distanceUnits: null }), radius)).toBe("radius-not-allowed");
  });

  it("dibatasi radius pencarian", () => {
    expect(reason(candidate({ distanceM: 6_000 }), radius)).toBe("out-of-radius");
    expect(reason(candidate({ distanceM: 4_000 }), radius)).toBe("ok");
  });

  it("dibatasi radius pilihan target walau pencari mencari lebih jauh", () => {
    const c = candidate({ discoverableRadiusM: 3_000, distanceM: 4_000 });
    expect(reason(c, { usernameQuery: false, radiusKm: 50 })).toBe("out-of-radius");
  });

  it("jarak dibulatkan 0,5 km, minimal 1 km", () => {
    const dist = (distanceM: number) => {
      const r = evaluateCandidate(candidate({ distanceM }), BASE);
      return r.ok ? r.result.distanceKm : "ditolak";
    };
    expect(dist(2_400)).toBe(2.5);
    expect(dist(100)).toBe(1);
    expect(dist(7_100)).toBe(7);
  });

  it("pencarian username: jarak TIDAK muncul bila pencari di luar radius pilihan target", () => {
    const r = evaluateCandidate(candidate({ discoverableRadiusM: 3_000, distanceM: 4_000 }), BASE);
    expect(r.ok).toBe(true);
    expect(r.ok && "distanceKm" in r.result).toBe(false);
  });

  it("proyeksi mengikuti visibilitas dan tidak pernah memuat jarak di bawah DISCOVERABLE_RADIUS", () => {
    const pick = (visibility: "PRIVATE" | "CITY_ONLY" | "AREA_ONLY") => {
      const r = evaluateCandidate(candidate({ visibility }), BASE);
      if (!r.ok) throw new Error("harus lolos");
      return r.result;
    };
    const priv = pick("PRIVATE");
    expect(priv.area).toBeUndefined();
    expect(priv.city).toBeUndefined();
    expect(priv.distanceKm).toBeUndefined();
    const city = pick("CITY_ONLY");
    expect(city.city).toBe("Batam");
    expect(city.area).toBeUndefined();
    expect(city.distanceKm).toBeUndefined();
    const area = pick("AREA_ONLY");
    expect(area.area).toBe("Sekupang");
    expect(area.distanceKm).toBeUndefined();
  });

  it("lokasi dinonaktifkan: tidak ada label maupun jarak", () => {
    const r = evaluateCandidate(candidate({ locationEnabled: false }), BASE);
    if (!r.ok) throw new Error("harus lolos");
    expect("area" in r.result).toBe(false);
    expect("city" in r.result).toBe(false);
    expect("distanceKm" in r.result).toBe(false);
  });
});

describe("evaluateCandidate: tidak ada kebocoran data internal", () => {
  it("DTO hanya memuat field whitelist", () => {
    const r = evaluateCandidate(candidate(), BASE);
    if (!r.ok) throw new Error("harus lolos");
    expect(Object.keys(r.result).sort()).toEqual(
      ["accounts", "area", "city", "displayName", "distanceKm", "username"].sort(),
    );
    expect(Object.keys(r.result.accounts[0] ?? {}).sort()).toEqual(
      ["isVerified", "platform", "profileUrl", "username"].sort(),
    );
    const text = JSON.stringify(r);
    for (const secret of ["11111111-1111", "userId", "normalized", "latitude", "longitude", "geography", "10000", "2400"]) {
      expect(text).not.toContain(secret);
    }
  });
});
