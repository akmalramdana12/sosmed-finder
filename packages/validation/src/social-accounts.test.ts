import { describe, expect, it } from "vitest";
import {
  createSocialAccountSchema,
  resourceIdSchema,
  socialUsernameSchema,
  updateSocialAccountSchema,
} from "./social-accounts";

describe("socialUsernameSchema", () => {
  it.each(["alex", "Alex_99", "a.b-c", "_x", "9lives"])("menerima %s", (value) => {
    expect(socialUsernameSchema.safeParse(value).success).toBe(true);
  });

  it("membuang satu @ di depan dan spasi", () => {
    expect(socialUsernameSchema.parse("  @alex ")).toBe("alex");
  });

  it.each([
    "",
    "@",
    "@@alex",
    "a/b",
    "https://instagram.com/alex",
    "a?x=1",
    "a#b",
    "a%2Fb",
    "a b",
    "../x",
    "evil.com@x",
    "alex.",
    "-alex",
    "ålex",
    "a".repeat(51),
  ])("menolak %s", (value) => {
    expect(socialUsernameSchema.safeParse(value).success).toBe(false);
  });
});

describe("createSocialAccountSchema", () => {
  it("menormalisasi platformKey", () => {
    expect(
      createSocialAccountSchema.parse({ platformKey: " Instagram ", username: "@alex" }),
    ).toEqual({ platformKey: "instagram", username: "alex" });
  });

  it.each(["isVerified", "profileUrl", "userId", "platformId", "id"])(
    "menolak field %s",
    (field) => {
      expect(
        createSocialAccountSchema.safeParse({
          platformKey: "instagram",
          username: "alex",
          [field]: true,
        }).success,
      ).toBe(false);
    },
  );
});

describe("updateSocialAccountSchema", () => {
  it("menerima update parsial dan menolak objek kosong", () => {
    expect(updateSocialAccountSchema.parse({ isDiscoverable: true })).toEqual({
      isDiscoverable: true,
    });
    expect(updateSocialAccountSchema.safeParse({}).success).toBe(false);
  });

  it("klien tidak bisa menyatakan dirinya terverifikasi atau mengganti URL", () => {
    expect(updateSocialAccountSchema.safeParse({ isVerified: true }).success).toBe(false);
    expect(
      updateSocialAccountSchema.safeParse({ username: "alex", profileUrl: "https://evil.example" })
        .success,
    ).toBe(false);
  });

  it("isDiscoverable harus boolean sungguhan", () => {
    expect(updateSocialAccountSchema.safeParse({ isDiscoverable: "true" }).success).toBe(false);
  });
});

describe("resourceIdSchema", () => {
  it("hanya menerima UUID", () => {
    expect(resourceIdSchema.safeParse("3f2b8c1e-9d4a-4b7e-8a61-2c5d9e0f1a34").success).toBe(true);
    expect(resourceIdSchema.safeParse("1").success).toBe(false);
    expect(resourceIdSchema.safeParse("../me").success).toBe(false);
  });
});
