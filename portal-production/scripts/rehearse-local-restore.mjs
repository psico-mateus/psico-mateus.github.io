import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationNames = [
  "0000_tranquil_glorian.sql",
  "0001_assisted_recovery.sql",
  "0002_entry_views.sql",
  "0003_patient_map_drafts.sql",
  "0004_patient_map_sharing.sql",
  "0005_patient_map_reset_cleanup.sql",
  "0006_entry_thought_reviews.sql",
];
const tableNames = [
  "users",
  "patient_links",
  "invitations",
  "entries",
  "entry_thought_reviews",
  "entry_views",
  "patient_map_draft_fields",
  "patient_map_shares",
  "sessions",
  "assisted_recovery_grants",
  "access_logs",
  "auth_windows",
  "system_config",
];
const expectedCounts = {
  users: 2,
  patient_links: 1,
  invitations: 1,
  entries: 1,
  entry_thought_reviews: 1,
  entry_views: 1,
  patient_map_draft_fields: 2,
  patient_map_shares: 1,
  sessions: 1,
  assisted_recovery_grants: 1,
  access_logs: 1,
  auth_windows: 1,
  system_config: 1,
};

async function applyMigration(database, migrationName) {
  const migration = await readFile(
    new URL(`../drizzle/${migrationName}`, import.meta.url),
    "utf8",
  );
  database.exec(migration);
}

async function applyMigrations(database, names = migrationNames) {
  for (const migrationName of names) {
    await applyMigration(database, migrationName);
  }
}

