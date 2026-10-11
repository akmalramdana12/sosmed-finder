import { updatePrivacySchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { getPrivacyService } from "@/lib/privacy";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/me/privacy — pengaturan privasi milik pengguna yang login. */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const privacy = await getPrivacyService().getPrivacy(userId);
    return Response.json({ data: privacy });
  });
}

/** PATCH /api/me/privacy — ubah saklar discoverability. Target selalu pengguna dari sesi. */
export async function PATCH(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const patch = updatePrivacySchema.parse(await readJson(request));
    const privacy = await getPrivacyService().updatePrivacy(userId, patch, ctx);
    return Response.json({ data: privacy });
  });
}
