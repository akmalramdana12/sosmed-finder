#!/usr/bin/env bash
# Dijalankan setiap Codespace menyala: menyetel APP_ORIGIN ke URL Codespaces lalu menjalankan web.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  ORIGIN="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  ORIGIN="http://localhost:3000"
fi
# Origin ini harus persis sama dengan yang dibuka di browser (cek CSRF memakai Origin).
sed -i "s|^APP_ORIGIN=.*|APP_ORIGIN=${ORIGIN}|" .env

pkill -f "next dev" >/dev/null 2>&1 || true
set -a
# shellcheck disable=SC1091
. ./.env
set +a
nohup pnpm --filter @social-finder/web dev > /tmp/web.log 2>&1 &
echo "Web dimulai. Buka: ${ORIGIN}  (log: /tmp/web.log; email dev: bash .devcontainer/mail.sh)"
