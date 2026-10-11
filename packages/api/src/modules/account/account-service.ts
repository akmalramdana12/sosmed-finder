import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RequestContext } from "../auth/auth-service";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import type { AuditEvent, AuditWriter, PasswordHasher } from "../auth/types";
import type { AccountRepository } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const ACCOUNT_LIMITS = {
  /** Sesi yang dibajak tidak boleh bisa menebak password lama: batas ketat per pengguna. */
  changePassword: { limit: 5, windowSec: 900 },
  /** Sesuai kontrak API: 3/jam. */
  deleteAccount: { limit: 3, windowSec: 3600 },
} as const satisfies Record<string, LimitRule>;

/** Masa tunggu sebelum akun yang dihapus dihapus permanen oleh pekerjaan latar belakang. */
export const DELETION_GRACE_DAYS = 30;

const WRONG_PASSWORD = "Password saat ini salah";

export interface AccountDeps {
  repository: AccountRepository;
  hasher: PasswordHasher;
  limiter: RateLimiter;
  audit: AuditWriter;
  now: () => Date;
  hmacSecret: string;
}

export class AccountService {
  private readonly deps: AccountDeps;

  constructor(deps: AccountDeps) {
    this.deps = deps;
  }

  /**
   * Ganti password. Seluruh sesi dicabut (termasuk yang sekarang): pengguna harus login ulang dengan
   * password baru, sehingga sesi yang dibajak ikut mati.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.enforce(`account:pw:${userId}`, ACCOUNT_LIMITS.changePassword);
    await this.verifyPassword(userId, currentPassword);
    if (newPassword === currentPassword) {
      throw new AppError("VALIDATION_ERROR", "Password baru harus berbeda dari yang lama");
    }
    const newHash = await this.deps.hasher.hash(newPassword);
    await this.deps.repository.setPasswordAndRevokeSessions(userId, newHash, this.deps.now());
    await this.audit(ctx, userId, "account.password.change");
  }

  /** Hapus akun: langsung hilang dari pencarian dan semua sesi mati; penghapusan permanen menyusul. */
  async deleteAccount(userId: string, password: string, ctx: RequestContext): Promise<void> {
    await this.enforce(`account:delete:${userId}`, ACCOUNT_LIMITS.deleteAccount);
    await this.verifyPassword(userId, password);
    await this.deps.repository.markDeleted(userId, this.deps.now());
    await this.audit(ctx, userId, "account.delete");
  }

  /** Dipanggil pekerjaan terjadwal (worker). Mengembalikan jumlah akun yang dihapus permanen. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(this.deps.now().getTime() - DELETION_GRACE_DAYS * 86_400_000);
    return this.deps.repository.purgeDeletedBefore(cutoff);
  }

  private async verifyPassword(userId: string, password: string): Promise<void> {
    const hash = await this.deps.repository.getPasswordHash(userId);
    // Tanpa hash = akun sudah tidak aktif; sesi seharusnya sudah mati, perlakukan sebagai gagal.
    if (hash === null || !(await this.deps.hasher.verify(hash, password))) {
      throw new AppError("VALIDATION_ERROR", WRONG_PASSWORD);
    }
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
