import { prisma } from "@social-finder/database";

/**
 * Tes integrasi MENGHAPUS semua tabel (TRUNCATE). Penjaga ini menolak berjalan kecuali
 * DATABASE_URL menunjuk ke database yang namanya berakhiran "_test", supaya data dev tidak terhapus.
 */
export function assertTestDatabase(): void {
  let name = "";
  try {
    name = new URL(process.env["DATABASE_URL"] ?? "").pathname.replace(/^\//, "");
  } catch {
    // dibiarkan kosong: ditolak di bawah
  }
  if (!/_test$/.test(name)) {
    throw new Error(
      "Tes integrasi hanya boleh berjalan pada database dengan nama berakhiran _test (lihat .env.test.example).",
    );
  }
}

const lit = (value: string | number | boolean | null): string => {
  if (value === null) return "NULL";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
};

export const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export interface SeedUser {
  n: number;
  username: string;
  discoverable: boolean;
  searchable?: boolean;
  showPlatforms?: boolean;
  visibility?: "PRIVATE" | "AREA_ONLY" | "CITY_ONLY" | "DISCOVERABLE_RADIUS";
  status?: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION";
  deleted?: boolean;
  accounts?: Array<{ platform: string; handle: string; discoverable?: boolean }>;
  /** northKm: jarak ke utara dari titik acuan (1.1, 104.0). */
  location?: { northKm: number; radiusM: number; enabled: boolean; area: string; city: string };
}

/** Pengguna 1 (ME) adalah pencari. Seluruh data statis: tidak ada input pengguna di dalam SQL. */
export const USERS: SeedUser[] = [
  { n: 1, username: "me", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "me_ig" }], location: { northKm: 0, radiusM: 5000, enabled: true, area: "Batam Centre", city: "Batam" } },
  { n: 2, username: "Alex", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "alex.ig" }, { platform: "x", handle: "alex_x" }, { platform: "instagram", handle: "alex_private", discoverable: false }], location: { northKm: 2.4, radiusM: 10000, enabled: true, area: "Sekupang", city: "Batam" } },
  { n: 3, username: "alexa", discoverable: true, visibility: "PRIVATE", accounts: [{ platform: "instagram", handle: "alexa_ig" }], location: { northKm: 1, radiusM: 5000, enabled: true, area: "RahasiaArea", city: "RahasiaKota" } },
  { n: 4, username: "alexb", discoverable: false, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "alexb_ig" }], location: { northKm: 1, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 5, username: "alexc", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "alexc_ig" }], location: { northKm: 1, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 6, username: "alexd", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "alexd_ig" }], location: { northKm: 1, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 7, username: "alexe", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "alexe_ig", discoverable: false }, { platform: "legacy", handle: "alexe_legacy" }], location: { northKm: 1, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 8, username: "alexf", discoverable: true, visibility: "DISCOVERABLE_RADIUS", status: "SUSPENDED", accounts: [{ platform: "instagram", handle: "alexf_ig" }], location: { northKm: 1, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 9, username: "alexg", discoverable: true, visibility: "DISCOVERABLE_RADIUS", deleted: true, accounts: [{ platform: "instagram", handle: "alexg_ig" }], location: { northKm: 1, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 10, username: "alexh", discoverable: true, searchable: false, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "alexh_ig" }], location: { northKm: 1.5, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 11, username: "alexi", discoverable: true, showPlatforms: false, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "secretig" }], location: { northKm: 1.2, radiusM: 5000, enabled: true, area: "A", city: "B" } },
  { n: 12, username: "faruser", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "far_ig" }], location: { northKm: 30, radiusM: 50000, enabled: true, area: "Jauh", city: "Kota Jauh" } },
  { n: 13, username: "narrow", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "narrow_ig" }], location: { northKm: 3, radiusM: 2000, enabled: true, area: "Sempit", city: "Batam" } },
  { n: 14, username: "locoff", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "instagram", handle: "locoff_ig" }], location: { northKm: 1, radiusM: 5000, enabled: false, area: "Mati", city: "Batam" } },
  { n: 15, username: "a_b", discoverable: true, visibility: "PRIVATE", accounts: [{ platform: "instagram", handle: "under_ig" }] },
  { n: 16, username: "axb", discoverable: true, visibility: "PRIVATE", accounts: [{ platform: "instagram", handle: "axb_ig" }] },
  { n: 17, username: "nolocation", discoverable: true, visibility: "DISCOVERABLE_RADIUS", accounts: [{ platform: "x", handle: "nl_x" }] },
  ...[20, 21, 22, 23, 24].map((n): SeedUser => ({ n, username: `page${n - 19}`, discoverable: true, visibility: "PRIVATE", accounts: [{ platform: "x", handle: `p${n - 19}` }] })),
];

