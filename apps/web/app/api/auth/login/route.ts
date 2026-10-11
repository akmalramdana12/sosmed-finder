import { serializeSessionCookie } from "@social-finder/api/auth";
import { loginSchema } from "@social-finder/validation";
import { getAuthService } from "@/lib/auth";
import { handleRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const input = loginSchema.parse(await readJson(request));
    const { token, expiresAt } = await getAuthService().login(input, ctx);
    const response = Response.json({ ok: true });
    // Token hanya lewat cookie HttpOnly, tidak pernah di body.
    response.headers.append(
      "Set-Cookie",
      serializeSessionCookie(token, expiresAt, ctx.env.secureCookies),
    );
    return response;
  });
}
