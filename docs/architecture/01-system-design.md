# SOCIAL FINDER — System Design

## 1. Tujuan & Prinsip

Platform web tempat pengguna **mendaftarkan sendiri** akun sosmed mereka dan **secara sukarela** mengaktifkan discoverability. Bukan surveillance system.

**Larangan keras (non-goals):** scraping, deanonymization, bypass CAPTCHA/auth/rate limit/privacy, ekspos koordinat GPS, pencarian lokasi tanpa consent, enumerasi username tanpa proteksi.

**Prinsip:** opt-in by default (semua PRIVATE), privacy by design, least data exposure (public DTO), KISS/YAGNI.

## 2. Requirements

**Fungsional (MVP):** registrasi, login, profil, username, akun sosmed + pilihan platform, discoverability, lokasi perkiraan, pencarian (username exact/prefix, platform, radius, urut jarak), halaman profil, block, report, privacy settings, hapus akun.

**Non-fungsional:** p95 search < 300 ms @ 100 rb user; semua endpoint rate-limited; tidak ada kebocoran lokasi presisi; audit trail; deploy via Docker.

## 3. Arsitektur

```
Browser ──► Next.js (App Router, RSC + Route Handlers /api)
                │  ├─ middleware: security headers, session, rate limit
                │  └─ modules (packages/api): auth, users, profiles, social-accounts,
                │       search, location, blocks, reports, health
                ├──► PostgreSQL + PostGIS (Prisma + $queryRaw terparameter untuk spatial)
                ├──► Redis (rate limit, cache hasil search, session denylist)
                └──► BullMQ ──► Worker (apps/worker)
                                 ├─ cleanup token/session kedaluwarsa
                                 ├─ hard-delete akun setelah masa tenggang
                                 ├─ pemrosesan report / notifikasi
                                 └─ purge SearchLog
```

## 4. Komponen

| Komponen            | Tanggung jawab                                                  |
| ------------------- | --------------------------------------------------------------- |
| apps/web            | UI + route handler tipis (parse → validasi Zod → panggil modul) |
| packages/api        | Logika bisnis per modul, middleware, error terstandar           |
| packages/database   | Prisma schema, migrasi, SQL spasial                             |
| packages/validation | Skema Zod bersama (client + server)                             |
| apps/worker         | Job async BullMQ                                                |

## 5. Alur Data Kunci

**Search:** request → auth + rate limit → validasi query → hitung titik pencari (dari lokasi tersimpan milik pencari, bukan input mentah publik) → query PostGIS dengan filter `discoverable`, privacy, block dua arah → bulatkan jarak & map ke label area → public DTO → cache singkat (per-viewer key).

**Lokasi:** pengguna set lokasi → koordinat di-_snap_ ke grid/centroid sesuai `accuracyLevel` **sebelum disimpan** (presisi mentah tidak pernah persisten) → disimpan sebagai `geography`.

**Verifikasi kepemilikan akun:** tidak ada scraping. Opsi: (a) OAuth resmi bila platform menyediakan; (b) kode verifikasi yang ditaruh pemilik di bio lalu dicek lewat API resmi/ manual; (c) fallback: klaim username tanpa verifikasi (`isVerified=false`, ditandai di UI).

## 6. Caching

Redis: rate limit counter, cache search 30–60 dtk (key mengandung viewerId + hash query), invalidasi saat block/privacy/lokasi berubah.

## 7. Scaling

Stateless web → horizontal. Index GiST pada `geography`, trigram/btree pada `normalizedUsername`. Read replica bila perlu. Worker diskalakan terpisah.

## 8. Observability

Logging terstruktur (pino) dengan redaksi field sensitif; request-id; metrik (latency, error rate, rate-limit hit); `/api/health` (liveness + readiness DB/Redis).

## 9. Failure Modes

| Kegagalan       | Dampak                  | Mitigasi                                                                         |
| --------------- | ----------------------- | -------------------------------------------------------------------------------- |
| Redis down      | rate limit/cache hilang | fail-closed untuk auth endpoint, fail-open ber-batas untuk search + alert        |
| PostGIS lambat  | search timeout          | statement_timeout, batas radius & limit, cache                                   |
| Worker down     | hard-delete tertunda    | akun sudah disembunyikan segera (soft-delete)                                    |
| Abuse enumerasi | scraping terselubung    | rate limit per user/IP, min panjang prefix, cap hasil, deteksi pola di SearchLog |

## 10. Trade-off

- Monolith Next.js + modul terpisah (bukan microservices): sederhana, cukup untuk MVP.
- Prisma + raw SQL untuk spatial: type-safety CRUD, kontrol penuh query PostGIS.
- Session server-side (cookie) vs JWT: dipilih session DB agar bisa dicabut instan.
