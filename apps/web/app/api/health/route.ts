import { checkHealth } from "@social-finder/api";

export const dynamic = "force-dynamic";

// Dependency check (DB, Redis) ditambahkan saat Fase 2.
export async function GET() {
  const report = await checkHealth();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
