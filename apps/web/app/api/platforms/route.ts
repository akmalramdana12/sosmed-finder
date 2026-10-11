import { getSocialAccountService } from "@/lib/social-accounts";
import { handleRequest } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/platforms — daftar platform yang didukung (publik, dibatasi per IP). */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const platforms = await getSocialAccountService().listPlatforms(ctx);
    return Response.json(
      { data: platforms },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  });
}
