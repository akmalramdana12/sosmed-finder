import { prisma } from "@social-finder/database";
import { uniqueTargets } from "../auth/prisma-repositories";
import { UniqueViolationError } from "../auth/types";
import type { MeRecord, MeUpdate, ProfileRepository } from "./types";

const ME_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  username: true,
  createdAt: true,
  profile: { select: { displayName: true, bio: true } },
} as const;

interface MeRow {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  username: string;
  createdAt: Date;
  profile: { displayName: string; bio: string | null } | null;
}

function toRecord(row: MeRow): MeRecord | null {
  // Profile selalu dibuat saat registrasi; tanpa profile data dianggap tidak konsisten.
  if (!row.profile) return null;
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    username: row.username,
    createdAt: row.createdAt,
    displayName: row.profile.displayName,
    bio: row.profile.bio,
  };
}

/** Prisma P2025 = record yang akan di-update tidak ada. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025"
  );
}

export class PrismaProfileRepository implements ProfileRepository {
  async findMe(userId: string): Promise<MeRecord | null> {
    // Hanya user aktif dan belum dihapus.
    const row = await prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE", deletedAt: null },
      select: ME_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async update(userId: string, update: MeUpdate): Promise<MeRecord | null> {
    const profileData = {
      ...(update.displayName !== undefined ? { displayName: update.displayName } : {}),
      ...(update.bio !== undefined ? { bio: update.bio } : {}),
    };
    try {
      // Satu nested write = satu transaksi atomik (User + Profile).
      const row = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(update.username !== undefined && update.normalizedUsername !== undefined
            ? { username: update.username, normalizedUsername: update.normalizedUsername }
            : {}),
          ...(Object.keys(profileData).length > 0 ? { profile: { update: profileData } } : {}),
        },
        select: ME_SELECT,
      });
      return toRecord(row);
    } catch (error) {
      if (isNotFound(error)) return null;
      if (uniqueTargets(error) !== null) throw new UniqueViolationError("username");
      throw error;
    }
  }
}
