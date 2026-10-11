import { verifyEmailSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { getRecoveryService } from "@/lib/recovery";

export const dynamic = "force-dynamic";

/** POST /api/auth/email/verify — konfirmasi email dengan token dari tautan. Tanpa sesi. */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const input = verifyEmailSchema.parse(await readJson(request));
    await getRecoveryService().verifyEmail(input.token, ctx);
    return Response.json({ ok: true });
  });
}
