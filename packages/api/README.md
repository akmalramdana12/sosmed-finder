# @social-finder/api

Logika bisnis di balik route handler. Dua entry point berbeda:

| Import                         | Isi                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `@social-finder/api`           | `AppError`, `RateLimitedError`, `checkHealth`                                    |
| `@social-finder/api/auth`      | `AuthService`, rate limiter, cookie, CSRF, token. Murni, tanpa Prisma/argon2     |
| `@social-finder/api/auth/node` | `Argon2Hasher`, repositori Prisma, audit writer. Hanya untuk server (wiring web) |

Pemisahan ini membuat seluruh logika auth bisa diuji unit tanpa database.

## Dependensi (sekali, dari root proyek)

```bash
pnpm add -Dw @types/node
pnpm --filter @social-finder/api add @node-rs/argon2
pnpm --filter @social-finder/web add ioredis zod
```

`@types/node` di root diperlukan: TypeScript 6 tidak lagi memuat `@types/*` otomatis, jadi
`tsconfig.base.json` menyatakan `"types": ["node"]` secara eksplisit.

## Auth (Fase 3)

Endpoint: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`.

| Aspek            | Implementasi                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Password         | argon2id (m=19 MiB, t=2, p=1). Minimal 12 karakter                                                                                 |
| Sesi             | token acak 256-bit; DB hanya menyimpan SHA-256-nya; berlaku 14 hari; login selalu membuat token baru                               |
| Cookie           | `HttpOnly; SameSite=Lax; Path=/`; di production `__Host-` + `Secure`                                                               |
| CSRF             | request POST wajib `Origin`/`Referer` yang ada di `APP_ORIGIN`                                                                     |
| Brute force      | login: 30/15 menit per IP dan 10/15 menit per akun; register: 5/jam per IP. Key memakai HMAC (IP dan email tidak tersimpan mentah) |
| Anti-enumerasi   | register dengan email yang sudah ada tetap membalas 201; login memberi pesan dan waktu sama untuk semua kegagalan (hash tiruan)    |
| Rate limit store | Redis bila `REDIS_URL` ada (wajib di production). Redis mati berarti endpoint gagal tertutup (500)                                 |
| Audit            | `AuditLog` mencatat register/login/logout tanpa password, token, email, atau IP mentah                                             |
| Logging error    | hanya nama error dan requestId, tidak pernah pesan error                                                                           |

### Batasan yang disengaja (belum dikerjakan)

- **Verifikasi email dan reset password**: butuh penyedia email. Akibatnya register dengan email
  yang sudah ada tidak mengirim pemberitahuan apa pun, dan akun tidak bisa dipulihkan lewat email.
- **Sesi tidak diperpanjang otomatis** (tidak ada sliding expiry) dan belum ada endpoint
  "logout semua perangkat" (`revokeAllForUser` sudah tersedia di repositori).
- **Pembatasan `unknown` IP**: tanpa `TRUST_PROXY=true`, semua klien berbagi satu bucket IP.
  Aman untuk development; di production letakkan di belakang tepat satu proxy tepercaya.
- Perlindungan CSRF berbasis Origin/SameSite, belum memakai token tersendiri.

## Profil (Fase 4)

Endpoint: `GET /api/me` dan `PATCH /api/me` (`displayName`, `bio`, `username`).

| Aspek           | Implementasi                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| IDOR            | Identitas hanya dari cookie sesi (`requireUser`). Tidak ada id di URL/body; repositori tidak punya method yang menerima id lain |
| Mass assignment | `updateProfileSchema` bersifat `.strict()`: `id`, `userId`, `email`, `status`, `passwordHash`, dst. ditolak                     |
| Respons         | `toMeDto` whitelist eksplisit; `passwordHash` dan field internal tidak pernah ikut walau repositori mengembalikannya            |
| Teks            | karakter kontrol, kontrol bidi (spoofing), dan zero-width tak terlihat dibuang; NFC; bio kosong menjadi `null`                  |
| Rate limit      | baca 120/menit, ubah 30/menit, ganti username 3x/hari (huruf besar/kecil saja tidak dihitung)                                   |
| Audit           | `profile.update` mencatat nama field yang berubah, tidak nilainya                                                               |

### Belum dikerjakan

- **Avatar**: sengaja belum ada. Menerima URL dari pengguna membuka risiko SSRF/pelacakan; menunggu fitur upload.
- **UI** (halaman login, register, pengaturan profil): ditunda ke satu putaran UI setelah backend stabil,
  karena `taste-skill` belum terpasang dan tampilan tidak bisa saya lihat dari lingkungan ini.

## Akun sosmed (Fase 5)

Endpoint: `GET /api/platforms` (publik), `GET` dan `POST /api/me/social-accounts`,
`PATCH` dan `DELETE /api/me/social-accounts/:id`.

| Aspek           | Implementasi                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| profileUrl      | satu-satunya jalan: `buildProfileUrl(template, username)`. Template wajib `https://HOST/PATH` dengan `{username}` hanya di path (tidak di host)  |
| Username        | ASCII aman-URL (`A-Z a-z 0-9 . _ -`), satu `@` di depan dibuang; `/ ? # % @` dan spasi ditolak. Diperiksa ulang di builder (pertahanan berlapis) |
| IDOR            | setiap query memuat `id` DAN `userId` sesi di `WHERE` (update memakai `where: { id, userId }`); tidak ada "ambil lalu cek"                       |
| 404 seragam     | akun milik orang lain dan akun yang tidak ada menghasilkan respons yang identik                                                                  |
| Mass assignment | skema `.strict()`: `isVerified`, `profileUrl`, `userId`, `platformId` ditolak                                                                    |
| Verifikasi      | `isVerified` selalu `false` saat dibuat dan tidak bisa diset klien. Ganti handle (bukan sekadar huruf besar/kecil) mencabut verifikasi           |
| Batas           | 10 akun per pengguna; buat 20/jam; ubah/hapus 30/menit; baca 120/menit; daftar platform 60/menit per IP                                          |
| Audit           | hanya key platform dan nama field yang berubah, tidak username                                                                                   |

