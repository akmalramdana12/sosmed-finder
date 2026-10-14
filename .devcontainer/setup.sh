#!/usr/bin/env bash
# Dijalankan sekali saat Codespace dibuat: dependensi, .env, migrasi, seed platform.
set -euo pipefail
cd "$(dirname "$0")/.."

corepack enable
pnpm install --frozen-lockfile

if [ ! -f .env ]; then
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat > .env <<EOF
DATABASE_URL=postgresql://sf:sf_dev_only@db:5432/socialfinder
REDIS_URL=redis://redis:6379
SESSION_SECRET=${SECRET}
APP_ORIGIN=http://localhost:3000
TRUST_PROXY=false
EOF
  echo ".env dibuat (tanpa SMTP_URL: email dicetak ke log; isi secret Codespaces SMTP_URL untuk email asli)."
fi

# psql untuk bantuan (mis. memberi peran moderator). Gagal tidak menghentikan setup.
(sudo -n apt-get update -qq && sudo -n apt-get install -y -qq postgresql-client) >/dev/null 2>&1 || \
  echo "psql tidak terpasang (opsional)."

pnpm db:generate
if ls packages/database/prisma/migrations/*_init >/dev/null 2>&1; then
  pnpm db:deploy
else
  echo "PERINGATAN: migrasi init tidak ada di cabang ini. Buka Codespace dari cabang bootstrap-output." >&2
  exit 1
fi
pnpm db:seed
echo "Setup selesai."
