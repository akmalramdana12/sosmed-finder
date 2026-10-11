// Entry point "murni": tidak mengimpor Prisma atau argon2, jadi aman dipakai di test.
export { AUTH_LIMITS, AuthService } from "./auth-service";
export type {
  AuthConfig,
  AuthDeps,
  LoginCommand,
  LoginResult,
  RegisterCommand,
  RequestContext,
  SessionIdentity,
} from "./auth-service";
export {
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionCookieName,
} from "./cookies";
export { MemoryRateLimiter } from "./rate-limit";
export type { RateLimiter, RateLimitResult } from "./rate-limit";
export { RedisRateLimiter } from "./redis-rate-limiter";
export type { RedisLike } from "./redis-rate-limiter";
export { getClientIp, isSameOrigin } from "./request";
export { generateSessionToken, hashIdentifier, hashToken } from "./tokens";
export { UniqueViolationError } from "./types";
export type {
  AuditEvent,
  AuditWriter,
  AuthUser,
  NewSession,
  NewUser,
  PasswordHasher,
  SessionLookup,
  SessionRepository,
  UserRepository,
  UserStatus,
} from "./types";
export { RateLimitedError } from "../../errors/rate-limited-error";
