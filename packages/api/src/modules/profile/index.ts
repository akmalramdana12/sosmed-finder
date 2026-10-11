// Entry point "murni" modul profil (tanpa Prisma): aman dipakai di test.
export { PROFILE_LIMITS, ProfileService, toMeDto } from "./profile-service";
export type { ProfileDeps, ProfilePatch } from "./profile-service";
export type { MeRecord, MeUpdate, ProfileRepository } from "./types";
