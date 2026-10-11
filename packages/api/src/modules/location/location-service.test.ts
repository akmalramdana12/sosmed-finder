import { describe, expect, it } from "vitest";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import type { AuditEvent } from "../auth/types";
import { haversineKm, snapToGrid, type GeoPoint } from "./geo";
import { DEFAULT_RADIUS_KM, LOCATION_LIMITS, LocationService } from "./location-service";
import type {
  LocationRepository,
  LocationSettingsUpdate,
  LocationWrite,
  StoredLocation,
} from "./types";

class FakeRepository implements LocationRepository {
  readonly rows = new Map<string, { stored: StoredLocation; point: GeoPoint }>();
  /** Semua penulisan titik yang sampai ke "database". */
  readonly writes: LocationWrite[] = [];
  /** Setiap userId yang pernah diminta: bukti tidak ada akses lintas pengguna. */
  readonly touched: string[] = [];
  settingsUpdates = 0;

  async findMine(userId: string): Promise<StoredLocation | null> {
    this.touched.push(userId);
    return this.rows.get(userId)?.stored ?? null;
  }

  async upsert(userId: string, write: LocationWrite): Promise<StoredLocation> {
    this.touched.push(userId);
    this.writes.push(write);
    const stored: StoredLocation = {
      accuracyLevel: write.accuracyLevel,
      visibility: write.visibility,
      discoverableRadiusM: write.discoverableRadiusM,
      areaLabel: write.areaLabel,
      cityLabel: write.cityLabel,
      isEnabled: true,
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    };
    this.rows.set(userId, { stored, point: write.point });
    return stored;
  }

  async updateSettings(
    userId: string,
    update: LocationSettingsUpdate,
  ): Promise<StoredLocation | null> {
    this.touched.push(userId);
    const row = this.rows.get(userId);
    if (!row) return null;
    this.settingsUpdates += 1;
    const stored: StoredLocation = { ...row.stored, ...update };
    this.rows.set(userId, { stored, point: row.point });
    return stored;
  }

  async remove(userId: string): Promise<boolean> {
    this.touched.push(userId);
    return this.rows.delete(userId);
  }
}

const CTX = { ip: "203.0.113.7", userAgent: "vitest" };
const RAW = { latitude: 1.123456, longitude: 104.123456 };
const PUT_AREA = { ...RAW, accuracyLevel: "AREA" } as const;

function setup() {
  const repository = new FakeRepository();
  const events: AuditEvent[] = [];
  const service = new LocationService({
    repository,
    limiter: new MemoryRateLimiter(() => 0),
    audit: async (event) => {
      events.push(event);
    },
    hmacSecret: "test-secret-test-secret-test-secret-123",
  });
  return { service, repository, events };
}

describe("setLocation: koordinat", () => {
  it("titik di-snap SEBELUM sampai ke repositori; koordinat mentah tidak pernah tersimpan", async () => {
    const { service, repository } = setup();
    await service.setLocation("user-a", PUT_AREA, CTX);

    const written = repository.writes[0]?.point;
    expect(written).toEqual(snapToGrid(RAW, "AREA"));
    expect(written).not.toEqual(RAW);
    expect(haversineKm(RAW, written ?? RAW)).toBeLessThanOrEqual(1.6);
    expect(repository.writes).toHaveLength(1);
  });

  it("DTO, audit, dan serialisasi apa pun tidak memuat koordinat (mentah maupun hasil snap)", async () => {
    const { service, repository, events } = setup();
    const dto = await service.setLocation(
      "user-a",
      { ...PUT_AREA, visibility: "DISCOVERABLE_RADIUS", areaLabel: "Sekupang" },
      CTX,
    );
    const snapped = repository.writes[0]?.point;
    const everything = JSON.stringify([dto, events, await service.getMine("user-a")]);

    for (const secret of [
      "1.123456",
      "104.123456",
      String(snapped?.latitude),
      String(snapped?.longitude),
    ]) {
      expect(everything).not.toContain(secret);
    }
    for (const key of ["latitude", "longitude", "geography", "point", 'lat"', 'lng"']) {
      expect(everything).not.toContain(key);
    }
    expect(Object.keys(dto).sort()).toEqual(
      [
        "accuracyLevel",
        "areaLabel",
        "cityLabel",
        "discoverableRadiusKm",
        "isEnabled",
        "updatedAt",
        "visibility",
      ].sort(),
    );
  });

  it("level CITY memakai grid yang lebih kasar", async () => {
    const { service, repository } = setup();
    await service.setLocation("user-a", { ...RAW, accuracyLevel: "CITY" }, CTX);
    expect(repository.writes[0]?.point).toEqual(snapToGrid(RAW, "CITY"));
    expect(repository.writes[0]?.accuracyLevel).toBe("CITY");
  });

  it("lintang di luar wilayah yang didukung: VALIDATION_ERROR tanpa nilai koordinat", async () => {
    const { service, repository } = setup();
    const error = await service
      .setLocation("user-a", { latitude: 89.987654, longitude: 10, accuracyLevel: "AREA" }, CTX)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error as object))).not.toContain(
      "89.987654",
    );
    expect(repository.writes).toHaveLength(0);
  });
});

