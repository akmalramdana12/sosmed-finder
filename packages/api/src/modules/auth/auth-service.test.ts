import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { AUTH_LIMITS, AuthService } from "./auth-service";
import { MemoryRateLimiter } from "./rate-limit";
import { hashToken } from "./tokens";
import {
  UniqueViolationError,
  type AuditEvent,
  type AuthUser,
  type NewSession,
  type NewUser,
  type PasswordHasher,
  type SessionLookup,
  type SessionRepository,
  type UserRepository,
} from "./types";

interface UserRow extends AuthUser {
  username: string;
  normalizedUsername: string;
}

interface SessionRow extends NewSession {
  id: string;
  revokedAt: Date | null;
}

class FakeUsers implements UserRepository {
  readonly rows: UserRow[] = [];

  async findByEmail(email: string): Promise<AuthUser | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }

  async create(user: NewUser): Promise<{ id: string }> {
    if (this.rows.some((row) => row.normalizedUsername === user.normalizedUsername)) {
      throw new UniqueViolationError("username");
    }
    if (this.rows.some((row) => row.email === user.email)) {
      throw new UniqueViolationError("email");
    }
    const id = `user-${this.rows.length + 1}`;
    this.rows.push({
      id,
      email: user.email,
      passwordHash: user.passwordHash,
      status: "ACTIVE",
      deletedAt: null,
      username: user.username,
      normalizedUsername: user.normalizedUsername,
    });
    return { id };
  }
}

class FakeSessions implements SessionRepository {
  readonly rows: SessionRow[] = [];
  private readonly users: FakeUsers;

  constructor(users: FakeUsers) {
    this.users = users;
  }

  async create(session: NewSession): Promise<{ id: string }> {
    const id = `session-${this.rows.length + 1}`;
    this.rows.push({ ...session, id, revokedAt: null });
    return { id };
  }

  async findByTokenHash(tokenHash: string): Promise<SessionLookup | null> {
    const row = this.rows.find((candidate) => candidate.tokenHash === tokenHash);
    if (!row) return null;
    const user = this.users.rows.find((candidate) => candidate.id === row.userId);
    if (!user) return null;
    return {
      id: row.id,
      userId: row.userId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastSeenAt: row.lastSeenAt,
      userStatus: user.status,
      userDeletedAt: user.deletedAt,
    };
  }

  async revoke(tokenHash: string, at: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.tokenHash === tokenHash && row.revokedAt === null) row.revokedAt = at;
    }
  }

  touches = 0;
  async touch(sessionId: string, at: Date): Promise<void> {
    this.touches += 1;
    for (const row of this.rows) {
      if (row.id === sessionId && row.revokedAt === null) row.lastSeenAt = at;
    }
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && row.revokedAt === null) row.revokedAt = at;
    }
  }
}

class FakeHasher implements PasswordHasher {
  hashCalls = 0;
  verifyCalls = 0;

  async hash(password: string): Promise<string> {
    this.hashCalls += 1;
    return `hashed:${password}`;
  }

  async verify(hash: string, password: string): Promise<boolean> {
    this.verifyCalls += 1;
    return hash === `hashed:${password}`;
  }
}

const SECRET = "test-secret-test-secret-test-secret-123";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const IDLE_MS = 3 * 24 * 60 * 60 * 1000;
const PASSWORD = "correct-horse-battery";
const CTX = { ip: "203.0.113.7", userAgent: "vitest" };

function setup() {
  const users = new FakeUsers();
  const sessions = new FakeSessions(users);
  const hasher = new FakeHasher();
  const events: AuditEvent[] = [];
  const clock = { value: new Date("2026-01-01T00:00:00.000Z") };
  const service = new AuthService({
    users,
    sessions,
    hasher,
    limiter: new MemoryRateLimiter(() => clock.value.getTime()),
    audit: async (event) => {
      events.push(event);
    },
    now: () => clock.value,
    config: { sessionTtlMs: TTL_MS, sessionIdleMs: IDLE_MS, hmacSecret: SECRET },
  });
  return { service, users, sessions, hasher, events, clock };
}

async function registerAlex(service: AuthService): Promise<void> {
  await service.register({ email: "alex@example.com", username: "Alex", password: PASSWORD }, CTX);
}

describe("onRegistered", () => {
  it("dipanggil untuk akun baru saja; gagal tidak memengaruhi pendaftaran", async () => {
    const calls: string[] = [];
    const users = new FakeUsers();
    const service = new AuthService({
      users,
      sessions: new FakeSessions(users),
      hasher: new FakeHasher(),
      limiter: new MemoryRateLimiter(),
      audit: async () => {},
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      config: { sessionTtlMs: TTL_MS, sessionIdleMs: IDLE_MS, hmacSecret: SECRET },
      onRegistered: async (userId) => {
        calls.push(userId);
        throw new Error("smtp down");
      },
    });
    await service.register({ email: "alex@example.com", username: "Alex", password: PASSWORD }, CTX);
    // email yang sama lagi: tidak ada pemanggilan kedua
    await service.register({ email: "alex@example.com", username: "other_name", password: PASSWORD }, CTX);
    await Promise.resolve();
    expect(users.rows).toHaveLength(1);
    expect(calls).toEqual([users.rows[0]?.id]);
  });
});

