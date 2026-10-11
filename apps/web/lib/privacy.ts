import { prismaAuditWriter } from "@social-finder/api/auth/node";
import { PrivacyService } from "@social-finder/api/privacy";
import { PrismaPrivacyRepository } from "@social-finder/api/privacy/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: PrivacyService | undefined;

export function getPrivacyService(): PrivacyService {
  if (!service) {
    service = new PrivacyService({
      repository: new PrismaPrivacyRepository(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      hmacSecret: getEnv().sessionSecret,
    });
  }
  return service;
}
