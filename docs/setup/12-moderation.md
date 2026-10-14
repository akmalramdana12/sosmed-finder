# Moderasi laporan dan verifikasi email

## Peran moderator

Peran ada di `User.role` (`USER` | `MODERATOR`). **Tidak ada API untuk mengubahnya**: peran diberikan
dan dicabut langsung di database oleh operator, sehingga bug aplikasi tidak bisa menaikkan hak akses.

```sql
-- beri peran (ganti username; selalu huruf kecil)
UPDATE "User" SET "role" = 'MODERATOR' WHERE "normalizedUsername" = 'namamoderator';
-- cabut
UPDATE "User" SET "role" = 'USER' WHERE "normalizedUsername" = 'namamoderator';
```

Peran dibaca dari database pada **setiap** permintaan, jadi pencabutan langsung berlaku. Pengguna yang
bukan moderator (atau tidak aktif) menerima `404` yang sama dengan rute yang tidak ada. Batas laju
dihitung sebelum cek peran, sehingga menebak endpoint ini juga dibatasi.

## Antarmuka

Halaman `/moderation` (tidak ada tautan di navigasi; buka langsung). Bukan moderator melihat
"Halaman tidak tersedia".

| Endpoint | Fungsi |
|---|---|
| `GET /api/mod/reports?status=OPEN&limit=20&cursor=` | Antrean, terlama dulu, paginasi cursor bertanda tangan |
| `POST /api/mod/reports/:id {action, note?}` | Tindakan |

DTO moderator berisi: id laporan, alasan, isi laporan, status, waktu, catatan moderator, serta username,
status akun, dan jumlah laporan terbuka untuk target. **Tidak ada** identitas pelapor, email, atau lokasi.

## Tindakan dan aturan transisi

| Aksi | Syarat | Efek |
|---|---|---|
| `review` | laporan OPEN | laporan REVIEWING |
| `dismiss` | laporan terbuka | laporan DISMISSED |
| `resolve` | laporan terbuka | laporan RESOLVED, tanpa sanksi |
| `suspend` (catatan wajib) | laporan terbuka, target ACTIVE dan berperan USER | laporan RESOLVED, akun SUSPENDED, **semua sesi target dicabut** |
| `reinstate` (catatan wajib) | target SUSPENDED (laporan boleh sudah selesai) | akun ACTIVE; sesi lama tetap dicabut (login ulang) |

- Tidak ada efek otomatis dari jumlah laporan (laporan massal tidak boleh jadi senjata).
- Moderator tidak bisa menangguhkan moderator (dicek di service dan dipaksa di `WHERE` SQL).
- Perubahan memakai compare-and-set pada status laporan di dalam satu transaksi: dua moderator yang
  bertindak bersamaan tidak saling menimpa (yang kedua mendapat `409`), dan bila efek pada akun gagal,
  perubahan status laporan ikut dibatalkan.
- Audit: `moderation.report.<aksi>` dengan alasan laporan dan transisi status. Isi catatan dan
  identitas pelapor tidak masuk audit.
- Catatan moderator tidak pernah dikirim ke pelapor maupun target.

## Migrasi

`packages/database/prisma/migrations/20261012000000_moderation/migration.sql` menambah enum `UserRole`,
`User.role`, `Report.reviewedById`, `Report.moderatorNote`. Ditulis idempoten dan aman di dua urutan
(DB yang sudah punya migrasi init, atau DB baru yang init-nya dibuat dari schema terbaru).

## Verifikasi email

- Pencari **dan** hasil pencarian/profil publik wajib berakun dengan email terverifikasi. Tanpa ini,
  akun sekali pakai bisa dibuat massal untuk memindai atau untuk muncul di pencarian.
- Pencari belum terverifikasi: `403` dengan pesan yang mengarahkan ke menu Akun (tombol kirim ulang email
  verifikasi sudah ada). Target belum terverifikasi: tidak muncul; profilnya `404` seperti "tidak ada".
- Filter diterapkan di SQL **dan** diperiksa ulang di `evaluateCandidate` (alasan `email-unverified`).
- `REQUIRE_VERIFIED_EMAIL=false` hanya untuk development/e2e (tanpa kotak surat). **Di production nilai
  `false` ditolak saat boot.**
- Dampak produk: pengguna baru tidak bisa mencari atau ditemukan sampai email terverifikasi. Pastikan
  SMTP berfungsi sebelum peluncuran, kalau tidak tidak ada yang bisa memakai pencarian.

## Belum ada

Penyimpanan bukti laporan setelah akun dipurge (laporan ikut terhapus; lihat `10-deployment.md`),
banding oleh pengguna, notifikasi ke pelapor, penugasan laporan antar moderator, pencarian riwayat
moderasi per akun.
