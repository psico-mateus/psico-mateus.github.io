import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import * as cryptoFunctions from "../lib/crypto.ts";
import * as recoveryFunctions from "../lib/professional-mfa-recovery.ts";
import * as sessionFunctions from "../lib/session-cookie.ts";

// Executa as funções e SQL reais da rota, sem Worker nem banco persistente.
// O adaptador preserva a atomicidade de D1.batch com BEGIN/COMMIT/ROLLBACK.
const source = await readFile(new URL("../app/api/portal/[...segments]/route.ts", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../lib/portal.ts", import.meta.url), "utf8");
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrationSql = await Promise.all((await readdir(migrationDirectory))
  .filter((name) => /^\d+.*\.sql$/u.test(name)).sort()
  .map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const SECRET = "synthetic-only-app-secret-for-atomic-mfa-recovery";
const EMAIL = "synthetic@example.test";
const PASSWORD = "SyntheticPassword123";
const USER = "therapist_synthetic";
const REQUEST_URL = "http://localhost/api/portal/recover/mfa/confirm";

function selectedFunctions(contents, names) {
  const ast = ts.createSourceFile("selected.ts", contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length, "as funções reais devem continuar presentes");
  return functions.map((node) => node.getText(ast).replace(/^export /u, "")).join("\n");
}

function totp(secret) {
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of secret) {
    buffer = (buffer << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(character);
    bits += 5;
    if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
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
    ...cryptoFunctions, ...recoveryFunctions, ...sessionFunctions,
    PortalError,
    getPortalEnv: () => ({ DB: db, APP_SECRET: SECRET }),
    DUMMY_PASSWORD_SALT: "AAAAAAAAAAAAAAAAAAAAAAAA",
    DUMMY_PASSWORD_HASH: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    DUMMY_TOTP_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    PROFESSIONAL_MFA_RECOVERY_ERROR: "Não foi possível recuperar o acesso profissional.",
    RATE_LIMIT_MESSAGE: "Muitas tentativas.",
  };
  const routeNames = ["json", "prepareRecoveryCodeInsertStatements", "generateProfessionalMfaRecoveryCodes",
    "startProfessionalMfaRecovery", "confirmProfessionalMfaRecovery", "login", "recoverAccount",
    "consumeActiveTherapistTotpCounter"];
  const portalNames = ["now", "validateEmail", "validatePassword", "userByEmail", "consumeRateLimitWindow",
    "checkRateLimit", "checkReauthenticationRateLimit", "currentSession", "requireSession", "requireCsrf",
    "publicUser", "prepareSession", "createSession", "prepareAudit", "audit"];
  const compiled = ts.transpile(selectedFunctions(portalSource, portalNames) + "\n" + selectedFunctions(source, routeNames), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  });
  const functions = new Function(...Object.keys(dependencies), `${compiled}\nreturn { ${routeNames.join(", ")} };`)(...Object.values(dependencies));
  const password = await cryptoFunctions.derivePassword(PASSWORD);
  const passwordRecovery = cryptoFunctions.createRecoveryCode();
  const recovery = await cryptoFunctions.derivePassword(passwordRecovery);
  const oldSecret = cryptoFunctions.createTotpSecret();
  const oldCiphertext = await cryptoFunctions.encrypt(SECRET, oldSecret);
  const set = await recoveryFunctions.createProfessionalMfaRecoverySet(SECRET, USER);
  const instant = new Date().toISOString();
  database.prepare(`INSERT INTO users (id, display_name, email_hash, role, status, password_salt,
    password_hash, password_iterations, recovery_salt, recovery_hash, totp_secret, totp_enabled,
    last_totp_counter, privacy_version, created_at, mfa_recovery_set_id)
    VALUES (?, 'Synthetic', ?, 'therapist', 'active', ?, ?, ?, ?, ?, ?, 1, ?, 'test', ?, ?)`).run(
    USER, await cryptoFunctions.emailHash(SECRET, EMAIL), password.salt, password.hash, password.iterations,
    recovery.salt, recovery.hash, oldCiphertext, Math.floor(Date.now() / 30_000) - 2, instant, set.setId,
  );
  for (const record of set.records) database.prepare(`INSERT INTO professional_mfa_recovery_codes
    (id, user_id, set_id, position, code_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    record.id, USER, set.setId, record.position, record.codeHash, instant,
  );
  const oldToken = cryptoFunctions.randomToken();
  database.prepare(`INSERT INTO sessions VALUES (?, ?, 'csrf-synthetic', ?, ?, ?)`).run(
    await cryptoFunctions.sha256(oldToken), USER, new Date(Date.now() + 3_600_000).toISOString(), instant, instant,
  );
  // Conteúdo clínico sintético independente para flagrar mutações indevidas.
  database.prepare(`INSERT INTO entries (id, patient_id, title, happened, created_at, updated_at)
    VALUES ('entry_synthetic', ?, 'Preservar', 'Conteúdo clínico sintético', ?, ?)`).run(USER, instant, instant);
  const request = (ip = "203.0.113.1") => new Request(REQUEST_URL, { headers: {
    "cf-connecting-ip": ip, cookie: `portal_session=${oldToken}`, "x-csrf-token": "csrf-synthetic",
  } });
  const state = () => Object.fromEntries(["users", "sessions", "professional_mfa_recovery_codes", "access_logs", "entries", "assisted_recovery_grants"]
    .map((table) => [table, database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const start = async () => (await functions.startProfessionalMfaRecovery(request(), {
    email: EMAIL, password: PASSWORD, recovery_code: set.codes[0],
  })).json();
  const confirm = (ticket, ip) => functions.confirmProfessionalMfaRecovery(request(ip), {
    ticket: ticket.ticket, totp: totp(ticket.totp_secret),
  });
  return { database, db, functions, request, state, start, confirm, set, oldSecret, passwordRecovery };
}

test("início não consome código, altera MFA ou emite sessão; erros são genéricos", async (t) => {
  const f = await fixture(t);
  const before = f.state();
  const ticket = await f.start();
  assert.ok(ticket.ticket);
  assert.notEqual(ticket.totp_secret, f.oldSecret);
  assert.deepEqual(f.state(), before);
  await assert.rejects(f.functions.startProfessionalMfaRecovery(f.request(), {
    email: EMAIL, password: PASSWORD, recovery_code: f.passwordRecovery,
  }), { status: 400, message: "Não foi possível recuperar o acesso profissional." });
  await assert.rejects(f.functions.confirmProfessionalMfaRecovery(f.request(), {
    ticket: ticket.ticket, totp: "12345",
  }), { status: 400 });
  assert.deepEqual(f.state(), before);
});

for (const distinctTickets of [false, true]) test(`CAS: duas confirmações ${distinctTickets ? "com tickets distintos" : "do mesmo ticket"} têm somente um vencedor`, async (t) => {
  const f = await fixture(t);
  const first = await f.start();
  const second = distinctTickets ? await f.start() : first;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let arrivals = 0;
  f.db.beforeBatch = async () => { if (++arrivals === 2) release(); await waiting; };
  const results = await Promise.allSettled([f.confirm(first), f.confirm(second)]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.find(({ status }) => status === "rejected").reason.status, 400);
  const after = f.state();
  assert.equal(after.sessions.length, 1);
  assert.equal(after.professional_mfa_recovery_codes.filter((code) => code.used_at).length, 1);
  assert.equal(after.professional_mfa_recovery_codes.filter((code) => !code.used_at && !code.invalidated_at).length, 8);
  assert.equal(after.access_logs.filter((log) => log.action === "recover_professional_mfa").length, 1);
  f.db.beforeBatch = null;
  const stable = f.state();
  await assert.rejects(f.confirm(first), { status: 400 });
  await assert.rejects(f.confirm(second), { status: 400 });
  assert.deepEqual(f.state(), stable);
});

for (const [table, condition] of [
  ["sessions", "1"],
  ["professional_mfa_recovery_codes", "NEW.position = 4"],
  ["access_logs", "NEW.action = 'recover_professional_mfa'"],
]) test(`falha em ${table} desfaz consumo, MFA, revogação, sessão e códigos; permite repetir`, async (t) => {
  const f = await fixture(t);
  const ticket = await f.start();
  const before = f.state();
  f.database.exec(`CREATE TRIGGER synthetic_failure BEFORE INSERT ON ${table} WHEN ${condition}
    BEGIN SELECT RAISE(ABORT, 'synthetic rollback'); END`);
  await assert.rejects(f.confirm(ticket), /synthetic rollback/u);
  assert.deepEqual(f.state(), before);
  f.database.exec("DROP TRIGGER synthetic_failure");
  const response = await f.confirm(ticket);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /^portal_session=/u);
  const payload = await response.json();
  assert.equal(payload.recovery_codes.length, 8);
  const stored = JSON.stringify(f.state());
  for (const secret of [ticket.ticket, ticket.totp_secret, ...payload.recovery_codes, ...f.set.codes]) {
    assert.equal(stored.includes(secret), false);
  }
  assert.deepEqual(f.state().entries, before.entries);
});

for (const mutation of ["password_hash = 'changed'", "totp_secret = 'changed'", "mfa_recovery_set_id = 'changed'", "status = 'disabled'"])
  test(`CAS bloqueia mudança concorrente de ${mutation.split(" =")[0]}`, async (t) => {
    const f = await fixture(t);
    const ticket = await f.start();
    let expected;
    f.db.beforeBatch = () => {
      f.database.exec(`UPDATE users SET ${mutation} WHERE id = '${USER}'`);
      expected = f.state();
    };
    await assert.rejects(f.confirm(ticket), { status: 400 });
    assert.deepEqual(f.state(), expected);
  });

for (const mutation of ["UPDATE users SET password_hash = 'changed'", "DELETE FROM sessions"])
  test(`geração rejeita credenciais revogadas durante reautenticação: ${mutation}`, async (t) => {
    const f = await fixture(t);
    let expected;
    f.db.beforeBatch = () => { f.database.exec(mutation); expected = f.state(); };
    await assert.rejects(f.functions.generateProfessionalMfaRecoveryCodes(f.request(), {
      current_password: PASSWORD, totp: totp(f.oldSecret),
    }), { status: 400 });
    assert.deepEqual(f.state(), expected);
  });

test("login antigo em andamento não cria sessão depois de recuperar o MFA", async (t) => {
  const f = await fixture(t);
  const ticket = await f.start();
  let releaseLogin;
  let loginArrived;
  const holdLogin = new Promise((resolve) => { releaseLogin = resolve; });
  const arrived = new Promise((resolve) => { loginArrived = resolve; });
  f.db.beforeBatch = async (statements) => {
    if (statements[0].sql.includes("INSERT INTO sessions")) { loginArrived(); await holdLogin; }
  };
  const pendingLogin = f.functions.login(f.request(), { email: EMAIL, password: PASSWORD, totp: totp(f.oldSecret) });
  await arrived;
  await f.confirm(ticket);
  const recovered = f.state();
  releaseLogin();
  await assert.rejects(pendingLogin, { status: 401 });
  assert.deepEqual(f.state(), recovered);
});

test("falha da auditoria do login desfaz sessão e consumo TOTP", async (t) => {
  const f = await fixture(t);
  const before = f.state();
  f.database.exec(`CREATE TRIGGER login_failure BEFORE INSERT ON access_logs WHEN NEW.action = 'login'
    BEGIN SELECT RAISE(ABORT, 'synthetic login rollback'); END`);
  await assert.rejects(f.functions.login(f.request(), {
    email: EMAIL, password: PASSWORD, totp: totp(f.oldSecret),
  }), /synthetic login rollback/u);
  assert.deepEqual(f.state(), before);
});

test("reautenticação profissional consome contador somente com credenciais capturadas ainda ativas", async (t) => {
  const f = await fixture(t);
  const user = f.state().users[0];
  const counter = user.last_totp_counter + 1;
  assert.equal(await f.functions.consumeActiveTherapistTotpCounter(user, counter), true);
  const after = f.state();
  assert.equal(after.users[0].last_totp_counter, counter);
  assert.equal(await f.functions.consumeActiveTherapistTotpCounter(user, counter), false);
  assert.deepEqual(f.state(), after);
});

for (const mutation of ["totp_secret = 'replacement-ciphertext'", "password_hash = 'replacement-password-hash'"])
  test(`reautenticação antiga rejeita ${mutation.split(" =")[0]} novo mesmo com contador igual`, async (t) => {
    const f = await fixture(t);
    const capturedUser = f.state().users[0];
    f.database.exec(`UPDATE users SET ${mutation} WHERE id = '${USER}'`);
    const after = f.state();
    assert.equal(after.users[0].last_totp_counter, capturedUser.last_totp_counter);
    assert.equal(await f.functions.consumeActiveTherapistTotpCounter(capturedUser, capturedUser.last_totp_counter + 1), false);
    assert.deepEqual(f.state(), after);
  });

test("recuperação real com contador coincidente invalida reautenticação em andamento", async (t) => {
  const f = await fixture(t);
  const ticket = await f.start();
  let capturedUser;
  f.db.beforeBatch = (statements) => {
    // Simula uma ação que já verificou o autenticador anterior no mesmo
    // intervalo em que o novo autenticador será confirmado.
    const replacementCounter = statements[1].values[1];
    f.database.prepare("UPDATE users SET last_totp_counter = ? WHERE id = ?").run(replacementCounter, USER);
    capturedUser = f.state().users[0];
  };
  await f.confirm(ticket);
  f.db.beforeBatch = null;
  const after = f.state();
  assert.equal(after.users[0].last_totp_counter, capturedUser.last_totp_counter);
  assert.notEqual(after.users[0].totp_secret, capturedUser.totp_secret);
  assert.equal(await f.functions.consumeActiveTherapistTotpCounter(capturedUser, capturedUser.last_totp_counter + 1), false);
  assert.deepEqual(f.state(), after);
});

test("dois logins profissionais concorrentes não reutilizam o mesmo TOTP", async (t) => {
  const f = await fixture(t);
  const before = f.state();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let arrivals = 0;
  f.db.beforeBatch = async () => { if (++arrivals === 2) release(); await waiting; };
  const input = { email: EMAIL, password: PASSWORD, totp: totp(f.oldSecret) };
  const results = await Promise.allSettled([
    f.functions.login(f.request(), input),
    f.functions.login(f.request(), input),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.find(({ status }) => status === "rejected").reason.status, 401);
  const after = f.state();
  assert.equal(after.sessions.length, before.sessions.length + 1);
  assert.equal(after.access_logs.filter((log) => log.action === "login").length, 1);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.professional_mfa_recovery_codes, before.professional_mfa_recovery_codes);
  f.db.beforeBatch = null;
  await assert.rejects(f.functions.login(f.request(), input), { status: 401 });
  assert.deepEqual(f.state(), after);
});

test("recuperação que termina após login antigo revoga também a sessão recém-criada", async (t) => {
  const f = await fixture(t);
  const ticket = await f.start();
  let releaseRecovery;
  let recoveryArrived;
  const held = new Promise((resolve) => { releaseRecovery = resolve; });
  const arrived = new Promise((resolve) => { recoveryArrived = resolve; });
  f.db.beforeBatch = async (statements) => {
    if (statements[0].sql.includes("UPDATE professional_mfa_recovery_codes")) {
      recoveryArrived();
      await held;
    }
  };
  const pendingRecovery = f.confirm(ticket);
  await arrived;
  const loginResponse = await f.functions.login(f.request(), {
    email: EMAIL, password: PASSWORD, totp: totp(f.oldSecret),
  });
  const loginToken = loginResponse.headers.get("set-cookie").match(/^portal_session=([^;]+)/u)[1];
  const loginHash = await cryptoFunctions.sha256(loginToken);
  assert.ok(f.state().sessions.some((session) => session.token_hash === loginHash));
  releaseRecovery();
  const recoveryResponse = await pendingRecovery;
  assert.equal(recoveryResponse.status, 200);
  const after = f.state();
  assert.equal(after.sessions.length, 1);
  assert.equal(after.sessions.some((session) => session.token_hash === loginHash), false);
  assert.equal(await cryptoFunctions.decrypt(SECRET, after.users[0].totp_secret), ticket.totp_secret);
  assert.equal(after.access_logs.filter((log) => log.action === "login").length, 1);
  assert.equal(after.access_logs.filter((log) => log.action === "recover_professional_mfa").length, 1);
});

test("login de paciente continua sem exigir nem alterar MFA", async (t) => {
  const f = await fixture(t);
  f.database.exec("UPDATE users SET role = 'patient', totp_secret = NULL, totp_enabled = 0, last_totp_counter = NULL");
  const before = f.state();
  const response = await f.functions.login(f.request(), { email: EMAIL, password: PASSWORD });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /^portal_session=/u);
  const payload = await response.json();
  assert.deepEqual(payload.user, { id: USER, name: "Synthetic", role: "patient" });
  assert.ok(payload.csrf);
  const after = f.state();
  assert.equal(after.sessions.length, before.sessions.length + 1);
  assert.equal(after.users[0].totp_secret, null);
  assert.equal(after.users[0].totp_enabled, 0);
  assert.equal(after.users[0].last_totp_counter, null);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.professional_mfa_recovery_codes, before.professional_mfa_recovery_codes);
});

test("geração substitui os oito códigos, consome o TOTP e mantém sessões e dados clínicos", async (t) => {
  const f = await fixture(t);
  const before = f.state();
  const input = { current_password: PASSWORD, totp: totp(f.oldSecret) };
  const response = await f.functions.generateProfessionalMfaRecoveryCodes(f.request(), input);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recovery_codes.length, 8);
  const after = f.state();
  assert.notEqual(after.users[0].mfa_recovery_set_id, before.users[0].mfa_recovery_set_id);
  assert.equal(after.users[0].totp_secret, before.users[0].totp_secret);
  assert.equal(after.professional_mfa_recovery_codes.filter((code) => code.invalidated_at).length, 8);
  assert.equal(after.professional_mfa_recovery_codes.filter((code) => !code.used_at && !code.invalidated_at).length, 8);
  assert.equal(after.access_logs.filter((log) => log.action === "generate_professional_mfa_recovery_codes").length, 1);
  assert.deepEqual(after.sessions, before.sessions);
  assert.deepEqual(after.entries, before.entries);
  for (const code of payload.recovery_codes) assert.equal(JSON.stringify(after).includes(code), false);
  await assert.rejects(f.functions.generateProfessionalMfaRecoveryCodes(f.request(), input), { status: 400 });
  assert.deepEqual(f.state(), after);
  await assert.rejects(f.start(), { status: 400 });
  const recovery = await f.functions.startProfessionalMfaRecovery(f.request(), {
    email: EMAIL, password: PASSWORD, recovery_code: payload.recovery_codes[0],
  });
  assert.equal(recovery.status, 200);
});

for (const [table, condition] of [
  ["professional_mfa_recovery_codes", "NEW.position = 4"],
  ["access_logs", "NEW.action = 'generate_professional_mfa_recovery_codes'"],
]) test(`falha em ${table} durante geração reverte conjunto e TOTP e permite repetir`, async (t) => {
  const f = await fixture(t);
  const before = f.state();
  const input = { current_password: PASSWORD, totp: totp(f.oldSecret) };
  f.database.exec(`CREATE TRIGGER generation_failure BEFORE INSERT ON ${table} WHEN ${condition}
    BEGIN SELECT RAISE(ABORT, 'synthetic generation rollback'); END`);
  await assert.rejects(f.functions.generateProfessionalMfaRecoveryCodes(f.request(), input), /synthetic generation rollback/u);
  assert.deepEqual(f.state(), before);
  f.database.exec("DROP TRIGGER generation_failure");
  assert.equal((await f.functions.generateProfessionalMfaRecoveryCodes(f.request(), input)).status, 200);
});

test("geração pendente não ressuscita códigos ou sessão após recuperação do MFA", async (t) => {
  const f = await fixture(t);
  const ticket = await f.start();
  let releaseGeneration;
  let generationArrived;
  const held = new Promise((resolve) => { releaseGeneration = resolve; });
  const arrived = new Promise((resolve) => { generationArrived = resolve; });
  f.db.beforeBatch = async (statements) => {
    if (statements[0].sql.includes("SET last_totp_counter = ?, mfa_recovery_set_id = ?")) {
      generationArrived();
      await held;
    }
  };
  const pendingGeneration = f.functions.generateProfessionalMfaRecoveryCodes(f.request(), {
    current_password: PASSWORD, totp: totp(f.oldSecret),
  });
  await arrived;
  await f.confirm(ticket);
  const after = f.state();
  releaseGeneration();
  await assert.rejects(pendingGeneration, { status: 400 });
  assert.deepEqual(f.state(), after);
});

test("limite global do ticket não reinicia mudando de IP", async (t) => {
  const f = await fixture(t);
  const ticket = await f.start();
  const before = f.state();
  for (let attempt = 0; attempt < 8; attempt++) {
    await assert.rejects(f.functions.confirmProfessionalMfaRecovery(f.request(`203.0.113.${attempt + 1}`), {
      ticket: ticket.ticket, totp: "12345",
    }), { status: 400 });
  }
  await assert.rejects(f.confirm(ticket, "203.0.113.100"), { status: 429 });
  assert.deepEqual(f.state(), before);
});

test("limite global de início não reinicia mudando de IP", async (t) => {
  const f = await fixture(t);
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(f.functions.startProfessionalMfaRecovery(f.request(`203.0.113.${attempt + 1}`), {
      email: EMAIL, password: "wrong", recovery_code: "wrong",
    }), { status: 400 });
  }
  await assert.rejects(f.functions.startProfessionalMfaRecovery(f.request("203.0.113.100"), {
    email: EMAIL, password: PASSWORD, recovery_code: f.set.codes[0],
  }), { status: 429 });
});

test("recuperação da senha não retira MFA e rollback da auditoria preserva código e sessões", async (t) => {
  const f = await fixture(t);
  const before = f.state();
  f.database.exec(`CREATE TRIGGER password_failure BEFORE INSERT ON access_logs WHEN NEW.action = 'recover_account'
    BEGIN SELECT RAISE(ABORT, 'synthetic password rollback'); END`);
  const input = { email: EMAIL, recovery_code: f.passwordRecovery, new_password: "ReplacementPassword123" };
  await assert.rejects(f.functions.recoverAccount(f.request(), input), /synthetic password rollback/u);
  assert.deepEqual(f.state(), before);
  f.database.exec("DROP TRIGGER password_failure");
  await f.functions.recoverAccount(f.request(), input);
  const after = f.state();
  assert.equal(after.users[0].totp_secret, before.users[0].totp_secret);
  assert.equal(after.users[0].totp_enabled, 1);
  assert.equal(after.sessions.length, 0);
  assert.deepEqual(after.professional_mfa_recovery_codes, before.professional_mfa_recovery_codes);
  assert.deepEqual(after.entries, before.entries);
  await assert.rejects(f.functions.recoverAccount(f.request(), input), { status: 400 });
});

test("duas recuperações de senha concorrentes consomem o código somente uma vez", async (t) => {
  const f = await fixture(t);
  const before = f.state();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let arrivals = 0;
  f.db.beforeBatch = async () => { if (++arrivals === 2) release(); await waiting; };
  const input = { email: EMAIL, recovery_code: f.passwordRecovery, new_password: "ReplacementPassword123" };
  const results = await Promise.allSettled([
    f.functions.recoverAccount(f.request(), input),
    f.functions.recoverAccount(f.request(), input),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.find(({ status }) => status === "rejected").reason.status, 400);
  const payload = await results.find(({ status }) => status === "fulfilled").value.json();
  const after = f.state();
  const user = after.users[0];
  assert.equal(await cryptoFunctions.passwordMatches(input.new_password, user.password_salt, user.password_hash, user.password_iterations), true);
  assert.equal(await cryptoFunctions.passwordMatches(payload.recovery_code, user.recovery_salt, user.recovery_hash, user.password_iterations), true);
  assert.equal(after.sessions.length, 0);
  assert.equal(after.access_logs.filter((log) => log.action === "recover_account").length, 1);
  assert.equal(user.totp_secret, before.users[0].totp_secret);
  assert.equal(user.totp_enabled, 1);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.professional_mfa_recovery_codes, before.professional_mfa_recovery_codes);
});
