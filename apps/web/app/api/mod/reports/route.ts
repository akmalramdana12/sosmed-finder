import { listReportsQuerySchema } from "@social-finder/validation";
import { handleRequest } from "@/lib/http";
import { getModerationService } from "@/lib/moderation";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/mod/reports?status=OPEN&limit=20&cursor= — antrean laporan untuk moderator.
 * Bukan moderator = 404 yang sama dengan rute yang tidak ada. Tanpa identitas pelapor.
 */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const raw: Record<string, string> = {};
    for (const [key, value] of new URL(request.url).searchParams) {
      if (key in raw) {
        return Response.json(
          { error: { code: "VALIDATION_ERROR", message: "Parameter ganda tidak diizinkan" } },
          { status: 400 },
        );
      }
      raw[key] = value;
    }
    const input = listReportsQuerySchema.parse(raw);
    const result = await getModerationService().listReports(userId, input);
    return Response.json(result);
  });
}
