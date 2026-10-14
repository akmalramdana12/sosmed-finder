import type { SearchAccountDto, SearchResultDto } from "@social-finder/types";
import { roundDistanceKm, withinDiscoverableRadius } from "../location/geo";
import { projectLocation, type PublicLocation } from "../location/projection";
import type { CandidateAccount, SearchCandidate } from "./types";

/** Apa yang diminta pencari; menentukan syarat tambahan di atas syarat dasar. */
export interface EvaluationRules {
  searcherId: string;
  /** Pencarian berdasarkan kata kunci (atau lookup profil lewat username). */
  usernameQuery: boolean;
  /**
   * Boleh cocok lewat handle sosmed? Default true (pencarian). Lookup profil mengisi false:
   * hanya username Social Finder yang boleh cocok.
   */
  allowHandleMatch?: boolean;
  platformKey: string | null;
  /** Default true (gagal tertutup): akun yang emailnya belum diverifikasi ditolak. Hanya `false` yang melonggarkan. */
  requireVerifiedEmail?: boolean;
  /** Radius pencarian dalam km; null bila bukan pencarian radius. */
  radiusKm: number | null;
}

export type RejectReason =
  | "self"
  | "inactive"
  | "email-unverified"
  | "not-discoverable"
  | "blocked"
  | "no-discoverable-account"
  | "username-search-off"
  | "no-match"
  | "handle-hidden"
  | "platform-hidden"
  | "platform-no-match"
  | "radius-not-allowed"
  | "out-of-radius";

export type Evaluation =
  | { ok: true; result: SearchResultDto }
  | { ok: false; reason: RejectReason };

const deny = (reason: RejectReason): Evaluation => ({ ok: false, reason });

function toAccountDto(account: CandidateAccount): SearchAccountDto {
  return {
    platform: account.platformKey,
    username: account.username,
    profileUrl: account.profileUrl,
    isVerified: account.isVerified,
  };
}

/**
 * Pemeriksaan akhir sebelum baris menjadi DTO. Fungsi murni, gagal tertutup: setiap kondisi yang
 * tidak terpenuhi menolak baris. Filter SQL hanyalah optimasi; ini yang menjadi gerbang privasi.
 */
export function evaluateCandidate(candidate: SearchCandidate, rules: EvaluationRules): Evaluation {
  if (candidate.userId === rules.searcherId) return deny("self");
  if (candidate.status !== "ACTIVE" || candidate.deleted) return deny("inactive");
  if (rules.requireVerifiedEmail !== false && !candidate.emailVerified) return deny("email-unverified");
  if (!candidate.isDiscoverable) return deny("not-discoverable");
  if (candidate.blockedEitherWay) return deny("blocked");

  const accounts = candidate.accounts.filter(
    (account) => account.isDiscoverable && account.platformActive,
  );
  if (accounts.length === 0) return deny("no-discoverable-account");

  if (rules.usernameQuery) {
    if (!candidate.searchableByUsername) return deny("username-search-off");
    if (!candidate.usernameMatched) {
      if (!candidate.handleMatched || rules.allowHandleMatch === false) return deny("no-match");
      // Cocok lewat handle sosmed berarti membuka bahwa orang ini punya handle itu.
      // Bila daftar platform disembunyikan, kecocokan semacam itu tidak boleh terjadi.
      if (!candidate.showPlatforms) return deny("handle-hidden");
    }
  }

  if (rules.platformKey !== null) {
    // Filter platform pada pengguna yang menyembunyikan platform = membocorkan platformnya.
    if (!candidate.showPlatforms) return deny("platform-hidden");
    if (!accounts.some((account) => account.platformKey === rules.platformKey)) {
      return deny("platform-no-match");
    }
  }

  const distanceKnown =
    candidate.locationEnabled &&
    candidate.visibility === "DISCOVERABLE_RADIUS" &&
    candidate.distanceM !== null &&
    candidate.discoverableRadiusM !== null;

  if (rules.radiusKm !== null) {
    if (!distanceKnown) return deny("radius-not-allowed");
    if (
      !withinDiscoverableRadius(
        (candidate.distanceM as number) / 1000,
        rules.radiusKm,
        candidate.discoverableRadiusM as number,
      )
    ) {
      return deny("out-of-radius");
    }
  }

  const projection: PublicLocation = candidate.locationEnabled
    ? projectLocation(candidate.visibility, {
        areaLabel: candidate.areaLabel,
        cityLabel: candidate.cityLabel,
      })
    : { distanceAllowed: false };

  const result: SearchResultDto = {
    username: candidate.username,
    displayName: candidate.displayName,
    accounts: candidate.showPlatforms ? accounts.map(toAccountDto) : [],
  };
  if (projection.area !== undefined) result.area = projection.area;
  if (projection.city !== undefined) result.city = projection.city;

  // Jarak hanya bila diizinkan DAN pencari berada dalam radius yang dipilih target.
  if (
    projection.distanceAllowed &&
    distanceKnown &&
    (candidate.distanceM as number) <= (candidate.discoverableRadiusM as number)
  ) {
    result.distanceKm = roundDistanceKm((candidate.distanceM as number) / 1000);
  }
  return { ok: true, result };
}
