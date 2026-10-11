import { PrismaClient } from "@prisma/client";
import { PLATFORM_SEEDS } from "../src/platforms";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const platform of PLATFORM_SEEDS) {
    await prisma.socialPlatform.upsert({
      where: { key: platform.key },
      update: { name: platform.name, urlTemplate: platform.urlTemplate },
      create: { key: platform.key, name: platform.name, urlTemplate: platform.urlTemplate },
    });
  }
  console.log(`Seed selesai: ${PLATFORM_SEEDS.length} platform`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
