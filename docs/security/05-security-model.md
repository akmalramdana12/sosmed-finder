# Security Model

## Aset & aktor

Aset: kredensial, lokasi perkiraan, relasi block, daftar akun sosmed. Ancaman: stalker/scraper, brute-force, IDOR, XSS/CSRF/SSRF, SQLi, enumerasi, kebocoran lokasi (triangulasi), insider/log leak.

## Status implementasi (Fase 11)

Tabel di bawah adalah rencana kontrol. Kolom ini memisahkan yang **sudah ada dan teruji** dari yang belum.
"Teruji" berarti ada tes yang dijalankan di harness lokal; hampir semuanya belum pernah dijalankan terhadap Next.js, Prisma, argon2, atau Redis asli.

| Kontrol | Status |
| --- | --- |
| argon2id, min 12 karakter | Ada. Cek password bocor: **belum** |
| Sesi acak 256-bit, hash di DB, cookie HttpOnly/SameSite (`__Host-` + Secure di production), sesi baru tiap login | Ada |
| Timeout sesi | Hanya absolut 14 hari. **Idle timeout belum ada** |
| Cabut semua sesi saat ganti password | Ada (`POST /api/me/password`; pengguna harus login ulang) |
| Brute force: batas per IP + per akun, waktu respons seragam | Ada. Lockout/backoff progresif: **belum** (fixed window) |
| Anti-enumerasi (register/login, 404 seragam, block/report seragam) | Ada |
| Anti-IDOR (id pelaku dari sesi, kepemilikan di WHERE) | Ada + tes statis yang menjaga setiap route |
| CSRF | Origin/Referer wajib untuk mutasi (SameSite=Lax). **Token CSRF terpisah belum ada** |
| CSP bernonce (`strict-dynamic`, tanpa unsafe-inline untuk skrip) | Ada di `middleware.ts`, saklar `CSP_REPORT_ONLY`. **Belum pernah dijalankan di Next asli**: bisa memecah halaman |
| Header lain (HSTS, nosniff, frame, referrer, permissions), CSP API `default-src 'none'` | Ada |
| SQLi, SSRF, CORS | Ada (SQL terparameter + tes statis; tidak ada fetch URL pengguna; tanpa header CORS = same-origin) |
| Audit login/privasi/block/report/hapus akun/ganti password | Ada |
| Redaksi log | Ada (tes statis: tanpa console.log, console.error hanya JSON statis) |
| Hapus akun | Ada: seketika hilang dari pencarian, sesi dicabut, lokasi/akun sosmed dihapus; hapus permanen setelah 30 hari **butuh worker yang belum menjadwalkannya** (`AccountService.purgeExpired` siap dipanggil) |
| Ekspor data pengguna | **Belum ada** |
| Reset password, verifikasi email | Ada (`modules/recovery`): token acak 256-bit, hanya hash di DB, sekali pakai (klaim atomik), 30 mnt/24 jam, tautan memakai fragmen `#token=` (tidak masuk log server/Referer), respons seragam, batas per IP dan per email (tanpa memandang terdaftar/tidak), reset mencabut semua sesi, argon2 tidak dihitung untuk token sampah, email dikirim di latar belakang. **Belum teruji dengan SMTP dan Prisma asli**; halaman UI `/forgot-password`, `/reset-password`, `/verify-email` ada (token dibaca dari fragmen lalu dihapus dari bilah alamat) tetapi belum dirender di Next asli; verifikasi email **belum menggerbangi fitur apa pun** (keputusan produk) |
| Deteksi scraping | Penanda saja: ≥120 pencarian/jam → audit `search.suspicious` (sekali/jam). Tanpa pemblokiran otomatis dan **tanpa pemeriksa** (belum ada UI/alert) |
| Moderasi laporan | **Belum ada** antarmuka/peran moderator (butuh keputusan produk + perubahan skema) |
| Audit dependensi, pembaruan otomatis | CI `pnpm audit` + Dependabot (belum pernah berjalan) |
| Pemindaian secret di CI, 2FA, pemberitahuan login baru | **Belum ada** |

