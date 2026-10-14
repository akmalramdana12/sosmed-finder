import { prismaAuditWriter } from "@social-finder/api/auth/node";
import { ModerationService } from "@social-finder/api/moderation";
import { PrismaModerationRepository } from "@social-finder/api/moderation/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: ModerationService | undefined;

export function getModerationService(): ModerationService {
  if (!service) {
    service = new ModerationService({
      repository: new PrismaModerationRepository(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      hmacSecret: getEnv().sessionSecret,
    });
  }
  return service;
}
