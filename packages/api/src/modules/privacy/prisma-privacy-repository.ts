import { prisma } from "@social-finder/database";
import type { PrivacyRecord, PrivacyRepository, PrivacyUpdate } from "./types";

const SELECT = {
  isDiscoverable: true,
  searchableByUsername: true,
  showPlatforms: true,
  locationVisibility: true,
  updatedAt: true,
} as const;

export class PrismaPrivacyRepository implements PrivacyRepository {
  async find(userId: string): Promise<PrivacyRecord | null> {
    return prisma.privacySettings.findUnique({ where: { userId }, select: SELECT });
  }

  async countDiscoverableAccounts(userId: string): Promise<number> {
    return prisma.socialAccount.count({ where: { userId, isDiscoverable: true } });
  }

  async update(userId: string, update: PrivacyUpdate): Promise<PrivacyRecord> {
    // Upsert: bila baris belum ada, kolom yang tidak disebut memakai default skema (aman).
    return prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, ...update },
      update: { ...update },
      select: SELECT,
    });
  }
}
