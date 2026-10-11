import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, type CursorBinding } from "./cursor";

const SECRET = "rahasia-uji-yang-cukup-panjang-1234567890";
const BINDING: CursorBinding = {
  searcherId: "99999999-9999-4999-8999-999999999999",
  query: "ale",
  mode: "prefix",
  platformKey: null,
  radiusM: null,
  sort: "username",
};
const KEY = { sort: "username", value: "alex", userId: "11111111-1111-4111-8111-111111111111" } as const;

describe("cursor", () => {
  it("bolak-balik utuh", () => {
    expect(decodeCursor(encodeCursor(KEY, BINDING, SECRET), BINDING, SECRET)).toEqual(KEY);
    const distance = { sort: "distance", value: 7, userId: KEY.userId } as const;
    const b = { ...BINDING, sort: "distance", radiusM: 5000 } as const;
    expect(decodeCursor(encodeCursor(distance, b, SECRET), b, SECRET)).toEqual(distance);
  });

  it("ditolak bila diubah", () => {
    const cursor = encodeCursor(KEY, BINDING, SECRET);
    const [payload, sig] = cursor.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify(["username", "a", KEY.userId])).toString("base64url");
    expect(decodeCursor(`${forged}.${sig}`, BINDING, SECRET)).toBeNull();
    expect(decodeCursor(`${payload}.${sig.slice(0, -1)}0`, BINDING, SECRET)).toBeNull();
  });

  it("ditolak bila dipakai pada query lain atau pengguna lain", () => {
    const cursor = encodeCursor(KEY, BINDING, SECRET);
    expect(decodeCursor(cursor, { ...BINDING, query: "alf" }, SECRET)).toBeNull();
    expect(decodeCursor(cursor, { ...BINDING, platformKey: "x" }, SECRET)).toBeNull();
    expect(decodeCursor(cursor, { ...BINDING, mode: "exact" }, SECRET)).toBeNull();
    expect(decodeCursor(cursor, { ...BINDING, searcherId: "88888888-8888-4888-8888-888888888888" }, SECRET)).toBeNull();
  });

  it("ditolak dengan secret lain dan untuk sampah", () => {
    const cursor = encodeCursor(KEY, BINDING, SECRET);
    expect(decodeCursor(cursor, BINDING, "secret-lain-yang-juga-panjang-123456")).toBeNull();
    for (const junk of ["", ".", "abc", "a.b.c", "....", "e30.e30"]) {
      expect(decodeCursor(junk, BINDING, SECRET)).toBeNull();
    }
  });

  it("tidak memuat jarak halus: hanya satuan 0,5 km", () => {
    const b = { ...BINDING, sort: "distance", radiusM: 5000 } as const;
    const cursor = encodeCursor({ sort: "distance", value: 7, userId: KEY.userId }, b, SECRET);
    const payload = Buffer.from(cursor.split(".")[0] ?? "", "base64url").toString("utf8");
    expect(JSON.parse(payload)).toEqual(["distance", 7, KEY.userId]);
  });
});
