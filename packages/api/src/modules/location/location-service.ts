import {
  DEFAULT_LOCATION_VISIBILITY,
  type AccuracyLevel,
  type LocationDto,
  type LocationVisibility,
} from "@social-finder/types";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import type { AuditEvent, AuditWriter } from "../auth/types";
import { InvalidCoordinateError, snapToGrid, type GeoPoint } from "./geo";
import type {
  LocationRepository,
  LocationSettingsUpdate,
  LocationWrite,
  StoredLocation,
} from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const LOCATION_LIMITS = {
  read: { limit: 120, windowSec: 60 },
  /**
   * Titik baru dibatasi ketat. Lokasi pencari adalah lokasi tersimpannya (bukan input bebas per
   * pencarian), jadi batas ini yang menghalangi "menggeser titik sendiri" untuk menyempitkan
   * posisi orang lain (triangulasi).
   */
  setPoint: { limit: 5, windowSec: 86_400 },
  settings: { limit: 30, windowSec: 60 },
} as const satisfies Record<string, LimitRule>;

export const DEFAULT_RADIUS_KM = 5;

export interface LocationDeps {
  repository: LocationRepository;
  limiter: RateLimiter;
  audit: AuditWriter;
  hmacSecret: string;
}

export interface SetLocationCommand {
  latitude: number;
  longitude: number;
  accuracyLevel: AccuracyLevel;
  visibility?: LocationVisibility | undefined;
  discoverableRadiusKm?: number | undefined;
  areaLabel?: string | null | undefined;
  cityLabel?: string | null | undefined;
}

export interface UpdateLocationSettingsCommand {
  visibility?: LocationVisibility | undefined;
  discoverableRadiusKm?: number | undefined;
  areaLabel?: string | null | undefined;
  cityLabel?: string | null | undefined;
  isEnabled?: boolean | undefined;
}

/** Whitelist eksplisit. Tidak ada koordinat, bahkan yang sudah di-snap. */
export function toLocationDto(stored: StoredLocation): LocationDto {
  return {
    isEnabled: stored.isEnabled,
    accuracyLevel: stored.accuracyLevel,
    visibility: stored.visibility,
    discoverableRadiusKm: Math.round(stored.discoverableRadiusM / 1000),
    areaLabel: stored.areaLabel,
    cityLabel: stored.cityLabel,
    updatedAt: stored.updatedAt.toISOString(),
  };
}

/** Visibilitas yang menampilkan label harus punya labelnya; kalau tidak, hasilnya menyesatkan. */
function assertVisibilityConsistent(
  visibility: LocationVisibility,
  areaLabel: string | null,
  cityLabel: string | null,
): void {
  if (visibility === "AREA_ONLY" && !areaLabel) {
    throw new AppError("VALIDATION_ERROR", "Visibilitas AREA_ONLY membutuhkan label area");
  }
  if (visibility === "CITY_ONLY" && !cityLabel) {
    throw new AppError("VALIDATION_ERROR", "Visibilitas CITY_ONLY membutuhkan label kota");
  }
}

export class LocationService {
  private readonly deps: LocationDeps;

  constructor(deps: LocationDeps) {
    this.deps = deps;
  }

  async getMine(userId: string): Promise<LocationDto | null> {
    await this.enforce(`location:read:${userId}`, LOCATION_LIMITS.read);
    const stored = await this.deps.repository.findMine(userId);
    return stored ? toLocationDto(stored) : null;
  }

  /**
   * Simpan titik. Koordinat mentah di-snap DI SINI, sebelum menyentuh repositori, audit, atau log.
   * Tanpa `visibility` eksplisit, lokasi baru berstatus PRIVATE: menyimpan titik tidak pernah
   * membuat siapa pun bisa melihatnya.
   */
  async setLocation(
    userId: string,
    command: SetLocationCommand,
    ctx: RequestContext,
  ): Promise<LocationDto> {
    await this.enforce(`location:set:${userId}`, LOCATION_LIMITS.setPoint);

    let point: GeoPoint;
    try {
      point = snapToGrid(
        { latitude: command.latitude, longitude: command.longitude },
        command.accuracyLevel,
      );
    } catch (error) {
      if (error instanceof InvalidCoordinateError) {
        throw new AppError("VALIDATION_ERROR", "Koordinat di luar wilayah yang didukung");
      }
      throw error;
    }

    const previous = await this.deps.repository.findMine(userId);
    const visibility = command.visibility ?? previous?.visibility ?? DEFAULT_LOCATION_VISIBILITY;
    // Label terikat pada titik: titik baru berarti label lama tidak lagi berlaku.
    const areaLabel = command.areaLabel ?? null;
    const cityLabel = command.cityLabel ?? null;
    assertVisibilityConsistent(visibility, areaLabel, cityLabel);

    const radiusKm =
      command.discoverableRadiusKm ??
      (previous ? previous.discoverableRadiusM / 1000 : DEFAULT_RADIUS_KM);

    const write: LocationWrite = {
      point,
      accuracyLevel: command.accuracyLevel,
      visibility,
      discoverableRadiusM: Math.round(radiusKm * 1000),
      areaLabel,
      cityLabel,
    };
    const stored = await this.deps.repository.upsert(userId, write);

    await this.audit({
      action: "location.set",
      actorId: userId,
      entity: "Location",
      entityId: userId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
      // Hanya level dan visibilitas. Tidak ada koordinat dan tidak ada label.
      metadata: { accuracyLevel: command.accuracyLevel, visibility },
    });
    return toLocationDto(stored);
  }

