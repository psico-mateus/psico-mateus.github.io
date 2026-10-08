import { getPortalEnv, type PortalEnv } from "@/db/runtime";
import { identifier } from "@/lib/crypto";
import {
  PortalError,
  now,
  readJson,
  requireCsrf,
  requireSession,
  requireTrustedOrigin,
} from "@/lib/portal";

type NoticeDatabase = PortalEnv["DB"];

export type PatientNotice = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type StoredNotice = PatientNotice & { deleted_at: string | null };
type NoticeInput = { title: string; body: string; client_request_id: string | null };
type NoticeScope = { patientId: string; therapistId?: string };

export const PATIENT_NOTICE_TITLE_MAX = 100;
export const PATIENT_NOTICE_BODY_MAX = 2_000;
export const PATIENT_NOTICE_PAGE_MAX = 100;
export const PATIENT_NOTICE_DAILY_MAX = 20;
export const PATIENT_NOTICE_ACTIVE_MAX = 1_000;

// All reads and writes repeat this live authorization guard. A previous check
// is only for a useful error response, never the authority for a later write.
const activeLink = `SELECT 1 FROM patient_links AS link
  JOIN users AS patient ON patient.id = link.patient_id
  JOIN users AS therapist ON therapist.id = link.therapist_id
  WHERE link.patient_id = ? AND link.therapist_id = ?
    AND link.status = 'active'
    AND patient.role = 'patient' AND patient.status = 'active'
    AND therapist.role = 'therapist' AND therapist.status = 'active'`;

const activeNoticeLink = `EXISTS (
  SELECT 1 FROM patient_links AS link
  JOIN users AS patient ON patient.id = link.patient_id
  JOIN users AS therapist ON therapist.id = link.therapist_id
  WHERE link.patient_id = n.patient_id AND link.therapist_id = n.therapist_id
    AND link.status = 'active'
    AND patient.role = 'patient' AND patient.status = 'active'
    AND therapist.role = 'therapist' AND therapist.status = 'active'
)`;

const noticeColumns = "n.id, n.title, n.body, n.created_at, n.read_at";

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

function missingNotice(): PortalError {
  return new PortalError(404, "Aviso não encontrado ou acesso não disponível.");
}

function isMissingNoticeTable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (/no such table:\s*(?:main\.)?patient_notices\b/iu.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export function validatePatientNotice(input: unknown): NoticeInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PortalError(400, "Preencha o título e o texto do aviso.");
  }
  const record = input as Record<string, unknown>;
  const text = (value: unknown, maximum: number, label: string): string => {
    if (typeof value !== "string") throw new PortalError(400, `Preencha ${label}.`);
    const normalized = value.replace(/\r\n?/gu, "\n").trim();
    if (!normalized || normalized.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) {
      throw new PortalError(400, `${label} deve ter de 1 a ${maximum} caracteres de texto.`);
    }
    return normalized;
  };
  let requestId: string | null = null;
  if (record.client_request_id !== undefined) {
    if (typeof record.client_request_id !== "string" || !/^[A-Za-z0-9_-]{16,80}$/u.test(record.client_request_id)) {
      throw new PortalError(400, "A identificação do envio não é válida. Atualize a página e tente novamente.");
    }
    requestId = record.client_request_id;
  }
  return {
    title: text(record.title, PATIENT_NOTICE_TITLE_MAX, "O título"),
    body: text(record.body, PATIENT_NOTICE_BODY_MAX, "O texto"),
    client_request_id: requestId,
  };
}

function pagination(url: URL) {
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? PATIENT_NOTICE_PAGE_MAX : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > PATIENT_NOTICE_PAGE_MAX) {
    throw new PortalError(400, "O tamanho da página de avisos não é válido.");
  }
  const rawCursor = url.searchParams.get("cursor");
  if (rawCursor === null) return { limit, cursor: null };
  try {
    if (!/^[A-Za-z0-9_-]{1,256}$/u.test(rawCursor)) throw new Error("Invalid cursor");
    const normalized = rawCursor.replaceAll("-", "+").replaceAll("_", "/");
    const cursor = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as { created_at?: unknown; id?: unknown };
    if (typeof cursor.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(cursor.created_at)
      || !Number.isFinite(Date.parse(cursor.created_at))
      || typeof cursor.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/u.test(cursor.id)) {
      throw new Error("Invalid cursor");
    }
    return { limit, cursor: { created_at: cursor.created_at, id: cursor.id } };
  } catch {
    throw new PortalError(400, "A página de avisos não é válida. Atualize a lista.");
  }
}

