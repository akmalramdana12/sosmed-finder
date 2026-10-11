import { describe, expect, it } from "vitest";
import { InvalidProfileUrlError, buildProfileUrl } from "./profile-url";

describe("buildProfileUrl", () => {
  it("membangun URL dari template", () => {
    expect(buildProfileUrl("https://www.instagram.com/{username}", "alex_99")).toBe(
      "https://www.instagram.com/alex_99",
    );
    expect(buildProfileUrl("https://www.tiktok.com/@{username}", "alex.id")).toBe(
      "https://www.tiktok.com/@alex.id",
    );
  });

  it.each([
    "a/b",
    "a?x=1",
    "a#b",
    "../x",
    "evil.com@x",
    "a b",
    "a%2Fb",
    "",
    "alex.",
    "a".repeat(51),
  ])("menolak username tidak aman: %s", (username) => {
    expect(() => buildProfileUrl("https://github.com/{username}", username)).toThrow();
  });

  it.each([
    "http://github.com/{username}", // bukan https
    "https://{username}.evil.com/", // placeholder di host
    "https://github.com/", // tanpa placeholder
    "https://github.com/{username}/{username}", // placeholder ganda
    "https://user:pw@github.com/{username}", // kredensial di URL
    "https://github.com:8080/{username}", // port
    "javascript:alert(1)//{username}",
    "//github.com/{username}",
  ])("menolak template tidak valid: %s", (template) => {
    expect(() => buildProfileUrl(template, "alex")).toThrow(InvalidProfileUrlError);
  });

  it("host hasil selalu sama dengan host template", () => {
    const url = new URL(buildProfileUrl("https://github.com/{username}", "alex"));
    expect(url.hostname).toBe("github.com");
    expect(url.protocol).toBe("https:");
  });
});