describe("setLocation: visibilitas (opt-in)", () => {
  it("tanpa visibility eksplisit, lokasi baru PRIVATE", async () => {
    const { service } = setup();
    const dto = await service.setLocation("user-a", PUT_AREA, CTX);
    expect(dto.visibility).toBe("PRIVATE");
    expect(dto.isEnabled).toBe(true);
    expect(dto.discoverableRadiusKm).toBe(DEFAULT_RADIUS_KM);
  });

  it("visibility eksplisit dihormati", async () => {
    const { service } = setup();
    const dto = await service.setLocation(
      "user-a",
      { ...PUT_AREA, visibility: "DISCOVERABLE_RADIUS", discoverableRadiusKm: 12 },
      CTX,
    );
    expect(dto.visibility).toBe("DISCOVERABLE_RADIUS");
    expect(dto.discoverableRadiusKm).toBe(12);
  });

  it("titik baru tanpa visibility mempertahankan pilihan sebelumnya, label direset", async () => {
    const { service } = setup();
    await service.setLocation(
      "user-a",
      {
        ...PUT_AREA,
        visibility: "DISCOVERABLE_RADIUS",
        discoverableRadiusKm: 8,
        areaLabel: "Sekupang",
        cityLabel: "Batam",
      },
      CTX,
    );
    const moved = await service.setLocation(
      "user-a",
      { latitude: 1.3, longitude: 104.3, accuracyLevel: "AREA" },
      CTX,
    );
    expect(moved.visibility).toBe("DISCOVERABLE_RADIUS");
    expect(moved.discoverableRadiusKm).toBe(8);
    // label lama tidak berlaku untuk titik baru
    expect(moved.areaLabel).toBeNull();
    expect(moved.cityLabel).toBeNull();
  });

  it("AREA_ONLY membutuhkan label area; CITY_ONLY membutuhkan label kota", async () => {
    const { service, repository } = setup();
    await expect(
      service.setLocation("user-a", { ...PUT_AREA, visibility: "AREA_ONLY" }, CTX),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.setLocation(
        "user-a",
        { ...PUT_AREA, visibility: "CITY_ONLY", areaLabel: "Sekupang" },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.writes).toHaveLength(0);

    await expect(
      service.setLocation(
        "user-a",
        { ...PUT_AREA, visibility: "AREA_ONLY", areaLabel: "Sekupang" },
        CTX,
      ),
    ).resolves.toBeTruthy();
  });

  it("audit hanya memuat level dan visibilitas, tanpa label dan tanpa IP mentah", async () => {
    const { service, events } = setup();
    await service.setLocation(
      "user-a",
      { ...PUT_AREA, visibility: "AREA_ONLY", areaLabel: "Sekupang", cityLabel: "Batam" },
      CTX,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("location.set");
    expect(events[0]?.metadata).toEqual({ accuracyLevel: "AREA", visibility: "AREA_ONLY" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("Sekupang");
    expect(serialized).not.toContain("Batam");
    expect(serialized).not.toContain(CTX.ip);
  });
});

describe("setLocation: rate limit (anti-triangulasi)", () => {
  it("titik baru dibatasi 5 kali per hari per pengguna", async () => {
    const { service, repository } = setup();
    for (let i = 0; i < LOCATION_LIMITS.setPoint.limit; i += 1) {
      await service.setLocation("user-a", PUT_AREA, CTX);
    }
    await expect(service.setLocation("user-a", PUT_AREA, CTX)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    expect(repository.writes).toHaveLength(LOCATION_LIMITS.setPoint.limit);
    // pengguna lain tidak terkena batas A
    await expect(service.setLocation("user-b", PUT_AREA, CTX)).resolves.toBeTruthy();
  });

  it("percobaan yang ditolak validasi tetap menghabiskan kuota", async () => {
    const { service } = setup();
    for (let i = 0; i < LOCATION_LIMITS.setPoint.limit; i += 1) {
      await service
        .setLocation("user-a", { latitude: 89, longitude: 0, accuracyLevel: "AREA" }, CTX)
        .catch(() => undefined);
    }
    await expect(service.setLocation("user-a", PUT_AREA, CTX)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});

describe("getMine", () => {
  it("null bila belum ada lokasi", async () => {
    const { service } = setup();
    expect(await service.getMine("user-a")).toBeNull();
  });

  it("dibatasi per pengguna", async () => {
    const { service } = setup();
    for (let i = 0; i < LOCATION_LIMITS.read.limit; i += 1) await service.getMine("user-a");
    await expect(service.getMine("user-a")).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("updateSettings", () => {
  it("NOT_FOUND bila lokasi belum diatur", async () => {
    const { service } = setup();
    await expect(
      service.updateSettings("user-a", { visibility: "PRIVATE" }, CTX),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("mengubah visibilitas dan radius tanpa menyentuh titik", async () => {
    const { service, repository } = setup();
    await service.setLocation("user-a", PUT_AREA, CTX);
    const pointBefore = repository.rows.get("user-a")?.point;

    const dto = await service.updateSettings(
      "user-a",
      { visibility: "DISCOVERABLE_RADIUS", discoverableRadiusKm: 20 },
      CTX,
    );
    expect(dto.visibility).toBe("DISCOVERABLE_RADIUS");
    expect(dto.discoverableRadiusKm).toBe(20);
    expect(repository.rows.get("user-a")?.point).toEqual(pointBefore);
    expect(repository.writes).toHaveLength(1);
  });

  it("tanpa perubahan nyata: tidak menulis dan tidak mengaudit", async () => {
    const { service, repository, events } = setup();
    await service.setLocation("user-a", PUT_AREA, CTX);
    const auditCount = events.length;
    await service.updateSettings("user-a", { visibility: "PRIVATE", isEnabled: true }, CTX);
    expect(repository.settingsUpdates).toBe(0);
    expect(events).toHaveLength(auditCount);
  });

  it("menonaktifkan lokasi memaksa PRIVATE", async () => {
    const { service } = setup();
    await service.setLocation(
      "user-a",
      { ...PUT_AREA, visibility: "DISCOVERABLE_RADIUS", areaLabel: "Sekupang" },
      CTX,
    );
    const dto = await service.updateSettings("user-a", { isEnabled: false }, CTX);
    expect(dto.isEnabled).toBe(false);
    expect(dto.visibility).toBe("PRIVATE");
  });

  it("mengaktifkan kembali TIDAK memulihkan visibilitas lama", async () => {
    const { service } = setup();
    await service.setLocation("user-a", { ...PUT_AREA, visibility: "DISCOVERABLE_RADIUS" }, CTX);
    await service.updateSettings("user-a", { isEnabled: false }, CTX);
    const dto = await service.updateSettings("user-a", { isEnabled: true }, CTX);
    expect(dto.isEnabled).toBe(true);
    expect(dto.visibility).toBe("PRIVATE");
  });

  it("tidak bisa membuka visibilitas saat lokasi nonaktif, kecuali diaktifkan dalam patch yang sama", async () => {
    const { service } = setup();
    await service.setLocation("user-a", PUT_AREA, CTX);
    await service.updateSettings("user-a", { isEnabled: false }, CTX);

    await expect(
      service.updateSettings("user-a", { visibility: "DISCOVERABLE_RADIUS" }, CTX),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const dto = await service.updateSettings(
      "user-a",
      { isEnabled: true, visibility: "DISCOVERABLE_RADIUS" },
      CTX,
    );
    expect(dto.visibility).toBe("DISCOVERABLE_RADIUS");
  });

  it("menghapus label yang dibutuhkan visibilitas aktif ditolak", async () => {
    const { service } = setup();
    await service.setLocation(
      "user-a",
      { ...PUT_AREA, visibility: "AREA_ONLY", areaLabel: "Sekupang" },
      CTX,
    );
    await expect(service.updateSettings("user-a", { areaLabel: null }, CTX)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    // boleh bila visibilitas diturunkan dalam patch yang sama
    const dto = await service.updateSettings(
      "user-a",
      { areaLabel: null, visibility: "PRIVATE" },
      CTX,
    );
    expect(dto.areaLabel).toBeNull();
    expect(dto.visibility).toBe("PRIVATE");
  });

  it("audit mencatat nama field dan visibilitas baru, tanpa label", async () => {
    const { service, events } = setup();
    await service.setLocation("user-a", PUT_AREA, CTX);
    await service.updateSettings("user-a", { visibility: "CITY_ONLY", cityLabel: "Batam" }, CTX);
    const last = events.at(-1);
    expect(last?.action).toBe("location.update");
    expect(last?.metadata).toEqual({ fields: "visibility,cityLabel", visibility: "CITY_ONLY" });
    expect(JSON.stringify(events)).not.toContain("Batam");
  });

  it("dibatasi 30 per menit", async () => {
    const { service } = setup();
    await service.setLocation("user-a", PUT_AREA, CTX);
    for (let i = 0; i < LOCATION_LIMITS.settings.limit; i += 1) {
      await service.updateSettings("user-a", { discoverableRadiusKm: 1 + (i % 2) }, CTX);
    }
    await expect(
      service.updateSettings("user-a", { visibility: "PRIVATE" }, CTX),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("removeLocation", () => {
  it("menghapus lokasi; getMine kembali null", async () => {
    const { service } = setup();
    await service.setLocation("user-a", { ...PUT_AREA, visibility: "DISCOVERABLE_RADIUS" }, CTX);
    await service.removeLocation("user-a", CTX);
    expect(await service.getMine("user-a")).toBeNull();
  });

  it("idempotent: menghapus yang tidak ada berhasil dan tidak mengaudit", async () => {
    const { service, events } = setup();
    await expect(service.removeLocation("user-a", CTX)).resolves.toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it("mengaudit penghapusan yang nyata", async () => {
    const { service, events } = setup();
    await service.setLocation("user-a", PUT_AREA, CTX);
    await service.removeLocation("user-a", CTX);
    expect(events.at(-1)?.action).toBe("location.delete");
  });
});

describe("IDOR", () => {
  it("semua operasi pengguna A hanya menyentuh A", async () => {
    const { service, repository } = setup();
    await service.setLocation("user-b", { ...PUT_AREA, visibility: "DISCOVERABLE_RADIUS" }, CTX);
    const bBefore = repository.rows.get("user-b");
    repository.touched.length = 0;

    await service.setLocation("user-a", PUT_AREA, CTX);
    await service.getMine("user-a");
    await service.updateSettings("user-a", { visibility: "CITY_ONLY", cityLabel: "Batam" }, CTX);
    await service.removeLocation("user-a", CTX);

    expect(repository.touched.every((id) => id === "user-a")).toBe(true);
    expect(repository.rows.get("user-b")).toEqual(bBefore);
  });
});
