// Pakai: pnpm tsx packages/database/perf/explain.ts <searcherId> <out.sql>, lalu: psql -f <out.sql>
// Menghasilkan SQL EXPLAIN (ANALYZE) untuk skenario pencarian memakai buildSearchQuery yang SAMA dengan produksi.
import { writeFileSync } from "node:fs";
import { buildSearchQuery } from "../../api/src/modules/search/search-sql";
import type { SearchCriteria } from "../../api/src/modules/search/types";

const searcher = process.argv[2] ?? "";
const out = process.argv[3] ?? "explain.sql";
const lit = (v: unknown): string => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const base: SearchCriteria = { searcherId: searcher, query: null, platformKey: null, radiusM: null, sort: "username", fetchLimit: 21, after: null };
const q = (text: string, mode: "exact" | "prefix", includeHandles = true) => ({ text, mode, includeHandles });

const scenarios: Record<string, SearchCriteria> = {
  "01 exact username": { ...base, query: q("alex1234", "exact") },
  "02 exact handle": { ...base, query: q("alex1234_x", "exact") },
  "03 prefix lebar 'al'": { ...base, query: q("al", "prefix") },
  "04 prefix sempit 'alexander12'": { ...base, query: q("alexander12", "prefix") },
  "05 prefix lebar + platform": { ...base, query: q("al", "prefix"), platformKey: "instagram" },
  "06 halaman 2 (keyset) prefix 'al'": { ...base, query: q("al", "prefix"), after: { sort: "username", value: "alan1000", userId: "00000000-0000-4000-8000-000000000000" } },
  "07 lookup profil exact": { ...base, query: q("alex1234", "exact", false), fetchLimit: 1 },
  "08 radius 5 km": { ...base, radiusM: 5000, sort: "distance" },
  "09 radius 5 km + prefix": { ...base, radiusM: 5000, sort: "distance", query: q("al", "prefix") },
};

let sql = "\\timing off\n";
for (const [name, criteria] of Object.entries(scenarios)) {
  const { text, values } = buildSearchQuery(criteria);
  sql += `\\echo ===== ${name}\nDEALLOCATE ALL;\nPREPARE q AS ${text};\nEXPLAIN (ANALYZE, BUFFERS, SUMMARY) EXECUTE q(${values.map(lit).join(",")});\n`;
}
writeFileSync(out, sql);
