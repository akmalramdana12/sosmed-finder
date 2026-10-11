# Social Finder: image web, worker, dan migrate dari satu Dockerfile (target: web | worker | migrate).
#   docker build --target web -t social-finder-web .
# SYARAT: pnpm-lock.yaml sudah ada di repo (hasil scripts/install-deps.sh, lalu di-commit).
# BELUM TERUJI: Dockerfile ini belum pernah dibangun (tidak ada Docker di lingkungan penulisan).
# Image berbasis Debian (glibc) agar binary native @node-rs/argon2 dan engine Prisma cocok.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /app

# ---- deps: seluruh dependensi (dev + prod) untuk build ----
FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
RUN pnpm --filter @social-finder/database db:generate \
 && pnpm --filter @social-finder/web build

# ---- migrate: menerapkan migrasi lalu keluar (dijalankan sekali per rilis) ----
FROM deps AS migrate
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@social-finder/database", "exec", "prisma", "migrate", "deploy"]

# ---- web: output standalone Next.js, proses non-root ----
FROM base AS web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ---- worker ----
# Paket workspace diekspor sebagai TypeScript (tanpa langkah build), jadi worker dijalankan dengan tsx
# dari pohon dependensi lengkap hasil stage build (image lebih besar, tetapi sederhana dan benar).
FROM build AS worker
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@social-finder/worker", "start"]
