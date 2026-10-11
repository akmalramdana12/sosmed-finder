import { prisma } from "@social-finder/database";
import type { MaintenanceRepository } from "./types";

export class PrismaMaintenanceRepository implements MaintenanceRepository {
  async deleteSessionsEndedBefore(cutoff: Date): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { not: null, lt: cutoff } }] },
    });
    return result.count;
  }

  async deleteTokensExpiredBefore(cutoff: Date): Promise<number> {
    const result = await prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    return result.count;
  }

  async deleteSearchLogsBefore(cutoff: Date): Promise<number> {
    const result = await prisma.searchLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }

  async deleteAuditLogsBefore(cutoff: Date): Promise<number> {
    const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }
}
