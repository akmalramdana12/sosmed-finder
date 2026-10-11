import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import { hashToken } from "../auth/tokens";
import type { AuditEvent } from "../auth/types";
import { RECOVERY_LIMITS, RecoveryService, TOKEN_TTL_MS } from "./recovery-service";
import type { MailMessage, NewRecoveryToken, RecoveryRepository, RecoveryUser } from "./types";

const NOW = new Date("2026-10-11T00:00:00.000Z");
const CTX = { ip: "203.0.113.5", userAgent: "test" };
const USER: RecoveryUser = { id: "11111111-1111-4111-8111-111111111111", email: "ada@example.com", emailVerifiedAt: null };

class FakeRepo implements RecoveryRepository {
  users: RecoveryUser[] = [USER];
  tokens: (NewRecoveryToken & { usedAt: Date | null })[] = [];
  passwords = new Map<string, string>();
  revoked: string[] = [];

  async findActiveByEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async findActiveById(id: string) { return this.users.find((u) => u.id === id) ?? null; }
  async replaceToken(t: NewRecoveryToken) {
    for (const old of this.tokens) if (old.userId === t.userId && old.type === t.type && !old.usedAt) old.usedAt = NOW;
    this.tokens.push({ ...t, usedAt: null });
  }
  private find(type: string, hash: string, now: Date) {
    return this.tokens.find((t) => t.type === type && t.tokenHash === hash && !t.usedAt && t.expiresAt > now);
  }
  async isTokenUsable(type: "PASSWORD_RESET" | "EMAIL_VERIFICATION", hash: string, now: Date) { return this.find(type, hash, now) !== undefined; }
  async resetPasswordWithToken(hash: string, passwordHash: string, now: Date) {
    const t = this.find("PASSWORD_RESET", hash, now);
    if (!t) return null;
    t.usedAt = now;
    this.passwords.set(t.userId, passwordHash);
    this.revoked.push(t.userId);
    return t.userId;
  }
  async verifyEmailWithToken(hash: string, now: Date) {
    const t = this.find("EMAIL_VERIFICATION", hash, now);
    if (!t) return null;
    t.usedAt = now;
    const user = this.users.find((u) => u.id === t.userId);
    if (user) user.emailVerifiedAt = now;
    return t.userId;
  }
}

function setup(now: () => Date = () => NOW) {
  const repository = new FakeRepo();
  const sent: MailMessage[] = [];
  const audits: AuditEvent[] = [];
  const pending: Promise<void>[] = [];
  let hashCalls = 0;
  const service = new RecoveryService({
    repository,
    hasher: { hash: async (p) => { hashCalls += 1; return `h:${p}`; }, verify: async () => true },
    limiter: new MemoryRateLimiter(() => now().getTime()),
    audit: async (e) => { audits.push(e); },
    mailer: { send: async (m) => { sent.push(m); } },
    now,
    hmacSecret: "s".repeat(40),
    appOrigin: "https://cari.example.com",
    defer: (p) => { pending.push(p); },
  });
  const flush = async () => { await Promise.all(pending.splice(0)); };
  return { repository, service, sent, audits, flush, hashCalls: () => hashCalls };
}

const tokenFrom = (m: MailMessage): string => /#token=([A-Za-z0-9_-]{43})/.exec(m.text)?.[1] ?? "";

