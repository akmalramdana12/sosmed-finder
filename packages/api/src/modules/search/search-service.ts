import type { SearchResponseDto, SearchResultDto, SearchSort } from "@social-finder/types";
import { AppError } from "../../errors/app-error";
import { RateLimitedError } from "../../errors/rate-limited-error";
import type { RateLimiter } from "../auth/rate-limit";
import { hashIdentifier } from "../auth/tokens";
import type { AuditWriter } from "../auth/types";
import { decodeCursor, encodeCursor, type CursorBinding } from "./cursor";
import { evaluateCandidate, type EvaluationRules } from "./eligibility";
import type { CursorKey, SearchCandidate, SearchCriteria, SearchRepository } from "./types";

interface LimitRule {
  readonly limit: number;
  readonly windowSec: number;
}

export const SEARCH_LIMITS = {
  /** Sesuai kontrak API: 30/menit per pengguna. */
  perMinute: { limit: 30, windowSec: 60 },
  /**
   * Batas harian melawan enumerasi pelan-pelan: tanpa ini, awalan 2 karakter bisa dipindai
   * berhari-hari dalam batas per menit. Mudah diatur, tapi jangan dilonggarkan tanpa alasan.
   */
  perDay: { limit: 300, windowSec: 86_400 },
  profilePerMinute: { limit: 60, windowSec: 60 },
  profilePerDay: { limit: 1000, windowSec: 86_400 },
} as const satisfies Record<string, LimitRule>;

/**
 * Pola scraping: pencarian terus-menerus mendekati batas per menit selama satu jam. Di bawah ini
 * pengguna wajar (mengetik beberapa kata kunci); di atasnya terlihat seperti pemindaian awalan.
 * Hanya MENANDAI (audit `search.suspicious`) untuk ditinjau manusia: tidak memblokir otomatis,
 * karena ambang tebakan bisa salah dan memblokir orang tak bersalah juga merugikan.
 */
export const SUSPICIOUS_SEARCH = {
  windowSec: 3600,
  threshold: 120,
  /** Satu tanda per pencari per jam, supaya log audit tidak dibanjiri. */
  flagEverySec: 3600,
} as const;

export interface SearchDeps {
  repository: SearchRepository;
  limiter: RateLimiter;
  hmacSecret: string;
  /** Opsional: bila ada, pola pencarian mencurigakan dicatat ke audit. */
  audit?: AuditWriter;
  /**
   * Default true. Pencari DAN hasil wajib berakun dengan email terverifikasi: tanpa ini, akun sekali
   * pakai bisa dibuat massal untuk memindai atau untuk muncul di pencarian. `false` hanya untuk
   * lingkungan tanpa email (pengembangan/e2e).
   */
  requireVerifiedEmail?: boolean;
}

export interface SearchCommand {
  q?: string | undefined;
  mode: "exact" | "prefix";
  platform?: string | undefined;
  radiusKm?: number | undefined;
  sort?: SearchSort | undefined;
  limit: number;
  cursor?: string | undefined;
}

export class SearchService {
  private readonly deps: SearchDeps;

  constructor(deps: SearchDeps) {
    this.deps = deps;
  }

  private get requireVerifiedEmail(): boolean {
    return this.deps.requireVerifiedEmail !== false;
  }

  private async assertSearcherVerified(searcherId: string): Promise<void> {
    if (this.requireVerifiedEmail && !(await this.deps.repository.isEmailVerified(searcherId))) {
      throw new AppError("FORBIDDEN", "Verifikasi email Anda terlebih dahulu (menu Akun) untuk memakai pencarian");
    }
  }

