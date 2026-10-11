import { searchQuerySchema } from "@social-finder/validation";
import { handleRequest } from "@/lib/http";
import { getSearchService } from "@/lib/search";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/search — hanya untuk pengguna yang login. Query string divalidasi ketat (parameter tak
 * dikenal ditolak). Hasil hanya pengguna yang memilih ikut (opt-in) dan whitelist DTO: tanpa
 * email, id internal, atau koordinat. Respons tidak pernah di-cache.
 */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const params = new URL(request.url).searchParams;
    const raw: Record<string, string> = {};
    for (const [key, value] of params) {
      // Parameter ganda (?q=a&q=b) ambigu: tolak, jangan diam-diam pilih salah satu.
      if (key in raw) {
        return Response.json(
          { error: { code: "VALIDATION_ERROR", message: "Parameter ganda tidak diizinkan" } },
          { status: 400 },
        );
      }
      raw[key] = value;
    }
    const input = searchQuerySchema.parse(raw);
    const result = await getSearchService().search(userId, input);
    return Response.json(result);
  });
}
