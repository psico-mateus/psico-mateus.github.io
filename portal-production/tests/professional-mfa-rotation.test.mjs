import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertSuccessfulRotationEvidence,
  decryptExistingProfessionalTotp,
  executeAtomicProfessionalMfaRotation,
  inspectProfessionalTarget,
  prepareValidatedTotpReplacement,
  readRotationEvidence,
  readSessionSummary,
} from "../scripts/professional-mfa-rotation-core.mjs";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CORE_PATH = join(TEST_DIRECTORY, "../scripts/professional-mfa-rotation-core.mjs");

const PROFESSIONAL_ID = "therapist-synthetic-1";
const PATIENT_ID = "patient-synthetic-1";
const OLD_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const NEW_TOTP_SECRET = "KRSXG5DSNFXGOIDB";
const OLD_CIPHERTEXT = `${"A".repeat(16)}.${"B".repeat(64)}`;
const NEW_CIPHERTEXT = `${"C".repeat(16)}.${"D".repeat(64)}`;
const OTHER_CIPHERTEXT = `${"E".repeat(16)}.${"F".repeat(64)}`;
const AUDIT_ID = "log_synthetic_mfa_rotation";
const CREATED_AT = "2026-08-24T12:34:56.000Z";
const APP_SECRET_SENTINEL = ["app", "secret", "must", "not", "leak"].join("-");
const CONFIRMATION_CODE_SENTINEL = ["19", "72", "46"].join("");

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    last_totp_counter INTEGER,
    last_login_at TEXT
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE access_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    shared_at TEXT
  );

  CREATE TABLE patient_links (
    id TEXT PRIMARY KEY,
    therapist_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL
  );

  CREATE TABLE invitations (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    therapist_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_at TEXT
  );

  CREATE TABLE patient_map_draft_fields (
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (patient_id, field_id)
  );

  CREATE TABLE patient_map_shares (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    therapist_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_at TEXT NOT NULL
  );
`;

const SNAPSHOT_TABLES = [
  "access_logs",
  "entries",
  "invitations",
  "patient_links",
  "patient_map_draft_fields",
  "patient_map_shares",
  "sessions",
  "users",
];

const CLINICAL_TABLES = [
  "entries",
  "invitations",
  "patient_links",
  "patient_map_draft_fields",
  "patient_map_shares",
];

class SyntheticD1Statement {
  constructor(database, sql, parameters = []) {
    this.database = database;
    this.sql = sql;
    this.parameters = parameters;
  }

  bind(...parameters) {
    return new SyntheticD1Statement(this.database, this.sql, parameters);
  }

  async all() {
    return this.database.executeAll(this);
  }
}

class SyntheticD1Database {
  constructor(sqlite, { failAfterStatementIndex = null } = {}) {
    this.sqlite = sqlite;
    this.failAfterStatementIndex = failAfterStatementIndex;
    this.batchCalls = 0;
    this.batchStatementTags = [];
  }

  prepare(sql) {
    return new SyntheticD1Statement(this, sql);
  }

  executeAll(statement) {
    const rows = this.sqlite.prepare(statement.sql).all(...statement.parameters);
    return { success: true, results: rows, meta: { changes: 0 } };
  }

  executeInBatch(statement) {
    const tag = statement.sql.match(/professional-mfa-rotation:([a-z-]+)/u)?.[1] ?? "unknown";
    this.batchStatementTags.push(tag);

    if (/\bRETURNING\s+id\b/iu.test(statement.sql)) {
      return this.executeAll(statement);
    }

    const result = this.sqlite.prepare(statement.sql).run(...statement.parameters);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    };
  }

  async batch(statements) {
    this.batchCalls += 1;
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        results.push(this.executeInBatch(statement));
        if (this.failAfterStatementIndex === index) {
          throw new Error("synthetic batch failure");
        }
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function insertUser(sqlite, { id, role, ciphertext = null }) {
  sqlite
    .prepare(
      `INSERT INTO users (
        id, display_name, email_hash, role, status, totp_secret,
        totp_enabled, last_totp_counter, last_login_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      id,
      `Name ${id}`,
      `hash-${id}`,
      role,
      ciphertext,
      role === "therapist" ? 1 : 0,
      role === "therapist" ? 87 : null,
      "2026-08-20T10:00:00.000Z",
    );
}

