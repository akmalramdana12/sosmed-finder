import { handleRequest } from "@/lib/http";
import { getSafetyService } from "@/lib/safety";
import { requireUser } from "@/lib/session";
import { usernameFromPath } from "@/lib/username-path";

export const dynamic = "force-dynamic";

/** DELETE /api/blocks/:username — cabut blokir milik sendiri. Idempotent; respons selalu sama. */
export async function DELETE(request: Request) {
  return handleRequest(request, { mutation: true }, async (ctx) => {
    const { userId } = await requireUser(request, ctx.env);
    const username = usernameFromPath(request);
    if (username !== null) await getSafetyService().unblock(userId, username, ctx);
    return Response.json({ ok: true });
  });
}
