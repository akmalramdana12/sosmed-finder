import { prisma } from "@social-finder/database";
import type { BlockedUserRecord, NewReport, SafetyRepository } from "./types";

export class PrismaSafetyRepository implements SafetyRepository {
  async findActiveUserId(normalizedUsername: string): Promise<string | null> {
    const user = await prisma.user.findFirst({
      where: { normalizedUsername, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    return user ? user.id : null;
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const row = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
    return row !== null;
  }

  async countBlocks(blockerId: string): Promise<number> {
    return prisma.block.count({ where: { blockerId } });
  }

  async addBlock(blockerId: string, blockedId: string): Promise<boolean> {
    // skipDuplicates memakai ON CONFLICT DO NOTHING: aman bila dua permintaan serentak.
    const result = await prisma.block.createMany({
      data: [{ blockerId, blockedId }],
      skipDuplicates: true,
    });
    return result.count > 0;
  }

  async removeBlockByUsername(blockerId: string, normalizedUsername: string): Promise<boolean> {
    // blockerId dari sesi dipaksa di WHERE: tidak bisa menghapus blokir milik orang lain.
    const result = await prisma.block.deleteMany({
      where: { blockerId, blocked: { normalizedUsername } },
    });
    return result.count > 0;
  }

  async listBlocks(blockerId: string, limit: number): Promise<BlockedUserRecord[]> {
    const rows = await prisma.block.findMany({
      where: { blockerId, blocked: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { createdAt: true, blocked: { select: { username: true } } },
    });
    return rows.map((row: { createdAt: Date; blocked: { username: string } }) => ({ username: row.blocked.username, createdAt: row.createdAt }));
  }

  async hasOpenReport(reporterId: string, targetUserId: string): Promise<boolean> {
    const row = await prisma.report.findFirst({
      where: { reporterId, targetUserId, status: { in: ["OPEN", "REVIEWING"] } },
      select: { id: true },
    });
    return row !== null;
  }

  async createReport(report: NewReport): Promise<void> {
    await prisma.report.create({
      data: {
        reporterId: report.reporterId,
        targetUserId: report.targetUserId,
        reason: report.reason,
        details: report.details,
      },
    });
  }
}
