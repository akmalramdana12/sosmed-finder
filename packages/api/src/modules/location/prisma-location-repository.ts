import { prisma } from "@social-finder/database";
import type {
  LocationRepository,
  LocationSettingsUpdate,
  LocationWrite,
  StoredLocation,
} from "./types";

// Kolom geography SENGAJA tidak pernah dipilih: koordinat tidak dibaca kembali ke aplikasi.
const SELECT = {
  accuracyLevel: true,
  areaLabel: true,
  cityLabel: true,
  discoverableRadius: true,
  isEnabled: true,
  updatedAt: true,
  user: { select: { privacy: { select: { locationVisibility: true } } } },
} as const;

interface LocationRow {
  accuracyLevel: StoredLocation["accuracyLevel"];
  areaLabel: string | null;
  cityLabel: string | null;
  discoverableRadius: number;
  isEnabled: boolean;
  updatedAt: Date;
  user: { privacy: { locationVisibility: StoredLocation["visibility"] } | null };
}

function toStored(row: LocationRow): StoredLocation {
  return {
    accuracyLevel: row.accuracyLevel,
    // Tanpa baris privasi: gagal tertutup ke PRIVATE.
    visibility: row.user.privacy?.locationVisibility ?? "PRIVATE",
    discoverableRadiusM: row.discoverableRadius,
    areaLabel: row.areaLabel,
    cityLabel: row.cityLabel,
    isEnabled: row.isEnabled,
    updatedAt: row.updatedAt,
  };
}

/** Prisma P2025 = record yang akan di-update tidak ditemukan. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025"
  );
}

export class PrismaLocationRepository implements LocationRepository {
  async findMine(userId: string): Promise<StoredLocation | null> {
    const row = await prisma.location.findUnique({ where: { userId }, select: SELECT });
    return row ? toStored(row) : null;
  }

  async upsert(userId: string, write: LocationWrite): Promise<StoredLocation> {
    // Prisma tidak bisa membuat baris dengan kolom Unsupported yang wajib, jadi memakai SQL mentah
    // TERPARAMETER (tagged template; nilai tidak pernah disambung ke string). ST_MakePoint(x, y)
    // = (bujur, lintang). Titik di sini sudah di-snap oleh LocationService.
    // Lokasi dan visibilitas ditulis dalam satu transaksi.
    await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO "Location"
          ("userId", "geography", "accuracyLevel", "areaLabel", "cityLabel",
           "discoverableRadius", "isEnabled", "updatedAt")
        VALUES (
          ${userId}::uuid,
          ST_SetSRID(
            ST_MakePoint(${write.point.longitude}::double precision, ${write.point.latitude}::double precision),
            4326
          )::geography,
          ${write.accuracyLevel}::"AccuracyLevel",
          ${write.areaLabel}::text,
          ${write.cityLabel}::text,
          ${write.discoverableRadiusM}::integer,
          true,
          now()
        )
        ON CONFLICT ("userId") DO UPDATE SET
          "geography" = EXCLUDED."geography",
          "accuracyLevel" = EXCLUDED."accuracyLevel",
          "areaLabel" = EXCLUDED."areaLabel",
          "cityLabel" = EXCLUDED."cityLabel",
          "discoverableRadius" = EXCLUDED."discoverableRadius",
          "isEnabled" = true,
          "updatedAt" = now()`,
      prisma.privacySettings.upsert({
        where: { userId },
        create: { userId, locationVisibility: write.visibility },
        update: { locationVisibility: write.visibility },
      }),
    ]);

    const stored = await this.findMine(userId);
    if (!stored) throw new Error("lokasi tidak tersimpan");
    return stored;
  }

  async updateSettings(
    userId: string,
    update: LocationSettingsUpdate,
  ): Promise<StoredLocation | null> {
    const existing = await prisma.location.findUnique({ where: { userId }, select: { id: true } });
    if (!existing) return null;

    try {
      await prisma.$transaction([
        prisma.location.update({
          where: { userId },
          data: {
            ...(update.discoverableRadiusM !== undefined
              ? { discoverableRadius: update.discoverableRadiusM }
              : {}),
            ...(update.areaLabel !== undefined ? { areaLabel: update.areaLabel } : {}),
            ...(update.cityLabel !== undefined ? { cityLabel: update.cityLabel } : {}),
            ...(update.isEnabled !== undefined ? { isEnabled: update.isEnabled } : {}),
          },
        }),
        ...(update.visibility !== undefined
          ? [
              prisma.privacySettings.upsert({
                where: { userId },
                create: { userId, locationVisibility: update.visibility },
                update: { locationVisibility: update.visibility },
              }),
            ]
          : []),
      ]);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    return this.findMine(userId);
  }

  async remove(userId: string): Promise<boolean> {
    const [deleted] = await prisma.$transaction([
      prisma.location.deleteMany({ where: { userId } }),
      // Tanpa lokasi, tidak boleh tersisa visibilitas selain PRIVATE.
      prisma.privacySettings.updateMany({
        where: { userId },
        data: { locationVisibility: "PRIVATE" },
      }),
    ]);
    return deleted.count > 0;
  }
}
