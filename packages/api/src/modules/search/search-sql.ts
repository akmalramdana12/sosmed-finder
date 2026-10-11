import type { SearchCriteria } from "./types";

export interface BuiltQuery {
  /** Teks SQL statis. Tidak pernah memuat input pengguna; semua nilai lewat placeholder $n. */
  text: string;
  values: unknown[];
}

/** Escape karakter khusus LIKE (\ % _). "_" valid di username, jadi wajib di-escape. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Membangun query pencarian. Seluruh teks SQL berasal dari konstanta di file ini; input pengguna
 * (kata kunci, platform, id, radius, cursor) hanya masuk sebagai parameter terikat.
 *
 * Syarat dasar (selalu): pengguna ACTIVE dan tidak dihapus, bukan pencari sendiri, isDiscoverable,
 * tidak ada block dua arah, minimal satu akun sosmed discoverable di platform aktif.
 * Filter ini hanyalah lapis pertama: `evaluateCandidate` memeriksa ulang setiap baris.
 *
 * Satuan jarak untuk urutan/cursor = kelipatan 0,5 km dibulatkan (FLOOR(x + 0.5), setengah ke atas),
 * minimal 2 (= 1 km). Urutan dalam satu satuan ditentukan id, jadi urutan tidak membocorkan jarak
 * yang lebih halus daripada yang ditampilkan.
 */
