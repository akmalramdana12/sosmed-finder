import { ACCURACY_LEVELS } from "@social-finder/types";
import { z } from "zod";
import { locationVisibilitySchema } from "./primitives";
import { cleanSingleLine } from "./text";

/**
 * Batas 85 harus sama dengan MAX_ABS_LATITUDE di packages/api/src/modules/location/geo.ts
 * (dijaga oleh test di sana). Di atasnya sel grid tidak bermakna.
 */
export const latitudeSchema = z.number().min(-85).max(85);
export const longitudeSchema = z.number().min(-180).max(180);

export const accuracyLevelSchema = z.enum(ACCURACY_LEVELS);

/** Label yang dinyatakan pengguna sendiri. Kosong tidak valid: kirim null untuk menghapus. */
export const placeLabelSchema = z
  .string()
  .max(200)
  .transform(cleanSingleLine)
  .pipe(z.string().min(1).max(100));

/** Radius dalam km; disimpan sebagai meter (CHECK 1000..50000 di database). */
export const discoverableRadiusKmSchema = z.number().int().min(1).max(50);

/**
 * PUT /api/me/location. Satu-satunya jalan koordinat masuk ke sistem; langsung di-snap oleh server.
 * `isEnabled` tidak ada: menyimpan titik selalu mengaktifkan lokasi, dan tanpa `visibility`
 * eksplisit lokasi baru berstatus PRIVATE.
 */
export const setLocationSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    accuracyLevel: accuracyLevelSchema,
    visibility: locationVisibilitySchema.optional(),
    discoverableRadiusKm: discoverableRadiusKmSchema.optional(),
    areaLabel: placeLabelSchema.nullable().optional(),
    cityLabel: placeLabelSchema.nullable().optional(),
  })
  .strict();

/** PATCH /api/me/location. Tanpa koordinat: mengganti titik hanya lewat PUT (lebih ketat dibatasi). */
export const updateLocationSettingsSchema = z
  .object({
    visibility: locationVisibilitySchema.optional(),
    discoverableRadiusKm: discoverableRadiusKmSchema.optional(),
    areaLabel: placeLabelSchema.nullable().optional(),
    cityLabel: placeLabelSchema.nullable().optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Minimal satu field harus diisi",
  });

export type SetLocationInput = z.infer<typeof setLocationSchema>;
export type UpdateLocationSettingsInput = z.infer<typeof updateLocationSettingsSchema>;
