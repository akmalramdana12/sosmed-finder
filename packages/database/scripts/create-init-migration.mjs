// Membuat migrasi "init" dari schema.prisma lalu menempelkan prisma/sql/extras.sql
// (index spasial, partial index, CHECK) ke migration.sql yang sama, SEBELUM diterapkan.
// Butuh: database berjalan (docker compose up -d) dan DATABASE_URL di ../../.env.
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationsDir = join(root, "prisma", "migrations");
const extrasPath = join(root, "prisma", "sql", "extras.sql");

const existing = existsSync(migrationsDir)
  ? readdirSync(migrationsDir).filter((name) => name.endsWith("_init"))
  : [];
if (existing.length > 0) {
  console.error(`Migrasi init sudah ada (${existing[0]}). Tidak dibuat ulang.`);
  process.exit(1);
}

execSync("pnpm exec dotenv -e ../../.env -- prisma migrate dev --create-only --name init", {
  cwd: root,
  stdio: "inherit",
});

const created = readdirSync(migrationsDir)
  .filter((name) => name.endsWith("_init"))
  .sort()
  .pop();
if (!created) {
  console.error("Folder migrasi init tidak ditemukan setelah prisma migrate.");
  process.exit(1);
}

const target = join(migrationsDir, created, "migration.sql");
appendFileSync(
  target,
  `\n-- ===== extras.sql: index spasial, partial index, CHECK =====\n${readFileSync(extrasPath, "utf8")}`,
);
console.log(`\nextras.sql ditambahkan ke prisma/migrations/${created}/migration.sql`);
console.log("Terapkan dengan: pnpm db:migrate   lalu seed: pnpm db:seed");
