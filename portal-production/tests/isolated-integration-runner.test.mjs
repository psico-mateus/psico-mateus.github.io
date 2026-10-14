import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  announcesOwnUrl, applyLocalMigrations, assertOwnedDatabase, createCodeMirror, createPhaseReporter,
  excludedMirrorName, findOwnedD1Database,
  makeChildEnvironment, parseOptions, processGroupMayBeAlive, snapshotSyntheticState,
} from "../scripts/run-isolated-integration.mjs";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "portal-runner-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "state", "v3", "d1", "miniflare-D1DatabaseObject");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "synthetic.sqlite");
  const database = new DatabaseSync(path);
  database.close();
  return { root, directory, path };
}

const migrationsDirectory = new URL("../drizzle/", import.meta.url).pathname;

async function applyCompatibilityBootstrap(database, transform = sql => sql) {
  const source = await readFile(new URL("../db/runtime.ts", import.meta.url), "utf8");
  const section = source.match(/const schemaStatements = \[([\s\S]+?)\n\];/u)?.[1];
  assert.ok(section, "The actual runtime bootstrap must remain identifiable.");
  const statements = [...section.matchAll(/`([^`]+)`/gu)].map(match => match[1]);
  assert.ok(statements.length > 10);
  const sql = `${statements.join(";\n")};`;
  const transformed = transform(sql);
  assert.equal(typeof transformed, "string");
  database.exec(transformed);
}

test("readiness recognizes an ANSI-colored port without accepting a different origin", () => {
  const readyUrl = "http://127.0.0.1:59685/";
  assert.equal(announcesOwnUrl(`Local: ${readyUrl}`, readyUrl), true);
  assert.equal(announcesOwnUrl("Local: http://127.0.0.1:\u001b[1m59685\u001b[22m/", readyUrl), true);
  for (const output of ["Local: http://localhost:59685/", "Local: http://127.0.0.1:59686/", "Not listening yet"]) {
    assert.equal(announcesOwnUrl(output, readyUrl), false);
  }
});

test("process group probes treat EPERM conservatively as alive and only ESRCH as absent", () => {
  const calls = [];
  assert.equal(processGroupMayBeAlive(12345, (group, signal) => calls.push({ group, signal })), true);
  assert.deepEqual(calls, [{ group: -12345, signal: 0 }]);
  for (const [code, expected] of [["EPERM", true], ["ESRCH", false]]) {
    assert.equal(processGroupMayBeAlive(12345, () => { throw Object.assign(new Error("synthetic-only"), { code }); }), expected);
  }
  const unexpected = Object.assign(new Error("synthetic-only"), { code: "EINVAL" });
  assert.throws(() => processGroupMayBeAlive(12345, () => { throw unexpected; }), error => error === unexpected);
});

test("D1 discovery ignores Miniflare metadata but still rejects multiple application databases", async t => {
  const f = await fixture(t);
  const metadata = new DatabaseSync(join(f.directory, "metadata.sqlite"));
  metadata.close();
  assert.equal(await findOwnedD1Database(f.root), f.path);
  const second = new DatabaseSync(join(f.directory, "another.sqlite"));
  second.close();
  await assert.rejects(findOwnedD1Database(f.root), /exatamente um SQLite D1/u);
});

async function mirrorFixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "portal-mirror-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const temporaryRoot = join(root, "isolated");
  await mkdir(join(source, "app", "nested"), { recursive: true });
  await mkdir(join(source, ".openai"));
  await mkdir(join(source, "node_modules"));
  await mkdir(temporaryRoot);
  await writeFile(join(source, "package.json"), '{"type":"module"}');
  await writeFile(join(source, "vite.config.ts"), "export default {};\n");
  await writeFile(join(source, ".openai", "hosting.json"), '{"d1":"DB"}');
  await writeFile(join(source, "app", "page.tsx"), "export default function Page() { return null; }\n");
  return { root, source, temporaryRoot };
}

test("code mirror copies only public allowlisted sources and never environment, database, build, or hosting sentinels", async t => {
  const f = await mirrorFixture(t);
  const forbiddenRoot = [".env", ".env.local", ".dev.vars", ".dev.vars.test", "wrangler.jsonc", "local.sqlite", "private.txt"];
  const forbiddenNested = [".env.production", ".dev.vars.local", "local.sqlite", "local.sqlite-wal", "local.sqlite-shm", "local.db", "local.db-journal", "secret.json", "credentials.json", "private.key"];
  const sentinel = "synthetic-mirror-excluded-sentinel";
  for (const name of forbiddenRoot) await writeFile(join(f.source, name), sentinel);
  for (const name of forbiddenNested) await writeFile(join(f.source, "app", "nested", name), sentinel);
  for (const name of [".wrangler", "dist", ".next"]) {
    await mkdir(join(f.source, "app", "nested", name));
    await writeFile(join(f.source, "app", "nested", name, "private.ts"), sentinel);
  }
  await writeFile(join(f.source, ".openai", "private.json"), sentinel);
  const mirror = await createCodeMirror(f.source, f.temporaryRoot);
  assert.equal(await readFile(join(mirror, "app", "page.tsx"), "utf8"), "export default function Page() { return null; }\n");
  for (const name of forbiddenRoot.filter(name => name !== "wrangler.jsonc")) {
    await assert.rejects(lstat(join(mirror, name)), { code: "ENOENT" });
  }
  for (const name of [...forbiddenNested, ".wrangler", "dist", ".next"]) {
    await assert.rejects(lstat(join(mirror, "app", "nested", name)), { code: "ENOENT" });
  }
  await assert.rejects(lstat(join(mirror, ".openai", "private.json")), { code: "ENOENT" });
  assert.equal((await lstat(join(mirror, "node_modules"))).isSymbolicLink(), true);
  assert.equal(await realpath(join(mirror, "node_modules")), join(f.source, "node_modules"));
  const workerConfig = await readFile(join(mirror, "wrangler.jsonc"), "utf8");
  assert.equal(workerConfig.includes(sentinel), false);
  assert.equal(Object.hasOwn(JSON.parse(workerConfig), "d1_databases"), false);
  assert.equal(Object.hasOwn(JSON.parse(workerConfig), "services"), false);
  assert.match(await readFile(join(mirror, "vite.isolated.config.mjs"), "utf8"), /cacheDir: "\.\/\.isolated-vite-cache"/u);
  // Source sentinels remain untouched; the helper does not clean the source.
  assert.equal(await readFile(join(f.source, ".env.local"), "utf8"), sentinel);
});

test("mirror refuses non-dependency symlinks before copying their target contents", async t => {
  const f = await mirrorFixture(t);
  const target = join(f.source, "do-not-copy.txt");
  await writeFile(target, "synthetic-symlink-target-sentinel");
  await symlink(target, join(f.source, "app", "nested", "linked.ts"));
  await assert.rejects(createCodeMirror(f.source, f.temporaryRoot), /Links simbólicos/u);
  await assert.rejects(lstat(join(f.temporaryRoot, "code", "app", "nested", "linked.ts")), { code: "ENOENT" });
});

test("isolated wrapper evaluates async configuration during module load and exports a resolved object", async t => {
  const f = await mirrorFixture(t);
  await writeFile(join(f.source, "vite.config.ts"),
    'export default async context => ({ testedContext: context, dynamicImportResolved: Boolean((await import("node:path")).sep) });\n');
  const mirror = await createCodeMirror(f.source, f.temporaryRoot);
  const wrapperPath = join(mirror, "vite.isolated.config.mjs");
  const wrapperSource = await readFile(wrapperPath, "utf8");
  assert.match(wrapperSource, /\? await sourceConfig\(context\)/u);
  assert.match(wrapperSource, /export default \{ \.\.\.evaluatedConfig, cacheDir:/u);
  assert.doesNotMatch(wrapperSource, /defineConfig|mergeConfig|export default (?:async|function)|=>/u);
  const loaded = await import(pathToFileURL(wrapperPath).href);
  assert.equal(typeof loaded.default, "object");
  assert.equal(loaded.default.dynamicImportResolved, true);
  assert.deepEqual(loaded.default.testedContext,
    { command: "serve", mode: "development", isSsrBuild: false, isPreview: false });
  assert.equal(loaded.default.cacheDir, "./.isolated-vite-cache");
});

test("mirror filename exclusions apply case-insensitively at every source depth", () => {
  for (const name of [".ENV.TEST", ".DEV.VARS", "sample.SQLITE3", "sample.DB-WAL", "credentials.json", "key.pem", ".wrangler", ".next", "dist"]) {
    assert.equal(excludedMirrorName(name), true);
  }
  for (const name of ["page.tsx", "schema.ts", "hosting.json", "crypto.ts"]) assert.equal(excludedMirrorName(name), false);
});

test("phase reporting emits only fixed phase names and the current failure phase, never raw values", () => {
  const lines = [];
  const reporter = createPhaseReporter(line => lines.push(line));
  for (const phase of ["startup", "migrations", "http-suite", "restart", "relogin", "cleanup"]) reporter.enter(phase);
  assert.deepEqual(lines.map(line => JSON.parse(line)), [
    "startup", "migrations", "http-suite", "restart", "relogin", "cleanup",
  ].map(phase => ({ runner: "isolated-integration", phase })));
  const syntheticSensitiveValue = "synthetic-cookie-password-row-error-sentinel";
  assert.throws(() => reporter.enter(syntheticSensitiveValue), /Fase inválida/u);
  reporter.enter("http-suite");
  reporter.failure(syntheticSensitiveValue);
  reporter.enter("cleanup");
  assert.deepEqual(JSON.parse(lines.at(-2)), { runner: "isolated-integration", failed_phase: "http-suite" });
  assert.equal(lines.join("").includes(syntheticSensitiveValue), false);
});

test("runner accepts only explicit retention/help, never a supplied database, port, URL, or secret", () => {
  assert.deepEqual(parseOptions([]), { keepTemp: false, help: false });
  assert.deepEqual(parseOptions(["--keep-temp"]), { keepTemp: true, help: false });
  for (const option of ["--persist-to=/existing", "--port=4390", "--url=https://example.test", "--secret=example"]) {
    assert.throws(() => parseOptions([option]), /Opção inválida/u);
  }
});

test("child environment isolates administrative auth, HOME, persistence, logs, and application secrets", () => {
  const environment = makeChildEnvironment("/tmp/portal-synthetic-test", {
    appSecret: "synthetic-app-secret-only", setupSecret: "synthetic-setup-secret-only",
  });
  assert.equal(environment.APP_SECRET, "synthetic-app-secret-only");
  assert.equal(environment.SETUP_SECRET, "synthetic-setup-secret-only");
  assert.equal(environment.CLOUDFLARE_INCLUDE_PROCESS_ENV, "true");
  assert.equal(environment.PORTAL_API_MODE, "local");
  assert.equal(environment.HOME, "/tmp/portal-synthetic-test/home");
  assert.equal(environment.PORTAL_TEST_PERSIST_PATH, "/tmp/portal-synthetic-test/state");
  for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY", "NODE_OPTIONS", "PORTAL_TEST_DB_PATH"]) {
    assert.equal(Object.hasOwn(environment, key), false);
  }
});

test("SQLite discovery is confined to the fresh D1 directory and rejects symbolic links", async t => {
  const f = await fixture(t);
  assert.equal(await findOwnedD1Database(f.root), f.path);
  const outsidePath = join(f.root, "outside.sqlite");
  await writeFile(outsidePath, "synthetic-only");
  await assert.rejects(assertOwnedDatabase(f.root, outsidePath), /SQLite D1/u);
  const linkPath = join(f.directory, "linked.sqlite");
  await symlink(outsidePath, linkPath);
  await assert.rejects(findOwnedD1Database(f.root), /links simbólicos/u);
});

test("all versioned migrations work in a new isolated SQLite and state summaries omit row values", async t => {
  const f = await fixture(t);
  assert.equal(await applyLocalMigrations(f.root, f.path, migrationsDirectory), 9);
  const database = new DatabaseSync(f.path);
  try {
    assert.ok(database.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'patient_notices'").get());
    assert.ok(database.prepare("PRAGMA table_info(users)").all().some(column => column.name === "mfa_recovery_set_id"));
  } finally { database.close(); }
  const state = await snapshotSyntheticState(f.root, f.path);
  assert.equal(state.users.count, 0);
  assert.equal(state.entries.count, 0);
  for (const table of Object.values(state)) assert.deepEqual(Object.keys(table), ["count", "digest"]);
});

test("compatibility bootstrap is skipped only when every legacy migration object exists", async t => {
  const f = await fixture(t);
  const database = new DatabaseSync(f.path);
  try {
    for (const name of ["0000_tranquil_glorian.sql", "0001_assisted_recovery.sql", "0002_entry_views.sql"]) {
      database.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
    }
  } finally { database.close(); }
  assert.equal(await applyLocalMigrations(f.root, f.path, migrationsDirectory), 9);
});

test("actual runtime bootstrap accepts only the two equivalent inline UNIQUE autoindexes", async t => {
  const f = await fixture(t);
  const database = new DatabaseSync(f.path);
  try {
    await applyCompatibilityBootstrap(database);
    for (const name of ["invitations_code_hash_idx", "patient_links_unique_idx"]) {
      assert.equal(database.prepare("SELECT 1 FROM sqlite_schema WHERE name = ?").get(name), undefined);
    }
    for (const table of ["invitations", "patient_links"]) {
      assert.ok(database.prepare('SELECT 1 FROM pragma_index_list(?) WHERE "unique" = 1 AND origin = \'u\' AND partial = 0')
        .get(table));
    }
  } finally { database.close(); }
  assert.equal(await applyLocalMigrations(f.root, f.path, migrationsDirectory), 9);
});

test("inline UNIQUE compatibility fails closed for absent, different, partial, or non-inline constraints", async t => {
  const variants = [
    ["invitation uniqueness absent", sql => sql.replace("code_hash TEXT NOT NULL UNIQUE", "code_hash TEXT NOT NULL")],
    ["patient-link uniqueness absent", sql => sql.replace(/closed_at TEXT,\s+UNIQUE \(therapist_id, patient_id\)/u, "closed_at TEXT")],
    ["patient-link columns reversed", sql => sql.replace("UNIQUE (therapist_id, patient_id)", "UNIQUE (patient_id, therapist_id)")],
    ["patient-link extra column", sql => sql.replace("UNIQUE (therapist_id, patient_id)", "UNIQUE (therapist_id, patient_id, status)")],
    ["patient-link descending column", sql => sql.replace("UNIQUE (therapist_id, patient_id)", "UNIQUE (therapist_id DESC, patient_id)")],
    ["invitation different collation", sql => sql.replace("code_hash TEXT NOT NULL UNIQUE", "code_hash TEXT COLLATE NOCASE NOT NULL UNIQUE")],
    ["invitation nonunique index", sql => sql.replace("code_hash TEXT NOT NULL UNIQUE", "code_hash TEXT NOT NULL")
      + "\nCREATE INDEX replacement_code_hash_idx ON invitations(code_hash);"],
    ["invitation partial unique index", sql => sql.replace("code_hash TEXT NOT NULL UNIQUE", "code_hash TEXT NOT NULL")
      + "\nCREATE UNIQUE INDEX replacement_code_hash_idx ON invitations(code_hash) WHERE used_at IS NULL;"],
    ["invitation differently named non-inline unique index", sql => sql.replace("code_hash TEXT NOT NULL UNIQUE", "code_hash TEXT NOT NULL")
      + "\nCREATE UNIQUE INDEX replacement_code_hash_idx ON invitations(code_hash);"],
    ["other named legacy index absent despite inline uniqueness", sql => sql.replace(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_idx ON users (email_hash);", "")],
  ];
  for (const [name, transform] of variants) {
    await t.test(name, async subtest => {
      const f = await fixture(subtest);
      const database = new DatabaseSync(f.path);
      try {
        await applyCompatibilityBootstrap(database, sql => {
          const changed = transform(sql);
          assert.notEqual(changed, sql, "The synthetic alteration must change the actual bootstrap.");
          return changed;
        });
      } finally { database.close(); }
      await assert.rejects(applyLocalMigrations(f.root, f.path, migrationsDirectory), /Bootstrap local incompleto/u);
      const readOnly = new DatabaseSync(f.path, { readOnly: true });
      try {
        assert.equal(readOnly.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'patient_notices'").get(), undefined);
      } finally { readOnly.close(); }
    });
  }
});

test("partial bootstrap fails closed and rolls back later migrations", async t => {
  const f = await fixture(t);
  const database = new DatabaseSync(f.path);
  database.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
  database.close();
  await assert.rejects(applyLocalMigrations(f.root, f.path, migrationsDirectory), /Bootstrap local incompleto/u);
  const readOnly = new DatabaseSync(f.path, { readOnly: true });
  try { assert.equal(readOnly.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'patient_notices'").get(), undefined); }
  finally { readOnly.close(); }
});

test("migrations refuse a nonempty database even inside the disposable directory", async t => {
  const f = await fixture(t);
  const database = new DatabaseSync(f.path);
  database.exec("CREATE TABLE entries (id TEXT PRIMARY KEY); INSERT INTO entries VALUES ('synthetic-sentinel')");
  database.close();
  await assert.rejects(applyLocalMigrations(f.root, f.path, migrationsDirectory), /não está vazio/u);
});

test("runner uses exact loopback/strict port, local SQL, restart, finally shutdown, and self-owned cleanup", async () => {
  const source = await readFile(new URL("../scripts/run-isolated-integration.mjs", import.meta.url), "utf8");
  assert.match(source, /"--host", "127\.0\.0\.1", "--port", String\(port\), "--strictPort"/u);
  assert.match(source, /mkdtemp\(join\(tmpdir\(\), temporaryPrefix\)\)/u);
  assert.match(source, /randomBytes\(48\)/u);
  assert.match(source, /randomBytes\(32\)/u);
  assert.match(source, /redirect: "error"/u);
  assert.match(source, /if \(!server\.ready\)/u);
  assert.match(source, /readyUrl: `\$\{baseUrl\}\/`/u);
  assert.match(source, /snapshotSyntheticState\(temporaryRoot, databasePath\), beforeRestart/u);
  assert.match(source, /Promise\.allSettled\(\[\.\.\.children\]\.map\(child => child\.stop\(\)\)\)/u);
  assert.match(source, /rm\(temporaryRoot, \{ recursive: true, force: true, maxRetries: 5, retryDelay: 100 \}\)/u);
  assert.match(source, /child\.once\("close",/u);
  assert.match(source, /if \(stopPromise\) return stopPromise/u);
  assert.match(source, /if \(groupAlive\(\)\) throw new Error/u);
  assert.match(source, /stopped\.some\(result => result\.status === "rejected"\)/u);
  assert.match(source, /cwd: workingDirectory/u);
  assert.match(source, /"--configLoader", "runner"/u);
  assert.match(source, /controller\.signal, mirrorRoot/u);
  assert.match(source, /join\(mirrorRoot, "drizzle"\)/u);
  assert.doesNotMatch(source, /process\.env|shell:\s*true|cwd: projectRoot|--remote|deploy:worker|readFile\([^\n]*\.env/u);
});
