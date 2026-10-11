import { timingSafeEqual } from "node:crypto";
import type { SearchSort } from "@social-finder/types";
import { hashIdentifier } from "../auth/tokens";
import type { CursorKey } from "./types";

/** Bagian query yang mengikat sebuah cursor. Cursor dari pencarian lain ditolak. */
export interface CursorBinding {
  searcherId: string;
  query: string | null;
  mode: string | null;
  platformKey: string | null;
  radiusM: number | null;
  sort: SearchSort;
}

function fingerprint(binding: CursorBinding): string {
  return JSON.stringify([
    binding.searcherId,
    binding.query,
    binding.mode,
    binding.platformKey,
    binding.radiusM,
    binding.sort,
  ]);
}

function mac(payload: string, binding: CursorBinding, secret: string): string {
  return hashIdentifier(`${payload}.${fingerprint(binding)}`, secret);
}

/**
 * Cursor buram dan bertanda tangan: base64url(payload).HMAC. Terikat pada pencari dan seluruh
 * parameter pencarian, jadi tidak bisa diubah, dipakai ulang di query lain, atau dipinjam pengguna lain.
 * Payload hanya berisi kunci urutan (username atau satuan 0,5 km) dan id: tidak ada jarak halus.
 */
export function encodeCursor(key: CursorKey, binding: CursorBinding, secret: string): string {
  const payload = Buffer.from(JSON.stringify([key.sort, key.value, key.userId])).toString(
    "base64url",
  );
  return `${payload}.${mac(payload, binding, secret)}`;
}

/** Null untuk cursor rusak, kedaluwarsa bentuknya, atau bukan milik query ini. */
export function decodeCursor(
  cursor: string,
  binding: CursorBinding,
  secret: string,
): CursorKey | null {
  const dot = cursor.indexOf(".");
  if (dot <= 0 || dot !== cursor.lastIndexOf(".")) return null;
  const payload = cursor.slice(0, dot);
  const given = cursor.slice(dot + 1);
  const expected = mac(payload, binding, secret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [sort, value, userId] = parsed as unknown[];
  if (typeof userId !== "string" || sort !== binding.sort) return null;
  if (sort === "username" && typeof value === "string") return { sort, value, userId };
  if (sort === "distance" && typeof value === "number" && Number.isInteger(value)) {
    return { sort, value, userId };
  }
  return null;
}
