import { z } from "zod";
import { LOCATION_VISIBILITY } from "@social-finder/types";

/** 3-30 karakter: huruf, angka, titik, underscore. Tidak diawali/diakhiri titik. */
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_](?:[a-zA-Z0-9_.]*[a-zA-Z0-9_])?$/, "Username tidak valid");

/** Normalisasi untuk keunikan & pencarian (case-insensitive). */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export const passwordSchema = z.string().min(12).max(128);

export const locationVisibilitySchema = z.enum(LOCATION_VISIBILITY);