export function buildSearchQuery(criteria: SearchCriteria): BuiltQuery {
  const values: unknown[] = [];
  const bind = (value: unknown, cast: string): string => {
    values.push(value);
    return `$${values.length}::${cast}`;
  };

  const searcher = bind(criteria.searcherId, "uuid");

  const accountMatch = (extra: string): string =>
    `EXISTS (SELECT 1 FROM "SocialAccount" sa
        JOIN "SocialPlatform" sp ON sp."id" = sa."platformId"
        WHERE sa."userId" = u."id" AND sa."isDiscoverable" AND sp."isActive"${extra})`;

  // Dihitung sebagai kolom DAN dipakai sebagai filter, agar guard di service memeriksa bendera nyata.
  const blocked = `EXISTS (SELECT 1 FROM "Block" b
        WHERE (b."blockerId" = ${searcher} AND b."blockedId" = u."id")
           OR (b."blockerId" = u."id" AND b."blockedId" = ${searcher}))`;

  // CTE kandidat (hanya bila ada kata kunci). MATERIALIZED memaksa planner mengevaluasinya lebih dulu
  // lewat indeks lalu me-join ke tabel lain; tanpanya planner memilih hash join atas SELURUH
  // SocialAccount karena EXISTS(...) dan OR di WHERE.
  let candidateCte = "";
  let fromUser = `FROM "User" u`;
  let usernameMatched = "false";
  let handleMatched = "false";
  const where: string[] = [
    `u."status" = 'ACTIVE'`,
    `u."deletedAt" IS NULL`,
    `u."id" <> ${searcher}`,
    `ps."isDiscoverable"`,
    `NOT ${blocked}`,
    accountMatch(""),
  ];

  if (criteria.query) {
    const { text, mode, includeHandles } = criteria.query;
    const operand = mode === "prefix" ? bind(`${escapeLike(text)}%`, "text") : bind(text, "text");
    const compare = (column: string): string =>
      mode === "prefix" ? `${column} LIKE ${operand} ESCAPE '\\'` : `${column} = ${operand}`;

    usernameMatched = `(${compare(`u."normalizedUsername"`)})`;
    if (includeHandles) {
      handleMatched = `(ps."showPlatforms" AND ${accountMatch(` AND ${compare(`sa."normalizedUsername"`)}`)})`;
    }
    where.push(`ps."searchableByUsername"`);
    // Himpunan kandidat berbasis indeks. Tanpa ini planner harus memeriksa `OR EXISTS(...)` untuk
    // SETIAP pengguna (O(N), ~2 detik pada 300 ribu pengguna). Klausa di bawahnya tetap dipertahankan
    // sebagai filter/bendera yang menentukan, jadi ini murni optimasi dan tidak mengubah hasil.
    const candidateSources = [
      `SELECT cu."id" AS "id" FROM "User" cu WHERE ${compare(`cu."normalizedUsername"`)}`,
    ];
    if (includeHandles) {
      candidateSources.push(
        `SELECT ca."userId" AS "id" FROM "SocialAccount" ca
        JOIN "SocialPlatform" cp ON cp."id" = ca."platformId"
        WHERE ca."isDiscoverable" AND cp."isActive" AND ${compare(`ca."normalizedUsername"`)}`,
      );
    }
    fromUser = `FROM cand JOIN "User" u ON u."id" = cand."id"`;
    candidateCte = `cand AS MATERIALIZED (
  ${candidateSources.join("\n  UNION\n  ")}
),
`;
    where.push(includeHandles ? `(${usernameMatched} OR ${handleMatched})` : usernameMatched);
  }

  if (criteria.platformKey !== null) {
    const platform = bind(criteria.platformKey, "text");
    where.push(`ps."showPlatforms"`);
    where.push(accountMatch(` AND sp."key" = ${platform}`));
  }

  if (criteria.radiusM !== null) {
    const radius = bind(criteria.radiusM, "float8");
    where.push(`l."isEnabled"`);
    where.push(`ps."locationVisibility" = 'DISCOVERABLE_RADIUS'`);
    where.push(`sl."userId" IS NOT NULL`);
    where.push(`ST_DWithin(l."geography", sl."geography", ${radius})`);
    where.push(`ST_DWithin(l."geography", sl."geography", l."discoverableRadius"::float8)`);
  }

  let cursorWhere = "";
  let orderBy: string;
  if (criteria.sort === "distance") {
    orderBy = `"distanceUnits" ASC, "userId" ASC`;
    if (criteria.after && criteria.after.sort === "distance") {
      cursorWhere = `WHERE ("distanceUnits", "userId") > (${bind(criteria.after.value, "int")}, ${bind(criteria.after.userId, "uuid")})`;
    }
  } else {
    orderBy = `"normalizedUsername" COLLATE "C" ASC, "userId" ASC`;
    if (criteria.after && criteria.after.sort === "username") {
      cursorWhere = `WHERE ("normalizedUsername" COLLATE "C", "userId") > (${bind(criteria.after.value, "text")} COLLATE "C", ${bind(criteria.after.userId, "uuid")})`;
    }
  }
  const limit = bind(criteria.fetchLimit, "int");

  const text = `WITH ${candidateCte}base AS (
  SELECT
    u."id" AS "userId",
    u."username" AS "username",
    u."normalizedUsername" AS "normalizedUsername",
    pr."displayName" AS "displayName",
    u."status"::text AS "status",
    (u."deletedAt" IS NOT NULL) AS "deleted",
    ps."isDiscoverable" AS "isDiscoverable",
    ps."searchableByUsername" AS "searchableByUsername",
    ps."showPlatforms" AS "showPlatforms",
    ${blocked} AS "blockedEitherWay",
    ps."locationVisibility"::text AS "visibility",
    COALESCE(l."isEnabled", false) AS "locationEnabled",
    l."areaLabel" AS "areaLabel",
    l."cityLabel" AS "cityLabel",
    l."discoverableRadius" AS "discoverableRadiusM",
    CASE WHEN l."isEnabled" AND sl."userId" IS NOT NULL
      THEN ST_Distance(l."geography", sl."geography")::float8 END AS "distanceM",
    ${usernameMatched} AS "usernameMatched",
    ${handleMatched} AS "handleMatched"
  ${fromUser}
  JOIN "Profile" pr ON pr."userId" = u."id"
  JOIN "PrivacySettings" ps ON ps."userId" = u."id"
  LEFT JOIN "Location" l ON l."userId" = u."id"
  LEFT JOIN "Location" sl ON sl."userId" = ${searcher} AND sl."isEnabled"
  WHERE ${where.join("\n    AND ")}
),
c AS (
  SELECT base.*,
    CASE WHEN "distanceM" IS NULL THEN NULL
      ELSE GREATEST(2, FLOOR("distanceM" / 500.0 + 0.5)::int) END AS "distanceUnits"
  FROM base
),
page AS (
  SELECT * FROM c
  ${cursorWhere}
  ORDER BY ${orderBy}
  LIMIT ${limit}
)
SELECT page.*,
  COALESCE((
    SELECT json_agg(json_build_object(
        'platformKey', sp."key",
        'username', sa."username",
        'profileUrl', sa."profileUrl",
        'isVerified', sa."isVerified",
        'isDiscoverable', sa."isDiscoverable",
        'platformActive', sp."isActive"
      ) ORDER BY sp."key", sa."normalizedUsername")
    FROM "SocialAccount" sa
    JOIN "SocialPlatform" sp ON sp."id" = sa."platformId"
    WHERE sa."userId" = page."userId" AND sa."isDiscoverable" AND sp."isActive"
  ), '[]'::json) AS "accounts"
FROM page
ORDER BY ${orderBy}`;

  return { text, values };
}
