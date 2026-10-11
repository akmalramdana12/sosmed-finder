import { prisma } from "@social-finder/database";
import type { Prisma } from "@social-finder/database";
import type {
  NewRecoveryToken,
  RecoveryRepository,
  RecoveryTokenType,
  RecoveryUser,
} from "./types";

/** Dilempar di dalam transaksi untuk membatalkan (rollback) seluruh perubahan. */
class Rollback extends Error {}

const ACTIVE = { status: "ACTIVE", deletedAt: null } as const;
const USER_SELECT = { id: true, email: true, emailVerifiedAt: true } as const;

export class PrismaRecoveryRepository implements RecoveryRepository {
  async findActiveByEmail(email: string): Promise<RecoveryUser | null> {
    return prisma.user.findFirst({ where: { email, ...ACTIVE }, select: USER_SELECT });
  }

  async findActiveById(userId: string): Promise<RecoveryUser | null> {
    return prisma.user.findFirst({ where: { id: userId, ...ACTIVE }, select: USER_SELECT });
  }

  async replaceToken(token: NewRecoveryToken): Promise<void> {
    await prisma.$transaction([
      prisma.verificationToken.updateMany({
        where: { userId: token.userId, type: token.type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.verificationToken.create({
        data: {
          userId: token.userId,
          type: token.type,
          tokenHash: token.tokenHash,
          expiresAt: token.expiresAt,
        },
      }),
    ]);
  }

  async isTokenUsable(type: RecoveryTokenType, tokenHash: string, now: Date): Promise<boolean> {
    const count = await prisma.verificationToken.count({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
    });
    return count === 1;
  }

  async resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<string | null> {
    return this.consume("PASSWORD_RESET", tokenHash, now, async (tx, userId) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, ...ACTIVE },
        data: { passwordHash },
      });
      if (updated.count !== 1) throw new Rollback();
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.verificationToken.updateMany({
        where: { userId, type: "PASSWORD_RESET", usedAt: null },
        data: { usedAt: now },
      });
    });
  }

  async verifyEmailWithToken(tokenHash: string, now: Date): Promise<string | null> {
    return this.consume("EMAIL_VERIFICATION", tokenHash, now, async (tx, userId) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, ...ACTIVE },
        data: { emailVerifiedAt: now },
      });
      if (updated.count !== 1) throw new Rollback();
    });
  }

  /**
   * Klaim token secara atomik (UPDATE ... WHERE usedAt IS NULL AND expiresAt > now): dua permintaan
   * bersamaan tidak mungkin sama-sama berhasil. `apply` berjalan di transaksi yang sama.
   */
  private async consume(
    type: RecoveryTokenType,
    tokenHash: string,
    now: Date,
    apply: (tx: Prisma.TransactionClient, userId: string) => Promise<void>,
  ): Promise<string | null> {
    try {
      return await prisma.$transaction(async (tx) => {
        const token = await tx.verificationToken.findUnique({
          where: { tokenHash },
          select: { userId: true, type: true },
        });
        if (!token || token.type !== type) throw new Rollback();
        const claimed = await tx.verificationToken.updateMany({
          where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new Rollback();
        await apply(tx, token.userId);
        return token.userId;
      });
    } catch (error) {
      if (error instanceof Rollback) return null;
      throw error;
    }
  }
}
