import { createSocialAccountSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getSocialAccountService } from "@/lib/social-accounts";

export const dynamic = "force-dynamic";

/** GET /api/me/social-accounts — akun sosmed milik pengguna yang login. */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const accounts = await getSocialAccountService().list(userId);
    return Response.json({ data: accounts });
  });
}

/** POST /api/me/social-accounts — daftarkan akun. profileUrl dibangun server dari template platform. */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const input = createSocialAccountSchema.parse(await readJson(request));
    const account = await getSocialAccountService().create(userId, input, ctx);
    return Response.json({ data: account }, { status: 201 });
  });
}
