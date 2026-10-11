import { AppError } from "./app-error";

/** 429. `retryAfterSec` dipakai route handler untuk header Retry-After. */
export class RateLimitedError extends AppError {
  readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super("RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi nanti.");
    this.name = "RateLimitedError";
    this.retryAfterSec = Math.max(1, Math.ceil(retryAfterSec));
  }
}