  async search(searcherId: string, command: SearchCommand): Promise<SearchResponseDto> {
    await this.enforce(`search:min:${searcherId}`, SEARCH_LIMITS.perMinute);
    await this.enforce(`search:day:${searcherId}`, SEARCH_LIMITS.perDay);
    await this.assertSearcherVerified(searcherId);

    // Pertahanan kedua di luar skema: tanpa q maupun radius = "daftar semua orang".
    if (command.q === undefined && command.radiusKm === undefined) {
      throw new AppError("VALIDATION_ERROR", "Isi kata kunci atau radius");
    }
    const sort: SearchSort = command.sort ?? (command.radiusKm !== undefined ? "distance" : "username");
    if (sort === "distance" && command.radiusKm === undefined) {
      throw new AppError("VALIDATION_ERROR", "Urutan jarak membutuhkan radius");
    }

    const radiusM = command.radiusKm !== undefined ? command.radiusKm * 1000 : null;
    if (radiusM !== null && !(await this.deps.repository.hasEnabledLocation(searcherId))) {
      // Titik pencari = lokasi tersimpannya sendiri; tidak ada input koordinat per pencarian.
      throw new AppError("VALIDATION_ERROR", "Atur dan aktifkan lokasi Anda sebelum mencari berdasarkan jarak");
    }

    const binding: CursorBinding = {
      searcherId,
      query: command.q ?? null,
      mode: command.q !== undefined ? command.mode : null,
      platformKey: command.platform ?? null,
      radiusM,
      sort,
    };
    let after: CursorKey | null = null;
    if (command.cursor !== undefined) {
      after = decodeCursor(command.cursor, binding, this.deps.hmacSecret);
      if (!after) throw new AppError("VALIDATION_ERROR", "Cursor tidak valid");
    }

    const criteria: SearchCriteria = {
      searcherId,
      query:
        command.q !== undefined
          ? { text: command.q, mode: command.mode, includeHandles: true }
          : null,
      platformKey: command.platform ?? null,
      requireVerifiedEmail: this.requireVerifiedEmail,
      radiusM,
      sort,
      fetchLimit: command.limit + 1,
      after,
    };
    const rows = await this.deps.repository.search(criteria);

    const hasMore = rows.length > command.limit;
    const page = rows.slice(0, command.limit);
    const rules: EvaluationRules = {
      searcherId,
      usernameQuery: command.q !== undefined,
      platformKey: command.platform ?? null,
      requireVerifiedEmail: this.requireVerifiedEmail,
      radiusKm: command.radiusKm ?? null,
    };

    const data: SearchResultDto[] = [];
    let rejected = 0;
    for (const row of page) {
      const evaluation = evaluateCandidate(row, rules);
      if (evaluation.ok) data.push(evaluation.result);
      else rejected += 1;
    }
    if (rejected > 0) {
      // Repositori mengembalikan baris yang seharusnya sudah disaring SQL: itu bug, bukan kejadian
      // normal. Hanya jumlah yang dilog, tanpa identitas siapa pun.
      console.error(JSON.stringify({ level: "error", msg: "search guard rejected rows", rejected }));
    }

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(this.keyOf(last, sort), binding, this.deps.hmacSecret) : null;

    await this.record(searcherId, command, sort, data.length);
    await this.flagIfSuspicious(searcherId);
    return { data, nextCursor };
  }

  /** Profil publik. "Tidak ada" dan "tidak boleh dilihat" menghasilkan 404 yang sama. */
  async getPublicProfile(searcherId: string, normalizedUsername: string): Promise<SearchResultDto> {
    await this.enforce(`profile:min:${searcherId}`, SEARCH_LIMITS.profilePerMinute);
    await this.enforce(`profile:day:${searcherId}`, SEARCH_LIMITS.profilePerDay);

    await this.assertSearcherVerified(searcherId);

    const notFound = new AppError("NOT_FOUND", "Profil tidak ditemukan");
    const candidate = await this.deps.repository.findByUsername(
      searcherId,
      normalizedUsername,
      this.requireVerifiedEmail,
    );
    if (!candidate) throw notFound;
    const evaluation = evaluateCandidate(candidate, {
      searcherId,
      usernameQuery: true,
      allowHandleMatch: false,
      platformKey: null,
      requireVerifiedEmail: this.requireVerifiedEmail,
      radiusKm: null,
    });
    if (!evaluation.ok) throw notFound;
    return evaluation.result;
  }

  private keyOf(row: SearchCandidate, sort: SearchSort): CursorKey {
    if (sort === "distance") {
      return { sort, value: row.distanceUnits ?? 0, userId: row.userId };
    }
    return { sort, value: row.normalizedUsername, userId: row.userId };
  }

  /** Catatan pencarian: best-effort, hanya hash query dan filter ringkas. Gagal tidak menggagalkan pencarian. */
  private async record(
    searcherId: string,
    command: SearchCommand,
    sort: SearchSort,
    resultCount: number,
  ): Promise<void> {
    try {
      await this.deps.repository.logSearch({
        searcherId,
        queryHash: hashIdentifier(command.q ?? "", this.deps.hmacSecret),
        filters: {
          mode: command.q !== undefined ? command.mode : null,
          platform: command.platform ?? null,
          radiusKm: command.radiusKm ?? null,
          sort,
          hasQuery: command.q !== undefined,
        },
        resultCount,
      });
    } catch {
      console.error(JSON.stringify({ level: "error", msg: "search log write failed" }));
    }
  }

  /** Best-effort: kegagalan di sini tidak boleh menggagalkan pencarian. */
  private async flagIfSuspicious(searcherId: string): Promise<void> {
    if (!this.deps.audit) return;
    try {
      const count = await this.deps.repository.countRecentSearches(
        searcherId,
        SUSPICIOUS_SEARCH.windowSec,
      );
      if (count < SUSPICIOUS_SEARCH.threshold) return;
      const once = await this.deps.limiter.consume(
        `search:flag:${searcherId}`,
        1,
        SUSPICIOUS_SEARCH.flagEverySec,
      );
      if (!once.allowed) return;
      await this.deps.audit({
        action: "search.suspicious",
        actorId: searcherId,
        entity: "User",
        entityId: searcherId,
        ipHash: null,
        metadata: { count, windowSec: SUSPICIOUS_SEARCH.windowSec },
      });
    } catch {
      console.error(JSON.stringify({ level: "error", msg: "search abuse check failed" }));
    }
  }

  private async enforce(key: string, rule: LimitRule): Promise<void> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowSec);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterSec);
  }
}
