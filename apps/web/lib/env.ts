import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET minimal 32 karakter"),
  REDIS_URL: z.string().min(1).optional(),
  APP_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  TRUST_PROXY: z.string().optional(),
  SMTP_URL: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).optional(),
});

export interface AppEnv {
  isProduction: boolean;
  sessionSecret: string;
  redisUrl: string | undefined;
  /** Origin yang diizinkan untuk request yang mengubah state (CSRF). */
  allowedOrigins: string[];
  trustProxy: boolean;
  secureCookies: boolean;
  /** Origin publik untuk tautan di email (origin pertama di APP_ORIGIN). */
  publicOrigin: string;
  /** URL SMTP (smtps://user:pass@host:465). Kosong hanya di development. */
  smtpUrl: string | undefined;
  mailFrom: string;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.parse(source);
  const isProduction = parsed.NODE_ENV === "production";
  if (isProduction && !parsed.REDIS_URL) {
    throw new Error("REDIS_URL wajib di production: rate limit harus dibagi antar instance");
  }
  if (isProduction && !parsed.SMTP_URL) {
    throw new Error("SMTP_URL wajib di production: reset password dan verifikasi email dikirim lewat email");
  }
  const allowedOrigins = parsed.APP_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => new URL(value).origin);
  return {
    isProduction,
    sessionSecret: parsed.SESSION_SECRET,
    redisUrl: parsed.REDIS_URL,
    allowedOrigins,
    publicOrigin: allowedOrigins[0] ?? "http://localhost:3000",
    smtpUrl: parsed.SMTP_URL,
    mailFrom: parsed.MAIL_FROM ?? "Social Finder <no-reply@localhost>",
    trustProxy: parsed.TRUST_PROXY === "true",
    secureCookies: isProduction,
  };
}

let cached: AppEnv | undefined;

/** Lazy agar `next build` tidak membutuhkan secret. */
export function getEnv(): AppEnv {
  cached ??= loadEnv();
  return cached;
}
