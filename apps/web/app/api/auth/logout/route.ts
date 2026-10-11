import { readSessionToken, serializeClearedSessionCookie } from "@social-finder/api/auth";
import { getAuthService } from "@/lib/auth";
import { handleRequest } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const token = readSessionToken(request.headers.get("cookie"), ctx.env.secureCookies);
    await getAuthService().logout(token, ctx);
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", serializeClearedSessionCookie(ctx.env.secureCookies));
    return response;
  });
}
