import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { identifier, sha256 } from "../lib/crypto.ts";
import { parseCookies, SESSION_COOKIE } from "../lib/session-cookie.ts";

// Exercise the actual TypeScript handler, validators, authorization helpers,
// and generated SQL against ephemeral SQLite. No Worker, network, or real data.
const noticeSource = await readFile(new URL("../lib/patient-notices.ts", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../lib/portal.ts", import.meta.url), "utf8");
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationDirectory))
  .filter((name) => /^\d+.*\.sql$/u.test(name)).sort()
  .map(async (name) => ({ name, sql: await readFile(new URL(name, migrationDirectory), "utf8") })));

function declarations(source, names) {
  const ast = ts.createSourceFile("actual.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return ast.statements.filter((node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return false;
    if (!names) return true;
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(({ name }) => names.includes(name.getText(ast)));
    return names.includes(node.name?.text);
  }).map((node) => node.getText(ast).replace(/^export /u, "")).join("\n");
}

const actualFunctions = ts.transpile(
  declarations(portalSource, ["PortalError", "readJson", "TRUSTED_PRODUCTION_ORIGINS", "requireTrustedOrigin", "currentSession", "requireSession", "requireCsrf"])
  + "\n" + declarations(noticeSource),
  { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
);

const PATIENT = "patient_synthetic";
const OTHER_PATIENT = "patient_other";
const THERAPIST = "therapist_synthetic";
const OTHER_THERAPIST = "therapist_other";
const INITIAL_TIME = "2026-10-08T12:00:00.000Z";
const composePath = (patient = PATIENT) => `/professional/patients/${patient}/notices`;
const readPath = (notice) => `/notices/${notice.id}/read`;
const removePath = (notice, patient = PATIENT) => `${composePath(patient)}/${notice.id}`;
const validInput = (clientRequestId = "synthetic_request_0001") => ({
  title: "Lembrete sintético privado", body: "Texto sintético sem dados reais.",
  ...(clientRequestId === null ? {} : { client_request_id: clientRequestId }),
});
const publicKeys = ["body", "created_at", "id", "read_at", "title"];

async function fixture(t, { withoutNotices = false } = {}) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) {
    if (!withoutNotices || !migration.name.includes("patient_notices")) database.exec(migration.sql);
  }
  let clock = INITIAL_TIME;
  const db = {
    beforeBatch: null,
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return database.prepare(sql).get(...this.values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...this.values) }; },
        async run() { return { meta: { changes: Number(database.prepare(sql).run(...this.values).changes) } }; },
      };
    },
    async batch(statements) {
      if (this.beforeBatch) await this.beforeBatch(statements);
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, values }) => /^\s*SELECT\b/iu.test(sql)
          ? { results: database.prepare(sql).all(...values), meta: { changes: 0 } }
          : { results: [], meta: { changes: Number(database.prepare(sql).run(...values).changes) } });
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const dependencies = { getPortalEnv: () => ({ DB: db }), identifier, sha256, parseCookies, SESSION_COOKIE, now: () => clock };
  const functions = new Function(...Object.keys(dependencies), `${actualFunctions}\nreturn {
    handlePatientNotices, exportPatientNotices, validatePatientNotice, PortalError,
    PATIENT_NOTICE_TITLE_MAX, PATIENT_NOTICE_BODY_MAX, PATIENT_NOTICE_PAGE_MAX,
    PATIENT_NOTICE_DAILY_MAX, PATIENT_NOTICE_ACTIVE_MAX,
  };`)(...Object.values(dependencies));
  const sessions = new Map();
  for (const [userId, role] of [[PATIENT, "patient"], [OTHER_PATIENT, "patient"], [THERAPIST, "therapist"], [OTHER_THERAPIST, "therapist"]]) {
    database.prepare(`INSERT INTO users (id, display_name, email_hash, role, status, password_salt,
      password_hash, password_iterations, recovery_salt, recovery_hash, privacy_version, created_at)
      VALUES (?, ?, ?, ?, 'active', 'synthetic', 'synthetic', 100000, 'synthetic', 'synthetic', 'test', ?)`)
      .run(userId, `Synthetic ${userId}`, `hash_${userId}`, role, INITIAL_TIME);
    const token = `synthetic_session_${userId}`;
    const csrf = `synthetic_csrf_${userId}`;
    const tokenHash = await sha256(token);
    database.prepare(`INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, '2027-01-01T00:00:00.000Z', ?, ?)`).run(tokenHash, userId, csrf, INITIAL_TIME, INITIAL_TIME);
    sessions.set(userId, { token, tokenHash, csrf });
  }
  const link = (patientId = PATIENT, therapistId = THERAPIST) => database.prepare(`INSERT INTO patient_links
    (id, patient_id, therapist_id, status, created_at) VALUES (?, ?, ?, 'active', ?)`)
    .run(`link_${patientId}_${therapistId}`, patientId, therapistId, INITIAL_TIME);
  link();
  link(OTHER_PATIENT, OTHER_THERAPIST);
  const request = (path, { method = "GET", actor = PATIENT, input, headers = {}, rawBody } = {}) => {
    const session = sessions.get(actor);
    const standard = { origin: "http://localhost", "sec-fetch-site": "same-origin" };
    if (session) Object.assign(standard, { cookie: `${SESSION_COOKIE}=${session.token}`, "x-csrf-token": session.csrf });
    if (input !== undefined || rawBody !== undefined) standard["content-type"] = "application/json";
    return new Request(`http://localhost/api/portal${path}`, {
      method, headers: { ...standard, ...headers },
      ...(input !== undefined ? { body: JSON.stringify(input) } : rawBody !== undefined ? { body: rawBody } : {}),
    });
  };
  const call = async (path, options) => {
    try { return await functions.handlePatientNotices(request(path, options), path.split("?", 1)[0]); }
    catch (error) {
      // The production dispatcher owns this same PortalError-to-HTTP boundary.
      if (!(error instanceof functions.PortalError)) throw error;
      return Response.json({ error: error.message }, { status: error.status });
    }
  };
  const create = async (input = validInput(), patient = PATIENT, actor = THERAPIST) => {
    const response = await call(composePath(patient), { method: "POST", actor, input });
    assert.equal(response.status, 201);
    return (await response.json()).notice;
  };
  const insert = ({ id, patient = PATIENT, therapist = THERAPIST, title = "Título sintético", body = "Texto sintético", at = INITIAL_TIME, readAt = null, requestId = null }) =>
    database.prepare(`INSERT INTO patient_notices
      (id, patient_id, therapist_id, title, body, created_at, read_at, client_request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, patient, therapist, title, body, at, readAt, requestId);
  const rows = () => database.prepare("SELECT * FROM patient_notices ORDER BY id").all();
  const logs = () => database.prepare("SELECT * FROM access_logs ORDER BY rowid").all();
  return { database, db, functions, sessions, link, request, call, create, insert, rows, logs, advance: () => { clock = "2026-10-08T13:00:00.000Z"; } };
}

test("compose, list, idempotent read, and removal use allowlisted data and PHI-free atomic audit", async (t) => {
  const f = await fixture(t);
  const input = validInput();
  const response = await f.call(composePath(), { method: "POST", actor: THERAPIST, input });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.idempotent, false);
  const notice = payload.notice;
  assert.deepEqual(Object.keys(notice).sort(), publicKeys);
  assert.equal(notice.read_at, null);
  assert.equal(f.rows().length, 1);
  for (const [path, actor] of [["/notices", PATIENT], [composePath(), THERAPIST]]) {
    const list = await f.call(path, { actor });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { notices: [notice], unread_count: 1, next_cursor: null });
  }
  const read = await (await f.call(readPath(notice), { method: "POST" })).json();
  assert.equal(read.notice.read_at, INITIAL_TIME);
  f.advance();
  const secondRead = await f.call(readPath(notice), { method: "POST" });
  assert.equal(secondRead.status, 200);
  assert.equal((await secondRead.json()).notice.read_at, INITIAL_TIME);
  assert.equal(f.logs().filter(({ action }) => action === "read_patient_notice").length, 1);
  assert.equal((await (await f.call("/notices")).json()).unread_count, 0);
  const removal = await f.call(removePath(notice), { method: "DELETE", actor: THERAPIST });
  assert.equal(removal.status, 204);
  assert.equal(await removal.text(), "");
  assert.equal(f.rows()[0].title, "");
  assert.equal(f.rows()[0].body, "");
  assert.ok(f.rows()[0].deleted_at);
  assert.deepEqual(await (await f.call("/notices")).json(), { notices: [], unread_count: 0, next_cursor: null });
  assert.equal((await f.call(readPath(notice), { method: "POST" })).status, 404);
  assert.equal((await f.call(removePath(notice), { method: "DELETE", actor: THERAPIST })).status, 404);
  assert.deepEqual(f.logs().map(({ action }) => action), ["create_patient_notice", "read_patient_notice", "delete_patient_notice"]);
  const audit = JSON.stringify(f.logs());
  for (const text of [input.title, input.body, `Synthetic ${PATIENT}`, input.client_request_id]) assert.equal(audit.includes(text), false);
});

test("client request IDs deduplicate retries, reject changed payloads, and cannot resurrect tombstones", async (t) => {
  const f = await fixture(t);
  const input = validInput();
  const notice = await f.create(input);
  const replay = await f.call(composePath(), { method: "POST", actor: THERAPIST, input });
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { notice, idempotent: true });
  assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST, input: { ...input, body: "Outro texto" } })).status, 409);
  assert.equal(f.rows().length, 1);
  assert.equal(f.logs().length, 1);
  await f.call(removePath(notice), { method: "DELETE", actor: THERAPIST });
  assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST, input })).status, 409);
  assert.equal(f.rows().length, 1);
  assert.deepEqual(await f.functions.exportPatientNotices(f.db, PATIENT), []);
  const independent = await f.create(validInput(null));
  const another = await f.create(validInput(null));
  assert.notEqual(independent.id, another.id);
  f.link(OTHER_PATIENT, THERAPIST);
  f.link(PATIENT, OTHER_THERAPIST);
  await f.create(input, OTHER_PATIENT, THERAPIST);
  await f.create(input, PATIENT, OTHER_THERAPIST);
  assert.equal(f.rows().length, 5);
});

test("simultaneous request retries have one stored notice and one audit event", async (t) => {
  const f = await fixture(t);
  let release;
  let arrivals = 0;
  const bothArrived = new Promise((resolve) => { release = resolve; });
  f.db.beforeBatch = async () => { if (++arrivals === 2) release(); await bothArrived; };
  const results = await Promise.all([1, 2].map(() => f.call(composePath(), { method: "POST", actor: THERAPIST, input: validInput() })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 201]);
  const payloads = await Promise.all(results.map((response) => response.json()));
  assert.equal(payloads[0].notice.id, payloads[1].notice.id);
  assert.equal(f.rows().length, 1);
  assert.equal(f.logs().length, 1);
});

test("sessions, roles, origin, CSRF, and HTTP methods are enforced before body consumption", async (t) => {
  const f = await fixture(t);
  for (const [path, options, status] of [
    ["/notices", { actor: null }, 401],
    ["/notices", { actor: THERAPIST }, 403],
    [composePath(), { actor: PATIENT }, 403],
    [composePath(), { method: "POST", actor: THERAPIST, headers: { origin: "https://evil.example" } }, 403],
    [composePath(), { method: "POST", actor: THERAPIST, headers: { origin: "" } }, 403],
    [composePath(), { method: "POST", actor: THERAPIST, headers: { "sec-fetch-site": "cross-site" } }, 403],
    [composePath(), { method: "POST", actor: THERAPIST, headers: { "x-csrf-token": "wrong" } }, 403],
    [composePath(), { method: "POST", actor: THERAPIST, headers: { "x-csrf-token": "" } }, 403],
    ["/notices/notice_unknown/read", { method: "POST", actor: THERAPIST }, 403],
    ["/notices/notice_unknown/read", { method: "POST", headers: { "x-csrf-token": "wrong" } }, 403],
    ["/notices/notice_unknown/read", { method: "POST", headers: { origin: "https://evil.example" } }, 403],
    [`${composePath()}/notice_unknown`, { method: "DELETE", actor: PATIENT }, 403],
    [`${composePath()}/notice_unknown`, { method: "DELETE", actor: THERAPIST, headers: { "x-csrf-token": "wrong" } }, 403],
    [`${composePath()}/notice_unknown`, { method: "DELETE", actor: THERAPIST, headers: { origin: "https://evil.example" } }, 403],
  ]) {
    const response = await f.call(path, { ...options, ...(options.method === "POST" ? { rawBody: "malformed" } : {}) });
    assert.equal(response.status, status, JSON.stringify([path, options]));
  }
  assert.equal(f.rows().length, 0);
  assert.equal(f.logs().length, 0);
  f.database.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(INITIAL_TIME, PATIENT);
  assert.equal((await f.call("/notices")).status, 401);
  f.database.prepare("DELETE FROM sessions WHERE user_id = ?").run(THERAPIST);
  assert.equal((await f.call(composePath(), { actor: THERAPIST })).status, 401);
  f.database.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(OTHER_PATIENT);
  assert.equal((await f.call("/notices", { actor: OTHER_PATIENT })).status, 401);
  for (const [path, method, allow] of [["/notices", "POST", "GET"], ["/notices/notice_unknown/read", "GET", "POST"],
    [composePath(), "DELETE", "GET, POST"], [`${composePath()}/notice_unknown`, "GET", "DELETE"]]) {
    const response = await f.call(path, { method, actor: null });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), allow);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("neither patient nor professional can act on another patient's or author's notice", async (t) => {
  const f = await fixture(t);
  const notice = await f.create();
  const other = await f.create(validInput(), OTHER_PATIENT, OTHER_THERAPIST);
  assert.deepEqual((await (await f.call("/notices", { actor: OTHER_PATIENT })).json()).notices, [other]);
  for (const [path, options] of [
    [readPath(notice), { method: "POST", actor: OTHER_PATIENT }],
    [composePath(), { actor: OTHER_THERAPIST }],
    [composePath(), { method: "POST", actor: OTHER_THERAPIST, input: validInput() }],
    [removePath(notice), { method: "DELETE", actor: OTHER_THERAPIST }],
    [removePath(other), { method: "DELETE", actor: THERAPIST }],
    [removePath(notice, OTHER_PATIENT), { method: "DELETE", actor: OTHER_THERAPIST }],
  ]) assert.equal((await f.call(path, options)).status, 404, path);
  f.link(PATIENT, OTHER_THERAPIST);
  assert.deepEqual((await (await f.call(composePath(), { actor: OTHER_THERAPIST })).json()).notices, []);
  assert.equal((await f.call(removePath(notice), { method: "DELETE", actor: OTHER_THERAPIST })).status, 404);
  assert.equal(f.rows().length, 2);
  assert.equal(f.logs().length, 2);
});

for (const mutation of [
  "UPDATE patient_links SET status = 'closed'",
  `UPDATE users SET status = 'disabled' WHERE id = '${THERAPIST}'`,
  `UPDATE users SET role = 'patient' WHERE id = '${THERAPIST}'`,
]) test(`revoked care access disappears from lists and cannot be read: ${mutation}`, async (t) => {
  const f = await fixture(t);
  const notice = await f.create();
  f.database.exec(mutation);
  assert.deepEqual(await (await f.call("/notices")).json(), { notices: [], unread_count: 0, next_cursor: null });
  assert.equal((await f.call(readPath(notice), { method: "POST" })).status, 404);
  assert.notEqual((await f.call(composePath(), { actor: THERAPIST })).status, 200);
  assert.notEqual((await f.call(removePath(notice), { method: "DELETE", actor: THERAPIST })).status, 204);
  assert.equal(f.rows()[0].read_at, null);
  assert.equal(f.rows()[0].deleted_at, null);
  assert.equal(f.logs().length, 1);
  // Owner data export remains complete even after care access is closed.
  assert.deepEqual(await f.functions.exportPatientNotices(f.db, PATIENT), [notice]);
});

for (const action of ["create", "read", "remove"]) test(`live SQL authorization blocks ${action} if the link closes after session checks`, async (t) => {
  const f = await fixture(t);
  const notice = await f.create();
  f.db.beforeBatch = () => f.database.exec("UPDATE patient_links SET status = 'closed'");
  const response = action === "create"
    ? await f.call(composePath(), { method: "POST", actor: THERAPIST, input: validInput("synthetic_request_0002") })
    : action === "read" ? await f.call(readPath(notice), { method: "POST" })
      : await f.call(removePath(notice), { method: "DELETE", actor: THERAPIST });
  assert.equal(response.status, 404);
  assert.equal(f.rows().length, 1);
  assert.equal(f.rows()[0].read_at, null);
  assert.equal(f.rows()[0].deleted_at, null);
  assert.equal(f.logs().length, 1);
});

for (const mutation of ["status = 'disabled'", "role = 'therapist'"])
  test(`professional access requires the linked account to remain an active patient: ${mutation}`, async (t) => {
    const f = await fixture(t);
    const notice = await f.create();
    f.database.exec(`UPDATE users SET ${mutation} WHERE id = '${PATIENT}'`);
    for (const [path, options] of [[composePath(), { actor: THERAPIST }],
      [composePath(), { method: "POST", actor: THERAPIST, input: validInput("synthetic_request_0002") }],
      [removePath(notice), { method: "DELETE", actor: THERAPIST }]]) {
      assert.equal((await f.call(path, options)).status, 404);
    }
    assert.equal(f.rows().length, 1);
    assert.equal(f.rows()[0].deleted_at, null);
    assert.equal(f.logs().length, 1);
  });

test("pagination is bounded, stable on timestamp ties, and reports unread count across all pages", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 205; index++) f.insert({ id: `notice_${String(index).padStart(4, "0")}`, readAt: index < 5 ? INITIAL_TIME : null });
  const found = [];
  let cursor = null;
  do {
    const response = await f.call(`/notices${cursor ? `?cursor=${cursor}` : ""}`);
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.ok(page.notices.length <= 100);
    assert.equal(page.unread_count, 200);
    assert.ok(page.notices.every((row) => Object.keys(row).sort().join() === publicKeys.join()));
    found.push(...page.notices.map(({ id }) => id));
    cursor = page.next_cursor;
  } while (cursor);
  assert.equal(found.length, 205);
  assert.equal(new Set(found).size, 205);
  assert.deepEqual(found, [...found].sort().reverse());
  const tiny = await (await f.call("/notices?limit=1")).json();
  assert.equal(tiny.notices.length, 1);
  assert.ok(tiny.next_cursor);
  const professional = await (await f.call(`${composePath()}?limit=2`, { actor: THERAPIST })).json();
  assert.equal(professional.notices.length, 2);
  assert.equal(professional.unread_count, 200);
  for (const query of ["limit=0", "limit=101", "limit=1.5", "limit=no", "limit=", "cursor=!!!", "cursor=e30", "cursor=" ]) {
    assert.equal((await f.call(`/notices?${query}`)).status, 400, query);
  }
  for (const value of [{ created_at: INITIAL_TIME, id: "bad/id" }, { created_at: "not-a-date", id: "notice_test" }]) {
    const cursor = Buffer.from(JSON.stringify(value)).toString("base64url");
    assert.equal((await f.call(`/notices?cursor=${cursor}`)).status, 400);
  }
});

test("validator and body parsing reject invalid text, idempotency IDs, malformed and oversized JSON", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.functions.validatePatientNotice({ title: "  Título  ", body: " Linha 1\r\nLinha 2\rLinha 3 ", client_request_id: "a".repeat(80) }), {
    title: "Título", body: "Linha 1\nLinha 2\nLinha 3", client_request_id: "a".repeat(80),
  });
  assert.equal(f.functions.validatePatientNotice({ title: "a".repeat(100), body: "b".repeat(2000) }).client_request_id, null);
  for (const input of [null, [], "text", {}, { title: 1, body: "valid" }, { title: "valid", body: null },
    { title: " ", body: "valid" }, { title: "a".repeat(101), body: "valid" }, { title: "valid", body: "a".repeat(2001) },
    { title: "bad\u0000", body: "valid" }, { title: "valid", body: "bad\u007f" },
    ...[null, 123, "x".repeat(15), "x".repeat(81), "bad/key/123456789", "with spaces 12345"].map((client_request_id) => ({ ...validInput(), client_request_id })),
  ]) assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST, input })).status, 400, JSON.stringify(input));
  for (const [rawBody, headers, status] of [["{broken", {}, 400], [JSON.stringify(validInput()), { "content-type": "text/plain" }, 415],
    ["x".repeat(64_001), {}, 413], [JSON.stringify(validInput()), { "content-length": "64001" }, 413]]) {
    assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST, rawBody, headers })).status, status);
  }
  assert.equal(f.rows().length, 0);
  assert.equal(f.logs().length, 0);
});

test("daily and active-history limits are enforced atomically; deleted notices still count for daily limit", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < f.functions.PATIENT_NOTICE_DAILY_MAX - 1; index++) f.insert({ id: `notice_daily_${index}` });
  let release;
  let arrivals = 0;
  const waiting = new Promise((resolve) => { release = resolve; });
  f.db.beforeBatch = async () => { if (++arrivals === 2) release(); await waiting; };
  const concurrent = await Promise.all([1, 2].map((index) => f.call(composePath(), {
    method: "POST", actor: THERAPIST, input: validInput(`synthetic_limit_${index}`),
  })));
  assert.deepEqual(concurrent.map(({ status }) => status).sort(), [201, 429]);
  assert.equal(f.rows().length, 20);
  assert.equal(f.logs().length, 1);
  f.db.beforeBatch = null;
  const winning = await concurrent.find(({ status }) => status === 201).json();
  const winningRequestId = f.rows().find(({ id }) => id === winning.notice.id).client_request_id;
  assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST,
    input: validInput(winningRequestId) })).status, 200);
  await f.call(removePath(winning.notice), { method: "DELETE", actor: THERAPIST });
  assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST, input: validInput("synthetic_new_send") })).status, 429);
  // A full older history independently enforces the active-history cap.
  f.database.exec("DELETE FROM patient_notices");
  for (let index = 0; index < f.functions.PATIENT_NOTICE_ACTIVE_MAX; index++) f.insert({ id: `notice_history_${index}`, at: "2026-09-01T00:00:00.000Z" });
  assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST, input: validInput() })).status, 429);
  await f.call(removePath({ id: "notice_history_0" }), { method: "DELETE", actor: THERAPIST });
  assert.equal((await f.call(composePath(), { method: "POST", actor: THERAPIST, input: validInput() })).status, 201);
});

for (const action of ["create", "read", "remove"]) test(`audit failure rolls back the ${action} mutation`, async (t) => {
  const f = await fixture(t);
  const notice = await f.create();
  const before = f.rows();
  f.database.exec(`CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON access_logs
    BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END`);
  await assert.rejects(action === "create"
    ? f.call(composePath(), { method: "POST", actor: THERAPIST, input: validInput("synthetic_request_0002") })
    : action === "read" ? f.call(readPath(notice), { method: "POST" })
      : f.call(removePath(notice), { method: "DELETE", actor: THERAPIST }), /synthetic audit failure/u);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.logs().length, 1);
});

test("patient export includes every current notice regardless of active link, with an explicit field allowlist", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 120; index++) f.insert({ id: `notice_export_${index}`, requestId: `private_request_${String(index).padStart(4, "0")}` });
  f.insert({ id: "notice_other_patient", patient: OTHER_PATIENT, therapist: OTHER_THERAPIST });
  await f.call(removePath({ id: "notice_export_0" }), { method: "DELETE", actor: THERAPIST });
  f.database.exec("UPDATE patient_links SET status = 'closed'");
  const exported = await f.functions.exportPatientNotices(f.db, PATIENT);
  assert.equal(exported.length, 119);
  assert.ok(exported.every((notice) => Object.keys(notice).sort().join() === publicKeys.join()));
  assert.ok(exported.every(({ id }) => !["notice_export_0", "notice_other_patient"].includes(id)));
  assert.equal(JSON.stringify(exported).includes("private_request"), false);
  assert.deepEqual(await f.functions.exportPatientNotices(f.db, "missing_patient"), []);
  // Even a DB adapter returning extra columns cannot broaden the export.
  const broadAdapter = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ ...exported[0], therapist_id: "secret", client_request_id: "secret" }] }) }) }) };
  assert.deepEqual(Object.keys((await f.functions.exportPatientNotices(broadAdapter, PATIENT))[0]).sort(), publicKeys);
});

test("only the export helper treats an absent notices migration as empty; routes fail clearly without bootstrapping", async (t) => {
  const f = await fixture(t, { withoutNotices: true });
  assert.deepEqual(await f.functions.exportPatientNotices(f.db, PATIENT), []);
  for (const [path, options] of [["/notices", {}], [composePath(), { actor: THERAPIST }],
    [composePath(), { method: "POST", actor: THERAPIST, input: validInput() }],
    ["/notices/notice_missing/read", { method: "POST" }],
    [`${composePath()}/notice_missing`, { method: "DELETE", actor: THERAPIST }]]) {
    const response = await f.call(path, options);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /avisos ainda não estão disponíveis/u);
  }
  assert.equal(f.database.prepare("SELECT name FROM sqlite_master WHERE name = 'patient_notices'").get(), undefined);
  assert.equal(await f.call("/entries", { actor: null }), null);
  assert.equal(f.logs().length, 0);
  const brokenAdapter = (message, cause) => ({ prepare() { throw new Error(message, cause ? { cause } : undefined); } });
  assert.deepEqual(await f.functions.exportPatientNotices(brokenAdapter("D1_ERROR", new Error("no such table: main.patient_notices")), PATIENT), []);
  for (const message of ["no such table: users", "no such column: deleted_at", "database is locked"]) {
    await assert.rejects(f.functions.exportPatientNotices(brokenAdapter(message), PATIENT), { message });
  }
});

for (const deletedUser of [PATIENT, THERAPIST]) test(`account deletion cascades notice content and tombstones for ${deletedUser}`, async (t) => {
  const f = await fixture(t);
  const current = await f.create();
  const removed = await f.create(validInput("synthetic_request_0002"));
  await f.call(removePath(removed), { method: "DELETE", actor: THERAPIST });
  const unaffected = await f.create(validInput(), OTHER_PATIENT, OTHER_THERAPIST);
  assert.equal(f.rows().length, 3);
  f.database.prepare("DELETE FROM users WHERE id = ?").run(deletedUser);
  assert.deepEqual(f.rows().map(({ id }) => id), [unaffected.id]);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM patient_notices WHERE id IN (?, ?)").get(current.id, removed.id).count, 0);
  assert.deepEqual(f.database.prepare("PRAGMA foreign_key_check").all(), []);
});

test("additive migration creates only the notices table and indexes and enforces storage constraints", async (t) => {
  const f = await fixture(t);
  const migration = migrations.find(({ name }) => name.includes("patient_notices")).sql;
  assert.match(migration, /CREATE TABLE `patient_notices`/u);
  assert.doesNotMatch(migration, /\b(?:ALTER|DROP|DELETE|UPDATE|REPLACE)\s+(?:TABLE|FROM|INTO|users|entries)\b/iu);
  assert.doesNotMatch(await readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"), /CREATE TABLE[^`]*patient_notices/iu);
  const older = await fixture(t, { withoutNotices: true });
  older.database.prepare(`INSERT INTO entries (id, patient_id, title, happened, created_at, updated_at)
    VALUES ('entry_synthetic_preserved', ?, 'Synthetic title', 'Synthetic content', ?, ?)`)
    .run(PATIENT, INITIAL_TIME, INITIAL_TIME);
  const existingTables = ["users", "sessions", "patient_links", "entries"];
  const previousState = () => Object.fromEntries(existingTables.map((table) => [table, older.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const beforeMigration = previousState();
  older.database.exec(migration);
  assert.deepEqual(previousState(), beforeMigration);
  for (const values of [{ id: "bad_empty", title: "" }, { id: "bad_title", title: "x".repeat(101) },
    { id: "bad_body", body: "x".repeat(2001) }, { id: "bad_request", requestId: "short" },
    { id: "bad_patient", patient: "nonexistent" }, { id: "bad_therapist", therapist: "nonexistent" }]) {
    assert.throws(() => f.insert(values), /constraint failed/iu);
  }
  f.insert({ id: "notice_valid" });
  assert.throws(() => f.database.exec("UPDATE patient_notices SET deleted_at = '2026-10-08' WHERE id = 'notice_valid'"), /constraint failed/iu);
  f.database.exec("UPDATE patient_notices SET title = '', body = '', deleted_at = '2026-10-08' WHERE id = 'notice_valid'");
  assert.equal(f.rows().length, 1);
});
