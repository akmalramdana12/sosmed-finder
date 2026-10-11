import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { generateSessionToken, hashIdentifier, hashToken } from "../auth/tokens";
import type { AuditEvent, AuditWriter, PasswordHasher } from "../auth/types";
import type { Mailer, RecoveryRepository, RecoveryTokenType } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const RECOVERY_LIMITS = {
  resetRequestPerIp: { limit: 5, windowSec: 900 },
  /** Dihitung per email (di-HMAC) TANPA memandang email itu terdaftar atau tidak: tidak membocorkan apa pun. */
  resetRequestPerEmail: { limit: 3, windowSec: 3600 },
  resetConfirmPerIp: { limit: 10, windowSec: 900 },
  verifyRequestPerUser: { limit: 3, windowSec: 3600 },
  verifyConfirmPerIp: { limit: 10, windowSec: 900 },
} as const satisfies Record<string, LimitRule>;

export const TOKEN_TTL_MS = {
  PASSWORD_RESET: 30 * 60 * 1000,
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
} as const satisfies Record<RecoveryTokenType, number>;

const INVALID_LINK = "Tautan tidak valid atau sudah kedaluwarsa";

export interface RecoveryDeps {
  repository: RecoveryRepository;
  hasher: PasswordHasher;
  limiter: RateLimiter;
  audit: AuditWriter;
  mailer: Mailer;
  now: () => Date;
  hmacSecret: string;
  /** Origin publik aplikasi untuk tautan di email, mis. https://cari.example.com (tanpa slash akhir). */
  appOrigin: string;
  /**
   * Pengiriman email dijalankan di latar belakang agar waktu respons tidak membedakan email yang
   * terdaftar dari yang tidak. Default: dilepas (error sudah ditangani di dalam).
   */
  defer?: (task: Promise<void>) => void;
}

export class RecoveryService {
  private readonly deps: RecoveryDeps;

  constructor(deps: RecoveryDeps) {
    this.deps = deps;
  }

  /**
   * Minta tautan reset password. SELALU selesai tanpa error yang membedakan email terdaftar atau
   * tidak (hanya pembatasan laju yang bisa melempar, dan itu berlaku untuk semua email).
   */
  async requestPasswordReset(rawEmail: string, ctx: RequestContext): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    await this.enforce(`reset:req:ip:${this.id(ctx.ip)}`, RECOVERY_LIMITS.resetRequestPerIp);
    await this.enforce(`reset:req:email:${this.id(email)}`, RECOVERY_LIMITS.resetRequestPerEmail);

    const user = await this.deps.repository.findActiveByEmail(email);
    if (!user) return;

    const token = await this.issueToken(user.id, "PASSWORD_RESET");
    this.sendInBackground("password_reset", {
      to: user.email,
      subject: "Atur ulang password Social Finder",
      text: [
        "Seseorang (semoga Anda) meminta pengaturan ulang password akun Social Finder ini.",
        "",
        `Buka tautan berikut dalam 30 menit untuk memilih password baru:`,
        `${this.deps.appOrigin}/reset-password#token=${token}`,
        "",
        "Jika bukan Anda, abaikan email ini; password Anda tidak berubah.",
      ].join("\n"),
    });
    await this.audit(ctx, user.id, "auth.password_reset.request");
  }

  /** Tetapkan password baru dengan token dari email. Semua sesi dicabut; token sekali pakai. */
  async resetPassword(token: string, newPassword: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`reset:confirm:ip:${this.id(ctx.ip)}`, RECOVERY_LIMITS.resetConfirmPerIp);
    const tokenHash = hashToken(token);
    // Periksa token SEBELUM menghitung argon2 agar token sampah tidak bisa dipakai membakar CPU.
    if (!(await this.deps.repository.isTokenUsable("PASSWORD_RESET", tokenHash, this.deps.now()))) {
      throw new AppError("VALIDATION_ERROR", INVALID_LINK);
    }
    const passwordHash = await this.deps.hasher.hash(newPassword);
    const userId = await this.deps.repository.resetPasswordWithToken(
      tokenHash,
      passwordHash,
      this.deps.now(),
    );
    if (userId === null) throw new AppError("VALIDATION_ERROR", INVALID_LINK);
    await this.audit(ctx, userId, "auth.password_reset.complete");
  }

  /** Kirim (ulang) tautan verifikasi email untuk pengguna yang login. Tidak melakukan apa pun bila sudah terverifikasi. */
  async requestEmailVerification(userId: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`verify:req:user:${userId}`, RECOVERY_LIMITS.verifyRequestPerUser);
    const user = await this.deps.repository.findActiveById(userId);
    if (!user || user.emailVerifiedAt !== null) return;

    const token = await this.issueToken(user.id, "EMAIL_VERIFICATION");
    this.sendInBackground("email_verification", {
      to: user.email,
      subject: "Verifikasi email Social Finder",
      text: [
        "Buka tautan berikut dalam 24 jam untuk memverifikasi email akun Social Finder Anda:",
        `${this.deps.appOrigin}/verify-email#token=${token}`,
        "",
        "Jika bukan Anda yang mendaftar, abaikan email ini.",
      ].join("\n"),
    });
    await this.audit(ctx, user.id, "auth.email_verification.request");
  }

  /** Konfirmasi email dengan token. Tidak butuh sesi (tautan dibuka dari email di perangkat mana pun). */
  async verifyEmail(token: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`verify:confirm:ip:${this.id(ctx.ip)}`, RECOVERY_LIMITS.verifyConfirmPerIp);
    const userId = await this.deps.repository.verifyEmailWithToken(hashToken(token), this.deps.now());
    if (userId === null) throw new AppError("VALIDATION_ERROR", INVALID_LINK);
    await this.audit(ctx, userId, "auth.email.verify");
  }

  private async issueToken(userId: string, type: RecoveryTokenType): Promise<string> {
    const token = generateSessionToken();
    await this.deps.repository.replaceToken({
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.deps.now().getTime() + TOKEN_TTL_MS[type]),
    });
    return token;
  }

  private sendInBackground(kind: string, message: Parameters<Mailer["send"]>[0]): void {
    const task = this.deps.mailer.send(message).catch(() => {
      // Hanya jenis email; jangan pernah mencatat alamat, isi, atau error (bisa memuat token/alamat).
      console.error(JSON.stringify({ level: "error", msg: "mail send failed", kind }));
    });
    (this.deps.defer ?? ((p: Promise<void>): void => void p))(task);
  }

  private id(value: string): string {
    return hashIdentifier(value, this.deps.hmacSecret);
  }

  private async audit(ctx: RequestContext, actorId: string, action: string): Promise<void> {
    const event: AuditEvent = {
      action,
      actorId,
      entity: "User",
      entityId: actorId,
      ipHash: hashIdentifier(ctx.ip, this.deps.hmacSecret),
    };
    try {
      await this.deps.audit(event);
    } catch {
      console.error(JSON.stringify({ level: "error", msg: "audit write failed", action }));
    }
  }

  private async enforce(key: string, rule: LimitRule): Promise<void> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSec);
  }
}
