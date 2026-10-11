import { blockUserSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { getSafetyService } from "@/lib/safety";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/blocks — daftar pengguna yang Anda blokir (username dan waktu saja). */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    return Response.json({ data: await getSafetyService().listBlocks(userId) });
  });
}

/**
 * POST /api/blocks {username} — blokir. Idempotent. Username yang tidak ada menghasilkan respons
 * yang sama dengan yang berhasil (tanpa enumerasi).
 */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const { username } = blockUserSchema.parse(await readJson(request));
    await getSafetyService().block(userId, username, ctx);
    return Response.json({ ok: true });
  });
}
