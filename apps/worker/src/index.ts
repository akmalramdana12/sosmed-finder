// Worker BullMQ. Saat ini satu antrean: "maintenance" (retensi data dan purge akun, tiap jam).
// Jobs lain (notifikasi, dsb.) ditambahkan di sini saat fiturnya ada.
// BELUM TERUJI terhadap bullmq/Redis asli: API dipakai sesuai dokumentasi bullmq v5 (upsertJobScheduler).
import { PrismaAccountRepository } from "@social-finder/api/account/node";
import { PrismaMaintenanceRepository } from "@social-finder/api/maintenance/node";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { logError, logInfo } from "./log";
import {
  handleMaintenance,
  MAINTENANCE_EVERY_MS,
  MAINTENANCE_JOB,
  MAINTENANCE_QUEUE,
} from "./maintenance-job";

const redisUrl = process.env["REDIS_URL"];
if (!redisUrl) {
  logError("REDIS_URL wajib diisi");
  process.exit(1);
}

// BullMQ mewajibkan maxRetriesPerRequest: null pada koneksi Worker.
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(MAINTENANCE_QUEUE, { connection });

const deps = {
  repository: new PrismaMaintenanceRepository(),
  accounts: new PrismaAccountRepository(),
  now: () => new Date(),
};

const worker = new Worker(
  MAINTENANCE_QUEUE,
  async (job) => {
    if (job.name !== MAINTENANCE_JOB) return;
    await handleMaintenance(deps);
  },
  { connection, concurrency: 1 },
);

worker.on("failed", (_job, err) => {
  // Hanya pesan statis dari handleMaintenance (nama tugas), tidak pernah data pengguna.
  logError("maintenance job failed", { reason: err.message });
});

// Idempotent: memanggil ulang saat start tidak menggandakan jadwal.
await queue.upsertJobScheduler(
  "maintenance-hourly",
  { every: MAINTENANCE_EVERY_MS },
  { name: MAINTENANCE_JOB, opts: { attempts: 3, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: 24, removeOnFail: 100 } },
);

async function shutdown(signal: string): Promise<void> {
  logInfo("worker shutting down", { signal });
  await worker.close();
  await queue.close();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logInfo("worker started");
