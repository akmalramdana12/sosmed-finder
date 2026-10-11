# Bootstrap lewat GitHub Actions (tanpa komputer)

Menghasilkan `pnpm-lock.yaml` dan migrasi Prisma `init`, lalu menjalankan typecheck/test/build dengan dependensi asli. Semua berjalan di server GitHub; HP hanya dipakai untuk upload dan unduh.

## Langkah (dari HP, browser)

1. Buat repo baru di github.com (boleh **Private**). Centang "Add a README".
2. Tambah file workflow: **Add file → Create new file**, nama persis `.github/workflows/bootstrap.yml` (ketik dengan garis miring; GitHub otomatis membuat folder). Tempel isi file `bootstrap.yml` (dikirim terpisah), lalu **Commit changes**.
3. Upload zip: **Add file → Upload files**, pilih `social-finder.zip` (satu file, jangan dibongkar), lalu **Commit changes**.
4. Buka tab **Actions** → pilih **Bootstrap** di kiri → **Run workflow** → **Run workflow**. (Bila tab Actions meminta persetujuan, setujui "I understand my workflows, go ahead and enable them".)
5. Tunggu ±5–15 menit sampai hijau atau merah. Buka run-nya: bagian **Summary** menampilkan status typecheck/test/build, ada/tidaknya lockfile, dan nama folder migrasi.
6. Ambil hasil:
   - **Artifact** `social-finder-bootstrapped` (bagian bawah halaman run) berisi proyek lengkap + `pnpm-lock.yaml` + migrasi. Mengunduhnya di HP memberi file zip.
   - Atau branch **`bootstrap-output`** di repo berisi hal yang sama (lebih mudah bila nanti lanjut dengan komputer / Codespaces).

Jika repo Private dan workflow gagal menulis ke branch, buka **Settings → Actions → General → Workflow permissions** dan pilih **Read and write permissions**.

## Bila ada langkah merah

Buka langkah yang merah, salin 30–40 baris terakhir lognya, dan kirim ke Claude. Kegagalan di langkah "Pasang dependensi" biasanya konflik versi paket; di "Typecheck/Test/Build" biasanya masalah kode yang belum pernah dijalankan dengan paket asli. Langkah typecheck/test/build memakai `continue-on-error`, jadi lockfile dan migrasi tetap dihasilkan walau ketiganya merah.

## Setelah berhasil

- Pakai isi artifact/branch `bootstrap-output` sebagai repo utama (lockfile dan migrasi sudah ada), lalu `ci.yml` akan berjalan penuh pada push berikutnya, termasuk build Docker dan tes integrasi.
- Hapus `bootstrap.yml` bila tidak diperlukan lagi.

## Memperbarui kode di kemudian hari (mode sinkronisasi)

Setelah branch `bootstrap-output` ada, workflow otomatis memakainya sebagai basis. Untuk memasukkan kode baru dari Claude:

1. Di repo, hapus `social-finder.zip` lama dan upload zip baru (Add file → Upload files).
2. Jalankan lagi **Actions → Bootstrap → Run workflow**.

Di mode ini workflow menimpa kode dengan isi zip, **mempertahankan** `pnpm-lock.yaml`, migrasi, dan versi dependensi yang sudah terpasang, serta hanya menambah dependensi baru (`scripts/add-deps.sh`). Batasan: file yang dihapus dari proyek tidak otomatis terhapus di branch, dan perubahan skema Prisma (bila ada) memerlukan migrasi baru (akan saya sebutkan saat itu terjadi). Pastikan juga memakai versi terbaru `bootstrap.yml` (dikirim bersama zip) karena logikanya ikut berubah.
