import { prismaAuditWriter, Argon2Hasher } from "@social-finder/api/auth/node";
import { RecoveryService } from "@social-finder/api/recovery";
import { PrismaRecoveryRepository } from "@social-finder/api/recovery/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";
import { getMailer } from "./mailer";

let service: RecoveryService | undefined;

export function getRecoveryService(): RecoveryService {
  if (!service) {
    const env = getEnv();
    service = new RecoveryService({
      repository: new PrismaRecoveryRepository(),
      hasher: new Argon2Hasher(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      mailer: getMailer(),
      now: () => new Date(),
      hmacSecret: env.sessionSecret,
      appOrigin: env.publicOrigin,
    });
  }
  return service;
}
