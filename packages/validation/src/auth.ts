import { z } from "zod";
import { displayNameSchema } from "./profile";
import { passwordSchema, usernameSchema } from "./primitives";

/** Email dinormalisasi (trim + lowercase) sebelum divalidasi. */
export const emailSchema = z.string().trim().toLowerCase().max(254).email();

export const registerSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    displayName: displayNameSchema.optional(),
  })
  .strict();

/** Login tidak menerapkan aturan panjang minimum: pesan error harus generik. */
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
