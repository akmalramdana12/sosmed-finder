# MVP Roadmap

Aturan: tiap fase harus stabil (test, lint, typecheck hijau + review keamanan) sebelum lanjut.

| Fase | Fokus           | Deliverable                                                                             | Exit criteria                                 |
| ---- | --------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1    | Bootstrap       | monorepo, pnpm, Turbo, TS strict, ESLint/Prettier, Docker (Postgres+PostGIS, Redis), CI | `pnpm build/lint/typecheck/test` hijau di CI  |
| 2    | Database        | Prisma schema, migrasi, ekstensi PostGIS, seed platform                                 | migrasi naik/turun, index terverifikasi       |
| 3    | Authentication  | register/login/logout, session, rate limit, brute-force guard, security headers         | test auth + enumeration lulus                 |
| 4    | Profile         | /me, halaman profil, validasi                                                           | IDOR test lulus                               |
| 5    | Social accounts | CRUD, platform, normalisasi, klaim/verifikasi                                           | profileUrl hanya dari template                |
| 6    | Discoverability | privacy settings, toggle                                                                | default PRIVATE terbukti                      |
| 7    | Location        | snap + simpan geography, accuracyLevel                                                  | tidak ada koordinat presisi di DB/log/respons |
| 8    | Search          | exact/prefix, platform, radius, sort jarak, public DTO, cache                           | p95 < 300 ms; test privacy leakage            |
| 9    | Block/Report    | block dua arah, report, antrean                                                         | block efektif di search & profil              |
| 10   | Testing         | unit, integrasi, E2E Playwright                                                         | cakupan area kritis ≥ 80%                     |
| 11   | Security        | audit, pentest checklist, dependency scan                                               | semua temuan high ditutup                     |
| 12   | Performance     | EXPLAIN, index tuning, load test k6                                                     | target latensi tercapai                       |
| 13   | Deployment      | image, CI/CD, backup, monitoring, runbook                                               | readiness review PRODUCTION lulus             |

## Risiko utama

Triangulasi lokasi, abuse scraping, verifikasi kepemilikan akun tanpa API resmi, kepatuhan privasi (UU PDP/GDPR).

## Keputusan terbuka (perlu input)

1. Metode login: email+password saja atau tambah OAuth?
2. Platform awal yang didukung (Instagram, X, TikTok, …)?
3. Wilayah target & sumber data area (untuk label seperti "Sekupang")?
4. Hosting target (VPS/Vercel+managed Postgres)?

## NEXT ACTION

Fase 1-13 sudah ditulis (Fase 13: `docs/setup/10-deployment.md`, artefak belum pernah dijalankan) (Fase 12: lihat `docs/setup/09-performance.md`). Fase 3-11 lulus typecheck strict dan 437 test unit/keamanan di harness lokal; tes integrasi pencarian lulus 16/16 di Postgres 16 asli (tanpa PostGIS, memakai shim). Belum pernah dijalankan: integrasi block/report/lokasi, e2e Playwright, CSP bernonce di Next asli, repositori Prisma (selain yang dilewati tes pencarian lewat stub), argon2, Redis, route Next.js. Dependensi belum terpasang di repo: jalankan `scripts/install-deps.sh`. Kolom baru `Location.cityLabel` perlu migrasi. Worker retensi/purge sudah ada (445 tes lulus; belum dijalankan terhadap BullMQ asli). Reset password dan verifikasi email: API + tes unit ada (462 tes), UI sudah ada untuk seluruh alur utama (masuk, daftar, lupa/reset password, verifikasi email, akun, profil, akun sosmed, privasi, lokasi, pencarian, profil publik dengan blokir/laporan, daftar blokir) dan lolos typecheck dengan stub React/Next, tetapi belum pernah dirender di browser, belum ada tes UI/e2e, dan tampilannya masih minimal (belum melalui proses desain); uji SMTP asli belum. Masih terbuka: moderasi laporan, ekspor data, idle timeout sesi. Fase 12 selesai sebagian: query pencarian dioptimalkan dan diukur pada 300 ribu pengguna; EXPLAIN dengan PostGIS asli dan uji beban penuh masih harus dijalankan. Berikutnya: menutup pemblokir publik di `10-deployment.md` (build Docker pertama, migrasi ter-commit, uji worker di staging).
