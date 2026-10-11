#!/usr/bin/env bash
# Backup logis Postgres (terkompresi). Jalankan dari root repo di host produksi.
# Simpan hasilnya DI LUAR host yang sama dan ENKRIPSI (berisi data pengguna). Uji restore secara berkala.
set -euo pipefail
OUT="${1:-backup-$(date -u +%Y%m%dT%H%M%SZ).sql.gz}"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$OUT"
echo "ditulis: $OUT"
