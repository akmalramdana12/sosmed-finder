# Discoverability & Lokasi — semantik untuk Fase 8 (Search)

## Syarat target muncul di hasil pencarian (semua harus benar)

1. `PrivacySettings.isDiscoverable = true`.
2. Minimal satu `SocialAccount` dengan `isDiscoverable = true`.
3. Akun user aktif (bukan dihapus/ditangguhkan).
4. Tidak ada block di salah satu arah.
5. Pencarian username: butuh `searchableByUsername = true`.
6. Pencarian jarak/radius: butuh `Location.isEnabled`, visibilitas `DISCOVERABLE_RADIUS`, dan jarak pencari-target <= min(radius pencarian, `discoverableRadius` target).

## Proyeksi lokasi (`projectLocation`)

| Visibilitas         | area | city | jarak/radius |
| ------------------- | ---- | ---- | ------------ |
| PRIVATE (atau `isEnabled=false`, atau nilai tak dikenal) | – | – | tidak |
| CITY_ONLY           | –    | ✔    | tidak        |
| AREA_ONLY           | ✔    | ✔    | tidak        |
| DISCOVERABLE_RADIUS | ✔    | ✔    | ya (dibulatkan 0,5 km, min 1 km) |

Label kosong dihilangkan. Koordinat tidak pernah ada di DTO.

## Aturan yang harus dijaga Search

- `showPlatforms=false`: platform tidak ditampilkan **dan tidak boleh dipakai sebagai filter** (kalau tidak, filter bisa membocorkan platform yang disembunyikan).
- Pencari harus punya lokasi tersimpan sendiri untuk pencarian jarak; titik pencari = titik tersimpan (bukan input bebas), agar tidak bisa dipakai menggeser-geser titik untuk triangulasi.
- Jarak dihitung dari centroid grid kedua pihak; dua target di sel yang sama tidak dapat dibedakan.
- Cache hasil: TTL pendek, dan harus di-invalidate saat privacy/lokasi/social account berubah, atau cache menjadi jalur kebocoran setelah user menutup visibilitas.
- Respons identik untuk "tidak ada" dan "tidak boleh dilihat".

## Batasan & item terbuka

- Label area/kota deklarasi sendiri, tidak diverifikasi: user bisa mengklaim area yang bukan tempatnya. Perlu gazetteer (sumber data wilayah) — pertanyaan terbuka #3 di roadmap.
- Anti-triangulasi bergantung pada: grid snap, batas 5 pembaruan titik/hari, dan pembulatan jarak. Ini mengurangi, bukan menghilangkan, risiko; pantau pola query di Fase 11.
- Lintang dibatasi ±85°.
- Query pencarian dan SQL upsert lokasi dijalankan di Postgres 16 sungguhan (17 skenario), tetapi tanpa PostGIS: fungsi `ST_Distance`/`ST_DWithin`/`ST_MakePoint` diganti shim haversine. Perilaku PostGIS asli (indeks GiST, presisi geography) belum teruji; tes integrasi dengan image PostGIS dijadwalkan di Fase 10.
- Kecocokan lewat handle sosmed ikut dibatasi `searchableByUsername` (lebih ketat dari kebutuhan minimum; sengaja).

## Implementasi Search (Fase 8)

- `modules/search`: `buildSearchQuery` (SQL statis, semua nilai terikat), `evaluateCandidate` (pemeriksaan ulang tiap baris; baris yang ditolak guard dilog jumlahnya saja), `cursor` (HMAC, terikat pencari + parameter), `SearchService`.
- Urutan jarak memakai satuan 0,5 km (bukan meter) dengan tie-break id: urutan dan cursor tidak membocorkan jarak lebih halus dari yang ditampilkan.
- Lookup profil memakai `allowHandleMatch=false` di SQL dan di guard service.
