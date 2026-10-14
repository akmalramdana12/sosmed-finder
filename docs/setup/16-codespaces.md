# Menjalankan aplikasi di GitHub Codespaces (dari HP)

Tujuan: aplikasi hidup dengan Postgres+PostGIS dan Redis asli, supaya `13-test-menyeluruh.md` bisa dijalankan
dari browser HP. Hanya untuk uji; bukan produksi.

## Prasyarat
- Repo berisi hasil Bootstrap: folder `migrations/*_init`, `pnpm-lock.yaml`. Itu ada di cabang **`bootstrap-output`**
  (jalankan Actions, Bootstrap, dulu setelah mengunggah zip terbaru; `.devcontainer/` ikut terdorong).
- (Opsional, untuk email asli) secret Codespaces `SMTP_URL` dan `MAIL_FROM`: GitHub, Settings (akun), Codespaces,
  Secrets, New secret, arahkan ke repo ini. Format: `15-smtp-uji.md`. Tanpa ini, email dicetak ke log.

## Langkah
1. Di repo, Code, tab Codespaces, tiga titik, **New with options**, pilih cabang `bootstrap-output`, buat.
2. Tunggu setup selesai (pertama kali beberapa menit): install dependensi, migrasi, seed platform.
3. Buka tab **Ports**, port 3000 (Social Finder), buka alamat HTTPS-nya. Alamat ini harus yang dipakai
   (cek Origin/CSRF memakai alamat ini; `start.sh` menyetelnya otomatis).
4. Bila web tidak naik: terminal, `tail -n 50 /tmp/web.log`, atau jalankan ulang `bash .devcontainer/start.sh`.

## Alat bantu (di terminal Codespace)
- Email dev (tanpa SMTP): `bash .devcontainer/mail.sh` menampilkan tautan verifikasi/reset terakhir.
- Jadikan moderator: `bash .devcontainer/make-moderator.sh namauser`.
- Worker retensi (opsional): `set -a; . ./.env; set +a; pnpm --filter @social-finder/worker start`.
- Hentikan Codespace bila tidak dipakai (kuota gratis bulanan terbatas; cek di pengaturan GitHub).

## Catatan
- Mode development (`next dev`): CSP memakai `unsafe-eval` dan cookie sesi tidak ber-prefix `__Host-`. Uji CSP/cookie
  produksi lewat `docker-compose.prod.yml`. Bila CSP memecahkan halaman, isi `CSP_REPORT_ONLY=true` di `.env` untuk
  sementara dan laporkan pesannya.
- Kata sandi DB di compose ini sengaja sederhana dan layanan tidak dibuka ke luar container.
- Data hilang bila volume Codespace dihapus.
