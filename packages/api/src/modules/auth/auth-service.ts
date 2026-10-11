import { normalizeUsername } from "@social-finder/validation";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RateLimiter } from "./rate-limit";
import { generateSessionToken, hashIdentifier, hashToken } from "./tokens";
import {
  UniqueViolationError,
  type AuditEvent,
  type AuditWriter,
  type PasswordHasher,
  type SessionRepository,
  type UserRepository,
} from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const AUTH_LIMITS = {
  registerPerIp: { limit: 5, windowSec: 3600 },
  loginPerIp: { limit: 30, windowSec: 900 },
  loginPerAccount: { limit: 10, windowSec: 900 },
} as const satisfies Record<string, LimitRule>;

export interface AuthConfig {
  sessionTtlMs: number;
  /** Secret untuk HMAC IP dan key rate limit. Minimal 32 karakter. */
  hmacSecret: string;
}

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  limiter: RateLimiter;
  audit: AuditWriter;
  now: () => Date;
  config: AuthConfig;
}

export interface RequestContext {
  ip: string;
  userAgent: string | null;
}

export interface RegisterCommand {
  email: string;
  username: string;
  password: string;
  displayName?: string | undefined;
}

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  userId: string;
}

export interface SessionIdentity {
  userId: string;
  sessionId: string;
}

const GENERIC_LOGIN_ERROR = "Email atau password salah";

export class AuthService {
  private readonly deps: AuthDeps;
  private dummyHash: Promise<string> | undefined;

  constructor(deps: AuthDeps) {
    this.deps = deps;
  }

  /**
   * Registrasi. Respons SAMA (sukses) baik email baru maupun sudah terdaftar, agar email
   * tidak bisa dienumerasi. Hash password selalu dihitung agar waktu respons tidak membedakan.
   * Hanya konflik username yang dilaporkan (username memang publik).
   */
  async register(command: RegisterCommand, ctx: RequestContext): Promise<void> {
    const ipHash = this.ipHash(ctx);
    await this.enforce(`register:ip:${ipHash}`, AUTH_LIMITS.registerPerIp);

    const email = command.email.trim().toLowerCase();
    const passwordHash = await this.deps.hasher.hash(command.password);

    const existing = await this.deps.users.findByEmail(email);
    if (existing) {
      await this.audit({
        action: "auth.register.duplicate_email",
        actorId: null,
        entity: "User",
        entityId: null,
        ipHash,
      });
      return;
    }

    try {
      const created = await this.deps.users.create({
        email,
        username: command.username,
        normalizedUsername: normalizeUsername(command.username),
        passwordHash,
        displayName: command.displayName ?? command.username,
      });
      await this.audit({
        action: "auth.register",
        actorId: created.id,
        entity: "User",
        entityId: created.id,
        ipHash,
      });
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        if (error.field === "username") {
          throw new AppError("CONFLICT", "Username sudah dipakai");
        }
        return; // race pada email: perlakukan sebagai email yang sudah terdaftar
      }
      throw error;
    }
  }

  /** Login. Semua kegagalan memberi pesan dan waktu yang sama. */
  async login(command: LoginCommand, ctx: RequestContext): Promise<LoginResult> {
    const ipHash = this.ipHash(ctx);
    const email = command.email.trim().toLowerCase();
    const accountKey = hashIdentifier(email, this.deps.config.hmacSecret);

    await this.enforce(`login:ip:${ipHash}`, AUTH_LIMITS.loginPerIp);
    await this.enforce(`login:acct:${accountKey}`, AUTH_LIMITS.loginPerAccount);

    const user = await this.deps.users.findByEmail(email);
    // Verifikasi selalu dijalankan (hash tiruan bila user tidak ada) agar waktu seragam.
    const hash = user ? user.passwordHash : await this.getDummyHash();
    const passwordOk = await this.deps.hasher.verify(hash, command.password);

    if (!user || !passwordOk || user.status !== "ACTIVE" || user.deletedAt !== null) {
      await this.audit({
        action: "auth.login.failure",
        actorId: user?.id ?? null,
        entity: "User",
        entityId: user?.id ?? null,
        ipHash,
        metadata: { reason: !user ? "unknown_user" : !passwordOk ? "bad_password" : "inactive" },
      });
      throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
    }

    const token = generateSessionToken();
    const expiresAt = new Date(this.deps.now().getTime() + this.deps.config.sessionTtlMs);
    const session = await this.deps.sessions.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      ipHash,
      userAgent: ctx.userAgent?.slice(0, 255) ?? null,
    });
    await this.audit({
      action: "auth.login.success",
      actorId: user.id,
      entity: "Session",
      entityId: session.id,
      ipHash,
    });
    return { token, expiresAt, userId: user.id };
  }

  /** Cabut sesi. Tidak error bila token kosong atau tidak dikenal. */
  async logout(token: string | null, ctx: RequestContext): Promise<void> {
    if (!token) return;
    const identity = await this.validateSession(token);
    await this.deps.sessions.revoke(hashToken(token), this.deps.now());
    if (identity) {
      await this.audit({
        action: "auth.logout",
        actorId: identity.userId,
        entity: "Session",
        entityId: identity.sessionId,
        ipHash: this.ipHash(ctx),
      });
    }
  }

  /** Validasi token sesi. Null bila tidak ada, dicabut, kedaluwarsa, atau akun tidak aktif. */
  async validateSession(token: string): Promise<SessionIdentity | null> {
    const record = await this.deps.sessions.findByTokenHash(hashToken(token));
    if (!record) return null;
    if (record.revokedAt !== null) return null;
    if (record.expiresAt.getTime() <= this.deps.now().getTime()) return null;
    if (record.userStatus !== "ACTIVE" || record.userDeletedAt !== null) return null;
    return { userId: record.userId, sessionId: record.id };
  }

  private ipHash(ctx: RequestContext): string {
    return hashIdentifier(ctx.ip, this.deps.config.hmacSecret);
  }

  private async enforce(key: string, rule: LimitRule): Promise<void> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSec);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash(generateSessionToken());
    return this.dummyHash;
  }

  /** Kegagalan audit tidak boleh menggagalkan request, tetapi harus terlihat di log. */
  private async audit(event: AuditEvent): Promise<void> {
    try {
      await this.deps.audit(event);
    } catch {
      console.error(
        JSON.stringify({ level: "error", msg: "audit write failed", action: event.action }),
      );
    }
  }
}
