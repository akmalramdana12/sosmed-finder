import { AppError } from "@social-finder/api";
import { moderationActionSchema, reportIdSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { getModerationService } from "@/lib/moderation";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/mod/reports/:id {action, note?} — tindakan moderator: review, dismiss, resolve,
 * suspend, reinstate. suspend/reinstate wajib bercatatan. Bukan moderator = 404.
 */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const segment = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
    const id = reportIdSchema.safeParse(segment);
    const command = moderationActionSchema.parse(await readJson(request));
    if (!id.success) throw new AppError("NOT_FOUND", "Laporan tidak ditemukan");
    const report = await getModerationService().act(userId, id.data, command, ctx);
    return Response.json({ data: report });
  });
}
