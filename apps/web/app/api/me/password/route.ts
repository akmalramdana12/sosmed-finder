import { serializeClearedSessionCookie } from "@social-finder/api/auth";
import { changePasswordSchema } from "@social-finder/validation";
import { getAccountService } from "@/lib/account";
import { handleRequest, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/me/password — ganti password. Semua sesi dicabut (termasuk yang ini): cookie dikosongkan
 * dan pengguna harus login ulang dengan password baru.
 */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const input = changePasswordSchema.parse(await readJson(request));
    await getAccountService().changePassword(userId, input.currentPassword, input.newPassword, ctx);
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", serializeClearedSessionCookie(ctx.env.secureCookies));
    return response;
  });
}
