import { normalizeUsername, publicUsernameSchema } from "@social-finder/validation";

/**
 * Username dari segmen terakhir path (lihat catatan di /api/me/social-accounts/[id]: path dipakai,
 * bukan `params` Next.js). Null bila bentuknya tidak valid; pemanggil memperlakukannya seperti
 * "tidak ada" agar tidak membedakan keduanya.
 */
export function usernameFromPath(request: Request): string | null {
  const segment = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const parsed = publicUsernameSchema.safeParse(decoded);
  return parsed.success ? normalizeUsername(parsed.data) : null;
}
