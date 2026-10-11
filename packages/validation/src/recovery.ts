import { z } from "zod";
import { emailSchema } from "./auth";
import { passwordSchema } from "./primitives";

/** Token dari email: 32 byte base64url = 43 karakter. Bentuk salah ditolak sebelum menyentuh DB. */
export const recoveryTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Token tidak valid");

export const requestPasswordResetSchema = z.object({ email: emailSchema }).strict();
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z
  .object({ token: recoveryTokenSchema, newPassword: passwordSchema })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: recoveryTokenSchema }).strict();
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
