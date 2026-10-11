import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Bukti "opt-in by default": default aman dibaca langsung dari schema.prisma, sehingga
 * mengubahnya menjadi lebih longgar membuat test ini gagal.
 */
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

function modelBlock(kind: "model" | "enum", name: string): string {
  const match = new RegExp(`^${kind} ${name} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  if (!match?.[1]) throw new Error(`${kind} ${name} tidak ditemukan di schema.prisma`);
  return match[1];
}

function fieldLine(model: string, field: string): string {
  const line = modelBlock("model", model)
    .split("\n")
    .find((candidate) => new RegExp(`^\\s+${field}\\s`).test(candidate));
  if (!line) throw new Error(`field ${model}.${field} tidak ditemukan`);
  return line;
}

describe("default schema: tidak ada yang terbuka sebelum pengguna memilih", () => {
  it("PrivacySettings.isDiscoverable = false", () => {
    expect(fieldLine("PrivacySettings", "isDiscoverable")).toContain("@default(false)");
  });

  it("PrivacySettings.locationVisibility = PRIVATE", () => {
    expect(fieldLine("PrivacySettings", "locationVisibility")).toContain("@default(PRIVATE)");
  });

  it("Location.isEnabled = false", () => {
    expect(fieldLine("Location", "isEnabled")).toContain("@default(false)");
  });

  it("SocialAccount.isDiscoverable dan isVerified = false", () => {
    expect(fieldLine("SocialAccount", "isDiscoverable")).toContain("@default(false)");
    expect(fieldLine("SocialAccount", "isVerified")).toContain("@default(false)");
  });

  it("enum LocationVisibility dimulai dari PRIVATE", () => {
    const first = modelBlock("enum", "LocationVisibility")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    expect(first).toBe("PRIVATE");
  });
});
