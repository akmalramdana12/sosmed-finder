import { describe, expect, it } from "vitest";
import { RateLimitedError } from "../../errors/rate-limited-error";
import { MemoryRateLimiter } from "../auth/rate-limit";
import { UniqueViolationError, type AuditEvent } from "../auth/types";
import { PROFILE_LIMITS, ProfileService } from "./profile-service";
import type { MeRecord, MeUpdate, ProfileRepository } from "./types";

interface Row extends MeRecord {
  normalizedUsername: string;
  /** Field internal yang TIDAK boleh sampai ke klien. */
  passwordHash: string;
}

class FakeRepository implements ProfileRepository {
  readonly rows: Row[] = [];
  /** Id yang pernah diminta ke repositori: dipakai untuk membuktikan tidak ada akses lintas pengguna. */
  readonly touched: string[] = [];

  add(id: string, username: string): void {
    this.rows.push({
      id,
      email: `${username}@example.com`,
      emailVerifiedAt: null,
      username,
      normalizedUsername: username.toLowerCase(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      displayName: `Nama ${username}`,
      bio: null,
      passwordHash: "argon2id$SANGAT-RAHASIA",
    });
  }

  async findMe(userId: string): Promise<MeRecord | null> {
    this.touched.push(userId);
    return this.rows.find((row) => row.id === userId) ?? null;
  }

  async update(userId: string, update: MeUpdate): Promise<MeRecord | null> {
    this.touched.push(userId);
    const row = this.rows.find((candidate) => candidate.id === userId);
    if (!row) return null;
    if (
      update.normalizedUsername !== undefined &&
      this.rows.some(
        (other) => other.id !== userId && other.normalizedUsername === update.normalizedUsername,
      )
    ) {
      throw new UniqueViolationError("username");
    }
    if (update.displayName !== undefined) row.displayName = update.displayName;
    if (update.bio !== undefined) row.bio = update.bio;
    if (update.username !== undefined && update.normalizedUsername !== undefined) {
      row.username = update.username;
      row.normalizedUsername = update.normalizedUsername;
    }
    return row; // sengaja mengembalikan Row utuh (termasuk passwordHash) untuk menguji whitelist DTO
  }
}

const CTX = { ip: "203.0.113.7", userAgent: "vitest" };

function setup() {
  const repository = new FakeRepository();
  repository.add("user-a", "alice");
  repository.add("user-b", "bob");
  const events: AuditEvent[] = [];
  const service = new ProfileService({
    repository,
    limiter: new MemoryRateLimiter(() => 0),
    audit: async (event) => {
      events.push(event);
    },
    hmacSecret: "test-secret-test-secret-test-secret-123",
  });
  return { service, repository, events };
}

describe("getMe", () => {
  it("mengembalikan data sendiri tanpa field internal", async () => {
    const { service } = setup();
    const me = await service.getMe("user-a");
    expect(me.username).toBe("alice");
    expect(me.email).toBe("alice@example.com");
    expect(me.emailVerified).toBe(false);
    expect(me.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(Object.keys(me).sort()).toEqual(
      ["bio", "createdAt", "displayName", "email", "emailVerified", "id", "username"].sort(),
    );
    expect(JSON.stringify(me)).not.toContain("SANGAT-RAHASIA");
  });

  it("NOT_FOUND bila pengguna tidak aktif/ada", async () => {
    const { service } = setup();
    await expect(service.getMe("tidak-ada")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dibatasi per pengguna", async () => {
    const { service } = setup();
    for (let i = 0; i < PROFILE_LIMITS.read.limit; i += 1) await service.getMe("user-a");
    await expect(service.getMe("user-a")).rejects.toBeInstanceOf(RateLimitedError);
    // pengguna lain tidak terkena batas A
    await expect(service.getMe("user-b")).resolves.toBeTruthy();
  });
});

describe("updateMe", () => {
  it("mengubah displayName dan bio; respons tanpa field internal", async () => {
    const { service } = setup();
    const me = await service.updateMe("user-a", { displayName: "Alice Baru", bio: "Halo" }, CTX);
    expect(me.displayName).toBe("Alice Baru");
    expect(me.bio).toBe("Halo");
    expect(JSON.stringify(me)).not.toContain("SANGAT-RAHASIA");
  });

  it("bio null menghapus bio", async () => {
    const { service } = setup();
    await service.updateMe("user-a", { bio: "Halo" }, CTX);
    const me = await service.updateMe("user-a", { bio: null }, CTX);
    expect(me.bio).toBeNull();
  });

  it("tanpa perubahan nyata: tidak menulis dan tidak mengaudit", async () => {
    const { service, events } = setup();
    await service.updateMe("user-a", { displayName: "Nama alice" }, CTX);
    expect(events).toHaveLength(0);
  });

  it("IDOR: update pengguna A tidak menyentuh data pengguna B", async () => {
    const { service, repository } = setup();
    await service.updateMe("user-a", { displayName: "Dibajak", bio: "x", username: "alice2" }, CTX);

    const b = repository.rows.find((row) => row.id === "user-b");
    expect(b?.displayName).toBe("Nama bob");
    expect(b?.bio).toBeNull();
    expect(b?.username).toBe("bob");
    expect(repository.touched.every((id) => id === "user-a")).toBe(true);
  });

  it("IDOR: sesi A hanya pernah membaca record A", async () => {
    const { service, repository } = setup();
    await service.getMe("user-a");
    await service.updateMe("user-a", { bio: "x" }, CTX);
    expect(repository.touched.includes("user-b")).toBe(false);
  });

  it("username bentrok dengan pengguna lain: CONFLICT, data tidak berubah", async () => {
    const { service, repository } = setup();
    await expect(service.updateMe("user-a", { username: "BOB" }, CTX)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(repository.rows.find((row) => row.id === "user-a")?.username).toBe("alice");
  });

  it("ganti username dibatasi 3x per hari", async () => {
    const { service } = setup();
    for (const name of ["alice_1", "alice_2", "alice_3"]) {
      await service.updateMe("user-a", { username: name }, CTX);
    }
    await expect(service.updateMe("user-a", { username: "alice_4" }, CTX)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("ganti huruf besar/kecil saja tidak menghabiskan kuota username", async () => {
    const { service } = setup();
    for (let i = 0; i < 6; i += 1) {
      await service.updateMe("user-a", { username: i % 2 === 0 ? "Alice" : "ALICE" }, CTX);
    }
    // kuota 3x pergantian sungguhan masih utuh
    await service.updateMe("user-a", { username: "alice_x" }, CTX);
  });

  it("audit hanya memuat nama field, tidak nilainya", async () => {
    const { service, events } = setup();
    await service.updateMe(
      "user-a",
      { displayName: "Rahasia Besar", bio: "alamat rumah saya" },
      CTX,
    );
    const serialized = JSON.stringify(events);
    expect(events[0]?.action).toBe("profile.update");
    expect(events[0]?.metadata).toEqual({ fields: "displayName,bio" });
    expect(serialized).not.toContain("Rahasia Besar");
    expect(serialized).not.toContain("alamat rumah saya");
    expect(serialized).not.toContain(CTX.ip);
  });

  it("NOT_FOUND bila pengguna sudah tidak ada", async () => {
    const { service } = setup();
    await expect(service.updateMe("hantu", { bio: "x" }, CTX)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
