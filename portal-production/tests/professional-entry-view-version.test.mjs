import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { identifier, sha256 } from "../lib/crypto.ts";
import { parseCookies, SESSION_COOKIE } from "../lib/session-cookie.ts";

// Actual route branches, authorization helpers and SQL; ephemeral SQLite only.
// No Worker, network, environment secrets or persistent/patient database.
const portalSource = await readFile(new URL("../lib/portal.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/portal/[...segments]/route.ts", import.meta.url), "utf8");
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationDirectory))
  .filter((name) => /^\d+.*\.sql$/u.test(name)).sort()
  .map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const names = ["PortalError", "markSharedEntryViewed", "currentSession", "requireSession", "requireCsrf",
  "readJson", "validateEntry", "cleanText", "audit", "prepareAudit"];
const ast = ts.createSourceFile("portal.ts", portalSource, ts.ScriptTarget.Latest, true);
const declarations = ast.statements.filter((node) => names.includes(node.name?.text));
assert.equal(declarations.length, names.length);
const markBranch = routeSource.slice(routeSource.indexOf("  const viewedEntry = path.match("),
  routeSource.indexOf("  const viewedMapShare = path.match("));
const routeAst = ts.createSourceFile("route.ts", routeSource, ts.ScriptTarget.Latest, true);
const patchSource = routeAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "handlePatch").getText(routeAst);
const editBranch = patchSource.slice(patchSource.indexOf("  const entryMatch = path.match("),
  patchSource.lastIndexOf('  throw new PortalError(404, "Recurso não encontrado.");'));
assert.match(markBranch, /markSharedEntryViewed/u);
assert.match(editBranch, /RETURNING updated_at/u);
const compiled = ts.transpile([
  ...declarations.map((node) => node.getText(ast).replace(/^export /u, "")),
  `async function mark(request, path) { const input = await readJson(request); ${markBranch} }`,
  `async function edit(request, path) { const { DB } = getPortalEnv(); const input = await readJson(request); ${editBranch} }`,
].join("\n"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });

const PATIENT = "synthetic_patient";
const THERAPIST = "synthetic_therapist";
const OTHER_PATIENT = "synthetic_other_patient";
const OTHER_THERAPIST = "synthetic_other_therapist";
const ENTRY = "synthetic_entry";
const INITIAL = "2026-10-14T12:00:00.000Z";
const LATER = "2026-10-14T13:00:00.000Z";
const markPath = (id = ENTRY) => `/professional/entries/${id}/viewed`;
const editPayload = (version = INITIAL) => ({ title: "Título sintético editado", happened: "Texto sintético preservado.",
  intensity: 4, expected_updated_at: version });

async function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) database.exec(migration);
  let clock = LATER;
  const db = { beforeWrite: null, prepare(sql) {
    return { values: [], bind(...values) { this.values = values; return this; },
      async first() {
        if (/^\s*(INSERT|UPDATE)\b/iu.test(sql) && db.beforeWrite) {
          const before = db.beforeWrite; db.beforeWrite = null; await before(sql);
        }
        return database.prepare(sql).get(...this.values) ?? null;
      },
      async run() { return { meta: { changes: Number(database.prepare(sql).run(...this.values).changes) } }; },
    };
  } };
  class ClockDate extends Date { static now() { return Date.parse(clock); } }
  const dependencies = { getPortalEnv: () => ({ DB: db }), identifier, sha256, parseCookies, SESSION_COOKIE,
    now: () => clock, Date: ClockDate, json: (payload) => Response.json(payload) };
  const functions = new Function(...Object.keys(dependencies), `${compiled}\nreturn { mark, edit, PortalError };`)(...Object.values(dependencies));
  const sessions = new Map();
  for (const [id, role] of [[PATIENT, "patient"], [THERAPIST, "therapist"], [OTHER_PATIENT, "patient"], [OTHER_THERAPIST, "therapist"]]) {
    database.prepare(`INSERT INTO users (id, display_name, email_hash, role, status, password_salt,
      password_hash, password_iterations, recovery_salt, recovery_hash, privacy_version, created_at)
      VALUES (?, 'Mesmo nome sintético', ?, ?, 'active', 'synthetic', 'synthetic', 100000, 'synthetic', 'synthetic', 'test', ?)`)
      .run(id, `synthetic_hash_${id}`, role, INITIAL);
    const token = `synthetic_token_${id}`;
    const csrf = `synthetic_csrf_${id}`;
    database.prepare("INSERT INTO sessions VALUES (?, ?, ?, '2036-01-01T00:00:00.000Z', ?, ?)")
      .run(await sha256(token), id, csrf, INITIAL, INITIAL);
    sessions.set(id, { token, csrf });
  }
  database.prepare("INSERT INTO patient_links (id, therapist_id, patient_id, status, created_at) VALUES ('synthetic_link', ?, ?, 'active', ?)")
    .run(THERAPIST, PATIENT, INITIAL);
  for (const [id, patient, shared] of [[ENTRY, PATIENT, INITIAL], ["synthetic_private", PATIENT, null], ["synthetic_foreign", OTHER_PATIENT, INITIAL]]) {
    database.prepare("INSERT INTO entries (id, patient_id, title, happened, created_at, updated_at, shared_at) VALUES (?, ?, 'Título sintético', 'Conteúdo sintético original', ?, ?, ?)")
      .run(id, patient, INITIAL, INITIAL, shared);
  }
  const call = async (kind = "mark", { actor = THERAPIST, input = {}, id = ENTRY, csrf } = {}) => {
    const session = sessions.get(actor);
    const headers = { "content-type": "application/json" };
    if (session) Object.assign(headers, { cookie: `${SESSION_COOKIE}=${session.token}`, "x-csrf-token": csrf ?? session.csrf });
    const path = kind === "mark" ? markPath(id) : `/entries/${id}`;
    try { return await functions[kind](new Request(`http://localhost/api/portal${path}`, {
      method: kind === "mark" ? "POST" : "PATCH", headers, body: JSON.stringify(input),
    }), path); }
    catch (error) { if (!(error instanceof functions.PortalError)) throw error;
      return Response.json({ error: error.message }, { status: error.status }); }
  };
  const state = () => ({ entries: database.prepare("SELECT * FROM entries ORDER BY id").all(),
    views: database.prepare("SELECT * FROM entry_views ORDER BY entry_id, therapist_id").all(),
    logs: database.prepare("SELECT * FROM access_logs ORDER BY rowid").all() });
  return { database, db, call, state, clock: (value) => { clock = value; },
    entry: () => database.prepare("SELECT * FROM entries WHERE id = ?").get(ENTRY) };
}

