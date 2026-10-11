import { prismaAuditWriter, Argon2Hasher } from "@social-finder/api/auth/node";
import { AccountService } from "@social-finder/api/account";
import { PrismaAccountRepository } from "@social-finder/api/account/node";
import { getRateLimiter } from "./auth";
import { getEnv } from "./env";

let service: AccountService | undefined;

export function getAccountService(): AccountService {
  if (!service) {
    service = new AccountService({
      repository: new PrismaAccountRepository(),
      hasher: new Argon2Hasher(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      now: () => new Date(),
      hmacSecret: getEnv().sessionSecret,
    });
  }
  return service;
}
