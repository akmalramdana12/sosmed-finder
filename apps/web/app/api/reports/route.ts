import { createReportSchema } from "@social-finder/validation";
import { handleRequest, readJson } from "@/lib/http";
import { getSafetyService } from "@/lib/safety";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/reports {username, reason, details?} — laporkan pengguna. Pelapor selalu dari sesi.
 * Username yang tidak ada atau laporan ganda yang masih terbuka menghasilkan respons yang sama
 * dengan yang berhasil. Laporan tidak punya efek otomatis pada target.
 */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const input = createReportSchema.parse(await readJson(request));
    await getSafetyService().report(userId, input, ctx);
    return Response.json({ ok: true }, { status: 201 });
  });
}
