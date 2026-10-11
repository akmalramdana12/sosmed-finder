import { latitudeSchema } from "@social-finder/validation";
import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_KM,
  GRID_KM,
  InvalidCoordinateError,
  KM_PER_DEGREE,
  MAX_ABS_LATITUDE,
  haversineKm,
  roundDistanceKm,
  snapToGrid,
  withinDiscoverableRadius,
  type GeoPoint,
} from "./geo";

/** PRNG deterministik (mulberry32) agar test acak tetap bisa diulang. */
function prng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_POINTS: GeoPoint[] = [
  { latitude: 1.1167, longitude: 104.0 }, // Batam
  { latitude: -6.2088, longitude: 106.8456 }, // Jakarta
  { latitude: 51.5074, longitude: -0.1278 }, // London
  { latitude: -33.8688, longitude: 151.2093 }, // Sydney
  { latitude: 64.1466, longitude: -21.9426 }, // Reykjavik
  { latitude: -0.1807, longitude: -78.4678 }, // Quito
  { latitude: 0, longitude: 0 },
  { latitude: 84.9, longitude: 179.99 },
  { latitude: -84.9, longitude: -179.99 },
];

describe("haversineKm", () => {
  it("jarak nol untuk titik yang sama dan simetris", () => {
    const a = { latitude: 1.1, longitude: 104.1 };
    const b = { latitude: -6.2, longitude: 106.8 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it("satu derajat lintang dan satu derajat bujur di ekuator", () => {
    expect(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
      KM_PER_DEGREE,
      6,
    );
    expect(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
      KM_PER_DEGREE,
      6,
    );
  });

  it("seperempat keliling bumi", () => {
    expect(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 90 })).toBeCloseTo(
      (EARTH_RADIUS_KM * Math.PI) / 2,
      6,
    );
  });

  it("benar melintasi antimeridian", () => {
    expect(
      haversineKm({ latitude: 0, longitude: 179.5 }, { latitude: 0, longitude: -179.5 }),
    ).toBeCloseTo(KM_PER_DEGREE, 6);
  });

  it("jarak Jakarta ke Bandung masuk akal (110-125 km)", () => {
    const distance = haversineKm(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: -6.9175, longitude: 107.6191 },
    );
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(125);
  });
});