test("new client acknowledges exactly its loaded version; response/audit contain no record content", async (t) => {
  const f = await fixture(t);
  const before = f.state().entries;
  const response = await f.call("mark", { input: { expected_updated_at: INITIAL } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { viewed_at: LATER });
  assert.deepEqual(f.state().entries, before);
  assert.equal(f.state().views.length, 1);
  assert.equal(f.state().logs.length, 1);
  assert.equal(f.state().logs[0].action, "mark_entry_viewed");
  assert.doesNotMatch(JSON.stringify(f.state().logs), /Conteúdo|Título|happened|expected_updated_at/u);
});

test("stale version returns 409 without overwriting content, receipt or audit", async (t) => {
  const f = await fixture(t);
  await f.call();
  f.database.prepare("UPDATE entries SET updated_at = ?, happened = 'Versão sintética mais nova' WHERE id = ?").run(LATER, ENTRY);
  const before = f.state();
  const response = await f.call("mark", { input: { expected_updated_at: INITIAL } });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Atualizar.*leia a versão atual/u);
  assert.deepEqual(f.state(), before);
});

for (const version of [null, 123, "", "invalid", "2026".repeat(20)]) test(`invalid optional version ${JSON.stringify(version)} is rejected`, async (t) => {
  const f = await fixture(t);
  const before = f.state();
  assert.equal((await f.call("mark", { input: { expected_updated_at: version } })).status, 400);
  assert.deepEqual(f.state(), before);
});

for (const [actor, csrf, status] of [[PATIENT, undefined, 403], [OTHER_THERAPIST, undefined, 404], [null, undefined, 401], [THERAPIST, "wrong", 403]])
  test(`existing role/session/CSRF permissions remain enforced (${actor}, ${status})`, async (t) => {
    const f = await fixture(t); const before = f.state();
    assert.equal((await f.call("mark", { actor, csrf, input: { expected_updated_at: INITIAL } })).status, status);
    assert.deepEqual(f.state(), before);
  });

