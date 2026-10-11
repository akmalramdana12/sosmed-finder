import { AppError } from "@social-finder/api";
import { readSessionToken } from "@social-finder/api/auth";
import type { SessionIdentity } from "@social-finder/api/auth";
import { getAuthService } from "./auth";
import type { AppEnv } from "./env";

/**
 * Penjaga endpoint terautentikasi. Identitas pengguna HANYA berasal dari cookie sesi:
 * route tidak boleh memakai id pengguna dari URL atau body untuk resource milik sendiri.
 */
export async function requireUser(
  request: Request,
  env: Pick<AppEnv, "secureCookies">,
): Promise<SessionIdentity> {
  const token = readSessionToken(request.headers.get("cookie"), env.secureCookies);
  const identity = token ? await getAuthService().validateSession(token) : null;
  if (!identity) throw new AppError("UNAUTHENTICATED", "Autentikasi diperlukan");
  return identity;
}
