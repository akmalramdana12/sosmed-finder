import { prismaAuditWriter } from "@social-finder/api/auth/node";
import { SocialAccountService } from "@social-finder/api/social-accounts";
import { PrismaSocialAccountRepository } from "@social-finder/api/social-accounts/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: SocialAccountService | undefined;

export function getSocialAccountService(): SocialAccountService {
  if (!service) {
    service = new SocialAccountService({
      repository: new PrismaSocialAccountRepository(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      hmacSecret: getEnv().sessionSecret,
    });
  }
  return service;
}
