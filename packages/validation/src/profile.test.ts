import { describe, expect, it } from "vitest";
import { registerSchema } from "./auth";
import { updateProfileSchema } from "./profile";
import { cleanMultiLine, cleanSingleLine } from "./text";

describe("updateProfileSchema", () => {
  it("menerima update parsial", () => {
    expect(updateProfileSchema.parse({ displayName: "  Alex  " })).toEqual({
      displayName: "Alex",
    });
    expect(updateProfileSchema.parse({ username: "alex_99" })).toEqual({ username: "alex_99" });
  });

  it("menolak objek kosong", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it.each(["id", "userId", "email", "status", "passwordHash", "normalizedUsername"])(
    "menolak field terlarang: %s (mass assignment / IDOR via body)",
    (field) => {
      expect(updateProfileSchema.safeParse({ displayName: "Alex", [field]: "x" }).success).toBe(
        false,
      );
    },
  );

  it("bio kosong atau spasi menjadi null; null dipertahankan", () => {
    expect(updateProfileSchema.parse({ bio: "   " })).toEqual({ bio: null });
    expect(updateProfileSchema.parse({ bio: null })).toEqual({ bio: null });
  });

  it("menolak bio > 500 karakter dan displayName kosong atau > 80", () => {
    expect(updateProfileSchema.safeParse({ bio: "a".repeat(501) }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: "   " }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: "a".repeat(81) }).success).toBe(false);
  });

  it("menolak username tidak valid", () => {
    expect(updateProfileSchema.safeParse({ username: "a b" }).success).toBe(false);
  });
});

describe("pembersihan teks", () => {
  it("displayName: newline/tab jadi spasi, kontrol dan bidi dibuang", () => {
    expect(cleanSingleLine("Alex\nSmith\t‮evil\u0000")).toBe("Alex Smith evil");
    expect(cleanSingleLine("a    b")).toBe("a b");
  });

  it("zero-width tak terlihat dibuang, ZWJ (emoji/aksara) dipertahankan", () => {
    expect(cleanSingleLine("A​B")).toBe("AB");
    expect(cleanSingleLine("A‍B")).toBe("A‍B");
  });

  it("bio: newline dipertahankan, CRLF dinormalisasi, baris kosong dibatasi", () => {
    expect(cleanMultiLine("baris1\r\n\r\n\r\n\r\nbaris2\u0007")).toBe("baris1\n\nbaris2");
  });

  it("normalisasi NFC", () => {
    expect(cleanSingleLine("é")).toBe("é");
  });
});

describe("registerSchema displayName", () => {
  it("memakai pembersihan yang sama", () => {
    const result = registerSchema.parse({
      email: "a@b.co",
      username: "alex",
      password: "a-long-enough-pass",
      displayName: "  Al\nex ",
    });
    expect(result.displayName).toBe("Al ex");
  });
});
