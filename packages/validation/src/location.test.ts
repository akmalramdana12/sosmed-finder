import { describe, expect, it } from "vitest";
import { setLocationSchema, updateLocationSettingsSchema } from "./location";

const valid = { latitude: 1.1167, longitude: 104.0, accuracyLevel: "AREA" } as const;

describe("setLocationSchema", () => {
  it("menerima payload minimal", () => {
    expect(setLocationSchema.parse(valid)).toEqual(valid);
  });

  it("menerima visibilitas, radius, dan label (label dibersihkan)", () => {
    const result = setLocationSchema.parse({
      ...valid,
      visibility: "DISCOVERABLE_RADIUS",
      discoverableRadiusKm: 10,
      areaLabel: "  Sekupang\n",
      cityLabel: "Batam",
    });
    expect(result.areaLabel).toBe("Sekupang");
    expect(result.cityLabel).toBe("Batam");
    expect(result.discoverableRadiusKm).toBe(10);
  });

  it("batas lintang dan bujur", () => {
    expect(setLocationSchema.safeParse({ ...valid, latitude: 85 }).success).toBe(true);
    expect(setLocationSchema.safeParse({ ...valid, latitude: -85 }).success).toBe(true);
    expect(setLocationSchema.safeParse({ ...valid, latitude: 85.0001 }).success).toBe(false);
    expect(setLocationSchema.safeParse({ ...valid, latitude: -85.0001 }).success).toBe(false);
    expect(setLocationSchema.safeParse({ ...valid, longitude: 180 }).success).toBe(true);
    expect(setLocationSchema.safeParse({ ...valid, longitude: -180 }).success).toBe(true);
    expect(setLocationSchema.safeParse({ ...valid, longitude: 180.0001 }).success).toBe(false);
  });

  it("koordinat harus angka sungguhan", () => {
    expect(setLocationSchema.safeParse({ ...valid, latitude: "1.1167" }).success).toBe(false);
    expect(setLocationSchema.safeParse({ ...valid, longitude: null }).success).toBe(false);
    expect(setLocationSchema.safeParse({ ...valid, latitude: Number.NaN }).success).toBe(false);
    expect(setLocationSchema.safeParse({ ...valid, latitude: Infinity }).success).toBe(false);
  });

  it("koordinat dan level akurasi wajib", () => {
    expect(setLocationSchema.safeParse({ longitude: 104, accuracyLevel: "AREA" }).success).toBe(
      false,
    );
    expect(setLocationSchema.safeParse({ latitude: 1, longitude: 104 }).success).toBe(false);
    expect(setLocationSchema.safeParse({ ...valid, accuracyLevel: "EXACT" }).success).toBe(false);
  });

  it.each([0, 51, 1.5, -1, "5"])("menolak radius %s", (radius) => {
    expect(setLocationSchema.safeParse({ ...valid, discoverableRadiusKm: radius }).success).toBe(
      false,
    );
  });

  it("menolak visibilitas tak dikenal", () => {
    expect(setLocationSchema.safeParse({ ...valid, visibility: "PUBLIC" }).success).toBe(false);
  });

  it("label: kosong ditolak, null diterima (menghapus)", () => {
    expect(setLocationSchema.safeParse({ ...valid, areaLabel: "   " }).success).toBe(false);
    expect(setLocationSchema.parse({ ...valid, areaLabel: null }).areaLabel).toBeNull();
    expect(setLocationSchema.safeParse({ ...valid, areaLabel: "a".repeat(101) }).success).toBe(
      false,
    );
  });

  it.each(["isEnabled", "geography", "userId", "id", "precise", "altitude"])(
    "menolak field %s",
    (field) => {
      expect(setLocationSchema.safeParse({ ...valid, [field]: true }).success).toBe(false);
    },
  );
});

describe("updateLocationSettingsSchema", () => {
  it("menerima update parsial", () => {
    expect(updateLocationSettingsSchema.parse({ visibility: "PRIVATE" })).toEqual({
      visibility: "PRIVATE",
    });
    expect(updateLocationSettingsSchema.parse({ isEnabled: false })).toEqual({ isEnabled: false });
  });

  it("menolak objek kosong", () => {
    expect(updateLocationSettingsSchema.safeParse({}).success).toBe(false);
  });

  it.each(["latitude", "longitude", "accuracyLevel", "geography", "userId"])(
    "menolak %s: mengganti titik hanya lewat PUT",
    (field) => {
      expect(
        updateLocationSettingsSchema.safeParse({ visibility: "PRIVATE", [field]: 1 }).success,
      ).toBe(false);
    },
  );
});
