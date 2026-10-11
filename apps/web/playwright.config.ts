import { defineConfig } from "@playwright/test";

/**
 * E2E tingkat API (tanpa browser UI; UI belum ada). Butuh database yang sudah dimigrasi + seed platform,
 * dan SESSION_SECRET. Rate limit register 5/jam per IP memakai memori saat REDIS_URL kosong, jadi
 * server dev baru tiap run (reuseExistingServer=false) menghindari bentrok antar run.
 */
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: { baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3000" },
  webServer: process.env["E2E_BASE_URL"]
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          SESSION_SECRET: process.env["SESSION_SECRET"] ?? "e2e-secret-yang-cukup-panjang-1234567890",
          APP_ORIGIN: "http://localhost:3000",
        },
      },
});
