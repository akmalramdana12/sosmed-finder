import { AuthService, MemoryRateLimiter, RedisRateLimiter } from "@social-finder/api/auth";
import type { RateLimiter } from "@social-finder/api/auth";
import {
  Argon2Hasher,
  PrismaSessionRepository,
  PrismaUserRepository,
  prismaAuditWriter,
} from "@social-finder/api/auth/node";
import Redis from "ioredis";
import { getEnv } from "./env";

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

let limiter: RateLimiter | undefined;

/** Satu limiter bersama untuk semua layanan (auth, profil, ...). */
export function getRateLimiter(): RateLimiter {
  if (!limiter) {
    const { redisUrl } = getEnv();
    if (!redisUrl) {
      limiter = new MemoryRateLimiter(); // hanya development (env mewajibkan Redis di production)
    } else {
      // enableOfflineQueue=false: bila Redis mati, perintah gagal cepat -> endpoint gagal tertutup.
      const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
      redis.on("error", () => {
        // Error koneksi ditangani per-permintaan (consume melempar). Tidak dilog agar URL tidak bocor.
      });
      limiter = new RedisRateLimiter(redis);
    }
  }
  return limiter;
}

let service: AuthService | undefined;

export function getAuthService(): AuthService {
  if (!service) {
    const env = getEnv();
    service = new AuthService({
      users: new PrismaUserRepository(),
      sessions: new PrismaSessionRepository(),
      hasher: new Argon2Hasher(),
      limiter: getRateLimiter(),
      audit: prismaAuditWriter,
      now: () => new Date(),
      config: { sessionTtlMs: SESSION_TTL_MS, hmacSecret: env.sessionSecret },
    });
  }
  return service;
}
