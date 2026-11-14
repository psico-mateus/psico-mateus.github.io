import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import * as cryptoFunctions from "../lib/crypto.ts";

// Executa a função e o SQL reais da rota, com as migrações reais, em SQLite em
// memória e só com dados sintéticos. Nenhum Worker, rede ou banco persistente.
const source = await readFile(new URL("../app/api/portal/[...segments]/route.ts", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../lib/portal.ts", import.meta.url), "utf8");
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrationSql = await Promise.all((await readdir(migrationDirectory))
  .filter((name) => /^\d+.*\.sql$/u.test(name)).sort()
  .map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const SECRET = "synthetic-only-app-secret-for-patient-deletion";
const PASSWORD = "SyntheticPassword123";
const THERAPIST = "therapist_synthetic";
const OTHER_THERAPIST = "therapist_other";
const DISABLED = "patient_disabled";
const ACTIVE = "patient_active";
const FOREIGN = "patient_foreign";

function selectedFunctions(contents, names) {
  const ast = ts.createSourceFile("selected.ts", contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length, "as funções reais devem continuar presentes");
  return functions.map((node) => node.getText(ast).replace(/^export /u, "")).join("\n");
}

function totp(secret, timestamp = Date.now()) {
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of secret) {
    buffer = (buffer << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(character);
    bits += 5;
    if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  const signature = createHmac("sha1", Buffer.from(bytes)).update(message).digest();
  const offset = signature.at(-1) & 15;
  return String((signature.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  for (const sql of migrationSql) database.exec(sql);
  const db = {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return database.prepare(sql).get(...this.values) ?? null; },
        async run() { return { meta: { changes: Number(database.prepare(sql).run(...this.values).changes) } }; },
      };
    },
    async batch(statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, values }) => ({ meta: {
          changes: Number(database.prepare(sql).run(...values).changes),
        } }));
        database.exec("COMMIT");
        return results;
      } catch (error) { database.exec("ROLLBACK"); throw error; }
    },
  };
  class PortalError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const dependencies = {
    ...cryptoFunctions,
    PortalError,
    getPortalEnv: () => ({ DB: db, APP_SECRET: SECRET }),
    RATE_LIMIT_MESSAGE: "Muitas tentativas.",
  };
  const routeNames = ["json", "consumeActiveTherapistTotpCounter", "deletePatientAccount"];
  const portalNames = ["now", "consumeRateLimitWindow", "checkRateLimit"];
  const compiled = ts.transpile(selectedFunctions(portalSource, portalNames) + "\n" + selectedFunctions(source, routeNames), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  });
  const functions = new Function(...Object.keys(dependencies), `${compiled}\nreturn { ${routeNames.join(", ")} };`)(...Object.values(dependencies));

  const password = await cryptoFunctions.derivePassword(PASSWORD);
  const secret = cryptoFunctions.createTotpSecret();
  const ciphertext = await cryptoFunctions.encrypt(SECRET, secret);
  const instant = new Date().toISOString();
  const insertUser = database.prepare(`INSERT INTO users (id, display_name, email_hash, role, status,
    password_salt, password_hash, password_iterations, recovery_salt, recovery_hash, totp_secret,
    totp_enabled, last_totp_counter, privacy_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test', ?)`);
  const user = (id, name, role, status, totpSecret = null) => insertUser.run(
    id, name, `hash-${id}`, role, status, password.salt, password.hash, password.iterations,
    password.salt, password.hash, totpSecret, totpSecret ? 1 : 0,
    totpSecret ? Math.floor(Date.now() / 30_000) - 5 : null, instant,
  );
  user(THERAPIST, "Profissional Sintético", "therapist", "active", ciphertext);
  user(OTHER_THERAPIST, "Outro Profissional", "therapist", "active", ciphertext);
  user(DISABLED, "Paciente Desativado", "patient", "disabled");
  user(ACTIVE, "Paciente Ativo", "patient", "active");
  user(FOREIGN, "Paciente De Outro", "patient", "disabled");
  const link = database.prepare(`INSERT INTO patient_links (id, therapist_id, patient_id, status, created_at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  link.run("link_disabled", THERAPIST, DISABLED, "closed", instant, instant);
  link.run("link_active", THERAPIST, ACTIVE, "active", instant, null);
  link.run("link_foreign", OTHER_THERAPIST, FOREIGN, "closed", instant, instant);
  for (const patient of [DISABLED, ACTIVE, FOREIGN]) {
    database.prepare(`INSERT INTO entries (id, patient_id, title, happened, created_at, updated_at, shared_at)
      VALUES (?, ?, 'Título sintético', 'Conteúdo clínico sintético', ?, ?, ?)`)
      .run(`entry_${patient}`, patient, instant, instant, instant);
    database.prepare(`INSERT INTO entry_thought_reviews (entry_id, source_thought, created_at, updated_at)
      VALUES (?, 'Pensamento sintético', ?, ?)`).run(`entry_${patient}`, instant, instant);
    database.prepare(`INSERT INTO patient_map_draft_fields
      (patient_id, content_version, field_type, field_id, generation, value, revision, request_id, updated_at)
      VALUES (?, 'v-sintetica', 'answer', 'campo', 1, 'Resposta sintética', 1, 'request-sintetico-0001', ?)`)
      .run(patient, instant);
  }
  database.prepare(`INSERT INTO entry_views (entry_id, therapist_id, viewed_at) VALUES (?, ?, ?)`)
    .run(`entry_${DISABLED}`, THERAPIST, instant);
  database.prepare(`INSERT INTO patient_notices (id, patient_id, therapist_id, title, body, created_at)
    VALUES ('notice_disabled', ?, ?, 'Aviso sintético', 'Texto sintético', ?)`).run(DISABLED, THERAPIST, instant);
  database.prepare(`INSERT INTO invitations (id, code_hash, therapist_id, expires_at, created_at, used_at, patient_id)
    VALUES ('invite_disabled', 'hash-convite', ?, ?, ?, ?, ?)`).run(THERAPIST, instant, instant, instant, DISABLED);
  database.prepare(`INSERT INTO access_logs (id, user_id, action, resource_type, resource_id, created_at)
    VALUES ('log_old', ?, 'login', 'session', NULL, ?)`).run(DISABLED, instant);

  const request = () => new Request("http://localhost/api/portal/professional/patients/x/delete-account", {
    method: "POST", headers: { "cf-connecting-ip": "203.0.113.9" },
  });
  const session = (userId = THERAPIST) => ({ userId, role: "therapist", tokenHash: `token-${userId}` });
  const count = (table, where = "1 = 1", ...values) =>
    database.prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE ${where}`).get(...values).value;
  const clinicalRows = (patient) => ({
    user: count("users", "id = ?", patient),
    link: count("patient_links", "patient_id = ?", patient),
    entries: count("entries", "patient_id = ?", patient),
    reviews: count("entry_thought_reviews", "entry_id = ?", `entry_${patient}`),
    map: count("patient_map_draft_fields", "patient_id = ?", patient),
  });
  const attempt = (patientId, overrides = {}, who = THERAPIST) => functions.deletePatientAccount(
    request(), session(who),
    { current_password: PASSWORD, totp: totp(secret), ...overrides },
    patientId,
  );
  return { database, attempt, count, clinicalRows, secret };
}

