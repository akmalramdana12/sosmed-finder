import { prismaAuditWriter } from "@social-finder/api/auth/node";
import { ProfileService } from "@social-finder/api/profile";
import { PrismaProfileRepository } from "@social-finder/api/profile/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: ProfileService | undefined;

export function getProfileService(): ProfileService {
  if (!service) {
    service = new ProfileService({
      repository: new PrismaProfileRepository(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      hmacSecret: getEnv().sessionSecret,
    });
  }
  return service;
}
