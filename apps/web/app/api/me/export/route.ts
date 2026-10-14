import { exportDataSchema } from "@social-finder/validation";
import { getAccountService } from "@/lib/account";
import { handleRequest, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/me/export {password} — unduh data milik sendiri sebagai JSON. POST (bukan GET) dan wajib
 * password: berisi email dan data pribadi, jadi sesi yang dibajak tidak cukup, dan tidak ada URL yang
 * bisa dibagikan atau tersimpan di riwayat. Tanpa koordinat. Tidak pernah di-cache.
 */
export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const input = exportDataSchema.parse(await readJson(request));
    const data = await getAccountService().exportData(userId, input.password, ctx);
    return Response.json(
      { data },
      { headers: { "Content-Disposition": 'attachment; filename="social-finder-data.json"' } },
    );
  });
}
