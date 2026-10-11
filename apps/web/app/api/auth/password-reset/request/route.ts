import { requestPasswordResetSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { getRecoveryService } from "@/lib/recovery";

export const dynamic = "force-dynamic";

/** POST /api/auth/password-reset/request — selalu 200 (anti-enumerasi), baik email terdaftar maupun tidak. */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const input = requestPasswordResetSchema.parse(await readJson(request));
    await getRecoveryService().requestPasswordReset(input.email, ctx);
    return Response.json({ ok: true });
  });
}