  /** Ubah pengaturan tanpa mengganti titik (tidak menerima koordinat sama sekali). */
  async updateSettings(
    userId: string,
    patch: UpdateLocationSettingsCommand,
    ctx: RequestContext,
  ): Promise<LocationDto> {
    await this.enforce(`location:settings:${userId}`, LOCATION_LIMITS.settings);

    const current = await this.deps.repository.findMine(userId);
    if (!current) throw new AppError("NOT_FOUND", "Lokasi belum diatur");

    const nextEnabled = patch.isEnabled ?? current.isEnabled;
    let nextVisibility = patch.visibility ?? current.visibility;
    const nextArea = patch.areaLabel !== undefined ? patch.areaLabel : current.areaLabel;
    const nextCity = patch.cityLabel !== undefined ? patch.cityLabel : current.cityLabel;

    if (!nextEnabled) {
      if (patch.visibility !== undefined && patch.visibility !== "PRIVATE") {
        throw new AppError("VALIDATION_ERROR", "Aktifkan lokasi sebelum mengubah visibilitas");
      }
      // Lokasi nonaktif tidak boleh terlihat. Mengaktifkan kembali TIDAK memulihkan visibilitas
      // lama: pengguna harus memilihnya lagi.
      nextVisibility = "PRIVATE";
    }
    assertVisibilityConsistent(nextVisibility, nextArea, nextCity);

    const update: LocationSettingsUpdate = {};
    const changed: string[] = [];
    if (nextVisibility !== current.visibility) {
      update.visibility = nextVisibility;
      changed.push("visibility");
    }
    if (nextEnabled !== current.isEnabled) {
      update.isEnabled = nextEnabled;
      changed.push("isEnabled");
    }
    if (patch.discoverableRadiusKm !== undefined) {
      const radiusM = Math.round(patch.discoverableRadiusKm * 1000);
      if (radiusM !== current.discoverableRadiusM) {
        update.discoverableRadiusM = radiusM;
        changed.push("discoverableRadius");
      }
    }
    if (patch.areaLabel !== undefined && patch.areaLabel !== current.areaLabel) {
      update.areaLabel = patch.areaLabel;
      changed.push("areaLabel");
    }
    if (patch.cityLabel !== undefined && patch.cityLabel !== current.cityLabel) {
      update.cityLabel = patch.cityLabel;
      changed.push("cityLabel");
    }

    if (changed.length === 0) return toLocationDto(current);

    const updated = await this.deps.repository.updateSettings(userId, update);
    if (!updated) throw new AppError("NOT_FOUND", "Lokasi belum diatur");

    await this.audit({
      action: "location.update",
      actorId: userId,
      entity: "Location",
      entityId: userId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
      metadata: {
        fields: changed.join(","),
        ...(update.visibility !== undefined ? { visibility: update.visibility } : {}),
      },
    });
    return toLocationDto(updated);
  }

  /** Hapus lokasi. Idempotent: menghapus yang tidak ada tetap berhasil. */
  async removeLocation(userId: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`location:settings:${userId}`, LOCATION_LIMITS.settings);
    const removed = await this.deps.repository.remove(userId);
    if (!removed) return;
    await this.audit({
      action: "location.delete",
      actorId: userId,
      entity: "Location",
      entityId: userId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
    });
  }

  private async enforce(key: string, rule: LimitRule): Promise<void> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSec);
  }

  private async audit(event: AuditEvent): Promise<void> {
    try {
      await this.deps.audit(event);
    } catch {
      console.error(
        JSON.stringify({ level: "error", msg: "audit write failed", action: event.action }),
      );
    }
  }
}
