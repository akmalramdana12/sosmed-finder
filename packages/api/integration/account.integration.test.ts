/** Integrasi ekspor data terhadap Postgres sungguhan: whitelist kolom, tanpa geography, hanya akun aktif. */
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaAccountRepository } from "../src/modules/account/prisma-account-repository";
import { toAccountExportDto } from "../src/modules/account/account-service";
import { resetAndSeed, uid } from "./db";

const ME = uid(1);

beforeAll(async () => {
  await resetAndSeed();
});

describe("integrasi: ekspor data", () => {
  it("memuat data milik sendiri; lokasi hanya label dan akurasi (tanpa koordinat)", async () => {
    const record = await new PrismaAccountRepository().loadExport(ME);
    expect(record).not.toBeNull();
    if (!record) return;
    const dto = toAccountExportDto(record, new Date("2026-10-12T00:00:00Z"));
    expect(dto.account.username).toBe("me");
    expect(dto.account.emailVerified).toBe(true);
    expect(dto.profile.displayName).toBe("Name me");
    expect(dto.socialAccounts.map((a) => `${a.platform}:${a.username}`)).toEqual(["instagram:me_ig"]);
    expect(dto.blocks.map((b) => b.username)).toEqual(["alexd"]);
    expect(dto.location?.areaLabel).toBe("Batam Centre");
    expect(dto.location?.discoverableRadiusKm).toBe(5);
    const json = JSON.stringify(dto);
    expect(json).not.toMatch(/latitude|longitude|geography|passwordHash|POINT/i);
  });

  it("akun nonaktif atau dihapus: null", async () => {
    const repository = new PrismaAccountRepository();
    expect(await repository.loadExport(uid(8))).toBeNull(); // SUSPENDED
    expect(await repository.loadExport(uid(9))).toBeNull(); // dihapus
  });
});
