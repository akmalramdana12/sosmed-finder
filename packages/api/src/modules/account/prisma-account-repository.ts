import { prisma } from "@social-finder/database";
import type { AccountExportRecord, AccountRepository } from "./types";

interface SocialRow {
  username: string;
  profileUrl: string;
  isVerified: boolean;
  isDiscoverable: boolean;
  platform: { key: string };
}
interface BlockRow {
  createdAt: Date;
  blocked: { username: string };
}

export class PrismaAccountRepository implements AccountRepository {
  async loadExport(userId: string): Promise<AccountExportRecord | null> {
    // Select eksplisit (whitelist): kolom geography, passwordHash, dan token tidak pernah diambil.
    const user = await prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE", deletedAt: null },
      select: {
        email: true,
        username: true,
        emailVerifiedAt: true,
        createdAt: true,
        profile: { select: { displayName: true, bio: true, avatarUrl: true } },
        privacy: {
          select: {
            isDiscoverable: true,
            searchableByUsername: true,
            showPlatforms: true,
            locationVisibility: true,
          },
        },
        location: {
          select: {
            isEnabled: true,
            accuracyLevel: true,
            areaLabel: true,
            cityLabel: true,
            discoverableRadius: true,
            updatedAt: true,
          },
        },
        socialAccounts: {
          orderBy: { createdAt: "asc" },
          select: {
            username: true,
            profileUrl: true,
            isVerified: true,
            isDiscoverable: true,
            platform: { select: { key: true } },
          },
        },
        blocksMade: {
          orderBy: { createdAt: "asc" },
          select: { createdAt: true, blocked: { select: { username: true } } },
        },
        reportsMade: {
          orderBy: { createdAt: "asc" },
          select: { reason: true, status: true, details: true, createdAt: true },
        },
      },
    });
    if (!user) return null;
    return {
      email: user.email,
      username: user.username,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      profile: user.profile,
      privacy: user.privacy,
      location: user.location
        ? {
            isEnabled: user.location.isEnabled,
            accuracyLevel: user.location.accuracyLevel,
            areaLabel: user.location.areaLabel,
            cityLabel: user.location.cityLabel,
            discoverableRadiusM: user.location.discoverableRadius,
            updatedAt: user.location.updatedAt,
          }
        : null,
      socialAccounts: user.socialAccounts.map((a: SocialRow) => ({
        platformKey: a.platform.key,
        username: a.username,
        profileUrl: a.profileUrl,
        isVerified: a.isVerified,
        isDiscoverable: a.isDiscoverable,
      })),
      blocks: user.blocksMade.map((b: BlockRow) => ({ username: b.blocked.username, createdAt: b.createdAt })),
      reportsMade: user.reportsMade,
    };
  }

  async getPasswordHash(userId: string): Promise<string | null> {
    const user = await prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE", deletedAt: null },
      select: { passwordHash: true },
    });
    return user ? user.passwordHash : null;
  }

  async setPasswordAndRevokeSessions(
    userId: string,
    passwordHash: string,
    at: Date,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } }),
    ]);
  }

  async markDeleted(userId: string, at: Date): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: "PENDING_DELETION", deletedAt: at },
      }),
      prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } }),
      // Minimisasi data: lokasi, akun sosmed, dan blokir yang dibuat tidak perlu disimpan selama masa tunggu.
      prisma.location.deleteMany({ where: { userId } }),
      prisma.socialAccount.deleteMany({ where: { userId } }),
      prisma.block.deleteMany({ where: { blockerId: userId } }),
      prisma.profile.updateMany({ where: { userId }, data: { bio: null, avatarUrl: null } }),
      prisma.privacySettings.updateMany({
        where: { userId },
        data: { isDiscoverable: false, locationVisibility: "PRIVATE" },
      }),
    ]);
  }

  async purgeDeletedBefore(cutoff: Date): Promise<number> {
    // onDelete: Cascade pada relasi menghapus profil, privasi, sesi, token, blokir, dan catatan pencarian.
    const result = await prisma.user.deleteMany({
      where: { status: "PENDING_DELETION", deletedAt: { not: null, lt: cutoff } },
    });
    return result.count;
  }
}
