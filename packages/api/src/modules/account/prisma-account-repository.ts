import { prisma } from "@social-finder/database";
import type { AccountRepository } from "./types";

export class PrismaAccountRepository implements AccountRepository {
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
