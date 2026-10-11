import { AppError, RateLimitedError } from "@social-finder/api";
import { loginSchema } from "@social-finder/validation";
import { describe, expect, it } from "vitest";
import { handleRequest, readJson } from "./http";

process.env.SESSION_SECRET = "x".repeat(40);
process.env.APP_ORIGIN = "https://app.example.com";

const ORIGIN = { origin: "https://app.example.com" };

function post(headers: Record<string, string>, body = "{}"): Request {
  return new Request("https://app.example.com/api/x", { method: "POST", headers, body });
}

const ok = async () => Response.json({ ok: true });

/** Jalankan fungsi sambil menangkap console.error (log error diharapkan di beberapa kasus). */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const original = console.error;
  let logged = "";
  console.error = (message?: unknown) => {
    logged += String(message);
  };
  try {
    return { result: await fn(), logged };
  } finally {
    console.error = original;
  }
}

describe("handleRequest: CSRF", () => {
  it("menolak POST dari origin asing (403)", async () => {
    const response = await handleRequest(
      post({ origin: "https://evil.example" }),
      { mutation: true },
      ok,
    );
    expect(response.status).toBe(403);
  });

  it("menolak POST tanpa Origin/Referer (403)", async () => {
    const response = await handleRequest(post({}), { mutation: true }, ok);
    expect(response.status).toBe(403);
  });

  it("GET tidak membutuhkan Origin", async () => {
    const response = await handleRequest(
      new Request("https://app.example.com/api/x"),
      { mutation: false },
      ok,
    );
    expect(response.status).toBe(200);
  });
});

describe("handleRequest: respons", () => {
  it("menambahkan no-store dan X-Request-Id", async () => {
    const response = await handleRequest(post(ORIGIN), { mutation: true }, ok);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("RateLimitedError menjadi 429 dengan Retry-After", async () => {
    const { result } = await captureErrors(() =>
      handleRequest(post(ORIGIN), { mutation: true }, async () => {
        throw new RateLimitedError(42);
      }),
    );
    expect(result.status).toBe(429);
    expect(result.headers.get("retry-after")).toBe("42");
  });

  it("AppError dipetakan ke status dan kode-nya", async () => {
    const response = await handleRequest(post(ORIGIN), { mutation: true }, async () => {
      throw new AppError("CONFLICT", "Username sudah dipakai");
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("error tak dikenal: 500 tanpa membocorkan pesan, log tanpa pesan", async () => {
    const { result, logged } = await captureErrors(() =>
      handleRequest(post(ORIGIN), { mutation: true }, async () => {
        throw new Error("postgres://user:SECRET@db/x email=a@b.co");
      }),
    );
    const body = JSON.stringify(await result.json());
    expect(result.status).toBe(500);
    expect(body).not.toContain("SECRET");
    expect(logged).not.toContain("SECRET");
    expect(logged).not.toContain("a@b.co");
  });

  it("ZodError menjadi 400 berisi path, tanpa nilai input", async () => {
    const response = await handleRequest(post(ORIGIN), { mutation: true }, async () => {
      loginSchema.parse({ email: "bukan-email", password: "rahasia123" });
      return Response.json({});
    });
    const serialized = JSON.stringify(await response.json());
    expect(response.status).toBe(400);
    expect(serialized).toContain("VALIDATION_ERROR");
    expect(serialized).toContain("email");
    expect(serialized).not.toContain("rahasia123");
    expect(serialized).not.toContain("bukan-email");
  });
});

describe("readJson", () => {
  it("menolak JSON rusak", async () => {
    await expect(readJson(post(ORIGIN, "{rusak"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("menolak body lebih dari 16 KB", async () => {
    await expect(readJson(post(ORIGIN, "x".repeat(20_000)))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("mem-parse JSON valid", async () => {
    expect(await readJson(post(ORIGIN, '{"a":1}'))).toEqual({ a: 1 });
  });
});

describe("handleRequest: Cache-Control", () => {
  it("tidak menimpa Cache-Control yang ditetapkan handler", async () => {
    const response = await handleRequest(post(ORIGIN), { mutation: true }, async () =>
      Response.json({}, { headers: { "Cache-Control": "public, max-age=300" } }),
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
  });
});
