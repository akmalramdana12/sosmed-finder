import { AppError } from "@social-finder/api";
import { handleRequest } from "@/lib/http";
import { getSearchService } from "@/lib/search";
import { requireUser } from "@/lib/session";
import { usernameFromPath } from "@/lib/username-path";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/:username — profil publik. "Tidak ada", "bukan discoverable", "diblokir", dan
 * "bentuk username tidak valid" semuanya menghasilkan 404 yang identik (tanpa enumerasi).
 */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const username = usernameFromPath(request);
    if (username === null) throw new AppError("NOT_FOUND", "Profil tidak ditemukan");
    const profile = await getSearchService().getPublicProfile(userId, username);
    return Response.json({ data: profile });
  });
}
