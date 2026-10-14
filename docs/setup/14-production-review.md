# Review kesiapan produksi

Tanggal 2026-10-13. Hasil audit konfigurasi dan kode di repo ini. Bukan jaminan: banyak butir hanya
bisa dibuktikan di lingkungan nyata (lihat `13-test-menyeluruh.md`).

## Sudah baik (diperiksa langsung di kode/konfigurasi)

- Container: user non-root (`node`), healthcheck web, compose: `read_only`, `cap_drop: ALL`, `no-new-privileges`, tanpa port DB/Redis terbuka, `restart: unless-stopped`.
- Header: HSTS, nosniff, DENY frame, Referrer-Policy, Permissions-Policy (geolocation hanya self), CSP bernonce di halaman, CSP `default-src 'none'` di API.
- Sesi: cookie `__Host-` HttpOnly Secure SameSite=Lax, token acak hanya hash disimpan, absolut 14 hari + idle 3 hari, cabut semua saat ganti/reset password dan saat suspend.
- Rate limit gagal tertutup (Redis wajib di production), `TRUST_PROXY` hanya valid di belakang Caddy.
- Env production divalidasi saat boot: `REDIS_URL`, `SMTP_URL` wajib; `REQUIRE_VERIFIED_EMAIL=false` ditolak.
- CI: lint, format, typecheck, test, build, integrasi, e2e, `pnpm audit`, build Docker, dan (baru) pemindaian rahasia gitleaks. Dependabot aktif.
- Retensi: sesi, token, log pencarian, audit, purge akun terhapus lewat worker.

## BLOKIR sebelum peluncuran publik

1. **Migrasi belum ada di kode utama.** Folder `migrations/` hanya berisi migrasi `moderation` dan `session_idle`; migrasi `init` dibuat oleh workflow Bootstrap dan hanya ada di cabang `bootstrap-output`. Commit hasil cabang itu (termasuk folder `*_init`) ke cabang utama. Tanpa itu, image `migrate` tidak punya apa-apa untuk diterapkan di server. CI saat ini memakai `prisma db push`, jadi tidak menguji rantai migrasi; ganti ke `migrate deploy` setelah init ter-commit.
2. **Halaman hukum belum ada**: kebijakan privasi, syarat layanan, kontak penghapusan data. Platform yang mempertemukan orang wajib punya ini; isinya keputusan hukum Anda (saya tidak mengarangnya). Tautkan dari halaman daftar dan beri persetujuan eksplisit saat registrasi.
3. **SMTP nyata belum teruji**, padahal pencarian bergantung pada email terverifikasi.
4. **Tes menyeluruh belum dijalankan** (daftar di `13-test-menyeluruh.md`): worker + Redis asli, UI di browser, compose produksi + TLS.

## Risiko sedang (putuskan atau jadwalkan)

- **Backup**: `deploy/backup.sh` tidak mengenkripsi dan tidak memutar salinan. Tambahkan enkripsi (mis. `age`/`gpg`), simpan di luar host, jadwalkan cron, dan **uji restore** minimal sekali.
- **Pemantauan**: belum ada metrik/alert. Minimal: uptime monitor pada `/api/health`, alert disk dan memori, dan alert kegagalan job worker (log JSON worker memuat `failed`).
- **Rotasi `SESSION_SECRET`**: aman untuk sesi (token acak di DB), tetapi mengubah HMAC IP di audit dan membatalkan cursor pencarian/moderasi yang sedang berjalan. Rotasi bukan keadaan darurat.
- **Retensi laporan**: laporan terhadap akun yang dipurge ikut hilang (cascade). Putuskan apakah bukti moderasi perlu disimpan lebih lama.
- **Moderator pertama**: diberi lewat SQL (`12-moderation.md`). Siapkan minimal dua moderator dan prosedur pencabutan.
- **Tanpa CAPTCHA/anti-bot pada registrasi**: dibatasi rate limit per IP dan verifikasi email. Bila terlihat pendaftaran massal, tambahkan tantangan (jangan menunggu sampai jadi masalah).
- **Verifikasi email tidak menjamin identitas**: hanya menunjukkan kendali atas kotak surat.
- **Tampilan UI minimal**, belum aksesibilitas penuh (audit WCAG), belum i18n.

## Pemeriksaan terakhir sebelum buka publik

- [ ] Init migrasi ter-commit, `migrate deploy` berhasil di staging dari DB kosong
- [ ] Semua rahasia unik dan acak (`SESSION_SECRET`, password DB, Redis), tidak ada di Git (gitleaks hijau)
- [ ] `APP_DOMAIN` + TLS aktif, `curl -I` menunjukkan HSTS, `TRUST_PROXY=true` hanya di belakang Caddy
- [ ] Email verifikasi dan reset password sampai ke kotak masuk (bukan spam): SPF/DKIM/DMARC domain pengirim
- [ ] Worker berjalan, job `maintenance-hourly` terlihat di log
- [ ] Backup terenkripsi berjalan dan restore teruji
- [ ] Halaman privasi/syarat terbit dan tertaut
- [ ] Minimal dua moderator, antrean `/moderation` teruji
- [ ] Uji skenario 1-13 di `13-test-menyeluruh.md` lulus
