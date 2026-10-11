import { describe, expect, it } from "vitest";
import { readSessionToken, serializeClearedSessionCookie, serializeSessionCookie } from "./cookies";
import { MemoryRateLimiter } from "./rate-limit";
import { RedisRateLimiter, type RedisLike } from "./redis-rate-limiter";
import { getClientIp, isSameOrigin } from "./request";
import { generateSessionToken, hashIdentifier, hashToken } from "./tokens";

function headers(values: Record<string, string>) {
  return { get: (name: string): string | null => values[name.toLowerCase()] ?? null };
}

describe("tokens", () => {
  it("token 43 karakter base64url dan unik", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashToken deterministik dan bukan token itu sendiri", () => {
    const token = generateSessionToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashIdentifier bergantung pada secret", () => {
    expect(hashIdentifier("1.2.3.4", "secret-a")).not.toBe(hashIdentifier("1.2.3.4", "secret-b"));
    expect(hashIdentifier("1.2.3.4", "secret-a")).toBe(hashIdentifier("1.2.3.4", "secret-a"));
  });
});

describe("cookies", () => {
  const token = "a".repeat(43);
  const expires = new Date("2026-02-01T00:00:00.000Z");

  it("production: __Host-, Secure, HttpOnly, SameSite=Lax, tanpa Domain", () => {
    const cookie = serializeSessionCookie(token, expires, true);
    expect(cookie.startsWith(`__Host-sf_session=${token}`)).toBe(true);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Domain");
  });

  it("development: tanpa Secure dan tanpa prefix __Host-", () => {
    const cookie = serializeSessionCookie(token, expires, false);
    expect(cookie.startsWith("sf_session=")).toBe(true);
    expect(cookie).not.toContain("Secure");
  });

  it("cookie penghapus kedaluwarsa", () => {
    const cookie = serializeClearedSessionCookie(true);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie.startsWith("__Host-sf_session=;")).toBe(true);
  });

  it("membaca token di antara cookie lain", () => {
    expect(readSessionToken(`a=1; sf_session=${token}; b=2`, false)).toBe(token);
  });

  it("menolak token tidak ada, salah nama, atau bentuk salah", () => {
    expect(readSessionToken(null, false)).toBeNull();
    expect(readSessionToken(`sf_session=${token}`, true)).toBeNull();
    expect(readSessionToken("sf_session=pendek", false)).toBeNull();
    expect(readSessionToken("sf_session=" + "!".repeat(43), false)).toBeNull();
  });
});

describe("isSameOrigin", () => {
  const allowed = ["https://app.example.com"];

  it("menerima Origin yang diizinkan, menolak yang lain", () => {
    expect(isSameOrigin(headers({ origin: "https://app.example.com" }), allowed)).toBe(true);
    expect(isSameOrigin(headers({ origin: "https://evil.example" }), allowed)).toBe(false);
  });

  it("jatuh ke Referer bila tidak ada Origin", () => {
    expect(isSameOrigin(headers({ referer: "https://app.example.com/login" }), allowed)).toBe(true);
    expect(isSameOrigin(headers({ referer: "https://evil.example/x" }), allowed)).toBe(false);
    expect(isSameOrigin(headers({ referer: "bukan url" }), allowed)).toBe(false);
  });

  it("menolak bila keduanya tidak ada", () => {
    expect(isSameOrigin(headers({}), allowed)).toBe(false);
  });
});

describe("getClientIp", () => {
  it("mengabaikan X-Forwarded-For bila proxy tidak dipercaya", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "9.9.9.9" }), false)).toBe("unknown");
  });

  it("memakai entri TERAKHIR (yang dilihat proxy tepercaya), bukan yang dikirim klien", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), true)).toBe(
      "203.0.113.9",
    );
  });

  it("fallback unknown bila header tidak ada", () => {
    expect(getClientIp(headers({}), true)).toBe("unknown");
  });
});

describe("MemoryRateLimiter", () => {
  it("mengizinkan sampai batas lalu menolak dengan retryAfter, dan reset setelah window", async () => {
    let now = 1_000_000;
    const limiter = new MemoryRateLimiter(() => now);
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.consume("k", 3, 60)).allowed).toBe(true);
    }
    const blocked = await limiter.consume("k", 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);

    now += 61_000;
    expect((await limiter.consume("k", 3, 60)).allowed).toBe(true);
  });

  it("key berbeda tidak saling memengaruhi", async () => {
    const limiter = new MemoryRateLimiter(() => 0);
    await limiter.consume("a", 1, 60);
    expect((await limiter.consume("a", 1, 60)).allowed).toBe(false);
    expect((await limiter.consume("b", 1, 60)).allowed).toBe(true);
  });
});

class FakeRedis implements RedisLike {
  readonly counts = new Map<string, number>();
  readonly ttls = new Map<string, number>();
  expireCalls = 0;

  async incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expireCalls += 1;
    this.ttls.set(key, seconds);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    return this.ttls.get(key) ?? -1;
  }
}

describe("RedisRateLimiter", () => {
  it("memasang TTL pada hit pertama dan menolak setelah batas", async () => {
    const redis = new FakeRedis();
    const limiter = new RedisRateLimiter(redis);
    expect((await limiter.consume("k", 2, 30)).allowed).toBe(true);
    expect(redis.expireCalls).toBe(1);
    expect((await limiter.consume("k", 2, 30)).allowed).toBe(true);
    expect(redis.expireCalls).toBe(1);
    const blocked = await limiter.consume("k", 2, 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(30);
  });

  it("memulihkan key tanpa TTL agar tidak terkunci selamanya", async () => {
    const redis = new FakeRedis();
    const limiter = new RedisRateLimiter(redis);
    await limiter.consume("k", 5, 30);
    redis.ttls.clear(); // simulasi TTL hilang
    await limiter.consume("k", 5, 30);
    expect(redis.expireCalls).toBe(2);
  });
});
