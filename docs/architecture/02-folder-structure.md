# Folder Structure (monorepo pnpm + Turborepo)

Catatan: worker dipisah ke `apps/worker`; `packages/api` memuat logika bisnis agar route handler Next.js tetap tipis.

```
social-finder/
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (marketing)/
│  │  │  ├─ (auth)/            # login, register
│  │  │  ├─ dashboard/
│  │  │  ├─ search/
│  │  │  ├─ users/[username]/
│  │  │  ├─ settings/
│  │  │  ├─ reports/
│  │  │  ├─ blocked/
│  │  │  └─ api/
│  │  │     ├─ auth/ users/ profiles/ social-accounts/
│  │  │     ├─ search/ location/ blocks/ reports/ health/
│  │  ├─ components/
│  │  │  ├─ ui/ (shadcn)  auth/  search/  profile/  map/  settings/
│  │  ├─ lib/
│  │  └─ tests/             # Playwright + Testing Library
│  └─ worker/
│     ├─ src/{jobs,queues,processors}/
│     └─ tests/
├─ packages/
│  ├─ database/  (prisma/{schema.prisma,migrations/}, src/)
│  ├─ api/src/{modules/{auth,users,profiles,social-accounts,search,location,blocks,reports,health},middleware,validators,errors}
│  ├─ auth/
│  ├─ types/
│  ├─ validation/
│  ├─ ui/
│  └─ config/               # tsconfig, eslint, prettier bersama
├─ docs/{architecture,api,database,security,product,decisions}/
├─ scripts/
├─ docker/
├─ .github/workflows/
├─ .env.example
├─ docker-compose.yml     # postgres+postgis, redis
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
└─ README.md
```

## Aturan dependensi

`web → api → database/validation/auth/types`; `worker → api/database`. Dilarang sebaliknya (cek via ESLint boundaries).