function createHarness({ professionalCount = 1, failAfterStatementIndex = null } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA_SQL);
  insertUser(sqlite, { id: PATIENT_ID, role: "patient" });

  for (let index = 0; index < professionalCount; index += 1) {
    insertUser(sqlite, {
      id: index === 0 ? PROFESSIONAL_ID : `therapist-synthetic-${index + 1}`,
      role: "therapist",
      ciphertext: index === 0 ? OLD_CIPHERTEXT : OTHER_CIPHERTEXT,
    });
  }

  sqlite
    .prepare(
      `INSERT INTO sessions
       (token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "patient-session",
      PATIENT_ID,
      "patient-csrf",
      "2026-09-01T00:00:00.000Z",
      "2026-08-24T00:00:00.000Z",
      "2026-08-24T01:00:00.000Z",
    );

  if (professionalCount > 0) {
    for (const suffix of ["a", "b"]) {
      sqlite
        .prepare(
          `INSERT INTO sessions
           (token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `professional-session-${suffix}`,
          PROFESSIONAL_ID,
          `professional-csrf-${suffix}`,
          "2026-09-01T00:00:00.000Z",
          "2026-08-24T00:00:00.000Z",
          "2026-08-24T01:00:00.000Z",
        );
    }

    sqlite
      .prepare(
        `INSERT INTO access_logs
         (id, user_id, action, resource_type, resource_id, created_at)
         VALUES ('existing-log', ?, 'login', 'session', 'existing-session', ?)`,
      )
      .run(PROFESSIONAL_ID, "2026-08-23T00:00:00.000Z");
    sqlite
      .prepare("INSERT INTO entries VALUES ('entry-1', ?, 'Synthetic entry', 'Private body', NULL)")
      .run(PATIENT_ID);
    sqlite
      .prepare("INSERT INTO patient_links VALUES ('link-1', ?, ?, 'active')")
      .run(PROFESSIONAL_ID, PATIENT_ID);
    sqlite
      .prepare("INSERT INTO invitations VALUES ('invite-1', 'opaque-code-hash', ?, ?, ?)")
      .run(PROFESSIONAL_ID, PATIENT_ID, "2026-08-22T00:00:00.000Z");
    sqlite
      .prepare("INSERT INTO patient_map_draft_fields VALUES (?, 'values', 'Synthetic value')")
      .run(PATIENT_ID);
    sqlite
      .prepare("INSERT INTO patient_map_shares VALUES ('map-share-1', ?, ?, ?)")
      .run(PATIENT_ID, PROFESSIONAL_ID, "2026-08-23T00:00:00.000Z");
  }

  return {
    sqlite,
    database: new SyntheticD1Database(sqlite, { failAfterStatementIndex }),
  };
}

function rows(sqlite, sql, ...parameters) {
  return JSON.parse(JSON.stringify(sqlite.prepare(sql).all(...parameters)));
}

function snapshotTables(sqlite, tableNames = SNAPSHOT_TABLES) {
  return Object.fromEntries(
    tableNames.map((tableName) => [
      tableName,
      rows(sqlite, `SELECT * FROM ${tableName} ORDER BY rowid`),
    ]),
  );
}

function syntheticCryptoAdapter() {
  return {
    async decrypt(appSecret, ciphertext) {
      if (appSecret !== APP_SECRET_SENTINEL || ciphertext !== OLD_CIPHERTEXT) {
        throw new Error("decryption failed");
      }
      return OLD_TOTP_SECRET;
    },
    async encrypt(appSecret, secret) {
      assert.equal(appSecret, APP_SECRET_SENTINEL);
      assert.equal(secret, NEW_TOTP_SECRET);
      return NEW_CIPHERTEXT;
    },
    async verifyTotp(secret, code) {
      return {
        valid: secret === NEW_TOTP_SECRET && code === CONFIRMATION_CODE_SENTINEL,
        counter: 42,
      };
    },
  };
}

