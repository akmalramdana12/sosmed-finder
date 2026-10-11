import type { LocationVisibility } from "@social-finder/types";
import { describe, expect, it } from "vitest";
import { projectLocation } from "./projection";

const LABELS = { areaLabel: "Sekupang", cityLabel: "Batam" };
const NO_LABELS = { areaLabel: null, cityLabel: null };

describe("projectLocation", () => {
  it("PRIVATE: tidak ada apa pun, walau label terisi", () => {
    const result = projectLocation("PRIVATE", LABELS);
    expect(result).toEqual({ distanceAllowed: false });
    expect(JSON.stringify(result)).not.toContain("Sekupang");
    expect(JSON.stringify(result)).not.toContain("Batam");
  });

  it("CITY_ONLY: hanya kota, tanpa area dan tanpa jarak", () => {
    expect(projectLocation("CITY_ONLY", LABELS)).toEqual({ city: "Batam", distanceAllowed: false });
  });

  it("AREA_ONLY: area dan kota, tanpa jarak", () => {
    expect(projectLocation("AREA_ONLY", LABELS)).toEqual({
      area: "Sekupang",
      city: "Batam",
      distanceAllowed: false,
    });
  });

  it("DISCOVERABLE_RADIUS: area, kota, dan jarak diizinkan", () => {
    expect(projectLocation("DISCOVERABLE_RADIUS", LABELS)).toEqual({
      area: "Sekupang",
      city: "Batam",
      distanceAllowed: true,
    });
  });

  it("label kosong dihilangkan, tidak muncul sebagai null/undefined", () => {
    expect(projectLocation("DISCOVERABLE_RADIUS", NO_LABELS)).toEqual({ distanceAllowed: true });
    expect(projectLocation("AREA_ONLY", { areaLabel: "Sekupang", cityLabel: null })).toEqual({
      area: "Sekupang",
      distanceAllowed: false,
    });
    expect(Object.keys(projectLocation("CITY_ONLY", NO_LABELS))).toEqual(["distanceAllowed"]);
  });

  it("jarak hanya boleh pada DISCOVERABLE_RADIUS", () => {
    const levels: LocationVisibility[] = [
      "PRIVATE",
      "CITY_ONLY",
      "AREA_ONLY",
      "DISCOVERABLE_RADIUS",
    ];
    const allowed = levels.filter((level) => projectLocation(level, LABELS).distanceAllowed);
    expect(allowed).toEqual(["DISCOVERABLE_RADIUS"]);
  });

  it("nilai tak dikenal diperlakukan sebagai PRIVATE (gagal tertutup)", () => {
    const result = projectLocation("SEMUA_ORANG" as LocationVisibility, LABELS);
    expect(result).toEqual({ distanceAllowed: false });
  });

  it("tidak pernah memuat koordinat dalam bentuk apa pun", () => {
    for (const level of ["PRIVATE", "CITY_ONLY", "AREA_ONLY", "DISCOVERABLE_RADIUS"] as const) {
      const keys = Object.keys(projectLocation(level, LABELS));
      for (const forbidden of ["latitude", "longitude", "lat", "lng", "geography", "point"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });
});
