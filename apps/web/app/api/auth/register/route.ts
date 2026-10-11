import { registerSchema } from "@social-finder/validation";
import { getAuthService } from "@/lib/auth";
import { handleRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const input = registerSchema.parse(await readJson(request));
    await getAuthService().register(input, ctx);
    // Respons sama untuk email baru maupun yang sudah terdaftar (anti-enumerasi).
    return Response.json({ ok: true }, { status: 201 });
  });
}