const intact = { user: 1, link: 1, entries: 1, reviews: 1, map: 1 };
const erased = { user: 0, link: 0, entries: 0, reviews: 0, map: 0 };

test("exclusão pelo profissional apaga a conta desativada e todo o conteúdo dela", async (t) => {
  const f = await fixture(t);
  const response = await f.attempt(DISABLED);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(f.clinicalRows(DISABLED), erased);
  assert.equal(f.count("entry_views", "entry_id = ?", `entry_${DISABLED}`), 0);
  assert.equal(f.count("patient_notices", "patient_id = ?", DISABLED), 0);
  assert.equal(f.count("sessions", "user_id = ?", DISABLED), 0);
  // O convite usado continua como histórico, sem apontar para a conta apagada.
  assert.deepEqual(
    { ...f.database.prepare("SELECT patient_id FROM invitations WHERE id = 'invite_disabled'").get() },
    { patient_id: null },
  );
  // Logs antigos da pessoa perdem o vínculo com ela.
  assert.equal(f.count("access_logs", "id = 'log_old' AND user_id IS NULL"), 1);
  const audit = f.database.prepare(
    "SELECT user_id, resource_type, resource_id FROM access_logs WHERE action = 'delete_patient_account'",
  ).all();
  assert.deepEqual(audit.map((row) => ({ ...row })), [
    { user_id: THERAPIST, resource_type: "patient_account", resource_id: DISABLED },
  ]);
  // Ninguém mais é afetado.
  assert.deepEqual(f.clinicalRows(ACTIVE), intact);
  assert.deepEqual(f.clinicalRows(FOREIGN), intact);
  assert.equal(f.count("users", "role = 'therapist' AND status = 'active'"), 2);
});

