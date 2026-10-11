export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimiter {
  /** Hitung satu permintaan untuk `key`. Fixed window `windowSec` detik. */
  consume(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Limiter in-memory: hanya untuk development dan test (tidak dibagi antar instance). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async consume(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const t = this.now();
    this.sweep(t);
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowSec * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    const allowed = bucket.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)),
    };
  }

  /** Buang bucket kedaluwarsa agar memori tidak tumbuh tanpa batas. */
  private sweep(t: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= t) this.buckets.delete(key);
    }
  }
}
