import { z } from "zod";
import { MODERATION_ACTIONS, REPORT_STATUSES } from "@social-finder/types";
import { cleanMultiLine } from "./text";

export const reportIdSchema = z.string().uuid();

/** Query string GET /api/mod/reports. `.strict()`: parameter tak dikenal ditolak. */
export const listReportsQuerySchema = z
  .object({
    status: z.enum(REPORT_STATUSES).default("OPEN"),
    cursor: z.string().min(1).max(200).optional(),
    limit: z
      .string()
      .regex(/^\d{1,2}$/, "Harus bilangan bulat")
      .default("20")
      .transform(Number)
      .pipe(z.number().int().min(1).max(50)),
  })
  .strict();
export type ListReportsQueryInput = z.infer<typeof listReportsQuerySchema>;

const noteSchema = z.string().max(3000).transform(cleanMultiLine).pipe(z.string().max(1000));

/**
 * Tindakan moderator. suspend dan reinstate mengubah akun orang lain, jadi wajib disertai catatan
 * (akuntabilitas); `.strict()` mencegah field lain (mis. status, targetUserId) diatur dari body.
 */
export const moderationActionSchema = z
  .object({
    action: z.enum(MODERATION_ACTIONS),
    note: noteSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.action !== "suspend" && value.action !== "reinstate") || (value.note?.length ?? 0) >= 5,
    { message: "Catatan minimal 5 karakter untuk suspend dan reinstate", path: ["note"] },
  );
export type ModerationActionInput = z.infer<typeof moderationActionSchema>;