describe("register", () => {
  it("membuat user dengan password ter-hash dan username ternormalisasi", async () => {
    const { service, users } = setup();
    await registerAlex(service);
    const row = users.rows[0];
    expect(users.rows).toHaveLength(1);
    expect(row?.normalizedUsername).toBe("alex");
    expect(row?.passwordHash).not.toBe(PASSWORD);
  });

  it("email yang sudah terdaftar: sukses diam-diam, tidak membuat user baru", async () => {
    const { service, users, hasher } = setup();
    await registerAlex(service);
    const hashCallsAfterFirst = hasher.hashCalls;
    await service.register(
      { email: "alex@example.com", username: "other_name", password: PASSWORD },
      CTX,
    );
    expect(users.rows).toHaveLength(1);
    // hash tetap dihitung agar waktu respons tidak membedakan
    expect(hasher.hashCalls).toBe(hashCallsAfterFirst + 1);
  });

  it("username bentrok dengan email baru: CONFLICT", async () => {
    const { service } = setup();
    await registerAlex(service);
    await expect(
      service.register({ email: "b@example.com", username: "ALEX", password: PASSWORD }, CTX),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("dibatasi per IP", async () => {
    const { service } = setup();
    for (let i = 0; i < AUTH_LIMITS.registerPerIp.limit; i += 1) {
      await service.register(
        { email: `u${i}@example.com`, username: `user_${i}`, password: PASSWORD },
        CTX,
      );
    }
    await expect(
      service.register({ email: "x@example.com", username: "user_x", password: PASSWORD }, CTX),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("login", () => {
  it("sukses: token dikembalikan, hanya hash-nya yang disimpan", async () => {
    const { service, sessions } = setup();
    await registerAlex(service);
    const result = await service.login({ email: "alex@example.com", password: PASSWORD }, CTX);

    expect(result.token).toHaveLength(43);
    const stored = sessions.rows[0];
    expect(stored?.tokenHash).toBe(hashToken(result.token));
    expect(stored?.tokenHash).not.toBe(result.token);
    expect(stored?.ipHash).not.toContain(CTX.ip);
    expect(await service.validateSession(result.token)).toMatchObject({ userId: result.userId });
  });

  it("password salah dan email tidak dikenal: pesan sama, verifikasi tetap dijalankan", async () => {
    const { service, hasher } = setup();
    await registerAlex(service);

    const wrongPassword = await service
      .login({ email: "alex@example.com", password: "salah-salah-salah" }, CTX)
      .catch((error: unknown) => error);
    const verifyAfterWrong = hasher.verifyCalls;
    const unknownUser = await service
      .login({ email: "nobody@example.com", password: PASSWORD }, CTX)
      .catch((error: unknown) => error);

    expect(wrongPassword).toBeInstanceOf(AppError);
    expect(unknownUser).toBeInstanceOf(AppError);
    expect((wrongPassword as AppError).message).toBe((unknownUser as AppError).message);
    expect((unknownUser as AppError).code).toBe("UNAUTHENTICATED");
    expect(hasher.verifyCalls).toBe(verifyAfterWrong + 1);
  });

  it("akun SUSPENDED atau terhapus tidak bisa login", async () => {
    const { service, users } = setup();
    await registerAlex(service);
    const row = users.rows[0];
    if (!row) throw new Error("user tidak ada");

    row.status = "SUSPENDED";
    await expect(
      service.login({ email: "alex@example.com", password: PASSWORD }, CTX),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    row.status = "ACTIVE";
    row.deletedAt = new Date();
    await expect(
      service.login({ email: "alex@example.com", password: PASSWORD }, CTX),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("brute force: setelah batas per akun, password benar pun ditolak (429)", async () => {
    const { service } = setup();
    await registerAlex(service);
    for (let i = 0; i < AUTH_LIMITS.loginPerAccount.limit; i += 1) {
      await service
        .login({ email: "alex@example.com", password: "salah-salah-salah" }, CTX)
        .catch(() => undefined);
    }
    await expect(
      service.login({ email: "alex@example.com", password: PASSWORD }, CTX),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("mencatat audit tanpa data sensitif", async () => {
    const { service, events } = setup();
    await registerAlex(service);
    await service
      .login({ email: "alex@example.com", password: "salah-salah-salah" }, CTX)
      .catch(() => undefined);
    const serialized = JSON.stringify(events);
    expect(events.map((event) => event.action)).toContain("auth.login.failure");
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("salah-salah-salah");
    expect(serialized).not.toContain("alex@example.com");
    expect(serialized).not.toContain(CTX.ip);
  });
});

describe("sesi", () => {
  it("kedaluwarsa setelah TTL", async () => {
    const { service, clock } = setup();
    await registerAlex(service);
    const { token } = await service.login({ email: "alex@example.com", password: PASSWORD }, CTX);

    // Sesi dipakai tiap 2 hari (di bawah batas idle 3 hari) sampai hari ke-12.
    const day = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 6; i += 1) {
      clock.value = new Date(clock.value.getTime() + 2 * day);
      expect(await service.validateSession(token)).not.toBeNull();
    }
    const start = clock.value.getTime() - 12 * day;
    clock.value = new Date(start + TTL_MS - 1000);
    expect(await service.validateSession(token)).not.toBeNull();

    clock.value = new Date(clock.value.getTime() + 2000);
    expect(await service.validateSession(token)).toBeNull();
  });

  it("idle: sesi yang menganggur lewat batas ditolak dan dicabut", async () => {
    const { service, clock, sessions } = setup();
    await registerAlex(service);
    const { token } = await service.login({ email: "alex@example.com", password: PASSWORD }, CTX);
    clock.value = new Date(clock.value.getTime() + IDLE_MS + 1000);
    expect(await service.validateSession(token)).toBeNull();
    expect(sessions.rows[0]?.revokedAt).not.toBeNull();
    // tetap ditolak walau waktu mundur: sudah dicabut
    clock.value = new Date(clock.value.getTime() - IDLE_MS);
    expect(await service.validateSession(token)).toBeNull();
  });

  it("aktivitas menggeser batas idle (sliding), tetapi umur mutlak tetap berlaku", async () => {
    const { service, clock } = setup();
    await registerAlex(service);
    const { token } = await service.login({ email: "alex@example.com", password: PASSWORD }, CTX);
    const day = 24 * 60 * 60 * 1000;
    for (let i = 0; i < 4; i += 1) {
      clock.value = new Date(clock.value.getTime() + 2 * day); // < idle 3 hari
      expect(await service.validateSession(token)).not.toBeNull();
    }
    // total 8 hari: tanpa sliding sudah mati; dengan sliding masih hidup. Lewat 14 hari mutlak: mati.
    clock.value = new Date(clock.value.getTime() + 2 * day);
    expect(await service.validateSession(token)).not.toBeNull(); // hari ke-10
    clock.value = new Date(clock.value.getTime() + 2 * day);
    expect(await service.validateSession(token)).not.toBeNull(); // hari ke-12
    clock.value = new Date(clock.value.getTime() + 2 * day);
    expect(await service.validateSession(token)).toBeNull(); // hari ke-14: TTL mutlak
  });

  it("penulisan aktivitas dibatasi: tidak ada tulis di setiap request, dan kegagalannya tidak menggagalkan request", async () => {
    const { service, clock, sessions } = setup();
    await registerAlex(service);
    const { token } = await service.login({ email: "alex@example.com", password: PASSWORD }, CTX);
    for (let i = 0; i < 5; i += 1) {
      clock.value = new Date(clock.value.getTime() + 30_000);
      await service.validateSession(token);
    }
    expect(sessions.touches).toBe(0); // 2,5 menit < 5 menit
    clock.value = new Date(clock.value.getTime() + 5 * 60_000);
    await service.validateSession(token);
    expect(sessions.touches).toBe(1);
    sessions.touch = async () => {
      throw new Error("db down");
    };
    clock.value = new Date(clock.value.getTime() + 10 * 60_000);
    expect(await service.validateSession(token)).not.toBeNull();
  });

  it("logout mencabut sesi; logout tanpa token tidak error", async () => {
    const { service } = setup();
    await registerAlex(service);
    const { token } = await service.login({ email: "alex@example.com", password: PASSWORD }, CTX);

    await service.logout(token, CTX);
    expect(await service.validateSession(token)).toBeNull();
    await expect(service.logout(null, CTX)).resolves.toBeUndefined();
  });

  it("token acak tidak valid", async () => {
    const { service } = setup();
    expect(await service.validateSession("x".repeat(43))).toBeNull();
  });

  it("sesi tidak valid lagi bila akun di-suspend", async () => {
    const { service, users } = setup();
    await registerAlex(service);
    const { token } = await service.login({ email: "alex@example.com", password: PASSWORD }, CTX);
    const row = users.rows[0];
    if (!row) throw new Error("user tidak ada");
    row.status = "SUSPENDED";
    expect(await service.validateSession(token)).toBeNull();
  });
});
