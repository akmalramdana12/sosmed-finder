-- Dijadikan migrasi KEDUA oleh `pnpm --filter @social-finder/database db:migrate:spatial`.
-- Hal yang tidak bisa diekspresikan di schema.prisma: index spasial, partial/pattern index, CHECK.
-- Nama tabel/kolom memakai nama default Prisma (case-sensitive, di-quote).

-- Index spasial untuk pencarian radius (ST_DWithin / ST_Distance).
CREATE INDEX "Location_geography_gist" ON "Location" USING GIST ("geography");

-- Prefix search username: LIKE 'abc%' dapat memakai btree dengan text_pattern_ops.
CREATE INDEX "User_normalizedUsername_prefix" ON "User" ("normalizedUsername" text_pattern_ops);
CREATE INDEX "SocialAccount_normalizedUsername_prefix"
  ON "SocialAccount" ("normalizedUsername" text_pattern_ops);

-- Search hanya menyentuh akun discoverable.
CREATE INDEX "SocialAccount_discoverable_partial"
  ON "SocialAccount" ("platformId", "normalizedUsername")
  WHERE "isDiscoverable";

-- Satu username terverifikasi per platform tidak boleh diklaim dua user.
CREATE UNIQUE INDEX "SocialAccount_verified_unique"
  ON "SocialAccount" ("platformId", "normalizedUsername")
  WHERE "isVerified";

-- Integritas data.
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "User_username_normalized" CHECK ("normalizedUsername" = lower("username"));

ALTER TABLE "SocialAccount"
  ADD CONSTRAINT "SocialAccount_username_normalized"
  CHECK ("normalizedUsername" = lower("username"));

ALTER TABLE "Block"
  ADD CONSTRAINT "Block_no_self_block" CHECK ("blockerId" <> "blockedId");

ALTER TABLE "Location"
  ADD CONSTRAINT "Location_radius_range" CHECK ("discoverableRadius" BETWEEN 1000 AND 50000),
  ADD CONSTRAINT "Location_enabled_requires_point"
  CHECK ("isEnabled" = false OR "geography" IS NOT NULL);
