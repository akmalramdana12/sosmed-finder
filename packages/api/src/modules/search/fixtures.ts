import type { CandidateAccount, SearchCandidate } from "./types";

export const ACCOUNT: CandidateAccount = {
  platformKey: "instagram",
  username: "alex",
  profileUrl: "https://instagram.com/alex",
  isVerified: false,
  isDiscoverable: true,
  platformActive: true,
};

/** Kandidat yang lolos semua syarat; test mengubah satu hal per kasus. Hanya untuk test. */
export function candidate(overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    username: "Alex",
    normalizedUsername: "alex",
    displayName: "Alex Doe",
    status: "ACTIVE",
    deleted: false,
    isDiscoverable: true,
    searchableByUsername: true,
    showPlatforms: true,
    blockedEitherWay: false,
    visibility: "DISCOVERABLE_RADIUS",
    locationEnabled: true,
    areaLabel: "Sekupang",
    cityLabel: "Batam",
    discoverableRadiusM: 10_000,
    distanceM: 2_400,
    distanceUnits: 5,
    usernameMatched: true,
    handleMatched: false,
    accounts: [ACCOUNT],
    ...overrides,
  };
}
