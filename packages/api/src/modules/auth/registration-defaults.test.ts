import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./prisma-repositories.ts", import.meta.url), "utf8");

describe("registrasi memakai default aman dari skema", () => {
  it("PrivacySettings dibuat tanpa nilai eksplisit (isDiscoverable=false, visibilitas PRIVATE)", () => {
    expect(source).toContain("privacy: { create: {} }");
  });

  it("registrasi tidak membuat Location atau SocialAccount", () => {
    const createBlock = source.slice(source.indexOf("async create(user: NewUser)"));
    expect(createBlock.slice(0, createBlock.indexOf("} catch"))).not.toMatch(
      /location|socialAccount/i,
    );
  });
});
