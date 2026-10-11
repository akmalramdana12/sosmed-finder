import { describe, expect, it } from "vitest";
import { AppError, toErrorResponse } from "./app-error";

describe("toErrorResponse", () => {
  it("memetakan AppError ke status dan kode yang benar", () => {
    const result = toErrorResponse(new AppError("RATE_LIMITED", "Terlalu banyak"), "req-1");
    expect(result.status).toBe(429);
    expect(result.body.error).toEqual({
      code: "RATE_LIMITED",
      message: "Terlalu banyak",
      requestId: "req-1",
    });
  });

  it("tidak membocorkan pesan error tak dikenal", () => {
    const result = toErrorResponse(new Error("password=hunter2 db down"), "req-2");
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("hunter2");
    expect(result.body.error.code).toBe("INTERNAL");
  });
});