function rotationParameters(overrides = {}) {
  return {
    professionalId: PROFESSIONAL_ID,
    expectedTotpCiphertext: OLD_CIPHERTEXT,
    replacementTotpCiphertext: NEW_CIPHERTEXT,
    auditId: AUDIT_ID,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

async function expectRotationError(action, expectedCode) {
  await assert.rejects(action, (error) => {
    assert.equal(error?.name, "ProfessionalMfaRotationError");
    assert.equal(error?.code, expectedCode);
    assert.doesNotMatch(
      error.message,
      new RegExp(`${APP_SECRET_SENTINEL}|${CONFIRMATION_CODE_SENTINEL}`, "u"),
    );
    return true;
  });
}

test("segredo da aplicação incorreto aborta antes de qualquer lote", async () => {
  const { database } = createHarness();
  const target = await inspectProfessionalTarget(database);

  await expectRotationError(
    () =>
      decryptExistingProfessionalTotp(syntheticCryptoAdapter(), {
        appSecret: "wrong-secret",
        totpSecretCiphertext: target.totpSecretCiphertext,
      }),
    "invalid-app-secret",
  );
  assert.equal(database.batchCalls, 0);
});

test("código TOTP incorreto aborta antes de qualquer lote", async () => {
  const { database } = createHarness();

  await expectRotationError(
    () =>
      prepareValidatedTotpReplacement(syntheticCryptoAdapter(), {
        appSecret: APP_SECRET_SENTINEL,
        oldTotpSecret: OLD_TOTP_SECRET,
        newTotpSecret: NEW_TOTP_SECRET,
        confirmationCode: "000000",
        timestamp: Date.parse(CREATED_AT),
      }),
    "invalid-confirmation-code",
  );
  assert.equal(database.batchCalls, 0);
});

for (const professionalCount of [0, 2]) {
  test(`${professionalCount} profissionais abortam antes de qualquer lote`, async () => {
    const { database } = createHarness({ professionalCount });
    await expectRotationError(() => inspectProfessionalTarget(database), "professional-count");
    assert.equal(database.batchCalls, 0);
  });
}

test("caminho válido altera apenas o MFA alvo, suas sessões e a auditoria técnica", async () => {
  const { sqlite, database } = createHarness();
  const usersBefore = snapshotTables(sqlite, ["users"]).users;
  const clinicalBefore = snapshotTables(sqlite, CLINICAL_TABLES);
  const patientSessionsBefore = rows(
    sqlite,
    "SELECT * FROM sessions WHERE user_id = ? ORDER BY token_hash",
    PATIENT_ID,
  );

  const target = await inspectProfessionalTarget(database);
  const sessionsBefore = await readSessionSummary(database, target.id);
  const oldTotpSecret = await decryptExistingProfessionalTotp(syntheticCryptoAdapter(), {
    appSecret: APP_SECRET_SENTINEL,
    totpSecretCiphertext: target.totpSecretCiphertext,
  });
  const replacement = await prepareValidatedTotpReplacement(syntheticCryptoAdapter(), {
    appSecret: APP_SECRET_SENTINEL,
    oldTotpSecret,
    newTotpSecret: NEW_TOTP_SECRET,
    confirmationCode: CONFIRMATION_CODE_SENTINEL,
    timestamp: Date.parse(CREATED_AT),
  });

  const result = await executeAtomicProfessionalMfaRotation(
    database,
    rotationParameters({ replacementTotpCiphertext: replacement.replacementTotpCiphertext }),
  );
  assert.deepEqual(result, { statements: 3, updatedProfessionalId: PROFESSIONAL_ID });
  assert.equal(database.batchCalls, 1);
  assert.deepEqual(database.batchStatementTags, [
    "update-professional",
    "guard-audit",
    "delete-professional-sessions",
  ]);

  const evidence = await readRotationEvidence(database, {
    professionalId: PROFESSIONAL_ID,
    auditId: AUDIT_ID,
  });
  assert.deepEqual(
    assertSuccessfulRotationEvidence(evidence, {
      professionalId: PROFESSIONAL_ID,
      replacementTotpCiphertext: NEW_CIPHERTEXT,
      otherSessionsBefore: sessionsBefore.otherSessions,
      auditId: AUDIT_ID,
      createdAt: CREATED_AT,
    }),
    { professionalId: PROFESSIONAL_ID, auditId: AUDIT_ID },
  );

  const usersAfter = snapshotTables(sqlite, ["users"]).users;
  const expectedUsers = structuredClone(usersBefore);
  const expectedProfessional = expectedUsers.find((user) => user.id === PROFESSIONAL_ID);
  expectedProfessional.totp_secret = NEW_CIPHERTEXT;
  expectedProfessional.totp_enabled = 1;
  expectedProfessional.last_totp_counter = null;
  assert.deepEqual(usersAfter, expectedUsers);
  assert.deepEqual(snapshotTables(sqlite, CLINICAL_TABLES), clinicalBefore);
  assert.deepEqual(
    rows(sqlite, "SELECT * FROM sessions WHERE user_id = ? ORDER BY token_hash", PATIENT_ID),
    patientSessionsBefore,
  );
  assert.equal(
    rows(sqlite, "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?", PROFESSIONAL_ID)[0]
      .total,
    0,
  );

  const serializedAudit = JSON.stringify(evidence.audits);
  assert.doesNotMatch(
    serializedAudit,
    new RegExp(
      `${APP_SECRET_SENTINEL}|${CONFIRMATION_CODE_SENTINEL}|${OLD_TOTP_SECRET}|${NEW_TOTP_SECRET}`,
      "u",
    ),
  );
});

test("falha deliberada dentro do lote desfaz update, auditoria e sessões", async () => {
  const { sqlite, database } = createHarness({ failAfterStatementIndex: 1 });
  const before = snapshotTables(sqlite);

  await expectRotationError(
    () => executeAtomicProfessionalMfaRotation(database, rotationParameters()),
    "atomic-write-failed",
  );

  assert.equal(database.batchCalls, 1);
  assert.deepEqual(snapshotTables(sqlite), before);
});

test("ciphertext esperado obsoleto faz a guarda SQL falhar e reverte o lote", async () => {
  const { sqlite, database } = createHarness();
  sqlite
    .prepare("UPDATE users SET totp_secret = ? WHERE id = ?")
    .run(OTHER_CIPHERTEXT, PROFESSIONAL_ID);
  const before = snapshotTables(sqlite);

  await expectRotationError(
    () => executeAtomicProfessionalMfaRotation(database, rotationParameters()),
    "atomic-write-failed",
  );

  assert.equal(database.batchCalls, 1);
  assert.deepEqual(snapshotTables(sqlite), before);
});

test("segundo profissional criado após a inspeção faz o lote inteiro reverter", async () => {
  const { sqlite, database } = createHarness();
  const inspected = await inspectProfessionalTarget(database);
  insertUser(sqlite, {
    id: "therapist-synthetic-race",
    role: "therapist",
    ciphertext: OTHER_CIPHERTEXT,
  });
  const before = snapshotTables(sqlite);

  await expectRotationError(
    () =>
      executeAtomicProfessionalMfaRotation(
        database,
        rotationParameters({ expectedTotpCiphertext: inspected.totpSecretCiphertext }),
      ),
    "atomic-write-failed",
  );

  assert.equal(database.batchCalls, 1);
  assert.deepEqual(snapshotTables(sqlite), before);
});

test("resumo de sessões falha fechado diante de resposta inválida", async () => {
  for (const invalidCount of ["not-a-count", null]) {
    const invalidDatabase = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async all() {
            return { results: [{ professional_sessions: invalidCount, other_sessions: 1 }] };
          },
        };
      },
    };

    await expectRotationError(
      () => readSessionSummary(invalidDatabase, PROFESSIONAL_ID),
      "invalid-session-summary",
    );
  }
});

