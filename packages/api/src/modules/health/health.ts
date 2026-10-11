export type HealthCheck = () => Promise<void>;

export interface HealthReport {
  status: "ok" | "degraded";
  checks: Record<string, "ok" | "fail">;
}

/**
 * Jalankan semua dependency check. Detail error TIDAK dikembalikan
 * (hanya ok/fail) agar endpoint publik tidak membocorkan informasi internal.
 */
export async function checkHealth(
  checks: Record<string, HealthCheck> = {},
  timeoutMs = 2000,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]): Promise<[string, "ok" | "fail"]> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          check(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
          }),
        ]);
        return [name, "ok"];
      } catch {
        return [name, "fail"];
      } finally {
        if (timer) clearTimeout(timer);
      }
    }),
  );
  const results = Object.fromEntries(entries);
  const healthy = Object.values(results).every((value) => value === "ok");
  return { status: healthy ? "ok" : "degraded", checks: results };
}
