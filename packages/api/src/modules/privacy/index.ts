// Entry point "murni" (tanpa Prisma): aman dipakai di test.
export {
  PRIVACY_LIMITS,
  PrivacyService,
  SAFE_PRIVACY_DEFAULTS,
  toPrivacyDto,
} from "./privacy-service";
export type { PrivacyDeps } from "./privacy-service";
export type { PrivacyRecord, PrivacyRepository, PrivacyUpdate } from "./types";
