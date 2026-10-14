import { prismaAuditWriter } from "@social-finder/api/auth/node";
import { SearchService } from "@social-finder/api/search";
import { PrismaSearchRepository } from "@social-finder/api/search/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: SearchService | undefined;

export function getSearchService(): SearchService {
  if (!service) {
    service = new SearchService({
      repository: new PrismaSearchRepository(),
      limiter: getRateLimiter(),
      hmacSecret: getEnv().sessionSecret,
      audit: prismaAuditWriter,
      requireVerifiedEmail: getEnv().requireVerifiedEmail,
    });
  }
  return service;
}
