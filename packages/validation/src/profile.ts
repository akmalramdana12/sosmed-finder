import { z } from "zod";
import { usernameSchema } from "./primitives";
import { cleanMultiLine, cleanSingleLine } from "./text";

/** Batas kasar di depan pembersihan agar input raksasa tidak diproses. */
export const displayNameSchema = z
  .string()
  .max(200)
  .transform(cleanSingleLine)
  .pipe(z.string().min(1).max(80));

/** Bio kosong menjadi null (menghapus bio). */
export const bioSchema = z
  .string()
  .max(2000)
  .transform(cleanMultiLine)
  .pipe(z.string().max(500))
  .transform((value) => (value === "" ? null : value));

/**
 * PATCH /api/me. `.strict()` menolak field apa pun di luar daftar ini
 * (id, userId, email, status, passwordHash, ...): mencegah mass assignment dan IDOR via body.
 */
export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: bioSchema.nullable().optional(),
    username: usernameSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Minimal satu field harus diisi",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