function insertSyntheticState(database) {
  database.exec(`
    INSERT INTO users (
      id, display_name, email_hash, role, status, password_salt,
      password_hash, password_iterations, recovery_salt, recovery_hash,
      totp_secret, totp_enabled, last_totp_counter, privacy_version,
      adult_confirmed_at, created_at, last_login_at
    ) VALUES
      (
        'therapist_synthetic', 'Profissional Sintético',
        'therapist-email-hash-synthetic', 'therapist', 'active',
        'salt-therapist-synthetic', 'password-hash-therapist-synthetic',
        210000, 'recovery-salt-therapist-synthetic',
        'recovery-hash-therapist-synthetic', 'totp-protected-synthetic',
        1, NULL, '2026-07-29', NULL,
        '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'
      ),
      (
        'patient_synthetic', 'Paciente Sintético',
        'patient-email-hash-synthetic', 'patient', 'active',
        'salt-patient-synthetic', 'password-hash-patient-synthetic',
        210000, 'recovery-salt-patient-synthetic',
        'recovery-hash-patient-synthetic', NULL, 0, NULL, '2026-07-29',
        '2026-01-01T10:00:00.000Z',
        '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'
      );

    INSERT INTO patient_links (
      id, therapist_id, patient_id, status, created_at, closed_at
    ) VALUES (
      'link_synthetic', 'therapist_synthetic', 'patient_synthetic',
      'active', '2026-01-01T10:00:00.000Z', NULL
    );

    INSERT INTO invitations (
      id, code_hash, therapist_id, expires_at, created_at,
      used_at, patient_id, revoked_at
    ) VALUES (
      'invitation_synthetic', 'invitation-hash-synthetic',
      'therapist_synthetic', '2026-01-08T10:00:00.000Z',
      '2026-01-01T10:00:00.000Z', '2026-01-01T11:00:00.000Z',
      'patient_synthetic', NULL
    );

    INSERT INTO entries (
      id, patient_id, title, happened, body, thoughts, urge, emotion,
      intensity, message, created_at, updated_at, shared_at, revoked_at
    ) VALUES (
      'entry_synthetic', 'patient_synthetic', 'Situação sintética',
      'Conteúdo neutro criado exclusivamente para o ensaio local.',
      '', '', '', 'Calma', 3, '',
      '2026-01-02T10:00:00.000Z', '2026-01-02T10:00:00.000Z',
      '2026-01-02T11:00:00.000Z', NULL
    );

    INSERT INTO entry_views (entry_id, therapist_id, viewed_at)
    VALUES (
      'entry_synthetic', 'therapist_synthetic',
      '2026-01-02T12:00:00.000Z'
    );

    INSERT INTO patient_map_draft_fields (
      patient_id, content_version, field_type, field_id, generation,
      value, revision, request_id, updated_at
    ) VALUES
      (
        'patient_synthetic', 'mapa-pessoal-refinado-ouro-v1',
        'state', '__state__', 2, NULL, 1,
        'map-clear-before-fix-0001',
        '2026-01-02T12:30:00.000Z'
      ),
      (
        'patient_synthetic', 'mapa-pessoal-refinado-ouro-v1',
        'answer', 'meu-jeito.01.1', 2,
        '{"response":"curious","note":"Conteúdo sintético."}',
        1, 'map-answer-synthetic-0001',
        '2026-01-02T12:31:00.000Z'
      ),
      (
        'patient_synthetic', 'mapa-pessoal-refinado-ouro-v1',
        'synthesis', 'already-fits', 1,
        '"Conteúdo sintético retido por uma limpeza anterior."',
        1, 'map-stale-before-fix-0001',
        '2026-01-02T12:29:00.000Z'
      );

    INSERT INTO patient_map_shares (
      patient_id, therapist_id, map_id, content_version, snapshot,
      shared_at, viewed_at
    ) VALUES (
      'patient_synthetic', 'therapist_synthetic', 'meu-jeito',
      'mapa-pessoal-refinado-ouro-v1',
      '{"content_version":"mapa-pessoal-refinado-ouro-v1","map_id":"meu-jeito","map_title":"Meu jeito","map_description":"Conteúdo sintético.","answers":[]}',
      '2026-01-02T12:32:00.000Z', NULL
    );

    INSERT INTO sessions (
      token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at
    ) VALUES (
      'session-hash-synthetic', 'patient_synthetic',
      'csrf-synthetic', '2026-01-03T18:00:00.000Z',
      '2026-01-03T10:00:00.000Z', '2026-01-03T10:00:00.000Z'
    );

    INSERT INTO assisted_recovery_grants (
      user_id, issued_by, expires_at, created_at
    ) VALUES (
      'patient_synthetic', 'therapist_synthetic',
      '2026-01-04T10:00:00.000Z', '2026-01-03T10:00:00.000Z'
    );

    INSERT INTO access_logs (
      id, user_id, action, resource_type, resource_id, created_at
    ) VALUES (
      'log_synthetic', 'patient_synthetic', 'synthetic_rehearsal',
      'system', NULL, '2026-01-03T10:00:00.000Z'
    );

    INSERT INTO auth_windows (key, count, window_started_at)
    VALUES ('auth-window-synthetic', 1, '2026-01-03T10:00:00.000Z');

    INSERT INTO system_config (key, value, updated_at)
    VALUES (
      'privacy_version', '2026-07-29', '2026-01-03T10:00:00.000Z'
    );
  `);
}

function insertSyntheticThoughtReview(database) {
  database.exec(`
    INSERT INTO entry_thought_reviews (
      entry_id, source_thought, supporting_context, missing_context,
      alternative_view, current_view, revision, created_at, updated_at
    ) VALUES (
      'entry_synthetic', 'Pensamento sintético escolhido.',
      'Contexto inteiramente sintético.', '', '', '', 1,
      '2026-01-02T12:15:00.000Z', '2026-01-02T12:15:00.000Z'
    );
  `);
}

function readSnapshot(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const counts = Object.fromEntries(
      tableNames.map((tableName) => [
        tableName,
        database.prepare(`SELECT COUNT(*) AS total FROM ${tableName}`).get().total,
      ]),
    );
    const integrity = database.prepare("PRAGMA integrity_check").get().integrity_check;
    const foreignKeyIssues = database.prepare("PRAGMA foreign_key_check").all();
    return { counts, integrity, foreignKeyIssues };
  } finally {
    database.close();
  }
}

