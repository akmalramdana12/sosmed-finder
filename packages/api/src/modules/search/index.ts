// Entry point "murni" (tanpa Prisma): aman dipakai di test.
export { decodeCursor, encodeCursor } from "./cursor";
export type { CursorBinding } from "./cursor";
export { evaluateCandidate } from "./eligibility";
export type { Evaluation, EvaluationRules, RejectReason } from "./eligibility";
export { SEARCH_LIMITS, SUSPICIOUS_SEARCH, SearchService } from "./search-service";
export type { SearchCommand, SearchDeps } from "./search-service";
export { buildSearchQuery, escapeLike } from "./search-sql";
export type { BuiltQuery } from "./search-sql";
export type {
  CandidateAccount,
  CursorKey,
  SearchCandidate,
  SearchCriteria,
  SearchLogEntry,
  SearchRepository,
} from "./types";