describe("requestPasswordReset", () => {
  it("email terdaftar: kirim tautan fragmen (#token) berumur 30 menit, simpan hanya hash", async () => {
    const { service, repository, sent, flush } = setup();
    await service.requestPasswordReset("  ADA@example.com ", CTX);
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ada@example.com");
    expect(sent[0]?.text).toContain("https://cari.example.com/reset-password#token=");
    const token = tokenFrom(sent[0] as MailMessage);
    expect(token).toHaveLength(43);
    expect(repository.tokens).toHaveLength(1);
    expect(repository.tokens[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(repository.tokens)).not.toContain(token);
    expect(repository.tokens[0]?.expiresAt).toEqual(new Date(NOW.getTime() + TOKEN_TTL_MS.PASSWORD_RESET));
  });

  it("email tidak terdaftar: selesai tanpa error, tanpa email, tanpa token", async () => {
    const { service, repository, sent, flush } = setup();
    await service.requestPasswordReset("tidak-ada@example.com", CTX);
    await flush();
    expect(sent).toHaveLength(0);
    expect(repository.tokens).toHaveLength(0);
  });

  it("permintaan baru mematikan token lama", async () => {
    const { service, repository, flush } = setup();
    await service.requestPasswordReset("ada@example.com", CTX);
    await service.requestPasswordReset("ada@example.com", CTX);
    await flush();
    expect(repository.tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
  });

  it("dibatasi per email (sama untuk email terdaftar maupun tidak)", async () => {
    for (const email of ["ada@example.com", "tidak-ada@example.com"]) {
      const { service } = setup();
      for (let i = 0; i < RECOVERY_LIMITS.resetRequestPerEmail.limit; i += 1) await service.requestPasswordReset(email, { ip: `198.51.100.${i}`, userAgent: null });
      await expect(service.requestPasswordReset(email, { ip: "198.51.100.99", userAgent: null })).rejects.toThrow(RateLimitedError);
    }
  });

  it("kegagalan kirim email tidak menggagalkan permintaan dan tidak membocorkan isi", async () => {
    const repository = new FakeRepo();
    const pending: Promise<void>[] = [];
    const service = new RecoveryService({
      repository, hasher: { hash: async (p) => p, verify: async () => true }, limiter: new MemoryRateLimiter(),
      audit: async () => undefined, mailer: { send: async () => { throw new Error("smtp down: ada@example.com"); } },
      now: () => NOW, hmacSecret: "s".repeat(40), appOrigin: "https://x.test", defer: (p) => { pending.push(p); },
    });
    await service.requestPasswordReset("ada@example.com", CTX);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });

  it("audit tidak memuat email atau token", async () => {
    const { service, audits, sent, flush } = setup();
    await service.requestPasswordReset("ada@example.com", CTX);
    await flush();
    const json = JSON.stringify(audits);
    expect(json).not.toContain("ada@example.com");
    expect(json).not.toContain(tokenFrom(sent[0] as MailMessage));
    expect(audits[0]?.action).toBe("auth.password_reset.request");
  });
});

describe("resetPassword", () => {
  async function issue() {
    const ctxs = setup();
    await ctxs.service.requestPasswordReset("ada@example.com", CTX);
    await ctxs.flush();
    return { ...ctxs, token: tokenFrom(ctxs.sent[0] as MailMessage) };
  }

  it("mengganti password, mencabut sesi, dan token hanya sekali pakai", async () => {
    const { service, repository, token } = await issue();
    await service.resetPassword(token, "password-baru-123", CTX);
    expect(repository.passwords.get(USER.id)).toBe("h:password-baru-123");
    expect(repository.revoked).toEqual([USER.id]);
    await expect(service.resetPassword(token, "password-lain-456", CTX)).rejects.toThrow("Tautan tidak valid atau sudah kedaluwarsa");
  });

  it("token kedaluwarsa ditolak", async () => {
    let t = NOW;
    const { service, flush, sent } = setup(() => t);
    await service.requestPasswordReset("ada@example.com", CTX);
    await flush();
    t = new Date(NOW.getTime() + TOKEN_TTL_MS.PASSWORD_RESET + 1);
    await expect(service.resetPassword(tokenFrom(sent[0] as MailMessage), "password-baru-123", CTX)).rejects.toThrow(AppError);
  });

  it("token tidak dikenal ditolak TANPA menghitung hash argon2", async () => {
    const { service, hashCalls } = setup();
    await expect(service.resetPassword("A".repeat(43), "password-baru-123", CTX)).rejects.toThrow(AppError);
    expect(hashCalls()).toBe(0);
  });

  it("token verifikasi email tidak bisa dipakai untuk reset password", async () => {
    const { service, repository, flush, sent } = setup();
    await service.requestEmailVerification(USER.id, CTX);
    await flush();
    await expect(service.resetPassword(tokenFrom(sent[0] as MailMessage), "password-baru-123", CTX)).rejects.toThrow(AppError);
    expect(repository.passwords.size).toBe(0);
  });

  it("pesan kegagalan sama untuk semua sebab", async () => {
    const { service } = await issue();
    const messages = new Set<string>();
    for (const token of ["A".repeat(43), "B".repeat(43)]) {
      try { await service.resetPassword(token, "password-baru-123", CTX); } catch (e) { messages.add((e as Error).message); }
    }
    expect(messages.size).toBe(1);
  });

  it("dibatasi per IP", async () => {
    const { service } = setup();
    for (let i = 0; i < RECOVERY_LIMITS.resetConfirmPerIp.limit; i += 1) await service.resetPassword("A".repeat(43), "password-baru-123", CTX).catch(() => undefined);
    await expect(service.resetPassword("A".repeat(43), "password-baru-123", CTX)).rejects.toThrow(RateLimitedError);
  });
});

describe("verifikasi email", () => {
  it("kirim tautan, lalu konfirmasi menandai terverifikasi dan token sekali pakai", async () => {
    const { service, repository, sent, flush } = setup();
    await service.requestEmailVerification(USER.id, CTX);
    await flush();
    expect(sent[0]?.text).toContain("https://cari.example.com/verify-email#token=");
    const token = tokenFrom(sent[0] as MailMessage);
    await service.verifyEmail(token, CTX);
    expect(repository.users[0]?.emailVerifiedAt).toEqual(NOW);
    await expect(service.verifyEmail(token, CTX)).rejects.toThrow(AppError);
  });

  it("sudah terverifikasi: tidak mengirim email lagi", async () => {
    const { service, repository, sent, flush } = setup();
    if (repository.users[0]) repository.users[0].emailVerifiedAt = NOW;
    await service.requestEmailVerification(USER.id, CTX);
    await flush();
    expect(sent).toHaveLength(0);
  });

  it("dibatasi per pengguna", async () => {
    const { service } = setup();
    for (let i = 0; i < RECOVERY_LIMITS.verifyRequestPerUser.limit; i += 1) await service.requestEmailVerification(USER.id, CTX);
    await expect(service.requestEmailVerification(USER.id, CTX)).rejects.toThrow(RateLimitedError);
  });
});
