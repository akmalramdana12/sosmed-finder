import { timingSafeEqual } from "node:crypto";
import type { ReportStatusValue } from "@social-finder/types";
import { hashIdentifier } from "../auth/tokens";
import type { ReportKey } from "./types";

/** Cursor terikat pada moderator dan filter status; tidak bisa dipakai di tempat lain atau diubah. */
export interface ModerationCursorBinding {
  moderatorId: string;
  status: ReportStatusValue;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mac(payload: string, binding: ModerationCursorBinding, secret: string): string {
  return hashIdentifier(`mod.${payload}.${binding.moderatorId}.${binding.status}`, secret);
}

export function encodeModerationCursor(
  key: ReportKey,
  binding: ModerationCursorBinding,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify([key.createdAt.getTime(), key.id])).toString("base64url");
  return `${payload}.${mac(payload, binding, secret)}`;
}

export function decodeModerationCursor(
  cursor: string,
  binding: ModerationCursorBinding,
  secret: string,
): ReportKey | null {
  const dot = cursor.indexOf(".");
  if (dot <= 0 || dot !== cursor.lastIndexOf(".")) return null;
  const payload = cursor.slice(0, dot);
  const a = Buffer.from(cursor.slice(dot + 1));
  const b = Buffer.from(mac(payload, binding, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [time, id] = parsed as unknown[];
  if (typeof time !== "number" || !Number.isInteger(time) || typeof id !== "string" || !UUID.test(id)) {
    return null;
  }
  return { createdAt: new Date(time), id };
}