## Kontrol

| Area        | Kontrol                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Password    | argon2id; panjang min 12; cek daftar password bocor (opsional); tidak dilog                                                                    |
| Session     | token acak 256-bit, simpan hash; cookie HttpOnly+Secure+SameSite; rotasi saat login; idle & absolute timeout; revoke semua saat ganti password |
| Brute force | rate limit per IP + per akun, lockout/backoff progresif, respons waktu konstan                                                                 |
| Enumeration | pesan generik di register/login/reset; 404 seragam pada /users; min panjang prefix; cap hasil                                                  |
| AuthZ       | cek kepemilikan di setiap resource `:id` (anti-IDOR); query selalu diberi `userId` sesi; policy terpusat                                       |
| CSRF        | cek Origin/Referer + token untuk mutasi                                                                                                        |
| XSS         | React escaping, tidak ada `dangerouslySetInnerHTML`, CSP ketat, sanitasi bio                                                                   |
| SQLi        | Prisma + `$queryRaw` hanya tagged template terparameter                                                                                        |
| SSRF        | server tidak fetch URL dari user; profileUrl dibangun dari template platform; bila fetch API resmi, allowlist host                             |
| CORS        | allowlist origin sendiri                                                                                                                       |
| Headers     | CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors                                                        |
| Secrets     | env/secret manager, `.env.example` tanpa nilai nyata, tidak di-commit, rotasi                                                                  |
| Audit       | AuditLog untuk login, ubah privacy, block, report, hapus akun                                                                                  |
| Logging     | redaksi password, token, API key, lokasi presisi, PII sensitif                                                                                 |

## Privasi lokasi (kritis)

1. Koordinat di-snap ke grid sebelum disimpan; presisi mentah tidak persisten.
2. Output hanya `area` + jarak dibulatkan; tidak ada koordinat.
3. Anti-triangulasi (yang diimplementasikan): titik di-snap ke centroid grid sehingga semua titik di satu sel tak terbedakan; jarak dibulatkan 0,5 km (minimum 1 km) dan urutan hasil memakai satuan yang sama; lokasi pencari = lokasi tersimpan (bukan input bebas); titik hanya bisa diganti 5x/hari; rate limit search 30/menit dan 300/hari. _Jitter_ per pasangan **tidak** diimplementasikan; ini mengurangi, bukan menghilangkan, risiko triangulasi.
4. Default PRIVATE; opt-in eksplisit; dapat dimatikan kapan saja → langsung hilang dari search (invalidasi cache).
5. Block bekerja dua arah dan menghapus kedua pihak dari hasil satu sama lain.

## Hak pengguna

Penghapusan: `DELETE /api/me` (password + `confirm: "DELETE"`) = soft-delete instan (status PENDING_DELETION, sesi dicabut, lokasi/akun sosmed/blokir/bio dihapus, privasi dikembalikan ke aman), lalu hapus permanen setelah 30 hari (relasi `onDelete: Cascade` membersihkan sisanya, termasuk SearchLog). Ekspor data belum ada. Retensi pendek SearchLog butuh pekerjaan terjadwal yang belum ada.

## Abuse & moderasi

Report → antrean review (OPEN/REVIEWING); satu laporan terbuka per pasangan, 10/jam dan 30/hari per pelapor. **Tidak ada auto-suspend** otomatis dari jumlah laporan: laporan massal bisa dipakai untuk membungkam orang, jadi efek hanya lewat peninjauan manusia (antarmuka moderator belum ada). Isi laporan (teks bebas) tidak pernah dicatat di audit/log. Deteksi pola scraping: hanya penanda audit (`search.suspicious`), ditinjau manual; tidak memblokir otomatis.

## Pengujian keamanan (wajib)

IDOR, enumeration, rate limiting, injection, privacy leakage (assert DTO tanpa field terlarang), authorization bypass, triangulasi.
