# Fase 12: Performance

Semua angka di sini diukur pada Postgres 16 dengan **300.000 pengguna sintetis** (599 ribu akun sosmed, 150 ribu lokasi, 20 ribu blokir; ~120 ribu pengguna discoverable). Skrip: `packages/database/perf/dataset.sql` (pembuat data) dan `packages/database/perf/explain.ts` (menghasilkan `EXPLAIN (ANALYZE, BUFFERS)` dari `buildSearchQuery` yang SAMA dengan produksi).

## Batasan pengukuran (baca dulu)

- Bagian **spasial memakai shim PostGIS** (haversine, tanpa indeks GiST). Angka skenario radius (08, 09) **tidak representatif**. Ulangi dengan PostGIS asli dan indeks `Location_geography_gist_idx` sebelum mengambil kesimpulan apa pun tentang radius.
- Data sintetis dengan distribusi nama sangat miring: prefix `al` cocok ke 15% pengguna. Itu sengaja kasus terburuk.
- Satu mesin sandbox, cache hangat. Pakai angka sebagai perbandingan sebelum/sesudah, bukan janji latensi produksi.

## Temuan dan perbaikan

1. **Klausa `username = x OR EXISTS(handle = x)` membuat pencarian O(N).** Planner meng-hash-join seluruh SocialAccount discoverable (419 ribu baris) ke PrivacySettings lalu menyaring OR sebagai join filter. Perbaikan di `search-sql.ts`: CTE `cand AS MATERIALIZED` (gabungan `UNION` dua lookup berindeks: username dan handle akun discoverable di platform aktif) dievaluasi lebih dulu, lalu di-join ke tabel lain. Klausa lama tetap ada sebagai filter dan sebagai bendera `usernameMatched`/`handleMatched`, jadi hasil tidak berubah dan guard `evaluateCandidate` tetap memeriksa bendera nyata.
2. **Daftar akun sosmed (`json_agg`) dihitung untuk semua baris cocok sebelum LIMIT.** Sekarang dihitung hanya untuk baris halaman (CTE `page`).
3. **JIT Postgres.** Rencana query ini bercost besar (estimasi baris semi-join meleset), sehingga JIT menyala dan memakan ~1,6 detik kompilasi untuk satu query ~0,6 detik. Untuk beban OLTP seperti ini matikan: `ALTER ROLE <app_role> SET jit = off;` (atau `jit = off` di postgresql.conf).

## Hasil (ms, waktu eksekusi)

| Skenario | Awal (JIT on) | Awal (JIT off) | Sesudah (JIT off) |
|---|---:|---:|---:|
| 01 exact username | 2154 | 920 | **1,2** |
| 02 exact handle | 2031 | 893 | **0,5** |
| 03 prefix lebar `al` (45 ribu cocok) | 2749 | 1519 | **641** |
| 04 prefix sempit `alexander12` | 2470 | 876 | **5,8** |
| 05 prefix lebar + platform | 2896 | 1296 | **634** |
| 06 halaman 2 (keyset) prefix `al` | 2970 | 1450 | **662** |
| 07 lookup profil | 0,19 | 0,45 | 0,19 |
| 08 radius 5 km (shim) | 123 | 147 | 113 |
| 09 radius + prefix (shim) | 113 | 116 | 210 |

Sisa ~640 ms pada prefix lebar adalah pekerjaan yang memang diperlukan: ~16 ribu kandidat harus diperiksa filter privasi/blokir lalu diurutkan (top-N). Mitigasinya ada di tingkat produk: panjang minimum kata kunci prefix dan rate limit pencarian (sudah ada: 30/menit, 300/hari). Pertimbangkan menaikkan panjang minimum prefix jika data nyata menunjukkan prefix pendek yang lebar.

## Strategi cache

**Tidak ada cache hasil pencarian per-pengguna untuk saat ini, dan itu disengaja.** Hasil bergantung pada pencari (blokir dua arah, lokasi pencari), pada privasi tiap target (isDiscoverable, showPlatforms, visibilitas lokasi), dan harus langsung berlaku saat pengguna mengubah privasi atau memblokir. Cache yang basi berarti **kebocoran privasi** (profil yang baru disembunyikan masih muncul). Respons API sudah `Cache-Control: no-store`.

Jika kelak diperlukan, syarat minimum: kunci mencakup id pencari; TTL pendek (detik); invalidasi eksplisit pada setiap perubahan privacy/lokasi/blokir/akun sosmed/hapus akun (pengguna mana pun yang berubah, bukan hanya pencari); dan tes keamanan bahwa perubahan privasi langsung menghilangkan target dari hasil. Cache untuk data statis (daftar platform) boleh dilakukan lebih dulu.

## Indeks

Indeks yang sudah ada sudah dipakai oleh rencana baru: `User_normalizedUsername_prefix_idx`, `User_normalizedUsername_key`, `SocialAccount_discoverable_username_prefix_idx` (parsial, `text_pattern_ops`), `SocialAccount_userId_idx`, `Block_*`. Tidak ada indeks baru yang diperlukan untuk perbaikan ini. Tidak ditambahkan indeks `COLLATE "C"` karena pengurutan kini dilakukan atas himpunan kandidat kecil; tinjau ulang jika EXPLAIN pada data nyata menunjukkan sort besar.

## Pool koneksi Prisma

Atur lewat parameter URL, contoh: `DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=10"`. Aturan praktis: `connection_limit` = (max_connections Postgres − cadangan) / jumlah instansi aplikasi. Belum diuji di sini (Prisma tidak terpasang di sandbox).

## Uji beban

Belum dijalankan (butuh aplikasi Next berjalan dan Redis). Rencana: k6 atau autocannon terhadap `/api/search` dengan akun uji, memantau p95 dan 429 (rate limit sebagai perilaku yang diharapkan). Ulangi EXPLAIN di atas pada data nyata/staging terlebih dulu.

## Mengulang pengukuran

```bash
psql -d <db_kosong_berskema> -f packages/database/perf/dataset.sql
pnpm tsx packages/database/perf/explain.ts <uuid_pencari> /tmp/explain.sql
psql -d <db> -c "SET jit=off" -f /tmp/explain.sql
```
