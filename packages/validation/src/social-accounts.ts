import { z } from "zod";

/**
 * Username akun sosmed. Karakter dibatasi ke himpunan ASCII yang aman untuk path URL,
 * sehingga profileUrl yang dibangun dari template tidak bisa disuntik ("/", "?", "#", "%", "@", spasi).
 * Satu "@" di depan (hasil copy-paste) dibuang. Aturan per platform yang lebih ketat
 * (panjang, karakter) ditambahkan bila ada sumber resmi yang bisa diverifikasi.
 */
export const socialUsernameSchema = z
  .string()
  .max(100)
  .transform((value) => value.trim().replace(/^@/, ""))
  .pipe(
    z
      .string()
      .min(1)
      .max(50)
      .regex(
        /^[A-Za-z0-9_](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$/,
        "Username hanya boleh huruf, angka, titik, garis bawah, atau strip",
      ),
  );

export const platformKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{1,32}$/, "Platform tidak valid");

export const createSocialAccountSchema = z
  .object({
    platformKey: platformKeySchema,
    username: socialUsernameSchema,
  })
  .strict();

/**
 * `isVerified`, `platformId`, `userId`, `profileUrl` sengaja TIDAK ada: `.strict()` menolaknya,
 * sehingga klien tidak bisa menyatakan dirinya terverifikasi atau menyetel URL sendiri.
 */
export const updateSocialAccountSchema = z
  .object({
    username: socialUsernameSchema.optional(),
    isDiscoverable: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Minimal satu field harus diisi",
  });

export const resourceIdSchema = z.string().uuid();

export type CreateSocialAccountInput = z.infer<typeof createSocialAccountSchema>;
export type UpdateSocialAccountInput = z.infer<typeof updateSocialAccountSchema>;