### Belum dikerjakan

- **Verifikasi kepemilikan**: tanpa API resmi per platform, kepemilikan tidak boleh dicek dengan scraping.
  Akun baru bisa diklaim siapa pun. Konsekuensinya: **dua pengguna bisa mengklaim handle yang sama**
  (peniruan). Mitigasi yang direncanakan: UI wajib menandai "belum terverifikasi", verifikasi OAuth resmi
  untuk platform yang menyediakannya, dan laporan (Fase 9).
- **Aturan username per platform** (panjang/karakter khusus): memakai satu himpunan aman umum sampai ada
  sumber resmi yang bisa diverifikasi.
- **Batas 10 akun** dicek sebelum insert tanpa kunci; dua permintaan serentak bisa melewati batas sebanyak
  satu. Untuk menutupnya sepenuhnya perlu constraint atau transaksi serializable.
- `profileUrl` disimpan saat dibuat; bila template platform diubah, URL lama tidak otomatis ikut.

## Privasi / discoverability (Fase 6)

`modules/privacy`: `GET/PATCH /api/me/privacy`. Default aman: `isDiscoverable=false`, `searchableByUsername=true`, `showPlatforms=true`.
Discoverability efektif = `isDiscoverable` dan minimal satu akun sosmed discoverable. Audit hanya mencatat nama field.
Batas: baca 120/menit, ubah 30/menit.

## Lokasi (Fase 7)

`modules/location`: `GET/PUT/PATCH/DELETE /api/me/location`.

- Koordinat mentah di-snap ke centroid grid (AREA 2 km, CITY 10 km) di server **sebelum** menyentuh repositori, audit, atau log. Koordinat (bahkan hasil snap) tidak pernah dikembalikan.
- Visibilitas: PRIVATE < CITY_ONLY < AREA_ONLY < DISCOVERABLE_RADIUS. Hanya DISCOVERABLE_RADIUS yang mengizinkan jarak/radius; jarak dibulatkan 0,5 km (minimal 1 km).
- Anti-triangulasi: titik hanya bisa diganti 5x/hari; label area/kota dideklarasikan sendiri dan direset saat titik baru.
- `isEnabled=false` memaksa PRIVATE; mengaktifkan lagi tidak memulihkan visibilitas lama.
- PostGIS: upsert lewat `$executeRaw` berparameter (`ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography`); kolom geography tidak pernah di-select.

## Pencarian (Fase 8)

`modules/search`: `GET /api/search`, `GET /api/users/:username`.

- Hanya pengguna login. Query ketat (parameter tak dikenal/ganda ditolak); wajib `q` atau `radiusKm`; `q` minimal 2 karakter tanpa wildcard.
- Filter privasi ada di SQL (`search-sql.ts`, semua nilai terikat, `LIKE` di-escape) dan diperiksa ulang per baris oleh `evaluateCandidate`.
- Hasil berupa DTO whitelist: tanpa id, email, koordinat. `showPlatforms=false` menyembunyikan platform dan juga mencegahnya dipakai sebagai filter atau pencocokan handle.
- Cursor keyset ditandatangani (HMAC), terikat ke pencari dan parameter. Urutan jarak dalam satuan 0,5 km.
- Batas: 30/menit + 300/hari (pencarian), 60/menit + 1000/hari (profil). Catatan pencarian hanya menyimpan hash query dan filter ringkas.
- Profil publik: semua penolakan menghasilkan 404 identik.

## Block & report (Fase 9)

`modules/safety`: `GET/POST /api/blocks`, `DELETE /api/blocks/:username`, `POST /api/reports`.

- Target diidentifikasi lewat username; pelaku selalu dari sesi. Username tak ada atau non-ACTIVE menghasilkan respons sukses yang sama (tanpa enumerasi).
- Block idempotent, maksimal 500 per pengguna (tanpa kunci: permintaan serentak bisa melewati batas sedikit), berlaku dua arah di pencarian (filter SQL + guard service).
- Report: satu laporan terbuka per pasangan, 10/jam dan 30/hari; tanpa efek otomatis pada target; audit hanya memuat alasan.
- Belum ada: antarmuka moderator untuk meninjau laporan.

## Akun dan hardening (Fase 11)

- `modules/account`: `POST /api/me/password` (cabut semua sesi), `DELETE /api/me` (soft-delete instan; `purgeExpired()` untuk hapus permanen setelah 30 hari, **belum dijadwalkan**).
- `modules/search`: penanda `search.suspicious` (≥120 pencarian/jam) ke audit; tanpa pemblokiran otomatis.
- `apps/web/middleware.ts` + `lib/csp.ts`: CSP bernonce per request. Saklar darurat `CSP_REPORT_ONLY=true`.
- CI: `pnpm audit`, Dependabot. Status lengkap kontrol: `docs/security/05-security-model.md`.