describe("snapToGrid", () => {
  it("deterministik dan idempoten (menyimpan hasil snap lalu snap lagi tidak mengubahnya)", () => {
    for (const level of ["AREA", "CITY"] as const) {
      for (const point of SAMPLE_POINTS) {
        const once = snapToGrid(point, level);
        expect(snapToGrid(point, level)).toEqual(once);
        expect(snapToGrid(once, level)).toEqual(once);
      }
    }
  });

  it("hasil tidak sama dengan masukan (presisi hilang)", () => {
    const raw = { latitude: 1.123456, longitude: 104.123456 };
    const snapped = snapToGrid(raw, "AREA");
    expect(snapped.latitude).not.toBe(raw.latitude);
    expect(snapped.longitude).not.toBe(raw.longitude);
  });

  it("paling jauh setengah diagonal sel dari titik asli (AREA <= 1,6 km, CITY <= 8 km)", () => {
    const random = prng(42);
    let maxArea = 0;
    let maxCity = 0;
    for (let i = 0; i < 3000; i += 1) {
      const point = {
        latitude: (random() * 2 - 1) * 84,
        longitude: (random() * 2 - 1) * 180,
      };
      maxArea = Math.max(maxArea, haversineKm(point, snapToGrid(point, "AREA")));
      maxCity = Math.max(maxCity, haversineKm(point, snapToGrid(point, "CITY")));
    }
    expect(maxArea).toBeLessThanOrEqual(1.6);
    expect(maxCity).toBeLessThanOrEqual(8);
  });

  it("semua titik di sel yang sama menghasilkan centroid yang sama", () => {
    for (const level of ["AREA", "CITY"] as const) {
      for (const origin of SAMPLE_POINTS) {
        const centroid = snapToGrid(origin, level);
        // geser <= 40% setengah sisi sel, jadi tetap di dalam sel yang sama
        const reachKm = GRID_KM[level] * 0.2;
        const dLat = reachKm / KM_PER_DEGREE;
        const dLng = reachKm / (KM_PER_DEGREE * Math.cos((centroid.latitude * Math.PI) / 180));
        for (const [sx, sy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
        ] as const) {
          const moved = {
            latitude: centroid.latitude + sy * dLat,
            longitude: centroid.longitude + sx * dLng,
          };
          expect(snapToGrid(moved, level)).toEqual(centroid);
        }
      }
    }
  });

  it("titik yang berjauhan menghasilkan centroid berbeda", () => {
    const a = { latitude: 1.1167, longitude: 104.0 };
    const b = { latitude: 1.1167 + 20 / KM_PER_DEGREE, longitude: 104.0 };
    expect(snapToGrid(a, "AREA")).not.toEqual(snapToGrid(b, "AREA"));
  });

  it("CITY lebih kasar daripada AREA", () => {
    const area = new Set<string>();
    const city = new Set<string>();
    for (let x = 0; x < 12; x += 1) {
      for (let y = 0; y < 12; y += 1) {
        const point = {
          latitude: 1.05 + (y * 0.5) / KM_PER_DEGREE,
          longitude: 103.95 + (x * 0.5) / KM_PER_DEGREE,
        };
        area.add(JSON.stringify(snapToGrid(point, "AREA")));
        city.add(JSON.stringify(snapToGrid(point, "CITY")));
      }
    }
    // area 6 x 6 km: sel 2 km -> 9-16 sel; sel 10 km -> paling banyak 4 sel
    expect(city.size).toBeLessThanOrEqual(4);
    expect(area.size).toBeGreaterThan(city.size);
  });

  it("antimeridian: +180 dan -180 satu sel, tidak ada sel terpotong", () => {
    expect(snapToGrid({ latitude: 10, longitude: 180 }, "AREA")).toEqual(
      snapToGrid({ latitude: 10, longitude: -180 }, "AREA"),
    );
    const edge = snapToGrid({ latitude: 10, longitude: 179.9999 }, "AREA");
    expect(edge.longitude).toBeLessThanOrEqual(180);
    expect(edge.longitude).toBeGreaterThan(179.9);
  });

  it("keluaran maksimal 6 desimal", () => {
    for (const point of SAMPLE_POINTS) {
      const snapped = snapToGrid(point, "AREA");
      expect(Number(snapped.latitude.toFixed(6))).toBe(snapped.latitude);
      expect(Number(snapped.longitude.toFixed(6))).toBe(snapped.longitude);
    }
  });

  it("menolak koordinat tidak didukung dengan pesan statis (tanpa nilai koordinat)", () => {
    const bad: GeoPoint[] = [
      { latitude: 89.123456, longitude: 10 },
      { latitude: -85.5, longitude: 10 },
      { latitude: Number.NaN, longitude: 10 },
      { latitude: 10, longitude: 181.654321 },
      { latitude: Infinity, longitude: 0 },
    ];
    for (const point of bad) {
      let message = "";
      try {
        snapToGrid(point, "AREA");
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidCoordinateError);
        message = (error as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).not.toMatch(/\d/);
    }
  });

  it("batas lintang sama dengan skema validasi", () => {
    expect(latitudeSchema.safeParse(MAX_ABS_LATITUDE).success).toBe(true);
    expect(latitudeSchema.safeParse(-MAX_ABS_LATITUDE).success).toBe(true);
    expect(latitudeSchema.safeParse(MAX_ABS_LATITUDE + 0.0001).success).toBe(false);
    expect(latitudeSchema.safeParse(-MAX_ABS_LATITUDE - 0.0001).success).toBe(false);
    // batas yang diterima validasi juga harus bisa di-snap
    expect(() => snapToGrid({ latitude: MAX_ABS_LATITUDE, longitude: 0 }, "CITY")).not.toThrow();
  });

  it("anti-triangulasi: dua target di sel yang sama tidak bisa dibedakan oleh jarak dari titik mana pun", () => {
    // Titik tengah sel dan titik lain di dalam sel yang sama (geser 0,3 km, setengah sisi sel = 1 km).
    const cellCentre = snapToGrid({ latitude: 1.1167, longitude: 104.0 }, "AREA");
    const insideSameCell = {
      latitude: cellCentre.latitude + 0.3 / KM_PER_DEGREE,
      longitude: cellCentre.longitude + 0.3 / KM_PER_DEGREE,
    };
    const random = prng(7);
    for (let i = 0; i < 200; i += 1) {
      const searcher = snapToGrid(
        { latitude: 1.1 + (random() - 0.5) * 0.5, longitude: 104 + (random() - 0.5) * 0.5 },
        "AREA",
      );
      const viaCentre = haversineKm(searcher, snapToGrid(cellCentre, "AREA"));
      const viaInside = haversineKm(searcher, snapToGrid(insideSameCell, "AREA"));
      expect(viaInside).toBe(viaCentre);
    }
  });
});

describe("roundDistanceKm", () => {
  it.each([
    [0, 1],
    [0.2, 1],
    [1.2, 1],
    [1.3, 1.5],
    [2.4, 2.5],
    [2.74, 2.5],
    [2.75, 3],
    [49.9, 50],
  ])("%s km ditampilkan %s km", (input, expected) => {
    expect(roundDistanceKm(input)).toBe(expected);
  });
});

describe("withinDiscoverableRadius", () => {
  it("dibatasi radius pencarian", () => {
    expect(withinDiscoverableRadius(3, 5, 10_000)).toBe(true);
    expect(withinDiscoverableRadius(6, 5, 10_000)).toBe(false);
  });

  it("dibatasi radius yang dipilih target walau pencari mencari lebih jauh", () => {
    expect(withinDiscoverableRadius(6, 10, 5_000)).toBe(false);
    expect(withinDiscoverableRadius(4, 50, 5_000)).toBe(true);
  });

  it("batas tepat termasuk", () => {
    expect(withinDiscoverableRadius(5, 5, 5_000)).toBe(true);
    expect(withinDiscoverableRadius(5.0001, 5, 5_000)).toBe(false);
  });
});
