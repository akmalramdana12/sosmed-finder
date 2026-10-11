import { describe, expect, it } from "vitest";
import { PLATFORM_SEEDS } from "./platforms";

describe("PLATFORM_SEEDS", () => {
  it("key unik dan lowercase", () => {
    const keys = PLATFORM_SEEDS.map((platform) => platform.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toBe(key.toLowerCase());
  });

  it("template https dan memuat tepat satu {username}", () => {
    for (const { urlTemplate } of PLATFORM_SEEDS) {
      expect(urlTemplate.startsWith("https://")).toBe(true);
      expect(urlTemplate.split("{username}").length - 1).toBe(1);
    }
  });

  it("template menghasilkan URL valid", () => {
    for (const { urlTemplate } of PLATFORM_SEEDS) {
      const url = new URL(urlTemplate.replace("{username}", "alex"));
      expect(url.protocol).toBe("https:");
    }
  });
});