test("conta com acesso ativo não pode ser excluída", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.attempt(ACTIVE), {
    status: 409, message: "Revogue o acesso desta pessoa antes de excluir a conta.",
  });
  assert.deepEqual(f.clinicalRows(ACTIVE), intact);
  assert.equal(f.count("access_logs", "action = 'delete_patient_account'"), 0);
});

test("paciente de outro profissional ou inexistente responde como não encontrado", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.attempt(FOREIGN), { status: 404, message: "Paciente não encontrado." });
  await assert.rejects(f.attempt("patient_inexistente"), { status: 404, message: "Paciente não encontrado." });
  await assert.rejects(f.attempt(OTHER_THERAPIST), { status: 404, message: "Paciente não encontrado." });
  assert.deepEqual(f.clinicalRows(FOREIGN), intact);
  assert.equal(f.count("users"), 5);
});

test("senha ou autenticador errados não apagam nada", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.attempt(DISABLED, { current_password: "SenhaErrada12345" }), {
    status: 400, message: "A senha profissional não confere.",
  });
  await assert.rejects(f.attempt(DISABLED, { totp: "000000" }), { status: 400 });
  await assert.rejects(f.attempt(DISABLED, { totp: undefined }), { status: 400 });
  assert.deepEqual(f.clinicalRows(DISABLED), intact);
  assert.equal(f.count("access_logs", "action = 'delete_patient_account'"), 0);
});

test("o mesmo código do autenticador não autoriza uma segunda exclusão", async (t) => {
  const f = await fixture(t);
  const code = totp(f.secret);
  assert.equal((await f.attempt(DISABLED, { totp: code })).status, 200);
  f.database.exec(`UPDATE users SET status = 'disabled' WHERE id = '${ACTIVE}'`);
  await assert.rejects(f.attempt(ACTIVE, { totp: code }), { status: 400 });
  assert.deepEqual(f.clinicalRows(ACTIVE), intact);
});

test("rota de exclusão exige sessão profissional, CSRF e não registra nome nem texto", async () => {
  const start = source.indexOf("const patientDeletion = path.match(");
  assert.notEqual(start, -1, "rota de exclusão presente");
  const block = source.slice(start, start + 700);
  assert.match(block, /requireSession\(request, "therapist"\)/u);
  assert.match(block, /requireCsrf\(request, session\)/u);
  assert.match(block, /deletePatientAccount\(request, session, input, /u);
  const fn = source.slice(source.indexOf("async function deletePatientAccount"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /checkRateLimit\(request, "delete-patient-account"/u);
  assert.match(body, /status = 'disabled'/u);
  assert.doesNotMatch(body, /display_name|console\./u);
});
