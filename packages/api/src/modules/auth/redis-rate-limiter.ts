import type { RateLimiter, RateLimitResult } from "./rate-limit";

/** Subset klien Redis yang dibutuhkan (kompatibel dengan ioredis). */
export interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

/**
 * Fixed-window di Redis. Bila Redis gagal, `consume` melempar error sehingga
 * endpoint auth GAGAL TERTUTUP (500), bukan lolos tanpa pembatasan.
 */
export class RedisRateLimiter implements RateLimiter {
  private readonly redis: RedisLike;
  private readonly prefix: string;

  constructor(redis: RedisLike, prefix = "rl:") {
    this.redis = redis;
    this.prefix = prefix;
  }

  async consume(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const redisKey = this.prefix + key;
    const count = await this.redis.incr(redisKey);
    let ttl = await this.redis.ttl(redisKey);
    // Bila key baru, atau TTL hilang (mis. proses mati di antara incr dan expire), pasang TTL.
    if (count === 1 || ttl < 0) {
      await this.redis.expire(redisKey, windowSec);
      ttl = windowSec;
    }
    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSec: allowed ? 0 : Math.max(1, ttl),
    };
  }
}
