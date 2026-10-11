import { prismaAuditWriter } from "@social-finder/api/auth/node";
import { SafetyService } from "@social-finder/api/safety";
import { PrismaSafetyRepository } from "@social-finder/api/safety/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: SafetyService | undefined;

export function getSafetyService(): SafetyService {
  if (!service) {
    service = new SafetyService({
      repository: new PrismaSafetyRepository(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      hmacSecret: getEnv().sessionSecret,
    });
  }
  return service;
}
