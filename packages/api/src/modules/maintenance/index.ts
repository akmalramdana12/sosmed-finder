// Entry point "murni" (tanpa Prisma): aman dipakai di test.
export { RETENTION, runMaintenance } from "./maintenance-service";
export type { MaintenanceDeps } from "./maintenance-service";
export type {
  AccountPurger,
  MaintenanceReport,
  MaintenanceRepository,
  MaintenanceTask,
} from "./types";
