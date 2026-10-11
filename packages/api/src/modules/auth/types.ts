export type UserStatus = "ACTIVE" | "SUSPENDED" | "PENDING_DELETION";

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  deletedAt: Date | null;
}

export interface NewUser {
  email: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  displayName: string;
}

export interface NewSession {
  userId: string;
  /** Hash token; token mentah tidak pernah disimpan. */
  tokenHash: string;
  expiresAt: Date;
  ipHash: string | null;
  userAgent: string | null;
}

export interface SessionLookup {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userStatus: UserStatus;
  userDeletedAt: Date | null;
}

/** Dilempar repository saat constraint unik dilanggar. */
export class UniqueViolationError extends Error {
  readonly field: "email" | "username";

  constructor(field: "email" | "username") {
    super(`unique violation: ${field}`);
    this.name = "UniqueViolationError";
    this.field = field;
  }
}

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  /** Membuat User + Profile + PrivacySettings (default aman) secara atomik. */
  create(user: NewUser): Promise<{ id: string }>;
}

export interface SessionRepository {
  create(session: NewSession): Promise<{ id: string }>;
  findByTokenHash(tokenHash: string): Promise<SessionLookup | null>;
  revoke(tokenHash: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface AuditEvent {
  action: string;
  actorId: string | null;
  entity: string;
  entityId: string | null;
  ipHash: string | null;
  /** Tanpa data sensitif: jangan masukkan password, token, email, atau lokasi. */
  metadata?: Record<string, string | number | boolean>;
}

export type AuditWriter = (event: AuditEvent) => Promise<void>;
