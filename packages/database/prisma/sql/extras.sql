-- Ditambahkan ke migrasi init oleh scripts/create-init-migration.mjs.
-- Berisi hal yang tidak bisa diungkapkan schema.prisma: index spasial,
-- partial index, operator class prefix, dan CHECK constraint.

-- ---------- Index ----------

-- Pencarian radius (ST_DWithin / ST_Distance) pada titik yang sudah di-snap.
CREATE INDEX "Location_geography_gist_idx" ON "Location" USING GIST ("geography");

-- Pencarian prefix username (LIKE 'abc%'). text_pattern_ops diperlukan karena
-- collation default (mis. en_US.utf8) tidak bisa memakai btree biasa untuk LIKE.
CREATE INDEX "User_normalizedUsername_prefix_idx"
  ON "User" ("normalizedUsername" text_pattern_ops);

-- Hanya akun yang discoverable yang dicari: satu index dengan filter platform,
-- satu untuk prefix tanpa filter platform.
CREATE INDEX "SocialAccount_discoverable_prefix_idx"
  ON "SocialAccount" ("platformId", "normalizedUsername" text_pattern_ops)
  WHERE "isDiscoverable";

CREATE INDEX "SocialAccount_discoverable_username_prefix_idx"
  ON "SocialAccount" ("normalizedUsername" text_pattern_ops)
  WHERE "isDiscoverable";

-- Satu username terverifikasi per platform = satu pemilik.
CREATE UNIQUE INDEX "SocialAccount_verified_unique_idx"
  ON "SocialAccount" ("platformId", "normalizedUsername")
  WHERE "isVerified";

-- ---------- CHECK constraint ----------

ALTER TABLE "User"
  ADD CONSTRAINT "User_email_lowercase_chk" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "User_normalizedUsername_matches_username_chk"
    CHECK ("normalizedUsername" = lower("username"));

ALTER TABLE "SocialAccount"
  ADD CONSTRAINT "SocialAccount_normalizedUsername_matches_username_chk"
    CHECK ("normalizedUsername" = lower("username"));

-- Radius minimum 1 km (privasi: tidak mengizinkan radius sempit yang memudahkan triangulasi).
ALTER TABLE "Location"
  ADD CONSTRAINT "Location_discoverableRadius_range_chk"
    CHECK ("discoverableRadius" BETWEEN 1000 AND 50000);

ALTER TABLE "Block"
  ADD CONSTRAINT "Block_not_self_chk" CHECK ("blockerId" <> "blockedId");

ALTER TABLE "Report"
  ADD CONSTRAINT "Report_not_self_chk"
    CHECK ("reporterId" IS NULL OR "reporterId" <> "targetUserId");
