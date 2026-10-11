import { z } from "zod";
import { REPORT_REASONS } from "@social-finder/types";
import { publicUsernameSchema } from "./search";
import { cleanMultiLine } from "./text";

/**
 * Block dan report memakai username (identitas publik), bukan id internal: DTO publik tidak pernah
 * membawa id, jadi klien tidak punya id untuk dikirim. Server yang memetakan username ke pengguna.
 * `.strict()`: field lain (mis. blockerId, reporterId, status) ditolak, jadi tidak bisa diatur lewat body.
 */
export const blockUserSchema = z.object({ username: publicUsernameSchema }).strict();
export type BlockUserInput = z.infer<typeof blockUserSchema>;

const detailsSchema = z
  .string()
  .max(3000)
  .transform(cleanMultiLine)
  .pipe(z.string().max(1000));

export const createReportSchema = z
  .object({
    username: publicUsernameSchema,
    reason: z.enum(REPORT_REASONS),
    details: detailsSchema.optional(),
  })
  .strict()
  .refine((value) => value.reason !== "OTHER" || (value.details?.length ?? 0) >= 10, {
    message: "Jelaskan laporan Anda (minimal 10 karakter) bila alasannya 'OTHER'",
    path: ["details"],
  });
export type CreateReportInput = z.infer<typeof createReportSchema>;
