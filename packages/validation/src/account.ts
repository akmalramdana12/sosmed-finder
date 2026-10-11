import { z } from "zod";
import { passwordSchema } from "./primitives";

/**
 * Password lama tidak diberi aturan panjang minimum (pesan harus generik), hanya batas atas agar
 * input raksasa tidak masuk ke hasher. Password baru memakai aturan registrasi.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Penghapusan akun tidak bisa dibatalkan setelah masa tunggu: wajib password dan penegasan
 * eksplisit, supaya satu request tersasar atau sesi yang dibajak tidak cukup.
 */
export const deleteAccountSchema = z
  .object({
    password: z.string().min(1).max(128),
    confirm: z.literal("DELETE"),
  })
  .strict();
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
