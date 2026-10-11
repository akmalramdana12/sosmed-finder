#!/usr/bin/env bash
# Dependensi yang ditambahkan SETELAH bootstrap pertama. Idempotent: hanya memasang yang belum ada di
# package.json, dan tidak menyentuh versi paket lain (berbeda dengan install-deps.sh yang memasang ulang semuanya).
# Dipakai oleh .github/workflows/bootstrap.yml bila repo sudah punya hasil bootstrap sebelumnya.
set -euo pipefail

has() { grep -q "\"$2\"" "$1/package.json"; }

# Fase 14: email reset password / verifikasi (SMTP)
if ! has apps/web nodemailer; then pnpm --filter @social-finder/web add nodemailer; fi
if ! has apps/web @types/nodemailer; then pnpm --filter @social-finder/web add -D @types/nodemailer; fi
