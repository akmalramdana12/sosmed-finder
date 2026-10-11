// Membuat migrasi kedua (spatial_constraints) dari prisma/manual/spatial_constraints.sql.
// Jalankan SETELAH migrasi init dibuat (db:migrate), lalu db:migrate lagi untuk menerapkannya.
// Idempotent: tidak membuat duplikat bila migrasi sudah ada.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "prisma", "migrations");
const source = join(root, "prisma", "manual", "spatial_constraints.sql");
const NAME = "spatial_constraints";

if (!existsSync(migrationsDir) || readdirSync(migrationsDir).every((d) => d.endsWith(".toml"))) {
  console.error(
    "Belum ada migrasi init. Jalankan `pnpm --filter @social-finder/database db:migrate` dulu.",
  );
  process.exit(1);
}

const dirs = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
if (dirs.some((d) => d.name.endsWith(`_${NAME}`))) {
  console.log(`Migrasi ${NAME} sudah ada; tidak ada yang dilakukan.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = join(migrationsDir, `${stamp}_${NAME}`);
mkdirSync(dir);
writeFileSync(join(dir, "migration.sql"), readFileSync(source, "utf8"));
console.log(`Dibuat: ${dir}`);
console.log("Terapkan dengan: pnpm --filter @social-finder/database db:migrate");