test("confirmação TOTP válida com contador inválido falha fechado", async () => {
  const adapter = syntheticCryptoAdapter();
  adapter.verifyTotp = async (secret, code) => ({
    valid: secret === NEW_TOTP_SECRET && code === CONFIRMATION_CODE_SENTINEL,
    counter: null,
  });

  await expectRotationError(
    () =>
      prepareValidatedTotpReplacement(adapter, {
        appSecret: APP_SECRET_SENTINEL,
        oldTotpSecret: OLD_TOTP_SECRET,
        newTotpSecret: NEW_TOTP_SECRET,
        confirmationCode: CONFIRMATION_CODE_SENTINEL,
      }),
    "invalid-confirmation-result",
  );
});

test("núcleo não expõe sentinelas em saída/argv nem usa APIs de arquivo", async () => {
  const output = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => {
    output.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    output.push(String(chunk));
    return true;
  };

  try {
    await expectRotationError(
      () =>
        prepareValidatedTotpReplacement(syntheticCryptoAdapter(), {
          appSecret: APP_SECRET_SENTINEL,
          oldTotpSecret: OLD_TOTP_SECRET,
          newTotpSecret: NEW_TOTP_SECRET,
          confirmationCode: "000000",
        }),
      "invalid-confirmation-code",
    );
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  const coreSource = await readFile(CORE_PATH, "utf8");
  for (const sentinel of [APP_SECRET_SENTINEL, CONFIRMATION_CODE_SENTINEL]) {
    assert.doesNotMatch(output.join(""), new RegExp(sentinel, "u"));
    assert.doesNotMatch(process.argv.join("\u0000"), new RegExp(sentinel, "u"));
    assert.doesNotMatch(coreSource, new RegExp(sentinel, "u"));
  }
  assert.doesNotMatch(coreSource, /console\.|process\.(?:argv|env)|node:fs/iu);

});
