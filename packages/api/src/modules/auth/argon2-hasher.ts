import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "./types";

/**
 * Argon2id dengan parameter minimum rekomendasi OWASP (m=19 MiB, t=2, p=1).
 * Naikkan memoryCost bila server mampu; hash lama tetap valid karena parameter ikut tersimpan.
 */
export class Argon2Hasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  async verify(hashed: string, password: string): Promise<boolean> {
    try {
      return await verify(hashed, password);
    } catch {
      return false; // hash rusak atau format tidak dikenal: anggap tidak cocok
    }
  }
}
