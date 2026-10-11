import { z } from "zod";
import { SEARCH_MODES, SEARCH_SORTS } from "@social-finder/types";
import { platformKeySchema } from "./social-accounts";

/**
 * Query string GET /api/search. `.strict()`: parameter tak dikenal ditolak (tidak ada filter
 * tersembunyi). Semua nilai datang sebagai string dari URL.
 *
 * Aturan anti-enumerasi:
 * - harus ada `q` atau `radiusKm` (tidak ada "daftar semua orang"),
 * - `q` minimal 2 karakter dan hanya himpunan karakter username yang valid,
 * - `sort=distance` hanya bermakna untuk pencarian radius.
 */
const queryText = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Kata kunci minimal 2 karakter")
  .max(50)
  .regex(/^[a-z0-9_](?:[a-z0-9._-]*)$/, "Kata kunci hanya boleh huruf, angka, titik, _ atau -");

const smallInt = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,3}$/, "Harus bilangan bulat")
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const searchQuerySchema = z
  .object({
    q: queryText.optional(),
    mode: z.enum(SEARCH_MODES).default("exact"),
    platform: platformKeySchema.optional(),
    radiusKm: smallInt(1, 50).optional(),
    sort: z.enum(SEARCH_SORTS).optional(),
    limit: smallInt(1, 50).default("20"),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict()
  .refine((value) => value.q !== undefined || value.radiusKm !== undefined, {
    message: "Isi kata kunci (q) atau radius (radiusKm)",
  })
  .refine((value) => value.sort !== "distance" || value.radiusKm !== undefined, {
    message: "Urutan jarak membutuhkan radiusKm",
  });

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

/** Segmen path /api/users/:username. Bentuk tak valid diperlakukan sama dengan "tidak ada". */
export const publicUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_](?:[a-zA-Z0-9_.]*[a-zA-Z0-9_])?$/);