for (const id of ["missing", "synthetic_private", "synthetic_foreign"]) test(`unavailable ${id} returns the same non-enumerating 404`, async (t) => {
  const f = await fixture(t); const before = f.state();
  const response = await f.call("mark", { id, input: { expected_updated_at: INITIAL } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Registro compartilhado não encontrado." });
  assert.deepEqual(f.state(), before);
});

for (const legacy of [false, true]) for (const mutation of [
  "UPDATE entries SET revoked_at = '2026-10-14T12:01:00.000Z' WHERE id = 'synthetic_entry'",
  "UPDATE patient_links SET status = 'closed'",
  "UPDATE users SET status = 'disabled' WHERE id = 'synthetic_patient'",
]) test(`atomic access: ${legacy ? "legacy" : "versioned"} request rejects concurrent ${mutation.split(" SET")[0]}`, async (t) => {
  const f = await fixture(t);
  let expected;
  f.db.beforeWrite = () => { f.database.exec(mutation); expected = f.state(); };
  const response = await f.call("mark", { input: legacy ? {} : { expected_updated_at: INITIAL } });
  assert.equal(response.status, 404);
  assert.deepEqual(f.state(), expected);
});

test("patient edit winning immediately before atomic acknowledgment causes conflict; legacy client still works", async (t) => {
  const f = await fixture(t);
  f.db.beforeWrite = () => f.database.prepare("UPDATE entries SET updated_at = ?, happened = 'Edição concorrente sintética' WHERE id = ?").run(LATER, ENTRY);
  assert.equal((await f.call("mark", { input: { expected_updated_at: INITIAL } })).status, 409);
  assert.equal(f.state().views.length, 0);
  assert.equal(f.state().logs.length, 0);
  assert.equal(f.entry().happened, "Edição concorrente sintética");
  assert.equal((await f.call()).status, 200, "Omitting the optional field retains the old request contract.");
});

test("revocation during a repeated confirmation cannot overwrite an existing receipt", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call()).status, 200);
  f.clock("2026-10-14T14:00:00.000Z");
  let expected;
  f.db.beforeWrite = () => {
    f.database.prepare("UPDATE entries SET revoked_at = ? WHERE id = ?").run(LATER, ENTRY);
    expected = f.state();
  };
  assert.equal((await f.call()).status, 404);
  assert.deepEqual(f.state(), expected);
  assert.equal(f.state().views[0].viewed_at, LATER);
});

test("a concurrent thought-review change advances the record version and blocks an old read receipt", async (t) => {
  const f = await fixture(t);
  f.db.beforeWrite = () => f.database.prepare(`INSERT INTO entry_thought_reviews
    (entry_id, source_thought, created_at, updated_at) VALUES (?, 'Pensamento sintético novo', ?, ?)`)
    .run(ENTRY, LATER, LATER);
  const response = await f.call("mark", { input: { expected_updated_at: INITIAL } });
  assert.equal(response.status, 409);
  assert.equal(f.entry().updated_at, LATER);
  assert.equal(f.state().views.length, 0);
  assert.equal(f.state().logs.length, 0);
  assert.equal(f.database.prepare("SELECT source_thought FROM entry_thought_reviews").get().source_thought, "Pensamento sintético novo");
});

for (const viewedAt of [LATER, "2026-10-14T13:00:00.999Z", "2026-12-31T23:59:59.999Z"])
  test(`an edit after a same-millisecond receipt becomes unread (${viewedAt})`, async (t) => {
    const f = await fixture(t); f.clock(viewedAt);
    assert.equal((await f.call("mark", { input: { expected_updated_at: INITIAL } })).status, 200);
    const edited = await f.call("edit", { actor: PATIENT, input: editPayload() });
    assert.equal(edited.status, 200);
    const savedVersion = (await edited.json()).updated_at;
    assert.equal(Date.parse(savedVersion), Date.parse(viewedAt) + 1);
    assert.equal(f.entry().updated_at, savedVersion);
    assert.equal(f.state().views[0].viewed_at < savedVersion, true);
    assert.equal((await f.call("mark", { input: { expected_updated_at: INITIAL } })).status, 409);
    assert.equal((await f.call("mark", { input: { expected_updated_at: savedVersion } })).status, 200);
    assert.equal(f.state().views[0].viewed_at >= savedVersion, true);
  });

test("edit timestamp checks a receipt arriving after the edit's SELECT, within the atomic UPDATE", async (t) => {
  const f = await fixture(t);
  const concurrentView = "2026-10-14T13:00:00.005Z";
  f.db.beforeWrite = () => f.database.prepare("INSERT INTO entry_views VALUES (?, ?, ?)").run(ENTRY, THERAPIST, concurrentView);
  const response = await f.call("edit", { actor: PATIENT, input: editPayload() });
  assert.equal(response.status, 200);
  const version = (await response.json()).updated_at;
  assert.equal(Date.parse(version), Date.parse(concurrentView) + 1);
  assert.equal(f.entry().updated_at, version);
  assert.equal(f.state().views[0].viewed_at < version, true);
});

test("edit CAS still rejects a competing edit without changing its newer contents", async (t) => {
  const f = await fixture(t);
  f.db.beforeWrite = () => f.database.prepare("UPDATE entries SET updated_at = ?, title = 'Ganhador sintético' WHERE id = ?").run(LATER, ENTRY);
  assert.equal((await f.call("edit", { actor: PATIENT, input: editPayload() })).status, 409);
  assert.equal(f.entry().title, "Ganhador sintético");
  assert.equal(f.entry().updated_at, LATER);
  assert.equal(f.state().logs.length, 0);
});