function assertHealthySnapshot(snapshot) {
  assert.equal(snapshot.integrity, "ok");
  assert.deepEqual(snapshot.foreignKeyIssues, []);
  assert.deepEqual(snapshot.counts, expectedCounts);
}

const rehearsalDirectory = await mkdtemp(join(tmpdir(), "area-paciente-restore-"));
const sourcePath = join(rehearsalDirectory, "source.sqlite");
const backupPath = join(rehearsalDirectory, "backup.sqlite");
const restoredPath = join(rehearsalDirectory, "restored.sqlite");

try {
  const source = new DatabaseSync(sourcePath);
  try {
    source.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;");
    await applyMigrations(source, migrationNames.slice(0, 5));
    insertSyntheticState(source);
    assert.equal(
      source.prepare(
        "SELECT COUNT(*) AS total FROM patient_map_draft_fields",
      ).get().total,
      3,
      "o ensaio deve começar com um campo inacessível retido pela limpeza antiga",
    );
    await applyMigration(source, migrationNames[5]);
    assert.deepEqual(
      source
        .prepare(
          `SELECT field_type, field_id, generation
           FROM patient_map_draft_fields
           ORDER BY field_type, field_id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        { field_type: "answer", field_id: "meu-jeito.01.1", generation: 2 },
        { field_type: "state", field_id: "__state__", generation: 2 },
      ],
      "a migração deve remover somente campos fora da geração atual",
    );
    await applyMigration(source, migrationNames[6]);
    insertSyntheticThoughtReview(source);
  } finally {
    source.close();
  }

  assertHealthySnapshot(readSnapshot(sourcePath));
  await copyFile(sourcePath, backupPath);

  const changed = new DatabaseSync(sourcePath);
  try {
    changed.exec(`
      PRAGMA foreign_keys = ON;
      DELETE FROM entries WHERE id = 'entry_synthetic';
      DELETE FROM sessions WHERE user_id = 'patient_synthetic';
      BEGIN IMMEDIATE;
      UPDATE patient_map_draft_fields
      SET generation = 3, revision = revision + 1,
          request_id = 'map-clear-synthetic-0001',
          updated_at = '2026-01-05T10:00:00.000Z'
      WHERE patient_id = 'patient_synthetic'
        AND content_version = 'mapa-pessoal-refinado-ouro-v1'
        AND field_type = 'state' AND field_id = '__state__'
        AND generation = 2;
      DELETE FROM patient_map_draft_fields
      WHERE patient_id = 'patient_synthetic'
        AND content_version = 'mapa-pessoal-refinado-ouro-v1'
        AND field_type <> 'state'
        AND EXISTS (
          SELECT 1 FROM patient_map_draft_fields AS state
          WHERE state.patient_id = 'patient_synthetic'
            AND state.content_version = 'mapa-pessoal-refinado-ouro-v1'
            AND state.field_type = 'state' AND state.field_id = '__state__'
            AND state.generation = 3
            AND state.request_id = 'map-clear-synthetic-0001'
        );
      COMMIT;
      UPDATE patient_links
      SET status = 'closed', closed_at = '2026-01-05T10:00:00.000Z'
      WHERE id = 'link_synthetic';
    `);
  } finally {
    changed.close();
  }

  const changedSnapshot = readSnapshot(sourcePath);
  assert.equal(changedSnapshot.counts.entries, 0);
  assert.equal(changedSnapshot.counts.entry_thought_reviews, 0);
  assert.equal(changedSnapshot.counts.entry_views, 0);
  assert.equal(changedSnapshot.counts.patient_map_draft_fields, 1);
  assert.equal(changedSnapshot.counts.patient_map_shares, 1);
  assert.equal(changedSnapshot.counts.sessions, 0);

  await copyFile(backupPath, restoredPath);
  assertHealthySnapshot(readSnapshot(restoredPath));

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      scope: "local-sqlite-rehearsal",
      data: "synthetic-only",
      tables_verified: tableNames.length,
      production_requests: 0,
    })}\n`,
  );
} finally {
  await rm(rehearsalDirectory, { recursive: true, force: true });
}
