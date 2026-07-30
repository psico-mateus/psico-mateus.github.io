import { getPortalEnv } from "@/db/runtime";
import { hmac, identifier, normalizeEmail, randomToken, sha256 } from "@/lib/crypto";
import {
  SESSION_COOKIE,
  SESSION_SECONDS,
  parseCookies,
  sessionCookie,
} from "@/lib/session-cookie";

export {
  SESSION_COOKIE,
  SESSION_SECONDS,
  clearSessionCookie,
  parseCookies,
  sessionCookie,
} from "@/lib/session-cookie";

export const PRIVACY_VERSION = "2026-07-29";

export class PortalError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SessionUser {
  tokenHash: string;
  csrfToken: string;
  userId: string;
  name: string;
  role: "patient" | "therapist";
  status: "active";
  expiresAt: string;
}

export interface UserRow {
  id: string;
  display_name: string;
  email_hash: string;
  role: "patient" | "therapist";
  status: "pending_mfa" | "active" | "disabled";
  password_salt: string;
  password_hash: string;
  password_iterations: number;
  recovery_salt: string;
  recovery_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
  last_totp_counter: number | null;
  privacy_version: string;
  adult_confirmed_at: string | null;
  created_at: string;
  last_login_at: string | null;
}

type SessionIdentity = Pick<UserRow, "id" | "display_name" | "role">;

export function now(): string {
  return new Date().toISOString();
}

export function cleanText(value: unknown, maximum: number): string {
  return String(value ?? "").trim().replace(/\r\n?/gu, "\n").slice(0, maximum);
}

export function validateEmail(value: unknown): string {
  const email = normalizeEmail(value);
  if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new PortalError(400, "Informe um e-mail válido.");
  }
  return email;
}

export function validatePassword(value: unknown): string {
  const password = String(value ?? "");
  if (
    password.length < 12 ||
    password.length > 128 ||
    !/[A-Za-zÀ-ÿ]/u.test(password) ||
    !/\d/u.test(password)
  ) {
    throw new PortalError(
      400,
      "Use de 12 a 128 caracteres. Pode ser uma frase com espaços; inclua pelo menos uma letra e um número.",
    );
  }
  return password;
}

export function validateEntry(input: Record<string, unknown>) {
  const entry = {
    title: cleanText(input.title, 120),
    happened: cleanText(input.happened, 2_000),
    body: cleanText(input.body, 1_500),
    thoughts: cleanText(input.thoughts, 1_500),
    urge: cleanText(input.urge, 1_500),
    emotion: cleanText(input.emotion, 120),
    intensity: Number(input.intensity),
    message: cleanText(input.message, 1_500),
  };
  if (!entry.title || !entry.happened) {
    throw new PortalError(400, "Preencha o título e descreva o que aconteceu.");
  }
  if (!Number.isInteger(entry.intensity) || entry.intensity < 0 || entry.intensity > 10) {
    throw new PortalError(400, "A intensidade precisa estar entre 0 e 10.");
  }
  return entry;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const maximumBytes = 64_000;
  const contentLength = Number(request.headers.get("content-length") || 0);
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let raw = "";
  let tooLarge = contentLength > maximumBytes;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) tooLarge = true;
      if (!tooLarge) raw += decoder.decode(value, { stream: true });
    }
    if (!tooLarge) raw += decoder.decode();
  }
  if (tooLarge) throw new PortalError(413, "Conteúdo muito grande.");
  if (!raw) return {};
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new PortalError(415, "Envie os dados no formato esperado.");
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new PortalError(400, "Não foi possível ler os dados enviados.");
  }
}

const TRUSTED_PRODUCTION_ORIGINS = new Set([
  "https://area-do-paciente.psico-mateus.workers.dev",
  "https://registros.psico-mateus.workers.dev",
]);

export function requireTrustedOrigin(request: Request): void {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const origin = request.headers.get("origin");
  const localRequest = ["localhost", "127.0.0.1", "::1"].includes(
    requestUrl.hostname,
  );
  const allowedOrigins = localRequest
    ? new Set([requestOrigin])
    : TRUSTED_PRODUCTION_ORIGINS;

  if (!origin || !allowedOrigins.has(origin)) {
    throw new PortalError(403, "A origem desta ação não pôde ser confirmada.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site"].includes(fetchSite)) {
    throw new PortalError(403, "A origem desta ação não pôde ser confirmada.");
  }
}

