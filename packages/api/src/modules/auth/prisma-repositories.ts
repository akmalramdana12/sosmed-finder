import { prisma } from "@social-finder/database";
import {
  UniqueViolationError,
  type AuditWriter,
  type AuthUser,
  type NewSession,
  type NewUser,
  type SessionLookup,
  type SessionRepository,
  type UserRepository,
} from "./types";

/** Prisma P2002 = unique constraint. Kembalikan nama kolom/constraint, atau null bila bukan P2002. */
export function uniqueTargets(error: unknown): string[] | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return null;
  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  return [];
}

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<AuthUser | null> {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, status: true, deletedAt: true },
    });
  }

  async create(user: NewUser): Promise<{ id: string }> {
    try {
      // Nested create = satu transaksi: User, Profile, dan PrivacySettings (default PRIVATE).
      return await prisma.user.create({
        data: {
          email: user.email,
          username: user.username,
          normalizedUsername: user.normalizedUsername,
          passwordHash: user.passwordHash,
          profile: { create: { displayName: user.displayName } },
          privacy: { create: {} },
        },
        select: { id: true },
      });
    } catch (error) {
      const targets = uniqueTargets(error);
      if (targets) {
        throw new UniqueViolationError(
          targets.some((target) => target.toLowerCase().includes("email")) ? "email" : "username",
        );
      }
      throw error;
    }
  }
}

export class PrismaSessionRepository implements SessionRepository {
  async create(session: NewSession): Promise<{ id: string }> {
    return prisma.session.create({
      data: {
        userId: session.userId,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
        ipHash: session.ipHash,
        userAgent: session.userAgent,
      },
      select: { id: true },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionLookup | null> {
    const row = await prisma.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { status: true, deletedAt: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      userStatus: row.user.status,
      userDeletedAt: row.user.deletedAt,
    };
  }

  async revoke(tokenHash: string, at: Date): Promise<void> {
    await prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}

export const prismaAuditWriter: AuditWriter = async (event) => {
  await prisma.auditLog.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      ipHash: event.ipHash,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    },
  });
};
