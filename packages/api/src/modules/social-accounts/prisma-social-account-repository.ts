import { prisma } from "@social-finder/database";
import { uniqueTargets } from "../auth/prisma-repositories";
import { UniqueViolationError } from "../auth/types";
import type {
  NewSocialAccount,
  OwnedSocialAccount,
  PlatformRecord,
  SocialAccountRecord,
  SocialAccountRepository,
  SocialAccountUpdate,
} from "./types";

const ACCOUNT_SELECT = {
  id: true,
  username: true,
  profileUrl: true,
  isVerified: true,
  isDiscoverable: true,
  createdAt: true,
  platform: { select: { key: true, name: true } },
} as const;

interface AccountRow {
  id: string;
  username: string;
  profileUrl: string;
  isVerified: boolean;
  isDiscoverable: boolean;
  createdAt: Date;
  platform: { key: string; name: string };
}

function toRecord(row: AccountRow): SocialAccountRecord {
  return {
    id: row.id,
    platformKey: row.platform.key,
    platformName: row.platform.name,
    username: row.username,
    profileUrl: row.profileUrl,
    isVerified: row.isVerified,
    isDiscoverable: row.isDiscoverable,
    createdAt: row.createdAt,
  };
}

/** Prisma P2025 = record yang akan di-update tidak ditemukan (termasuk bukan milik userId). */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025"
  );
}

export class PrismaSocialAccountRepository implements SocialAccountRepository {
  async listByUser(userId: string): Promise<SocialAccountRecord[]> {
    const rows = await prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: ACCOUNT_SELECT,
    });
    return rows.map(toRecord);
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.socialAccount.count({ where: { userId } });
  }

  async listPlatforms(): Promise<PlatformRecord[]> {
    return prisma.socialPlatform.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, urlTemplate: true },
    });
  }

  async findPlatformByKey(key: string): Promise<PlatformRecord | null> {
    return prisma.socialPlatform.findFirst({
      where: { key, isActive: true },
      select: { id: true, key: true, name: true, urlTemplate: true },
    });
  }

  async findOwned(userId: string, id: string): Promise<OwnedSocialAccount | null> {
    // Kepemilikan di WHERE: akun milik orang lain tidak pernah terbaca.
    const row = await prisma.socialAccount.findFirst({
      where: { id, userId },
      select: {
        ...ACCOUNT_SELECT,
        platform: { select: { key: true, name: true, urlTemplate: true } },
      },
    });
    if (!row) return null;
    return { ...toRecord(row), urlTemplate: row.platform.urlTemplate };
  }

  async create(userId: string, input: NewSocialAccount): Promise<SocialAccountRecord> {
    try {
      const row = await prisma.socialAccount.create({
        data: {
          userId,
          platformId: input.platformId,
          username: input.username,
          normalizedUsername: input.normalizedUsername,
          profileUrl: input.profileUrl,
          // isVerified dan isDiscoverable memakai default skema: false.
        },
        select: ACCOUNT_SELECT,
      });
      return toRecord(row);
    } catch (error) {
      if (uniqueTargets(error) !== null) throw new UniqueViolationError("username");
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    update: SocialAccountUpdate,
  ): Promise<SocialAccountRecord | null> {
    try {
      const row = await prisma.socialAccount.update({
        // where majemuk (id + userId): update atomik hanya bila akun milik userId.
        where: { id, userId },
        data: {
          ...(update.username !== undefined ? { username: update.username } : {}),
          ...(update.normalizedUsername !== undefined
            ? { normalizedUsername: update.normalizedUsername }
            : {}),
          ...(update.profileUrl !== undefined ? { profileUrl: update.profileUrl } : {}),
          ...(update.isVerified !== undefined ? { isVerified: update.isVerified } : {}),
          ...(update.isDiscoverable !== undefined ? { isDiscoverable: update.isDiscoverable } : {}),
        },
        select: ACCOUNT_SELECT,
      });
      return toRecord(row);
    } catch (error) {
      if (isNotFound(error)) return null;
      if (uniqueTargets(error) !== null) throw new UniqueViolationError("username");
      throw error;
    }
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await prisma.socialAccount.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
