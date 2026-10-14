# Rencana tes menyeluruh

Status per 2026-10-12. "Terbukti" = sudah dijalankan dengan dependensi/database asli (GitHub Actions).

## Sudah terbukti (run Bootstrap terakhir)

typecheck strict, unit test, build Next, migrasi init pada PostGIS, tes integrasi block/report/lokasi/pencarian, e2e API (Playwright), build Docker (web, worker, migrate), smoke web dan Prisma/argon2 di image.
Tes integrasi moderasi, verifikasi email, dan ekspor data **baru ditambahkan** dan belum pernah dijalankan.

## Belum pernah dijalankan (urut prioritas)

1. **Alur lengkap dengan email asli**: daftar, email verifikasi tiba, klik tautan, pencarian terbuka. Butuh SMTP nyata (pencarian wajib email terverifikasi).
2. **Worker retensi terhadap Redis asli** (BullMQ scheduler per jam, purge akun, token kedaluwarsa).
3. **UI di browser** (HP dan desktop): semua halaman, `/moderation` dengan akun moderator, unduh data, geolokasi.
4. **Compose produksi** (`docker-compose.prod.yml` + Caddy): TLS, `TRUST_PROXY`, backup `deploy/backup.sh`, restore.
5. **EXPLAIN pencarian pada PostGIS asli** (indeks GiST) dan uji beban (`docs/setup/09-performance.md`).
6. **Uji keamanan manual**: CSRF (Origin salah), cookie `__Host-`, CSP di browser asli, rate limit dengan Redis, enumerasi (respons seragam), IDOR pada `/api/mod/*` dan `/api/me/*`.

## Skenario manual inti (dua akun A dan B, satu moderator M)

| # | Skenario | Hasil yang diharapkan |
|---|---|---|
| 1 | A daftar, belum verifikasi, buka /search | Pesan: verifikasi email dulu (403) |
| 2 | A verifikasi lewat tautan, aktifkan discoverable | A bisa mencari |
| 3 | B (terverifikasi) cari username A | A muncul tanpa email/koordinat |
| 4 | A pilih lokasi PRIVATE, B cari radius | A tidak muncul |
| 5 | A ubah ke DISCOVERABLE_RADIUS 5 km, B dalam radius | A muncul dengan jarak dibulatkan |
| 6 | A blokir B | B tidak melihat A, A tidak melihat B; profil 404 |
| 7 | B laporkan A | Laporan masuk antrean M; A tidak terdampak otomatis |
| 8 | M tangguhkan A dengan catatan | A keluar dari semua sesi, tidak bisa login, hilang dari pencarian |
| 9 | M aktifkan kembali A | A bisa login ulang |
| 10 | Pengguna biasa buka /api/mod/reports | 404 |
| 11 | A unduh data (password benar/salah) | Berkas JSON tanpa koordinat / error password |
| 12 | A hapus akun, tunggu masa tunggu, jalankan worker | Data terhapus permanen |
| 13 | Reset password lewat email | Tautan sekali pakai; semua sesi lama mati |

Temuan: kirim screenshot atau log; saya perbaiki dari akar masalahnya.
