# @social-finder/database

Prisma + PostgreSQL + PostGIS. Skema mengikuti `docs/database/03-database-erd.md`.

## Pasang dependensi (sekali, dari root proyek)

```bash
pnpm --filter @social-finder/database add @prisma/client@6
pnpm --filter @social-finder/database add -D prisma@6 dotenv-cli tsx @types/node
```

Versi Prisma dikunci ke 6.x karena skema memakai `url = env(...)` di `datasource` dan
`package.json#prisma`. Prisma 7 memindahkan konfigurasi ke `prisma.config.ts`.

## Langkah pertama

```bash
cp .env.example .env            # isi POSTGRES_PASSWORD, sesuaikan DATABASE_URL
docker compose up -d            # Postgres+PostGIS dan Redis
pnpm db:validate                # cek schema.prisma
pnpm db:init-migration          # buat migrasi init + tempel prisma/sql/extras.sql
pnpm db:migrate                 # terapkan
pnpm db:seed                    # isi SocialPlatform
```

Catatan:

- `docker/postgres/20-extensions.sql` hanya berjalan saat volume baru dibuat. Jika Postgres
  sudah pernah dijalankan sebelumnya: `docker compose down -v` lalu `up -d` (menghapus data dev).
- Migrasi harus lewat `db:init-migration`, bukan `prisma migrate dev` langsung, agar index spasial
  dan CHECK constraint ikut masuk.
- Bila `prisma migrate dev` kemudian mengusulkan **menghapus** index/constraint dari `extras.sql`,
  jangan diterapkan; catat dan perbaiki di migrasi tersendiri.
- Produksi: gunakan `pnpm db:deploy`, bukan `migrate dev`.

## Aturan privasi di level data

- `Location.geography` hanya berisi titik yang sudah di-snap; presisi mentah tidak pernah disimpan.
- Baca/tulis kolom geography lewat `prisma.$queryRaw` tagged template (terparameter), tidak lewat
  string concat.
- Client tidak mengaktifkan log `query`, agar parameter lokasi tidak masuk log.
- Default aman: `isDiscoverable=false`, `locationVisibility=PRIVATE`, `Location.isEnabled=false`.
