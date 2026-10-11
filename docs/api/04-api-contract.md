# API Contract (REST, prefix `/api`, versi via header `X-API-Version: 1`; path v1 bila dipublikasikan)

## Konvensi

- Auth: cookie session `HttpOnly; Secure; SameSite=Lax`. Mutasi wajib CSRF (cek `Origin` + token).
- Validasi: Zod di setiap endpoint. Body maks 16 KB.
- Error seragam:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [], "requestId": "…" } }
```

Kode: `VALIDATION_ERROR 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `CONFLICT 409`, `RATE_LIMITED 429` (+`Retry-After`), `INTERNAL 500`.

- Pagination cursor: `?limit=20&cursor=…` (maks 50).
- Semua respons: security headers, `Cache-Control: no-store` untuk data privat.

## Endpoint

| Method | Path                    | Auth    | Rate limit                | Ringkasan                                                                                   |
| ------ | ----------------------- | ------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| POST   | /auth/register          | –       | 5/jam/IP                  | email, username, password. Respons generik (anti-enumeration)                               |
| POST   | /auth/login             | –       | 30/IP, 10/akun per 15 mnt | set cookie HttpOnly; pesan error generik; 429 + Retry-After                                 |
| POST   | /auth/password-reset/request | –  | 5/IP per 15 mnt, 3/email per jam | {email}; SELALU 200 (anti-enumerasi); email berisi tautan `/reset-password#token=…` (30 mnt, sekali pakai) |
| POST   | /auth/password-reset/confirm | –  | 10/IP per 15 mnt          | {token, newPassword}; mencabut SEMUA sesi; token salah/kedaluwarsa/terpakai → 400 dengan pesan sama |
| POST   | /auth/email/verify      | –       | 10/IP per 15 mnt          | {token}; menandai email terverifikasi (token 24 jam, sekali pakai)                           |
| POST   | /me/email/verification  | ✔       | 3/jam                     | kirim ulang tautan verifikasi; selalu 200 (juga bila sudah terverifikasi)                    |
| POST   | /auth/logout            | ✔       | 30/mnt                    | revoke session                                                                              |
| GET    | /me                     | ✔       | 120/mnt                   | data milik sendiri                                                                          |
| PATCH  | /me                     | ✔       | 30/mnt                    | displayName, bio, username, avatar                                                          |
| POST   | /me/password            | ✔       | 5/15 mnt                  | {currentPassword, newPassword}; mencabut SEMUA sesi, cookie dikosongkan, login ulang         |
| DELETE | /me                     | ✔       | 3/jam                     | {password, confirm:"DELETE"}; soft-delete instan, hapus permanen setelah 30 hari            |
| GET    | /me/social-accounts     | ✔       | 120/mnt                   | daftar milik sendiri                                                                        |
| POST   | /me/social-accounts     | ✔       | 20/jam                    | {platformKey, username} → profileUrl dibangun server dari template; isVerified selalu false |
| PATCH  | /me/social-accounts/:id | ✔ owner | 30/mnt                    | isDiscoverable, username (ganti handle mencabut verifikasi); 404 seragam bila bukan milik   |
| DELETE | /me/social-accounts/:id | ✔ owner | 30/mnt                    | hapus                                                                                       |
| GET    | /me/privacy             | ✔       | 120/mnt                   | privacy settings (isDiscoverable, searchableByUsername, showPlatforms, effective)           |
| PATCH  | /me/privacy             | ✔       | 30/mnt                    | {isDiscoverable?, searchableByUsername?, showPlatforms?}; field lokasi ditolak (strict)     |
| GET    | /me/location            | ✔       | 120/mnt                   | pengaturan lokasi sendiri, `data` null bila belum ada; tanpa koordinat                      |
| PUT    | /me/location            | ✔       | 30/mnt, titik 5/hari      | {latitude, longitude, accuracyLevel, visibility?, labels?}; di-snap server, tidak dikembalikan |
| PATCH  | /me/location            | ✔       | 30/mnt                    | visibility, discoverableRadiusKm (1–50), areaLabel, cityLabel, isEnabled; tanpa koordinat   |
| DELETE | /me/location            | ✔       | 30/mnt                    | hapus lokasi; visibilitas kembali PRIVATE                                                   |
| GET    | /search                 | ✔       | 30/mnt/user               | lihat bawah                                                                                 |
| GET    | /users/:username        | ✔       | 60/mnt/user               | profil publik (404 sama untuk "tidak ada" / "tidak boleh dilihat")                          |
| GET    | /blocks                 | ✔       | 120/mnt                   | daftar yang Anda blokir: `{username, blockedAt}`                                            |
| POST   | /blocks                 | ✔       | 30/jam                    | {username}; idempotent; username tak ada → respons sama; maks 500                           |
| DELETE | /blocks/:username       | ✔       | 30/jam                    | idempotent; respons selalu sama                                                             |
| POST   | /reports                | ✔       | 10/jam, 30/hari           | {username, reason, details?}; 201 seragam (tak ada / duplikat terbuka → sama)               |
| GET    | /platforms              | –       | 60/mnt/IP                 | daftar platform aktif: `{key, name}`                                                        |
| GET    | /health                 | –       | longgar                   | liveness/readiness                                                                          |

