import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const SECRET = "x".repeat(40);

describe("loadEnv", () => {
  it("menolak SESSION_SECRET pendek", () => {
    expect(() => loadEnv({ SESSION_SECRET: "pendek" })).toThrow();
  });

  it("production wajib REDIS_URL", () => {
    expect(() => loadEnv({ NODE_ENV: "production", SESSION_SECRET: SECRET, SMTP_URL: "smtps://u:p@h:465" })).toThrow();
  });

  it("production wajib SMTP_URL", () => {
    expect(() =>
      loadEnv({ NODE_ENV: "production", SESSION_SECRET: SECRET, REDIS_URL: "redis://localhost:6379" }),
    ).toThrow();
  });

  it("publicOrigin = origin pertama APP_ORIGIN", () => {
    const env = loadEnv({ SESSION_SECRET: SECRET, APP_ORIGIN: "https://a.example.com/x, http://localhost:3000" });
    expect(env.publicOrigin).toBe("https://a.example.com");
  });

  it("cookie secure hanya di production", () => {
    const production = loadEnv({
      NODE_ENV: "production",
      SESSION_SECRET: SECRET,
      REDIS_URL: "redis://localhost:6379",
      SMTP_URL: "smtps://u:p@h:465",
    });
    const development = loadEnv({ SESSION_SECRET: SECRET });
    expect(production.secureCookies).toBe(true);
    expect(development.secureCookies).toBe(false);
  });

  it("APP_ORIGIN dinormalisasi menjadi daftar origin", () => {
    const env = loadEnv({
      SESSION_SECRET: SECRET,
      APP_ORIGIN: "https://a.example.com/path, http://localhost:3000",
    });
    expect(env.allowedOrigins).toEqual(["https://a.example.com", "http://localhost:3000"]);
  });

  it("TRUST_PROXY default false", () => {
    expect(loadEnv({ SESSION_SECRET: SECRET }).trustProxy).toBe(false);
    expect(loadEnv({ SESSION_SECRET: SECRET, TRUST_PROXY: "true" }).trustProxy).toBe(true);
  });

  it("REQUIRE_VERIFIED_EMAIL: default true, boleh dimatikan di luar production, dilarang di production", () => {
    expect(loadEnv({ SESSION_SECRET: SECRET }).requireVerifiedEmail).toBe(true);
    expect(loadEnv({ SESSION_SECRET: SECRET, REQUIRE_VERIFIED_EMAIL: "false" }).requireVerifiedEmail).toBe(false);
    expect(() => loadEnv({ SESSION_SECRET: SECRET, REQUIRE_VERIFIED_EMAIL: "iya" })).toThrow();
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        SESSION_SECRET: SECRET,
        REDIS_URL: "redis://localhost:6379",
        SMTP_URL: "smtps://u:p@h:465",
        REQUIRE_VERIFIED_EMAIL: "false",
      }),
    ).toThrow();
  });
});
