/** Pemanggil API untuk komponen klien. Same-origin: browser mengirim cookie sesi dan header Origin sendiri. */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; retryAfterSec: number | null };

interface ErrorBody {
  error?: { message?: unknown; details?: unknown };
}

function pickMessage(body: ErrorBody | null, fallback: string): string {
  const details = body?.error?.details;
  if (Array.isArray(details)) {
    const first: unknown = details[0];
    if (typeof first === "object" && first !== null && "message" in first && typeof first.message === "string") {
      return first.message;
    }
  }
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export async function apiRequest<T>(
  url: string,
  options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const method = options.method ?? "GET";
  try {
    const response = await fetch(url, {
      method,
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.ok) return { ok: true, data: body as T };
    const retryHeader = Number(response.headers.get("Retry-After"));
    const retryAfterSec = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : null;
    if (response.status === 429) {
      const wait = retryAfterSec === null ? "" : ` Coba lagi dalam ${retryAfterSec} detik.`;
      return { ok: false, status: 429, message: `Terlalu banyak percobaan.${wait}`, retryAfterSec };
    }
    return {
      ok: false,
      status: response.status,
      message: pickMessage(body as ErrorBody | null, "Terjadi kesalahan. Coba lagi."),
      retryAfterSec,
    };
  } catch {
    return { ok: false, status: 0, message: "Tidak dapat terhubung ke server. Periksa koneksi Anda.", retryAfterSec: null };
  }
}

/** Ambil token dari fragmen URL (#token=...) lalu hapus dari bilah alamat agar tidak tersimpan di riwayat. */
export function takeTokenFromHash(): string | null {
  const match = /(?:^#|&)token=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
  if (match === null) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return match[1] ?? null;
}
