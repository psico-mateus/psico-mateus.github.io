import { env } from "cloudflare:workers";

export interface PortalEnv {
  DB: D1Database;
  APP_SECRET: string;
  SETUP_SECRET: string;
  PUBLIC_SITE_URL?: string;
  GUIDE_URL?: string;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('patient', 'therapist')),
    status TEXT NOT NULL CHECK (status IN ('pending_mfa', 'active', 'disabled')),
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    recovery_salt TEXT NOT NULL,
    recovery_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    last_totp_counter INTEGER,
    privacy_version TEXT NOT NULL,
    adult_confirmed_at TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_idx ON users (email_hash)`,
  `CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status)`,
  `CREATE TABLE IF NOT EXISTS patient_links (
    id TEXT PRIMARY KEY,
    therapist_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    created_at TEXT NOT NULL,
    closed_at TEXT,
    UNIQUE (therapist_id, patient_id)
  )`,
  `CREATE INDEX IF NOT EXISTS patient_links_patient_idx ON patient_links (patient_id, status)`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    therapist_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    used_at TEXT,
    patient_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS invitations_therapist_idx ON invitations (therapist_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    happened TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    thoughts TEXT NOT NULL DEFAULT '',
    urge TEXT NOT NULL DEFAULT '',
    emotion TEXT NOT NULL DEFAULT '',
    intensity INTEGER NOT NULL DEFAULT 0 CHECK (intensity BETWEEN 0 AND 10),
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    shared_at TEXT,
    revoked_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS entries_patient_created_idx ON entries (patient_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS entries_shared_idx ON entries (shared_at, revoked_at)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS assisted_recovery_grants (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    issued_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS assisted_recovery_expiry_idx
    ON assisted_recovery_grants (expires_at)`,
  `CREATE TABLE IF NOT EXISTS access_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS access_logs_user_created_idx ON access_logs (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS auth_windows (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_started_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

let schemaPromise: Promise<void> | null = null;

export function getPortalEnv(): PortalEnv {
  const portalEnv = env as unknown as PortalEnv;
  if (!portalEnv.DB) throw new Error("D1 binding DB is unavailable.");
  if (!portalEnv.APP_SECRET || portalEnv.APP_SECRET.length < 32) {
    throw new Error("APP_SECRET must contain at least 32 characters.");
  }
  if (!portalEnv.SETUP_SECRET || portalEnv.SETUP_SECRET.length < 20) {
    throw new Error("SETUP_SECRET must contain at least 20 characters.");
  }
  return portalEnv;
}

export async function ensureSchema(database = getPortalEnv().DB): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = database
      .batch(schemaStatements.map((statement) => database.prepare(statement)))
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  await schemaPromise;
}

export async function cleanupExpired(database = getPortalEnv().DB): Promise<void> {
  const current = new Date().toISOString();
  const oldWindow = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const oldLog = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000).toISOString();
  await database.batch([
    database.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(current),
    database.prepare("DELETE FROM auth_windows WHERE window_started_at <= ?").bind(oldWindow),
    database.prepare("DELETE FROM access_logs WHERE created_at <= ?").bind(oldLog),
  ]);
}