## GET /search

Hanya untuk pengguna yang login. Query string divalidasi ketat (`.strict()`): parameter tak dikenal dan parameter ganda (`?q=a&q=b`) ditolak 400.

| Parameter  | Aturan                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `q`        | 2–50 karakter, huruf kecil/angka/`.`/`_`/`-`; tanpa wildcard. Mencocokkan username Social Finder atau handle sosmed yang discoverable |
| `mode`     | `exact` (bawaan) atau `prefix`                                                                      |
| `platform` | key platform; hanya mencocokkan target yang `showPlatforms=true`                                    |
| `radiusKm` | bilangan bulat 1–50; butuh lokasi aktif milik pencari sendiri                                       |
| `sort`     | `distance` (bawaan bila ada `radiusKm`, wajib punya radius) atau `username` (bawaan untuk kata kunci) |
| `limit`    | 1–50, bawaan 20                                                                                     |
| `cursor`   | dari `nextCursor`; ditandatangani dan terikat ke pencari + parameter pencarian                       |

Wajib ada `q` atau `radiusKm`: tidak ada "daftar semua orang".

Syarat target muncul (dicek di SQL **dan** diperiksa ulang per baris di service): ACTIVE dan tidak dihapus, bukan pencari sendiri, `isDiscoverable`, tidak ada block dua arah, minimal satu akun sosmed discoverable di platform aktif; untuk `q`: `searchableByUsername`, dan kecocokan lewat handle hanya bila `showPlatforms`; untuk radius: lokasi aktif, visibilitas `DISCOVERABLE_RADIUS`, jarak <= min(radius pencarian, radius target). Aturan lengkap: `docs/product/07-discoverability-and-location.md`.

Batas: 30/menit dan 300/hari per pengguna (batas harian melawan enumerasi pelan-pelan). Respons `Cache-Control: no-store`.

Respons (public DTO):

```json
{
  "data": [
    {
      "username": "alex",
      "displayName": "Alex",
      "accounts": [
        {
          "platform": "instagram",
          "username": "alex",
          "profileUrl": "https://instagram.com/alex",
          "isVerified": false
        }
      ],
      "area": "Sekupang",
      "city": "Batam",
      "distanceKm": 2.5
    }
  ],
  "nextCursor": null
}
```

`distanceKm` dibulatkan 0,5 km (minimum 1) dan hanya ada pada visibilitas `DISCOVERABLE_RADIUS`; `area`/`city` hanya sesuai visibilitas. `accounts` kosong bila target menyembunyikan platform. **Tidak pernah** ada: id, email, phone, hash, token, koordinat, metadata internal.

## GET /users/:username

DTO publik sama. Hanya cocok dengan username Social Finder (bukan handle sosmed). "Tidak ada", "tidak discoverable", "diblokir", "searchableByUsername=false", dan bentuk username tidak valid semuanya menghasilkan 404 identik. Batas: 60/menit dan 1000/hari per pengguna.

## Block & report

Memakai **username**, bukan id: DTO publik tidak pernah membawa id internal, jadi klien tidak punya id untuk dikirim (ini mengubah kontrak awal yang memakai `userId`/`targetUserId`). Pelaku (pemblokir/pelapor) selalu dari sesi; body `.strict()` menolak field lain.

- **Block** berlaku dua arah di pencarian dan profil publik (lihat Fase 8). `POST /blocks` idempotent. Memblokir diri sendiri → 400. Username tak ada / non-ACTIVE → respons sukses yang sama (tanpa enumerasi). Batas 500 blokir per pengguna.
- **Report** `reason` ∈ SPAM, IMPERSONATION, HARASSMENT, INAPPROPRIATE_CONTENT, PRIVACY_VIOLATION, OTHER. `details` maks 1000 karakter (dibersihkan dari karakter kontrol/bidi); wajib ≥10 karakter bila `OTHER`. Satu laporan terbuka (OPEN/REVIEWING) per pasangan pelapor→target; mengulang tidak menambah antrean. Laporan **tidak** punya efek otomatis pada target (tanpa auto-suspend). Audit hanya mencatat alasan, bukan isi laporan.

## Catatan caching

Semua respons API `Cache-Control: no-store`, kecuali daftar platform publik. Bila nanti ada cache hasil pencarian di sisi server, wajib di-invalidate saat privacy, lokasi, social account, atau block berubah.
