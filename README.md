# Social Finder

Platform web opt-in untuk menemukan profil sosial media pengguna yang secara sukarela mendaftar dan mengaktifkan discoverability. Bukan sistem surveillance: lokasi hanya perkiraan, default PRIVATE.

Dokumen desain: [`docs/`](docs/) (system design, ERD, API contract, security model, roadmap).

## Prasyarat

- Node >= 22, pnpm 10 (`corepack enable`)
- Docker (untuk Postgres+PostGIS dan Redis)

## Mulai

```bash
corepack enable
./scripts/install-deps.sh   # SEKALI: memasang dependensi tiap workspace (lihat isinya dulu; versi dikunci seperlunya)
cp .env.example .env        # isi POSTGRES_PASSWORD dan SESSION_SECRET
docker compose up -d        # postgres + redis
pnpm db:init-migration && pnpm db:migrate && pnpm db:seed   # lihat packages/database/README.md
pnpm dev
```

Setelah `install-deps.sh`, commit `package.json` dan `pnpm-lock.yaml`; seterusnya cukup `pnpm install`.
Repo ini **belum** mendeklarasikan versi dependensi apa pun sebelum skrip itu dijalankan.

## Perintah

| Perintah            | Fungsi                |
| ------------------- | --------------------- |
| `pnpm lint`         | ESLint                |
| `pnpm format:check` | Prettier (cek)        |
| `pnpm typecheck`    | TypeScript strict     |
| `pnpm test`         | Vitest                |
| `pnpm build`        | Build semua workspace |
| `pnpm --filter @social-finder/api test:integration` | Tes integrasi Postgres+PostGIS (butuh `.env.test`, DB `*_test`) |
| `pnpm --filter @social-finder/web test:e2e`         | E2E API (Playwright) terhadap server nyata |

## Status

Fase 1-11 (Bootstrap, Database, Authentication, Profile, Social accounts, Discoverability, Location, Search, Block & Report, Testing, Security hardening) sudah ditulis. Strategi test dan apa yang sudah/belum terverifikasi: `docs/setup/08-testing.md`. Lihat `packages/database/README.md` dan `packages/api/README.md` untuk langkah menjalankan. Roadmap: `docs/product/06-mvp-roadmap.md`.
