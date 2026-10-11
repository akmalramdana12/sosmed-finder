# Fase 13: Deployment

> **Status jujur:** semua artefak di sini (Dockerfile, compose produksi, Caddyfile, job CI docker) ditulis tetapi **belum pernah dibangun atau dijalankan**; lingkungan penulisan tidak punya Docker, registry, atau dependensi terpasang. Anggap sebagai titik awal yang harus lolos build pertama di mesin Anda / di CI.

## Arsitektur

Satu host dengan Docker Compose (`docker-compose.prod.yml`):

| Layanan | Peran | Terbuka ke luar? |
|---|---|---|
| caddy | TLS otomatis, reverse proxy, batas body 1 MB | 80, 443 |
| web | Next.js (output standalone), proses non-root, filesystem read-only | tidak |
| worker | BullMQ, job retensi tiap jam (lihat "Retensi data"); dijalankan dengan tsx | tidak |
| migrate | `prisma migrate deploy`, sekali per rilis, lalu keluar | tidak |
| postgres | PostGIS 16, `jit=off` (lihat 09-performance.md) | tidak |
| redis | rate limit bersama, ber-password | tidak |

`TRUST_PROXY=true` benar hanya karena Caddy adalah tepat satu proxy di depan web. Jangan menambah proxy/CDN di depannya tanpa meninjau `getClientIp` (memakai entri TERAKHIR `X-Forwarded-For`).

## Prasyarat sebelum build pertama

1. Jalankan `scripts/install-deps.sh` lalu **commit `pnpm-lock.yaml`** (Dockerfile memakai `--frozen-lockfile`).
2. **Buat dan commit migrasi** (belum ada): dengan DB lokal menyala, `pnpm db:init-migration`. Ini menempelkan `extras.sql` (GiST, partial index, CHECK) ke migrasi. Tanpa migrasi, service `migrate` tidak membuat tabel apa pun.
3. Tambahkan migrasi untuk `Location.cityLabel` (kolom baru dari Fase 7) bila migrasi init dibuat sebelum kolom itu ada.
4. Pastikan `pnpm typecheck && pnpm test && pnpm build` lulus lokal.

## Menjalankan

```bash
cp .env.production.example .env.production      # isi; pakai openssl rand -hex 24 untuk password/secret
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
curl -fsS https://$APP_DOMAIN/api/health
```
DNS A/AAAA untuk `APP_DOMAIN` harus mengarah ke host sebelum `up` agar Caddy bisa mengambil sertifikat.

## Rilis, rollback, backup

- **Rilis:** `git pull && docker compose ... build && docker compose ... up -d`. `migrate` jalan lebih dulu; `web`/`worker` menunggu `service_completed_successfully`. Migrasi harus kompatibel mundur (tambah dulu, hapus kemudian) agar rollback kode aman.
- **Rollback kode:** checkout tag sebelumnya lalu build/up. Rollback skema dilakukan manual lewat migrasi baru, bukan `migrate reset`.
- **Backup:** `deploy/backup.sh` (pg_dump terkompresi). Simpan di luar host dan terenkripsi; uji restore. Volume `pgdata` bukan backup.
- **Secret:** `.env.production` tidak masuk git (sudah di .gitignore). Memutar `SESSION_SECRET` membuat hash IP lama di audit tidak lagi bisa dicocokkan (sesi tidak terpengaruh karena token di-hash SHA-256 tanpa secret).

## Daftar periksa PRODUCTION

| Item | Status |
|---|---|
| TLS + HSTS, CSP bernonce, cookie `__Host-`, CSRF Origin | ditulis; **belum diuji di Next/Caddy asli** |
| Postgres/Redis tidak terbuka, Redis ber-password | dikonfigurasi di compose, belum dijalankan |
| Rate limit Redis fail-closed, `TRUST_PROXY` benar | kode ada; perlu uji nyata di belakang Caddy |
| Migrasi ter-commit | **BELUM** (prasyarat 2) |
| `pnpm-lock.yaml` ter-commit | **BELUM** |
| Dockerfile/compose terbukti build & jalan | **BELUM** (job CI `docker` akan menguji build + smoke) |
| Prisma engine ikut di bundel standalone | **tidak terverifikasi**; bila web gagal query, tambahkan `outputFileTracingIncludes` untuk engine Prisma |
| EXPLAIN PostGIS asli, indeks GiST dipakai | **BELUM** (09-performance.md) |
| Uji beban | **BELUM** |
| Retensi/purge (worker) | kode + tes unit ada; **belum dijalankan** terhadap BullMQ/DB asli |
| Backup terjadwal + uji restore | skrip ada; penjadwalan dan uji restore **BELUM** |
| Monitoring/alert (health, 5xx, 429, disk) | **BELUM** |
| Pemindaian dependensi di CI | ada (`pnpm audit`); Dependabot ada |

## Retensi data

Job `maintenance` (antrean BullMQ, `upsertJobScheduler` tiap 1 jam, 3 percobaan dengan backoff) menjalankan, masing-masing independen dan idempotent:

| Tugas | Aturan |
|---|---|
| Purge akun | `PENDING_DELETION` dengan `deletedAt` > 30 hari dihapus permanen (cascade: profil, privasi, sesi, token, blokir, SearchLog, notifikasi; AuditLog dan Report.reporter di-`SetNull`) |
| Sesi | kedaluwarsa atau dicabut > 7 hari |
| Token verifikasi | kedaluwarsa > 1 hari |
| SearchLog | > 30 hari |
| AuditLog | > 365 hari |

Angka ada di `RETENTION` (`packages/api/src/modules/maintenance/maintenance-service.ts`): **kebijakan produk/hukum, tinjau sebelum produksi.** Catatan: `Report.target` ber-cascade, jadi laporan terhadap akun yang dipurge ikut hilang; putuskan apakah bukti moderasi perlu disimpan lebih lama. Log worker hanya memuat jumlah baris dan nama tugas.

## Pemblokir sebelum membuka ke publik

1. ~~Worker kerangka~~ **Sudah ditulis** (modul `maintenance` + worker BullMQ, lihat di bawah), tetapi baru teruji di tingkat unit; belum dijalankan terhadap Redis/BullMQ/Postgres asli. Verifikasi di staging: buat akun, hapus, mundurkan `deletedAt` 31 hari lewat SQL, jalankan job, pastikan baris hilang.
2. Reset password dan verifikasi email: API sudah ada, tetapi butuh `SMTP_URL` + `MAIL_FROM` (wajib di production), halaman UI belum ada, dan belum diuji dengan SMTP asli. Verifikasi email belum menggerbangi fitur apa pun.
3. Tooling moderasi laporan belum ada (laporan masuk tetapi tak ada yang menanganinya).
4. Semua yang bertanda BELUM di tabel di atas, terutama build Docker pertama, migrasi, dan tes yang belum pernah dijalankan (integrasi block/location, e2e Playwright).
