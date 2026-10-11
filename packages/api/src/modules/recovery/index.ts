// Entry point "murni" (tanpa Prisma): aman dipakai di test.
export { RECOVERY_LIMITS, RecoveryService, TOKEN_TTL_MS } from "./recovery-service";
export type { RecoveryDeps } from "./recovery-service";
export type {
  MailMessage,
  Mailer,
  NewRecoveryToken,
  RecoveryRepository,
  RecoveryTokenType,
  RecoveryUser,
} from "./types";
