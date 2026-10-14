import { prisma } from "@social-finder/database";
import { buildSearchQuery } from "./search-sql";
import type {
  CandidateAccount,
  SearchCandidate,
  SearchCriteria,
  SearchLogEntry,
  SearchRepository,
} from "./types";

type Row = Record<string, unknown>;

const STATUSES = ["ACTIVE", "SUSPENDED", "PENDING_DELETION"] as const;
const VISIBILITIES = ["PRIVATE", "AREA_ONLY", "CITY_ONLY", "DISCOVERABLE_RADIUS"] as const;

function str(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`kolom ${key} bukan string`);
  return value;
}
function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}
function bool(row: Row, key: string): boolean {
  return row[key] === true;
}
function nullableNum(row: Row, key: string): number | null {
  const value = row[key];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

function parseAccounts(value: unknown): CandidateAccount[] {
  const raw: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(raw)) return [];
  const accounts: CandidateAccount[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const a = item as Row;
    if (
      typeof a["platformKey"] !== "string" ||
      typeof a["username"] !== "string" ||
      typeof a["profileUrl"] !== "string"
    ) {
      continue;
    }
    accounts.push({
      platformKey: a["platformKey"],
      username: a["username"],
      profileUrl: a["profileUrl"],
      isVerified: a["isVerified"] === true,
      isDiscoverable: a["isDiscoverable"] === true,
      platformActive: a["platformActive"] === true,
    });
  }
  return accounts;
}

/**
 * Nilai yang tidak dikenal menjadi nilai paling membatasi (status non-ACTIVE, visibilitas PRIVATE),
 * sehingga baris rusak ditolak oleh `evaluateCandidate` dan bukan ditampilkan.
 */
function toCandidate(row: Row): SearchCandidate {
  const status = STATUSES.find((s) => s === row["status"]) ?? "SUSPENDED";
  const visibility = VISIBILITIES.find((v) => v === row["visibility"]) ?? "PRIVATE";
  return {
    userId: str(row, "userId"),
    username: str(row, "username"),
    normalizedUsername: str(row, "normalizedUsername"),
    displayName: str(row, "displayName"),
    status,
    deleted: bool(row, "deleted"),
    emailVerified: bool(row, "emailVerified"),
    isDiscoverable: bool(row, "isDiscoverable"),
    searchableByUsername: bool(row, "searchableByUsername"),
    showPlatforms: bool(row, "showPlatforms"),
    blockedEitherWay: row["blockedEitherWay"] !== false,
    visibility,
    locationEnabled: bool(row, "locationEnabled"),
    areaLabel: nullableStr(row, "areaLabel"),
    cityLabel: nullableStr(row, "cityLabel"),
    discoverableRadiusM: nullableNum(row, "discoverableRadiusM"),
    distanceM: nullableNum(row, "distanceM"),
    distanceUnits: nullableNum(row, "distanceUnits"),
    usernameMatched: bool(row, "usernameMatched"),
    handleMatched: bool(row, "handleMatched"),
    accounts: parseAccounts(row["accounts"]),
  };
}

export class PrismaSearchRepository implements SearchRepository {
  async search(criteria: SearchCriteria): Promise<SearchCandidate[]> {
    const { text, values } = buildSearchQuery(criteria);
    // $queryRawUnsafe dengan teks STATIS dan nilai terikat ($1..$n): nama "Unsafe" hanya berarti
    // Prisma tidak membangun teks dari template literal. Tidak ada input pengguna di dalam teks.
    const rows = await prisma.$queryRawUnsafe<Row[]>(text, ...values);
    return rows.map(toCandidate);
  }

  async findByUsername(
    searcherId: string,
    normalizedUsername: string,
    requireVerifiedEmail: boolean,
  ): Promise<SearchCandidate | null> {
    const { text, values } = buildSearchQuery({
      searcherId,
      query: { text: normalizedUsername, mode: "exact", includeHandles: false },
      platformKey: null,
      requireVerifiedEmail,
      radiusM: null,
      sort: "username",
      fetchLimit: 1,
      after: null,
    });
    const rows = await prisma.$queryRawUnsafe<Row[]>(text, ...values);
    const first = rows[0];
    return first ? toCandidate(first) : null;
  }

  async hasEnabledLocation(searcherId: string): Promise<boolean> {
    const row = await prisma.location.findFirst({
      where: { userId: searcherId, isEnabled: true },
      select: { id: true },
    });
    return row !== null;
  }

  async isEmailVerified(userId: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: { id: userId, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    return user !== null;
  }

  async logSearch(entry: SearchLogEntry): Promise<void> {
    await prisma.searchLog.create({
      data: {
        searcherId: entry.searcherId,
        queryHash: entry.queryHash,
        filters: entry.filters,
        resultCount: entry.resultCount,
      },
    });
  }

  async countRecentSearches(searcherId: string, windowSec: number): Promise<number> {
    return prisma.searchLog.count({
      where: { searcherId, createdAt: { gte: new Date(Date.now() - windowSec * 1000) } },
    });
  }
}
