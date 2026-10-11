#!/usr/bin/env bash
# Memasang semua dependensi proyek, per workspace, sesuai impor yang sebenarnya dipakai kode.
# Jalankan SEKALI dari root proyek, setelah `corepack enable`. Menghasilkan package.json + pnpm-lock.yaml
# yang kemudian di-commit (setelah itu cukup `pnpm install`).
#
# Versi: hanya yang perlu dikunci yang dikunci. Sisanya memakai rilis terbaru saat Anda menjalankan ini.
#   zod@3        kode ditulis dan diuji terhadap zod 3.25 (zod 4 mengubah API)
#   prisma@6     skema memakai `url = env(...)` di datasource (Prisma 7 memindahkannya ke prisma.config.ts)
#   typescript@6 tsconfig.base.json mengasumsikan TS 6 (`types: ["node"]` eksplisit)
# BELUM TERUJI: kombinasi versi terbaru next/react/tailwind/eslint dengan TS 6 belum pernah dijalankan.
# Bila ada yang gagal, laporkan pesan errornya.
set -euo pipefail

echo "== root: tooling"
pnpm add -Dw typescript@6 turbo eslint @eslint/js typescript-eslint eslint-config-prettier prettier \
  vitest @types/node dotenv-cli tsx

echo "== validation"
pnpm --filter @social-finder/validation add zod@3

echo "== api"
pnpm --filter @social-finder/api add @node-rs/argon2

echo "== database"
pnpm --filter @social-finder/database add @prisma/client@6
pnpm --filter @social-finder/database add -D prisma@6

echo "== web"
pnpm --filter @social-finder/web add next react react-dom zod@3 ioredis nodemailer
pnpm --filter @social-finder/web add -D @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss \
  @playwright/test @types/nodemailer

echo "== worker"
pnpm --filter @social-finder/worker add bullmq ioredis tsx @social-finder/api@workspace:* @social-finder/database@workspace:*

echo "== prisma client"
pnpm --filter @social-finder/database db:generate

echo "Selesai. Lanjut: cp .env.example .env, isi nilainya, docker compose up -d, lalu lihat README."
