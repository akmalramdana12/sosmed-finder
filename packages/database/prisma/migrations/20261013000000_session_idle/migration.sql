-- Idle timeout sesi: kolom Session.lastSeenAt.
-- Idempoten; tidak melakukan apa pun bila tabel "Session" belum ada (berjalan sebelum init, lalu init
-- dibuat dari schema.prisma terbaru yang sudah memuat kolom ini). Sesi lama diberi nilai saat migrasi.
DO $$
BEGIN
  IF to_regclass('"Session"') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
END
$$;