export async function prepareSession(request: Request, user: SessionIdentity) {
  const { DB } = getPortalEnv();
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const csrfToken = randomToken(24);
  const createdAt = now();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1_000).toISOString();
  return {
    statement: DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(tokenHash, user.id, csrfToken, expiresAt, createdAt, createdAt),
    csrf: csrfToken,
    cookie: sessionCookie(request, token),
    user: publicUser(user),
  };
}

export async function createSession(request: Request, user: SessionIdentity) {
  const session = await prepareSession(request, user);
  await session.statement.run();
  return {
    csrf: session.csrf,
    cookie: session.cookie,
    user: session.user,
  };
}

export async function currentSession(request: Request): Promise<SessionUser | null> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const { DB } = getPortalEnv();
  const tokenHash = await sha256(token);
  const row = await DB.prepare(
    `SELECT sessions.token_hash AS tokenHash, sessions.csrf_token AS csrfToken,
            sessions.expires_at AS expiresAt, users.id AS userId,
            users.display_name AS name, users.role AS role, users.status AS status
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = 'active'`,
  )
    .bind(tokenHash, now())
    .first<SessionUser>();
  return row ?? null;
}

export async function requireSession(
  request: Request,
  role?: "patient" | "therapist",
): Promise<SessionUser> {
  const session = await currentSession(request);
  if (!session) throw new PortalError(401, "Faça login para continuar.");
  if (role && session.role !== role) {
    throw new PortalError(403, "Esta ação não está disponível para este perfil.");
  }
  return session;
}

export function requireCsrf(request: Request, session: SessionUser): void {
  if (request.headers.get("x-csrf-token") !== session.csrfToken) {
    throw new PortalError(403, "A sessão não pôde confirmar esta ação.");
  }
}

export function publicUser(user: Pick<UserRow, "id" | "display_name" | "role">) {
  return { id: user.id, name: user.display_name, role: user.role };
}

export async function audit(
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId: string | null = null,
): Promise<void> {
  await prepareAudit(userId, action, resourceType, resourceId).run();
}

export function prepareAudit(
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId: string | null = null,
) {
  const { DB } = getPortalEnv();
  return DB.prepare(
    `INSERT INTO access_logs (id, user_id, action, resource_type, resource_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(identifier("log"), userId, action, resourceType, resourceId, now());
}

export async function checkRateLimit(
  request: Request,
  scope: string,
  subject: string,
  limit = 8,
  windowSeconds = 15 * 60,
): Promise<void> {
  const { DB, APP_SECRET } = getPortalEnv();
  const client = request.headers.get("cf-connecting-ip") ?? "local";
  const key = await hmac(APP_SECRET, `rate:${scope}:${subject}:${client}`);
  const row = await DB.prepare(
    "SELECT count, window_started_at FROM auth_windows WHERE key = ?",
  )
    .bind(key)
    .first<{ count: number; window_started_at: string }>();
  const started = row ? new Date(row.window_started_at).getTime() : 0;
  const expired = !row || Date.now() - started >= windowSeconds * 1_000;
  if (!expired && row.count >= limit) {
    throw new PortalError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
  if (expired) {
    await DB.prepare(
      `INSERT INTO auth_windows (key, count, window_started_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, window_started_at = excluded.window_started_at`,
    )
      .bind(key, now())
      .run();
  } else {
    await DB.prepare("UPDATE auth_windows SET count = count + 1 WHERE key = ?").bind(key).run();
  }
}

export async function userByEmail(email: string): Promise<UserRow | null> {
  const { DB, APP_SECRET } = getPortalEnv();
  const hashed = await hmac(APP_SECRET, `email:${normalizeEmail(email)}`);
  return (await DB.prepare("SELECT * FROM users WHERE email_hash = ?")
    .bind(hashed)
    .first<UserRow>()) ?? null;
}
