import { configDefaults, defineConfig } from "vitest/config";

// Tes unit murni. Tes integrasi (butuh Postgres) dijalankan terpisah: lihat vitest.integration.config.ts.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "integration/**"] },
});
