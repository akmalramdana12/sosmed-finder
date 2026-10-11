import { serializeClearedSessionCookie } from "@social-finder/api/auth";
import { deleteAccountSchema, updateProfileSchema } from "@social-finder/validation";
import { getAccountService } from "@/lib/account";
import { getProfileService } from "@/lib/profile";
import { handleRequest, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/me — data milik pengguna yang sedang login. */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const me = await getProfileService().getMe(userId);
    return Response.json({ data: me });
  });
}

/** PATCH /api/me — ubah displayName, bio, username. Target selalu pengguna dari sesi. */
export async function PATCH(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const patch = updateProfileSchema.parse(await readJson(request));
    const me = await getProfileService().updateMe(userId, patch, ctx);
    return Response.json({ data: me });
  });
}

/**
 * DELETE /api/me {password, confirm: "DELETE"} — hapus akun. Langsung hilang dari pencarian dan semua
 * sesi dicabut; data lokasi dan akun sosmed dihapus sekarang, sisanya dihapus permanen setelah 30 hari.
 */
export async function DELETE(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const input = deleteAccountSchema.parse(await readJson(request));
    await getAccountService().deleteAccount(userId, input.password, ctx);
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", serializeClearedSessionCookie(ctx.env.secureCookies));
    return response;
  });
}
