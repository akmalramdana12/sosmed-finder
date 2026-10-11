import { describe, expect, it } from "vitest";
import { updatePrivacySchema } from "./privacy";

describe("updatePrivacySchema", () => {
  it("menerima update parsial", () => {
    expect(updatePrivacySchema.parse({ isDiscoverable: true })).toEqual({ isDiscoverable: true });
    expect(
      updatePrivacySchema.parse({ showPlatforms: false, searchableByUsername: false }),
    ).toEqual({
      showPlatforms: false,
      searchableByUsername: false,
    });
  });

  it("menolak objek kosong", () => {
    expect(updatePrivacySchema.safeParse({}).success).toBe(false);
  });

  it("opt-in harus boolean sungguhan: string dan angka ditolak", () => {
    expect(updatePrivacySchema.safeParse({ isDiscoverable: "true" }).success).toBe(false);
    expect(updatePrivacySchema.safeParse({ isDiscoverable: 1 }).success).toBe(false);
    expect(updatePrivacySchema.safeParse({ isDiscoverable: null }).success).toBe(false);
  });

  it.each(["locationVisibility", "discoverableRadius", "userId", "id", "status"])(
    "menolak field %s (lokasi hanya lewat /api/me/location)",
    (field) => {
      expect(
        updatePrivacySchema.safeParse({ isDiscoverable: true, [field]: "PRIVATE" }).success,
      ).toBe(false);
    },
  );
});
