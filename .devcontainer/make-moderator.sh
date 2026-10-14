#!/usr/bin/env bash
# Pemakaian: bash .devcontainer/make-moderator.sh <username>   (beri peran MODERATOR)
set -euo pipefail
[[ "${1:-}" =~ ^[A-Za-z0-9_.-]{3,30}$ ]] || { echo "Username tidak valid"; exit 1; }
NAME="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
# Variabel psql tidak diinterpolasi oleh -c, jadi SQL dikirim lewat stdin.
printf '%s\n' "UPDATE \"User\" SET \"role\" = 'MODERATOR' WHERE \"normalizedUsername\" = :'n';" |
  psql "postgresql://sf:sf_dev_only@db:5432/socialfinder" -v ON_ERROR_STOP=1 -v "n=${NAME}"
