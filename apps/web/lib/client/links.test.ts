import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./links";

describe("safeExternalUrl", () => {
  it("menerima http dan https", () => {
    expect(safeExternalUrl("https://instagram.com/ada")).toBe("https://instagram.com/ada");
    expect(safeExternalUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("menolak skema berbahaya dan input rusak", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.test", "//evil.test", "", "bukan url", " javascript:alert(1)"]) {
      expect(safeExternalUrl(bad)).toBeNull();
    }
  });
});
