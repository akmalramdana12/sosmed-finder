import { handleRequest } from "@/lib/http";
import { getRecoveryService } from "@/lib/recovery";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST /api/me/email/verification — kirim ulang tautan verifikasi. Selalu 200 (juga bila sudah terverifikasi). */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    await getRecoveryService().requestEmailVerification(userId, ctx);
    return Response.json({ ok: true });
  });
}