function encodeCursor(notice: PatientNotice): string {
  return btoa(JSON.stringify({ created_at: notice.created_at, id: notice.id }))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/**
 * The account export belongs to the patient, independently of whether the
 * care relationship is still active. Include every non-deleted notice, not
 * merely the first API page, and never export internal author/request IDs.
 * An older database may not have the additive notices migration yet; only
 * this compatibility helper treats that specific missing table as empty.
 */
export async function exportPatientNotices(database: NoticeDatabase, patientId: string): Promise<PatientNotice[]> {
  try {
    const { results } = await database.prepare(`SELECT ${noticeColumns} FROM patient_notices AS n
      WHERE n.patient_id = ? AND n.deleted_at IS NULL
      ORDER BY n.created_at DESC, n.id DESC`).bind(patientId).all<PatientNotice>();
    return results.map(({ id, title, body, created_at, read_at }) => ({ id, title, body, created_at, read_at }));
  } catch (error) {
    if (isMissingNoticeTable(error)) return [];
    throw error;
  }
}

async function requireActiveLink(database: NoticeDatabase, patientId: string, therapistId: string) {
  if (!await database.prepare(activeLink).bind(patientId, therapistId).first()) throw missingNotice();
}

function scopeWhere(scope: NoticeScope) {
  return `n.patient_id = ?${scope.therapistId ? " AND n.therapist_id = ?" : ""} AND ${activeNoticeLink}`;
}

function scopeBindings(scope: NoticeScope): string[] {
  return scope.therapistId ? [scope.patientId, scope.therapistId] : [scope.patientId];
}

async function listNotices(database: NoticeDatabase, scope: NoticeScope, url: URL) {
  const { limit, cursor } = pagination(url);
  const where = `${scopeWhere(scope)} AND n.deleted_at IS NULL`;
  const bindings = scopeBindings(scope);
  const pageBindings = cursor ? [...bindings, cursor.created_at, cursor.created_at, cursor.id] : bindings;
  // D1 batch keeps the unread count and page in the same database snapshot.
  const results = await database.batch([
    database.prepare(`SELECT ${noticeColumns} FROM patient_notices AS n
      WHERE ${where}${cursor ? " AND (n.created_at < ? OR (n.created_at = ? AND n.id < ?))" : ""}
      ORDER BY n.created_at DESC, n.id DESC LIMIT ?`).bind(...pageBindings, limit + 1),
    database.prepare(`SELECT COUNT(*) AS unread_count FROM patient_notices AS n
      WHERE ${where} AND n.read_at IS NULL`).bind(...bindings),
  ]);
  const rows = results[0].results as PatientNotice[];
  const notices = rows.slice(0, limit);
  return {
    notices,
    unread_count: Number((results[1].results[0] as { unread_count: number }).unread_count),
    next_cursor: rows.length > limit ? encodeCursor(notices[notices.length - 1]) : null,
  };
}

async function findNotice(database: NoticeDatabase, scope: NoticeScope, noticeId: string) {
  return database.prepare(`SELECT ${noticeColumns} FROM patient_notices AS n
    WHERE ${scopeWhere(scope)} AND n.id = ? AND n.deleted_at IS NULL`)
    .bind(...scopeBindings(scope), noticeId).first<PatientNotice>();
}

function auditChangedNotice(database: NoticeDatabase, actorId: string, action: string, noticeId: string, timestamp: string) {
  // This statement is only used directly after its mutation in the same batch.
  // No title/body, patient name, or free-text payload is stored in access logs.
  return database.prepare(`INSERT INTO access_logs (id, user_id, action, resource_type, resource_id, created_at)
    SELECT ?, ?, ?, 'patient_notice', ?, ? WHERE changes() = 1`)
    .bind(identifier("log"), actorId, action, noticeId, timestamp);
}

async function findRequest(database: NoticeDatabase, scope: Required<NoticeScope>, requestId: string) {
  return database.prepare(`SELECT ${noticeColumns}, n.deleted_at FROM patient_notices AS n
    WHERE ${scopeWhere(scope)} AND n.client_request_id = ?`)
    .bind(...scopeBindings(scope), requestId).first<StoredNotice>();
}

function replayNotice(notice: StoredNotice, input: NoticeInput): PatientNotice {
  if (notice.deleted_at !== null) {
    throw new PortalError(409, "Este envio já foi removido. Para um novo aviso, inicie um novo envio.");
  }
  if (notice.title !== input.title || notice.body !== input.body) {
    throw new PortalError(409, "Este envio já foi usado para outro texto. Atualize a lista antes de enviar novamente.");
  }
  const { id, title, body, created_at, read_at } = notice;
  return { id, title, body, created_at, read_at };
}

async function createNotice(database: NoticeDatabase, scope: Required<NoticeScope>, input: NoticeInput) {
  const { patientId, therapistId } = scope;
  if (input.client_request_id) {
    const existing = await findRequest(database, scope, input.client_request_id);
    if (existing) return { notice: replayNotice(existing, input), idempotent: true };
  }
  const timestamp = now();
  const cutoff = new Date(Date.parse(timestamp) - 24 * 60 * 60 * 1_000).toISOString();
  const noticeId = identifier("notice");
  // Limits are guarded by the INSERT, so simultaneous sends cannot overrun
  // them. Redacted tombstones count toward the daily limit after deletion.
  const results = await database.batch([
    database.prepare(`INSERT INTO patient_notices
      (id, patient_id, therapist_id, title, body, created_at, read_at, client_request_id, deleted_at)
      SELECT ?, ?, ?, ?, ?, ?, NULL, ?, NULL
      WHERE EXISTS (${activeLink})
        AND (SELECT COUNT(*) FROM patient_notices WHERE patient_id = ? AND therapist_id = ? AND created_at > ?) < ?
        AND (SELECT COUNT(*) FROM patient_notices WHERE patient_id = ? AND therapist_id = ? AND deleted_at IS NULL) < ?
      ON CONFLICT(therapist_id, patient_id, client_request_id) DO NOTHING`)
      .bind(noticeId, patientId, therapistId, input.title, input.body, timestamp, input.client_request_id,
        patientId, therapistId, patientId, therapistId, cutoff, PATIENT_NOTICE_DAILY_MAX,
        patientId, therapistId, PATIENT_NOTICE_ACTIVE_MAX),
    auditChangedNotice(database, therapistId, "create_patient_notice", noticeId, timestamp),
  ]);
  if (results[0].meta.changes === 1) {
    const notice = await findNotice(database, scope, noticeId);
    if (!notice) throw missingNotice();
    return { notice, idempotent: false };
  }
  // A concurrent retry may have won the unique key after our first lookup.
  if (input.client_request_id) {
    const existing = await findRequest(database, scope, input.client_request_id);
    if (existing) return { notice: replayNotice(existing, input), idempotent: true };
  }
  await requireActiveLink(database, patientId, therapistId);
  throw new PortalError(429, "O limite de avisos deste paciente foi atingido. Aguarde 24 horas ou remova avisos antigos se o histórico estiver cheio.");
}

async function markNoticeRead(database: NoticeDatabase, patientId: string, noticeId: string) {
  const timestamp = now();
  await database.batch([
    database.prepare(`UPDATE patient_notices AS n SET read_at = ?
      WHERE ${scopeWhere({ patientId })} AND n.id = ? AND n.deleted_at IS NULL AND n.read_at IS NULL`)
      .bind(timestamp, patientId, noticeId),
    auditChangedNotice(database, patientId, "read_patient_notice", noticeId, timestamp),
  ]);
  const notice = await findNotice(database, { patientId }, noticeId);
  if (!notice) throw missingNotice();
  return notice;
}

async function removeNotice(database: NoticeDatabase, scope: Required<NoticeScope>, noticeId: string) {
  const timestamp = now();
  // Erase the text but retain a tiny idempotency/rate-limit tombstone. This
  // prevents a delayed POST retry from resurrecting a removed notice.
  const results = await database.batch([
    database.prepare(`UPDATE patient_notices AS n SET title = '', body = '', deleted_at = ?
      WHERE ${scopeWhere(scope)} AND n.id = ? AND n.deleted_at IS NULL`)
      .bind(timestamp, ...scopeBindings(scope), noticeId),
    auditChangedNotice(database, scope.therapistId, "delete_patient_notice", noticeId, timestamp),
  ]);
  if (results[0].meta.changes !== 1) throw missingNotice();
}

/**
 * Call before the portal's generic GET/POST/DELETE dispatch (and before it
 * consumes the body). This handler owns requireSession, trusted origin, CSRF,
 * and readJson for matching notice routes. Unrelated routes return null and
 * never touch the new table. PortalError is handled by the outer route.
 */
export async function handlePatientNotices(request: Request, path: string): Promise<Response | null> {
  const patientList = path === "/notices";
  const patientRead = path.match(/^\/notices\/([A-Za-z0-9_-]{1,80})\/read$/u);
  const professional = path.match(/^\/professional\/patients\/([A-Za-z0-9_-]{1,80})\/notices(?:\/([A-Za-z0-9_-]{1,80}))?$/u);
  if (!patientList && !patientRead && !professional) return null;

  const allowed = patientList ? ["GET"] : patientRead ? ["POST"] : professional?.[2] ? ["DELETE"] : ["GET", "POST"];
  if (!allowed.includes(request.method)) {
    return Response.json({ error: "Método não permitido." }, { status: 405, headers: { Allow: allowed.join(", "), "Cache-Control": "no-store" } });
  }
  const session = await requireSession(request, professional ? "therapist" : "patient");
  if (request.method !== "GET") {
    requireTrustedOrigin(request);
    requireCsrf(request, session);
  }
  const { DB } = getPortalEnv();
  try {
    if (patientList) return json(await listNotices(DB, { patientId: session.userId }, new URL(request.url)));
    if (patientRead) return json({ notice: await markNoticeRead(DB, session.userId, patientRead[1]) });
    if (professional) {
      const scope = { patientId: professional[1], therapistId: session.userId };
      await requireActiveLink(DB, scope.patientId, scope.therapistId);
      if (request.method === "GET") return json(await listNotices(DB, scope, new URL(request.url)));
      if (request.method === "POST") {
        const result = await createNotice(DB, scope, validatePatientNotice(await readJson(request)));
        return json(result, result.idempotent ? 200 : 201);
      }
      await removeNotice(DB, scope, professional[2]);
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    return null;
  } catch (error) {
    if (isMissingNoticeTable(error)) {
      throw new PortalError(503, "Os avisos ainda não estão disponíveis. O restante da área continua funcionando; tente novamente mais tarde.");
    }
    throw error;
  }
}
