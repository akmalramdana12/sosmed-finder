# Halaman UI

Semua halaman memanggil API yang sama dengan klien lain (`apps/web/lib/client/api.ts`); tidak ada logika keamanan di klien. Halaman yang membutuhkan login mengarahkan ke `/login` bila API menjawab 401.

| Rute | Fungsi | API |
| --- | --- | --- |
| `/` | Beranda | – |
| `/register`, `/login` | Daftar, masuk | `/api/auth/register`, `/api/auth/login` |
| `/forgot-password`, `/reset-password#token=…` | Lupa dan atur ulang password | `/api/auth/password-reset/*` |
| `/verify-email#token=…` | Verifikasi email dari tautan | `/api/auth/email/verify` |
| `/dashboard` | Email (kirim ulang verifikasi), ganti password, hapus akun | `/api/me`, `/api/me/password`, `/api/me/email/verification` |
| `/profile` | Nama tampilan, username, bio | `PATCH /api/me` |
| `/accounts` | Akun sosmed: tambah, izinkan ditemukan, hapus | `/api/me/social-accounts`, `/api/platforms` |
| `/privacy` | Tiga saklar discoverability + status "bisa ditemukan sekarang" | `/api/me/privacy` |
| `/location` | Lokasi perkiraan, dengan persetujuan eksplisit | `/api/me/location` |
| `/search` | Pencarian (kata kunci dan/atau radius), muat lebih banyak (cursor) | `/api/search` |
| `/u/<username>` | Profil publik, blokir, laporkan | `/api/users/:username`, `/api/blocks`, `/api/reports` |
| `/blocked` | Daftar blokir, buka blokir | `/api/blocks` |
| `/dashboard` (bagian "Unduh data saya") | Ekspor data sendiri sebagai JSON, wajib password | `/api/me/export` |
| `/moderation` | Antrean laporan untuk moderator (tanpa tautan navigasi; non-moderator melihat pesan netral) | `/api/mod/reports` |

## Keputusan yang disengaja

- **Lokasi:** izin browser baru diminta saat tombol ditekan. Koordinat hanya ada di variabel lokal, dikirim sekali ke server (yang membulatkannya ke grid), dan tidak pernah ditampilkan atau disimpan di state.
- **Tautan sosmed:** hanya `http(s)` yang dirender sebagai tautan (`safeExternalUrl`), dengan `rel="noopener noreferrer nofollow"`.
- **404 profil seragam:** halaman profil publik menampilkan pesan yang sama untuk "tidak ada", "tidak bisa ditemukan", dan "diblokir".
- **Token di fragmen URL**, dihapus dari bilah alamat setelah dibaca.

## Belum ada

Tes UI/e2e untuk halaman, desain visual yang matang (saat ini Tailwind netral dan fungsional), pengaturan bahasa, dan antrean moderasi yang matang (saat ini fungsional saja).
