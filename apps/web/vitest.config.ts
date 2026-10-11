import { configDefaults, defineConfig } from "vitest/config";

// e2e/*.spec.ts milik Playwright; vitest tidak boleh ikut menjalankannya.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
