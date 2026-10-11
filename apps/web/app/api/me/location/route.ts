import { setLocationSchema, updateLocationSettingsSchema } from "@social-finder/validation";
import { getLocationService } from "@/lib/location";
import { handleRequest, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/me/location — pengaturan lokasi milik sendiri. `data` null bila belum diatur. Tanpa koordinat. */
export async function GET(request: Request) {
  return handleRequest(request, { mutation: false }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const location = await getLocationService().getMine(userId);
    return Response.json({ data: location });
  });
}

/**
 * PUT /api/me/location — simpan titik. Koordinat mentah di-snap ke grid di server sebelum
 * disimpan; tidak disimpan, dikembalikan, atau dilog dalam bentuk mentah.
 */
export async function PUT(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const input = setLocationSchema.parse(await readJson(request));
    const location = await getLocationService().setLocation(userId, input, ctx);
    return Response.json({ data: location });
  });
}

/** PATCH /api/me/location — ubah visibilitas, radius, label, atau saklar aktif (tanpa koordinat). */
export async function PATCH(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const patch = updateLocationSettingsSchema.parse(await readJson(request));
    const location = await getLocationService().updateSettings(userId, patch, ctx);
    return Response.json({ data: location });
  });
}

/** DELETE /api/me/location — hapus lokasi; visibilitas kembali PRIVATE. */
export async function DELETE(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    await getLocationService().removeLocation(userId, ctx);
    return Response.json({ ok: true });
  });
}
