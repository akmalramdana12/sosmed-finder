# Testing (Fase 10)

## Lapisan test

| Lapisan | Lokasi | Perintah | Butuh | Status verifikasi |
| --- | --- | --- | --- | --- |
| Unit (logika murni, repositori tiruan) | `packages/*/src/**/*.test.ts`, `apps/web/lib/*.test.ts` | `pnpm test` | dependensi terpasang | **Dijalankan** di harness lokal (410 tes, tsc strict bersih) |
| Regresi keamanan statis | `packages/api/src/security-regression.test.ts` | ikut `pnpm test` | - | **Dijalankan**; terbukti gagal bila route kehilangan `requireUser`, ada `console.log`, atau ada `any` |
| Integrasi pencarian | `packages/api/integration/search.integration.test.ts` | `test:integration` | Postgres+PostGIS, DB `*_test` | **16/16 lulus** di Postgres 16 asli, **tanpa PostGIS** (shim `ST_*`); seed lolos CHECK dan index dari `extras.sql` |
| Integrasi block/report, lokasi | `packages/api/integration/{safety,location}.integration.test.ts` | `test:integration` | Prisma + PostGIS asli | **Belum pernah dijalankan** |
| E2E API | `apps/web/e2e/api.spec.ts` | `test:e2e` | server Next + DB + seed platform | **Belum pernah dijalankan** (hanya diperiksa sintaksnya) |

Tes yang "belum pernah dijalankan" tidak boleh dianggap lulus. Kegagalan pertama di sana wajar dan berharga:
itu justru bug yang tidak terjangkau tes unit (repositori Prisma, SQL PostGIS, wiring route).

## Tes integrasi: aman untuk data dev

Tes integrasi menjalankan `TRUNCATE` pada semua tabel. `assertTestDatabase()` menolak berjalan kecuali nama
database di `DATABASE_URL` berakhiran `_test`. Langkah:

```bash
docker compose exec postgres createdb -U socialfinder socialfinder_test
cp .env.test.example .env.test            # sesuaikan password
# buat skema di DB test (sama dengan CI):
pnpm --filter @social-finder/database exec dotenv -e ../../.env.test -- prisma db push --skip-generate
psql "postgresql://socialfinder:PASSWORD@localhost:5432/socialfinder_test" -f packages/database/prisma/sql/extras.sql
pnpm --filter @social-finder/api test:integration
```

## Temuan Fase 10 (sebagian sudah diperbaiki)

- Tidak ada dependensi yang terdeklarasi di repo: `pnpm install` saja tidak memasang turbo, vitest, next, dll.
  Diperbaiki dengan `scripts/install-deps.sh` (dipetakan dari impor sebenarnya per workspace). `validation` dan `web`
  sama-sama mengimpor `zod`; sebelumnya hanya `web` yang disebut di dokumentasi.
- pnpm 10 memblokir skrip install: `pnpm-workspace.yaml` sekarang punya `onlyBuiltDependencies` (Prisma, esbuild).
- INSERT mentah ke kolom `@updatedAt` Prisma wajib mengisi `updatedAt` (tidak ada default di DB).

## Yang belum ada

- Tes UI/komponen (UI belum dibangun), uji beban penuh (lihat 09-performance.md), pemindaian dependensi (Fase 11).
- Tes konkurensi: batas 10 akun sosmed dan 500 blokir tidak dikunci; belum ada tes yang membuktikan dampaknya.
- Tes terhadap PostGIS asli: perilaku `ST_DWithin`, index GiST, dan presisi `geography` baru teruji lewat shim.
