import type { ApiErrorBody, ApiErrorCode } from "@social-finder/types";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown[] | undefined;

  constructor(code: ApiErrorCode, message: string, details?: unknown[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

/**
 * Ubah error apa pun menjadi respons seragam.
 * Error tak dikenal TIDAK membocorkan pesan internal.
 */
export function toErrorResponse(
  error: unknown,
  requestId: string,
): { status: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          requestId,
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Terjadi kesalahan internal", requestId } },
  };
}
