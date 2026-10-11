// Entry point "murni" (tanpa Prisma): aman dipakai di test.
export { InvalidProfileUrlError, buildProfileUrl } from "./profile-url";
export {
  MAX_SOCIAL_ACCOUNTS,
  SOCIAL_LIMITS,
  SocialAccountService,
  toSocialAccountDto,
} from "./social-account-service";
export type {
  CreateSocialAccountCommand,
  SocialAccountDeps,
  UpdateSocialAccountCommand,
} from "./social-account-service";
export type {
  NewSocialAccount,
  OwnedSocialAccount,
  PlatformRecord,
  SocialAccountRecord,
  SocialAccountRepository,
  SocialAccountUpdate,
} from "./types";
