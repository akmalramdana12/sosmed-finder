import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

const NONCE = "bm9uY2UtdWppLTEyMw==";
const directive = (csp: string, name: string): string =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("generateNonce", () => {
  it("unik per panggilan dan hanya berisi karakter base64", () => {
    const values = new Set(Array.from({ length: 200 }, () => generateNonce()));
    expect(values.size).toBe(200);
    for (const value of values) expect(/^[A-Za-z0-9+/=]+$/.test(value)).toBe(true);
  });
});

describe("buildCsp (production)", () => {
  const csp = buildCsp({ nonce: NONCE, isProd: true });

  it("skrip hanya dengan nonce + strict-dynamic; tanpa unsafe-inline dan unsafe-eval", () => {
    const script = directive(csp, "script-src");
    expect(script).toBe(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(script.includes("unsafe-inline")).toBe(false);
    expect(script.includes("unsafe-eval")).toBe(false);
  });

  it("menutup objek, base-uri, form, dan framing", () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("tidak ada wildcard sumber atau skema http", () => {
    expect(/\s\*(\s|;|$)/.test(csp)).toBe(false);
    expect(csp.includes("http:")).toBe(false);
    expect(csp.includes("https:")).toBe(false);
  });

  it("nonce berbeda menghasilkan kebijakan berbeda", () => {
    expect(buildCsp({ nonce: "AAAA", isProd: true })).not.toBe(csp);
  });
});

describe("buildCsp (development)", () => {
  it("hanya development yang boleh unsafe-eval, dan tanpa upgrade-insecure-requests", () => {
    const csp = buildCsp({ nonce: NONCE, isProd: false });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(csp.includes("upgrade-insecure-requests")).toBe(false);
  });
});
