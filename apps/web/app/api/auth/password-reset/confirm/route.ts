import { serializeClearedSessionCookie } from "@social-finder/api/auth";
import { resetPasswordSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { getRecoveryService } from "@/lib/recovery";

export const dynamic = "force-dynamic";

/** POST /api/auth/password-reset/confirm — token dari email + password baru. Semua sesi lama dicabut. */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const input = resetPasswordSchema.parse(await readJson(request));
    await getRecoveryService().resetPassword(input.token, input.newPassword, ctx);
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", serializeClearedSessionCookie(ctx.env.secureCookies));
    return response;
  });
}
