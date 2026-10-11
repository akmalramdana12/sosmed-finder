/**
 * Integrasi lokasi terhadap Postgres+PostGIS sungguhan: upsert SQL mentah, snap sebelum simpan,
 * visibilitas lewat PrivacySettings, dan penghapusan.
 * CATATAN: belum pernah dijalankan (butuh Prisma + PostGIS asli + database *_test).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@social-finder/database";
import { MemoryRateLimiter } from "../src/modules/auth/rate-limit";
import { snapToGrid } from "../src/modules/location/geo";
import { LocationService } from "../src/modules/location/location-service";
import { PrismaLocationRepository } from "../src/modules/location/prisma-location-repository";
import { resetAndSeed, uid } from "./db";

const CTX = { ip: "203.0.113.7", userAgent: "integration" };
const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const USER = uid(17); // seed: tanpa lokasi
const RAW = { latitude: 1.123456, longitude: 104.123456 };

function service(audits: unknown[] = []): LocationService {
  return new LocationService({
    repository: new PrismaLocationRepository(),
    limiter: new MemoryRateLimiter(),
    audit: async (event) => {
      audits.push(event);
    },
    hmacSecret: SECRET,
  });
}

async function storedPoint(): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ lat: number; lng: number }>>(
    `SELECT ST_Y("geography"::geometry)::float8 AS lat, ST_X("geography"::geometry)::float8 AS lng FROM "Location" WHERE "userId" = '${USER}'::uuid`,
  );
  const row = rows[0];
  return row ? { lat: Number(row.lat), lng: Number(row.lng) } : null;
}

beforeAll(async () => {
  await resetAndSeed();
});

describe("integrasi: lokasi", () => {
  it("menyimpan titik yang SUDAH di-snap (bukan koordinat mentah), lengkap dengan SRID 4326", async () => {
    const audits: unknown[] = [];
    const dto = await service(audits).setLocation(USER, { ...RAW, accuracyLevel: "AREA", visibility: "AREA_ONLY", areaLabel: "Sekupang" }, CTX);
    const expected = snapToGrid(RAW, "AREA");
    const stored = await storedPoint();
    expect(stored).not.toBeNull();
    expect(stored?.lat).toBeCloseTo(expected.latitude, 5);
    expect(stored?.lng).toBeCloseTo(expected.longitude, 5);
    expect(stored?.lat).not.toBeCloseTo(RAW.latitude, 5);
    const srid = await prisma.$queryRawUnsafe<Array<{ srid: number }>>(`SELECT ST_SRID("geography"::geometry)::int AS srid FROM "Location" WHERE "userId" = '${USER}'::uuid`);
    expect(Number(srid[0]?.srid)).toBe(4326);
    // tidak ada koordinat di DTO maupun audit
    expect(JSON.stringify(dto)).not.toMatch(/1\.12|104\.12|latitude|longitude/);
    expect(JSON.stringify(audits)).not.toMatch(/1\.12|104\.12|latitude|longitude/);
  });

  it("visibilitas tersimpan di PrivacySettings dan DTO mengikutinya", async () => {
    const dto = await service().getMine(USER);
    expect(dto?.visibility).toBe("AREA_ONLY");
    expect(dto?.areaLabel).toBe("Sekupang");
  });

  it("titik baru menimpa baris yang sama (satu baris per pengguna) dan mereset label", async () => {
    // Visibilitas AREA_ONLY diwarisi dari langkah sebelumnya dan butuh label baru, jadi titik baru
    // tanpa label ditolak (lihat tes berikutnya). Di sini visibilitas diturunkan ke PRIVATE secara eksplisit.
    await service().setLocation(USER, { latitude: 1.5, longitude: 104.5, accuracyLevel: "CITY", visibility: "PRIVATE" }, CTX);
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "Location" WHERE "userId" = '${USER}'::uuid`);
    expect(Number(rows[0]?.n)).toBe(1);
    const dto = await service().getMine(USER);
    expect(dto?.accuracyLevel).toBe("CITY");
    expect(dto?.areaLabel).toBeNull();
  });

  it("titik baru tanpa label ditolak bila visibilitas yang berlaku menampilkan label", async () => {
    await service().setLocation(USER, { latitude: 1.5, longitude: 104.5, accuracyLevel: "AREA", visibility: "AREA_ONLY", areaLabel: "Batam Centre" }, CTX);
    await expect(
      service().setLocation(USER, { latitude: 1.51, longitude: 104.51, accuracyLevel: "AREA" }, CTX),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const dto = await service().getMine(USER);
    expect(dto?.areaLabel).toBe("Batam Centre");
  });

  it("menghapus lokasi mengembalikan visibilitas ke PRIVATE", async () => {
    await service().removeLocation(USER, CTX);
    expect(await storedPoint()).toBeNull();
    const rows = await prisma.$queryRawUnsafe<Array<{ v: string }>>(`SELECT "locationVisibility"::text AS v FROM "PrivacySettings" WHERE "userId" = '${USER}'::uuid`);
    expect(rows[0]?.v).toBe("PRIVATE");
  });
});
