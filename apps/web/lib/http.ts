import { AppError, toErrorResponse } from "@social-finder/api";
import { RateLimitedError, getClientIp, isSameOrigin } from "@social-finder/api/auth";
import type { RequestContext } from "@social-finder/api/auth";
import { ZodError } from "zod";
import { getEnv, type AppEnv } from "./env";

const MAX_BODY_CHARS = 16 * 1024;

export interface HandlerContext extends RequestContext {
  requestId: string;
  env: AppEnv;
}

function json(body: unknown, status: number, requestId: string, extra?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...extra },
  });
}

/** Log hanya nama error dan requestId: pesan error bisa memuat data sensitif (email, DSN). */
function logError(requestId: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      name: error instanceof Error ? error.name : "unknown",
    }),
  );
}

function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Input tidak valid",
          details: error.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message,
          })),
          requestId,
        },
      },
      400,
      requestId,
    );
  }
  if (error instanceof RateLimitedError) {
    const { status, body } = toErrorResponse(error, requestId);
    return json(body, status, requestId, { "Retry-After": String(error.retryAfterSec) });
  }
  if (error instanceof AppError) {
    const { status, body } = toErrorResponse(error, requestId);
    return json(body, status, requestId);
  }
  logError(requestId, error);
  const { status, body } = toErrorResponse(error, requestId);
  return json(body, status, requestId);
}

/**
 * Pembungkus semua route handler: request id, cek Origin untuk mutasi, error seragam,
 * dan Cache-Control: no-store.
 */
export async function handleRequest(
  request: Request,
  options: { mutation: boolean },
  handler: (ctx: HandlerContext) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();

  let env: AppEnv;
  try {
    env = getEnv();
  } catch (error) {
    logError(requestId, error);
    const { status, body } = toErrorResponse(
      new Error("konfigurasi server tidak valid"),
      requestId,
    );
    return json(body, status, requestId);
  }

  try {
    if (options.mutation && !isSameOrigin(request.headers, env.allowedOrigins)) {
      throw new AppError("FORBIDDEN", "Origin tidak diizinkan");
    }
    const response = await handler({
      requestId,
      env,
      ip: getClientIp(request.headers, env.trustProxy),
      userAgent: request.headers.get("user-agent"),
    });
    // Handler boleh menetapkan Cache-Control sendiri (mis. daftar platform publik); default no-store.
    if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/** Baca body JSON dengan batas ukuran. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    throw new AppError("VALIDATION_ERROR", "Body terlalu besar");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body harus berupa JSON yang valid");
  }
}
