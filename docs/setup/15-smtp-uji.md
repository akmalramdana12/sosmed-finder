# SMTP uji

Pencarian membutuhkan email terverifikasi, jadi SMTP harus teruji sebelum tes menyeluruh.

## 1. Pilih penyedia

| Penyedia | Kegunaan | Contoh `SMTP_URL` |
|---|---|---|
| Mailtrap (sandbox) | Paling aman untuk uji: email **tidak** sampai ke inbox asli, dibaca di dasbor Mailtrap | `smtp://USER:PASS@sandbox.smtp.mailtrap.io:2525` (host/port: lihat halaman Integration/SMTP di Mailtrap) |
| Gmail (app password) | Cepat untuk uji ke inbox sendiri; butuh verifikasi 2 langkah aktif | `smtps://emailanda%40gmail.com:APPPASSWORD@smtp.gmail.com:465` |
| Brevo (gratis, ~300 email/hari) | Layak untuk peluncuran kecil; butuh verifikasi pengirim/domain | `smtp://LOGIN:SMTPKEY@smtp-relay.brevo.com:587` |

Aturan penulisan URL:
- Karakter khusus di username/password harus di-encode: `@` menjadi `%40`, `:` menjadi `%3A`, `/` menjadi `%2F`, `#` menjadi `%23`.
- Port 465 memakai `smtps://` (TLS langsung). Port 587/2525 memakai `smtp://` (STARTTLS dinegosiasikan otomatis); tambah `?requireTLS=true` bila ingin memaksa.
- Gmail: `MAIL_FROM` harus alamat Gmail yang sama, kalau tidak Gmail menggantinya.
- Untuk produksi, gunakan domain sendiri dengan SPF/DKIM/DMARC supaya email tidak masuk spam.

## 2. Isi secrets di GitHub

Repo, Settings, Secrets and variables, Actions, New repository secret:
- `SMTP_URL`: URL di atas (wajib)
- `MAIL_FROM`: mis. `Social Finder <no-reply@domainanda.com>` (opsional)

## 3. Jalankan tes

Actions, **SMTP test**, Run workflow, isi alamat tujuan. Log menampilkan host, hasil login SMTP, dan
respons server (kredensial tidak dicetak). Gagal? Kirim screenshot: `code`/`responseCode` menunjukkan
penyebabnya (EAUTH = login salah, ECONNECTION/ETIMEDOUT = host/port salah atau diblokir).

## 4. Uji alur penuh (daftar, email, verifikasi)

Butuh aplikasi yang berjalan dengan `SMTP_URL` yang sama: GitHub Codespaces (dari browser HP) atau satu
VPS dengan `docker-compose.prod.yml`. Lalu jalankan skenario 1-2 dan 13 di `13-test-menyeluruh.md`.
