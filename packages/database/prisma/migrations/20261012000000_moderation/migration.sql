-- Moderasi laporan: peran pengguna + jejak peninjauan pada Report.
-- Idempotent dan aman di dua urutan: (a) DB yang sudah punya init (sebelum fitur ini), dan
-- (b) DB baru, di mana init dibuat dari schema.prisma terbaru dan sudah memuat semuanya.
-- Bila tabel "User" belum ada (migrasi ini berjalan sebelum init), tidak melakukan apa pun.

DO $$
BEGIN
  IF to_regclass('"User"') IS NULL OR to_regclass('"Report"') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR');
  END IF;

  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER';
  ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "reviewedById" UUID;
  ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "moderatorNote" VARCHAR(1000);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Report_reviewedById_fkey') THEN
    ALTER TABLE "Report"
      ADD CONSTRAINT "Report_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
