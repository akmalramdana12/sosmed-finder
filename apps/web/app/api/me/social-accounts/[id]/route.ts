import { resourceIdSchema, updateSocialAccountSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getSocialAccountService } from "@/lib/social-accounts";

export const dynamic = "force-dynamic";

/**
 * id diambil dari path request, bukan dari argumen `params` Next.js: bentuk `params`
 * berbeda antar versi (sinkron vs Promise), sedangkan path selalu `/api/me/social-accounts/<id>`.
 */
function idFromRequest(request: Request) {
  const segment = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  return resourceIdSchema.parse(segment);
}

/** PATCH /api/me/social-accounts/:id — ubah username atau isDiscoverable. Hanya milik sendiri. */
export async function PATCH(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const id = idFromRequest(request);
    const patch = updateSocialAccountSchema.parse(await readJson(request));
    const account = await getSocialAccountService().update(userId, id, patch, ctx);
    return Response.json({ data: account });
  });
}

/** DELETE /api/me/social-accounts/:id — hapus akun milik sendiri. */
export async function DELETE(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const id = idFromRequest(request);
    await getSocialAccountService().delete(userId, id, ctx);
    return Response.json({ ok: true });
  });
}
