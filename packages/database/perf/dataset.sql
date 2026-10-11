-- CATATAN: pada PostGIS asli, ganti ROW(lat, lng)::geography di bawah dengan
--   ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
-- (versi ROW dipakai hanya untuk shim PostGIS di lingkungan pengembangan tanpa ekstensi).
-- Dataset sintetis: N pengguna. Bukan data nyata. Jalankan pada database KOSONG berskema Social Finder.
\set n 300000
TRUNCATE "Block","Location","SocialAccount","SocialPlatform","PrivacySettings","Profile","User" CASCADE;
INSERT INTO "SocialPlatform"("key","name","urlTemplate") VALUES ('instagram','Instagram','https://instagram.com/{username}'),('x','X','https://x.com/{username}'),('tiktok','TikTok','https://tiktok.com/@{username}');

CREATE TEMP TABLE names AS SELECT * FROM unnest(ARRAY['alex','alice','alan','andi','anita','budi','bella','citra','dewi','dian','eko','fajar','gita','hadi','indra','joko','kiki','lina','maya','nina','omar','putri','rani','sari','tono','udin','vina','wati','yuni','zaki','alexa','alexander','albert','amir','ayu','bagas','bayu','cahya','dimas','erik']) WITH ORDINALITY AS t(name, ord);

INSERT INTO "User"("id","email","passwordHash","username","normalizedUsername","status","updatedAt")
SELECT gen_random_uuid(), 'u'||i||'@example.test', 'x', nm.name||i, nm.name||i,
       CASE WHEN i % 200 = 0 THEN 'SUSPENDED'::"UserStatus" ELSE 'ACTIVE'::"UserStatus" END, now()
FROM generate_series(1,:n) i JOIN names nm ON nm.ord = (i % 40) + 1;

INSERT INTO "Profile"("userId","displayName","updatedAt") SELECT "id", 'Name '||"username", now() FROM "User";
INSERT INTO "PrivacySettings"("userId","isDiscoverable","searchableByUsername","showPlatforms","locationVisibility")
SELECT "id", random() < 0.4, random() < 0.9, random() < 0.8,
       (ARRAY['PRIVATE','CITY_ONLY','AREA_ONLY','DISCOVERABLE_RADIUS'])[1 + floor(random()*4)::int]::"LocationVisibility"
FROM "User";

-- 1..3 akun per pengguna; handle = username + sufiks platform
INSERT INTO "SocialAccount"("userId","platformId","username","normalizedUsername","profileUrl","isDiscoverable","updatedAt")
SELECT u."id", p."id", u."username"||'_'||p."key", u."normalizedUsername"||'_'||p."key", 'https://example.test/'||u."username", random() < 0.7, now()
FROM "User" u JOIN LATERAL (SELECT * FROM "SocialPlatform" ORDER BY "key" LIMIT (1 + (hashtext(u."id"::text) & 1) + (hashtext(u."username") & 1))) p ON true;

INSERT INTO "Location"("userId","geography","accuracyLevel","areaLabel","cityLabel","discoverableRadius","isEnabled")
SELECT "id", ROW(1.0 + random()*0.3, 103.9 + random()*0.3)::geography, 'AREA', 'Area', 'Batam', 1000 + (floor(random()*10)::int)*1000, random() < 0.7
FROM "User" WHERE random() < 0.5;

-- ~20.000 blokir acak: pasangan berurutan dari urutan acak
WITH s AS (SELECT "id", row_number() OVER (ORDER BY random()) rn FROM "User")
INSERT INTO "Block"("blockerId","blockedId") SELECT a."id", b."id" FROM s a JOIN s b ON b.rn = a.rn + 1 WHERE a.rn <= 20000;

ANALYZE;