/** 5 blokir pada ME (diblokir oleh alexc) dan 6 (diblokir ME). */
const BLOCKS: Array<[number, number]> = [
  [5, 1],
  [1, 6],
];

export function seedStatements(): string[] {
  const out: string[] = [
    `TRUNCATE "SearchLog","Report","AuditLog","Block","Location","SocialAccount","SocialPlatform","PrivacySettings","Profile","Session","User" CASCADE`,
    `INSERT INTO "SocialPlatform"("key","name","urlTemplate","isActive") VALUES ('instagram','Instagram','https://instagram.com/{username}',true),('x','X','https://x.com/{username}',true),('legacy','Legacy','https://legacy.example/{username}',false)`,
  ];
  for (const u of USERS) {
    const id = uid(u.n);
    out.push(
      `INSERT INTO "User"("id","email","passwordHash","username","normalizedUsername","status","deletedAt","updatedAt") VALUES (${lit(id)},${lit(`${u.username.toLowerCase()}@example.test`)},'x',${lit(u.username)},${lit(u.username.toLowerCase())},${lit(u.status ?? "ACTIVE")}::"UserStatus",${u.deleted ? "now()" : "NULL"},now())`,
      `INSERT INTO "Profile"("userId","displayName","updatedAt") VALUES (${lit(id)},${lit(`Name ${u.username}`)},now())`,
      `INSERT INTO "PrivacySettings"("userId","isDiscoverable","searchableByUsername","showPlatforms","locationVisibility") VALUES (${lit(id)},${u.discoverable},${u.searchable ?? true},${u.showPlatforms ?? true},${lit(u.visibility ?? "PRIVATE")}::"LocationVisibility")`,
    );
    for (const a of u.accounts ?? []) {
      out.push(
        `INSERT INTO "SocialAccount"("userId","platformId","username","normalizedUsername","profileUrl","isDiscoverable","updatedAt") SELECT ${lit(id)}, p."id", ${lit(a.handle)}, ${lit(a.handle.toLowerCase())}, replace(p."urlTemplate",'{username}',${lit(a.handle)}), ${a.discoverable ?? true}, now() FROM "SocialPlatform" p WHERE p."key" = ${lit(a.platform)}`,
      );
    }
    if (u.location) {
      const l = u.location;
      out.push(
        `INSERT INTO "Location"("userId","geography","accuracyLevel","areaLabel","cityLabel","discoverableRadius","isEnabled") VALUES (${lit(id)}, ST_SetSRID(ST_MakePoint(104.0, ${1.1 + l.northKm / 111.195}), 4326)::geography, 'AREA'::"AccuracyLevel", ${lit(l.area)}, ${lit(l.city)}, ${l.radiusM}, ${l.enabled})`,
      );
    }
  }
  for (const [blocker, blocked] of BLOCKS) {
    out.push(`INSERT INTO "Block"("blockerId","blockedId") VALUES (${lit(uid(blocker))},${lit(uid(blocked))})`);
  }
  return out;
}

export async function resetAndSeed(): Promise<void> {
  assertTestDatabase();
  for (const statement of seedStatements()) {
    await prisma.$executeRawUnsafe(statement);
  }
}

export async function scalar(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: unknown }>>(sql);
  return Number(rows[0]?.n);
}
