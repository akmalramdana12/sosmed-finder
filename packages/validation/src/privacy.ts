import { z } from "zod";

/**
 * PATCH /api/me/privacy. Hanya tiga saklar boolean; `.strict()` menolak field lain.
 * Visibilitas dan radius lokasi SENGAJA tidak ada di sini: keduanya terikat pada titik lokasi
 * dan diatur lewat /api/me/location, supaya tidak pernah ada visibilitas lokasi tanpa lokasi.
 */
export const updatePrivacySchema = z
  .object({
    isDiscoverable: z.boolean().optional(),
    searchableByUsername: z.boolean().optional(),
    showPlatforms: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Minimal satu field harus diisi",
  });

export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;
