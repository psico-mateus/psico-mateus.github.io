import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const temporaryPrefix = "portal-isolated-integration-";
const mirrorDirectories = ["app", "build", "content", "db", "drizzle", "lib", "public", "worker"];
const mirrorRootFiles = [
  "package.json", "vite.config.ts", "next.config.ts", "postcss.config.mjs",
  "tsconfig.json", "tsconfig.app.json", "tsconfig.worker.json", "next-env.d.ts",
];
const persistentTables = [
  "users", "sessions", "entries", "entry_thought_reviews", "entry_views",
  "patient_links", "invitations", "patient_map_draft_fields", "patient_map_shares",
  "patient_notices", "professional_mfa_recovery_codes", "assisted_recovery_grants",
];
const allowedPhases = new Set(["startup", "migrations", "http-suite", "restart", "relogin", "cleanup"]);
const legacyInlineUniqueIndexes = new Map([
  ["invitations_code_hash_idx", { table: "invitations", columns: ["code_hash"] }],
  ["patient_links_unique_idx", { table: "patient_links", columns: ["therapist_id", "patient_id"] }],
]);

function hasLegacyMigrationObject(database, name) {
  if (database.prepare("SELECT 1 FROM sqlite_schema WHERE name = ?").get(name)) return true;
  const expected = legacyInlineUniqueIndexes.get(name);
  if (!expected) return false;
  // The runtime compatibility bootstrap expresses only these two constraints
  // inline, so SQLite gives them autoindex names. Require the same complete
  // UNIQUE constraint, not merely an index or a matching prefix of its columns.
  const indexes = database.prepare('SELECT name, "unique" AS is_unique, origin, partial FROM pragma_index_list(?)')
    .all(expected.table);
  return indexes.some(index => {
    if (index.is_unique !== 1 || index.origin !== "u" || index.partial !== 0) return false;
    const columns = database.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
      .all(index.name).map(column => column.name);
    if (columns.length !== expected.columns.length
      || columns.some((column, position) => column !== expected.columns[position])) return false;
    const keyColumns = database.prepare('SELECT coll, "desc" AS is_desc FROM pragma_index_xinfo(?) WHERE "key" = 1 ORDER BY seqno')
      .all(index.name);
    return keyColumns.length === expected.columns.length
      && keyColumns.every(column => column.coll === "BINARY" && column.is_desc === 0);
  });
}

export function announcesOwnUrl(output, readyUrl) {
  // Vite may color only the port inside the URL. Preserve the exact-origin gate
  // without making readiness depend on terminal styling.
  return stripVTControlCharacters(output).includes(readyUrl);
}

export function processGroupMayBeAlive(pid, probe = (group, signal) => process.kill(group, signal)) {
  try { probe(-pid, 0); return true; }
  catch (error) {
    if (error.code === "ESRCH") return false;
    // macOS can transiently return EPERM while this owned group is exiting.
    // Permission denial proves neither absence nor safe cleanup: keep waiting
    // within stop's bounded deadline and require an actual ESRCH before removal.
    if (error.code === "EPERM") return true;
    throw error;
  }
}

export function createPhaseReporter(write = line => process.stderr.write(line)) {
  let phase = "startup";
  return {
    enter(value) {
      if (!allowedPhases.has(value)) throw new Error("Fase inválida do runner isolado.");
      phase = value;
      write(`${JSON.stringify({ runner: "isolated-integration", phase })}\n`);
    },
    failure() {
      write(`${JSON.stringify({ runner: "isolated-integration", failed_phase: phase })}\n`);
    },
  };
}

export function parseOptions(argumentsList) {
  const options = { keepTemp: false, help: false };
  for (const argument of argumentsList) {
    if (argument === "--keep-temp") options.keepTemp = true;
    else if (argument === "--help") options.help = true;
    else throw new Error("Opção inválida. Use somente --keep-temp ou --help.");
  }
  return options;
}

export function excludedMirrorName(name) {
  const lowerName = name.toLowerCase();
  return lowerName.startsWith(".env") || lowerName.startsWith(".dev.vars")
    || new Set([".wrangler", ".next", ".git", "dist", "node_modules", ".cache", "coverage", ".aws", ".ssh", ".npmrc", ".netrc"])
      .has(lowerName)
    || /(?:\.sqlite3?|\.db3?)(?:-(?:wal|shm|journal))?$/iu.test(name)
    || /^(?:secrets?|credentials?)(?:\.|$)/iu.test(name)
    || /\.(?:pem|key|p12|pfx)$/iu.test(name);
}

export async function createCodeMirror(sourceRoot, temporaryRoot) {
  const mirrorRoot = join(temporaryRoot, "code");
  await mkdir(mirrorRoot, { mode: 0o700 });
  async function copyAllowed(sourcePath, destinationPath, { optional = false } = {}) {
    try { await lstat(sourcePath); }
    catch (error) {
      if (optional && error.code === "ENOENT") return;
      throw error;
    }
    await cp(sourcePath, destinationPath, {
      recursive: true, dereference: false, force: false, errorOnExist: true,
      async filter(path) {
        // The decision is based solely on the filename, before cp can read file
        // contents. Excluded directories are not traversed at all.
        if (excludedMirrorName(basename(path))) return false;
        const info = await lstat(path);
        if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) {
          throw new Error("Links simbólicos e arquivos especiais não podem entrar no espelho de código.");
        }
        return true;
      },
    });
  }
  for (const directory of mirrorDirectories) {
    await copyAllowed(join(sourceRoot, directory), join(mirrorRoot, directory), { optional: true });
  }
  for (const name of mirrorRootFiles) {
    await copyAllowed(join(sourceRoot, name), join(mirrorRoot, name),
      { optional: !["package.json", "vite.config.ts"].includes(name) });
  }
  const hostingSource = join(sourceRoot, ".openai");
  if (!(await lstat(hostingSource)).isDirectory() || (await lstat(hostingSource)).isSymbolicLink()) {
    throw new Error("A configuração pública de hosting precisa ser um diretório regular.");
  }
  await mkdir(join(mirrorRoot, ".openai"));
  await copyAllowed(join(hostingSource, "hosting.json"), join(mirrorRoot, ".openai", "hosting.json"));
  const installedModules = await realpath(join(sourceRoot, "node_modules"));
  if (!(await lstat(installedModules)).isDirectory()) throw new Error("Dependências locais não instaladas.");
  // This is the only allowed symlink. No .env/.dev.vars, local D1, generated
  // output, developer state, or other .openai files are copied into the mirror.
  await symlink(installedModules, join(mirrorRoot, "node_modules"), "dir");
  // Never copy the production Wrangler config or its remote service bindings.
  await writeFile(join(mirrorRoot, "wrangler.jsonc"), JSON.stringify({
    name: "portal-isolated-integration", main: "./worker/index.ts",
    compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"],
    vars: { PORTAL_API_MODE: "local" },
  }), { mode: 0o600 });
  // The runner loader avoids .vite-temp in the symlinked node_modules. The
  // optimizer cache also belongs exclusively to this temporary code mirror.
  // Resolve the async source configuration during import: configLoader runner's
  // importer is already closed when Vite invokes an exported async function.
  await writeFile(join(mirrorRoot, "vite.isolated.config.mjs"),
    'import sourceConfig from "./vite.config.ts";\n'
    + 'const context = { command: "serve", mode: "development", isSsrBuild: false, isPreview: false };\n'
    + 'const evaluatedConfig = typeof sourceConfig === "function"\n'
    + '  ? await sourceConfig(context)\n'
    + '  : await sourceConfig;\n'
    + 'export default { ...evaluatedConfig, cacheDir: "./.isolated-vite-cache" };\n', { mode: 0o600 });
  return mirrorRoot;
}

// Do not inherit administrative credentials, NODE_OPTIONS, a developer DB path,
// or the user's Cloudflare login directory. All application secrets are generated
// for this run and never written to files, argv, or output.
export function makeChildEnvironment(temporaryRoot, secrets) {
  return {
    PATH: [dirname(process.execPath), join(projectRoot, "node_modules", ".bin"),
      "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
    HOME: join(temporaryRoot, "home"),
    TMPDIR: join(temporaryRoot, "tmp"),
    LANG: "en_US.UTF-8",
    CI: "1",
    NODE_ENV: "development",
    DO_NOT_TRACK: "1",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: join(temporaryRoot, "logs", "wrangler.log"),
    MINIFLARE_REGISTRY_PATH: join(temporaryRoot, "registry"),
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    CLOUDFLARE_PUBLIC_DEPLOY: "0",
    PORTAL_API_MODE: "local",
    PORTAL_TEST_PERSIST_PATH: join(temporaryRoot, "state"),
    APP_SECRET: secrets.appSecret,
    SETUP_SECRET: secrets.setupSecret,
  };
}

export async function assertOwnedDatabase(temporaryRoot, databasePath) {
  const root = await realpath(temporaryRoot);
  const canonicalPath = await realpath(databasePath);
  const stateRoot = join(root, "state", "v3", "d1");
  const localPath = relative(stateRoot, canonicalPath);
  if (localPath === "" || localPath === ".." || localPath.startsWith(`..${sep}`)
    || isAbsolute(localPath) || !canonicalPath.endsWith(".sqlite")
    || (await lstat(databasePath)).isSymbolicLink()) {
    throw new Error("O banco precisa ser o SQLite D1 criado dentro do TMP desta execução.");
  }
  return canonicalPath;
}

export async function findOwnedD1Database(temporaryRoot) {
  const candidates = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("O estado isolado não pode conter links simbólicos.");
      if (entry.isDirectory()) await visit(path);
      // Miniflare has a separate bookkeeping SQLite beside the application D1.
      else if (entry.isFile() && entry.name.endsWith(".sqlite") && entry.name !== "metadata.sqlite") candidates.push(path);
    }
  }
  await visit(join(temporaryRoot, "state", "v3", "d1"));
  if (candidates.length !== 1) throw new Error("Esperado exatamente um SQLite D1 no estado isolado.");
  return assertOwnedDatabase(temporaryRoot, candidates[0]);
}

export async function applyLocalMigrations(temporaryRoot, databasePath, migrationsDirectory) {
  const ownedPath = await assertOwnedDatabase(temporaryRoot, databasePath);
  const database = new DatabaseSync(ownedPath);
  try {
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;");
    const existingTables = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all().map(row => row.name));
    for (const table of persistentTables) {
      if (existingTables.has(table) && database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total !== 0) {
        throw new Error("Migrações recusadas: o banco isolado não está vazio.");
      }
    }
    const migrationNames = (await readdir(migrationsDirectory))
      .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name)).sort();
    if (migrationNames.length === 0) throw new Error("Nenhuma migração local encontrada.");
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const name of migrationNames) {
        const sql = await readFile(join(migrationsDirectory, name), "utf8");
        // /health initializes the legacy compatibility schema. Verify every SQL
        // object from 0000–0002 before skipping those already-present migrations.
        if (/^000[0-2]_/u.test(name)) {
          const objects = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+`([^`]+)`/giu)]
            .map(match => match[1]);
          const present = objects.filter(object => hasLegacyMigrationObject(database, object));
          if (objects.length > 0 && present.length === objects.length) continue;
          if (present.length > 0) throw new Error("Bootstrap local incompleto; migrações interrompidas.");
        }
        database.exec(sql);
      }
      assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return migrationNames.length;
  } finally {
    database.close();
  }
}

export async function snapshotSyntheticState(temporaryRoot, databasePath) {
  const ownedPath = await assertOwnedDatabase(temporaryRoot, databasePath);
  const database = new DatabaseSync(ownedPath, { readOnly: true });
  try {
    return Object.fromEntries(persistentTables.map(table => {
      const rows = database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      return [table, { count: rows.length,
        digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex") }];
    }));
  } finally {
    database.close();
  }
}

async function availableLoopbackPort() {
  const reservation = createServer();
  await new Promise((resolvePromise, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolvePromise);
  });
  const port = reservation.address().port;
  await new Promise((resolvePromise, reject) => reservation.close(error => error ? reject(error) : resolvePromise()));
  return port;
}

function launch(argumentsList, environment, signal, workingDirectory, { captureOutput = false, readyUrl } = {}) {
  const child = spawn(process.execPath, argumentsList, {
    cwd: workingDirectory, env: environment, stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let output = "";
  let startupTail = "";
  let ready = !readyUrl;
  let exited = false;
  let stopPromise;
  const completion = new Promise(resolvePromise => {
    child.once("error", () => { exited = true; resolvePromise({ code: null, failed: true }); });
    child.once("exit", () => { exited = true; });
    // close follows exit only after inherited stdout/stderr are closed. Waiting
    // for it avoids truncating the suite summary or racing late child cleanup.
    child.once("close", (code, exitSignal) => {
      resolvePromise({ code, signal: exitSignal });
    });
  });
  // Startup/error logs are deliberately not forwarded: dotenv may be loaded by
  // dependencies, and assertion diagnostics must not accidentally expose values.
  child.stdout.on("data", chunk => {
    if (captureOutput) output = (output + chunk.toString()).slice(-8192);
    if (!ready && readyUrl) {
      startupTail = (startupTail + chunk.toString()).slice(-2048);
      ready = announcesOwnUrl(startupTail, readyUrl);
      if (ready) startupTail = "";
    }
  });
  child.stderr.resume();
  function kill(killSignal) {
    if (!child.pid || (process.platform === "win32" && exited)) return;
    try {
      if (process.platform === "win32") child.kill(killSignal);
      else process.kill(-child.pid, killSignal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  const cancel = () => kill("SIGTERM");
  signal.addEventListener("abort", cancel, { once: true });
  function groupAlive() {
    if (process.platform === "win32") return !exited;
    if (!child.pid) return false;
    return processGroupMayBeAlive(child.pid);
  }
  return {
    completion,
    get ready() { return ready; },
    get exited() { return exited; },
    get output() { return output; },
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        signal.removeEventListener("abort", cancel);
        kill("SIGTERM");
        let deadline = Date.now() + 3000;
        while (groupAlive() && Date.now() < deadline) await delay(100);
        if (groupAlive()) kill("SIGKILL");
        deadline = Date.now() + 3000;
        while (groupAlive() && Date.now() < deadline) await delay(100);
        if (groupAlive()) throw new Error("O grupo do processo sintético não terminou dentro do prazo.");
        const closeTimeout = new AbortController();
        try {
          await Promise.race([
            completion,
            delay(3000, undefined, { signal: closeTimeout.signal, ref: false }).then(() => {
              throw new Error("Os canais do processo sintético não fecharam dentro do prazo.");
            }),
          ]);
        } finally {
          closeTimeout.abort();
        }
      })();
      return stopPromise;
    },
  };
}

async function localRequest(baseUrl, path, signal, { method = "GET", body, cookie, csrf } = {}) {
  const url = new URL(path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin || url.hostname !== "127.0.0.1") {
    throw new Error("Requisição fora do servidor sintético recusada.");
  }
  const headers = { origin: new URL(baseUrl).origin };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await fetch(url, { method, headers, redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: response.status === 204 ? null : await response.json() };
}

async function waitForHealthy(server, baseUrl, signal) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && !server.exited) {
    signal.throwIfAborted();
    // Never probe an unrelated process that could occupy the selected port.
    // Vite must first announce our exact URL on its own stdout after listening.
    if (!server.ready) {
      await delay(500, undefined, { signal });
      continue;
    }
    try {
      const result = await localRequest(baseUrl, "/api/portal/health", signal);
      if (result.response.status === 200 && result.payload.ok === true) return;
    } catch {
      signal.throwIfAborted();
    }
    await delay(500, undefined, { signal });
  }
  throw new Error("O servidor sintético não iniciou na porta exclusiva dentro do prazo.");
}

export async function runIsolatedIntegration(options) {
  const reporter = createPhaseReporter();
  reporter.enter("startup");
  let temporaryRoot;
  const controller = new AbortController();
  const children = new Set();
  const cancel = () => controller.abort(new Error("Teste isolado interrompido."));
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), temporaryPrefix)));
    for (const directory of ["home", "tmp", "logs", "registry", "state"]) {
      await mkdir(join(temporaryRoot, directory), { recursive: true, mode: 0o700 });
    }
    const mirrorRoot = await createCodeMirror(projectRoot, temporaryRoot);
    const environment = makeChildEnvironment(temporaryRoot, {
      appSecret: randomBytes(48).toString("hex"),
      setupSecret: randomBytes(32).toString("hex"),
    });
    const port = await availableLoopbackPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const viteBin = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
    await access(viteBin);
    // strictPort prevents Vite from selecting another port after a race. This
    // uses the repository's vinext + Cloudflare/Miniflare Vite configuration.
    const serverArguments = [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort",
      "--config", join(mirrorRoot, "vite.isolated.config.mjs"), "--configLoader", "runner"];
    function startServer() {
      const server = launch(serverArguments, environment, controller.signal, mirrorRoot, { readyUrl: `${baseUrl}/` });
      children.add(server);
      return server;
    }
    let server = startServer();
    await waitForHealthy(server, baseUrl, controller.signal);
    reporter.enter("migrations");
    const databasePath = await findOwnedD1Database(temporaryRoot);
    const migrations = await applyLocalMigrations(temporaryRoot, databasePath, join(mirrorRoot, "drizzle"));
    reporter.enter("http-suite");
    const suite = launch([join(projectRoot, "tests", "portal.integration.mjs")], {
      ...environment, PORTAL_TEST_BASE_URL: baseUrl,
      PORTAL_TEST_SETUP_SECRET: environment.SETUP_SECRET, PORTAL_TEST_DB_PATH: databasePath,
    }, controller.signal, mirrorRoot, { captureOutput: true });
    children.add(suite);
    const suiteTimeout = new AbortController();
    let suiteResult;
    try {
      suiteResult = await Promise.race([
        suite.completion,
        delay(600000, undefined, { signal: suiteTimeout.signal, ref: false }).then(() => {
          throw new Error("A suíte sintética excedeu o limite de dez minutos.");
        }),
      ]);
    } finally {
      suiteTimeout.abort();
    }
    controller.signal.throwIfAborted();
    if (suiteResult.code !== 0) throw new Error("A suíte HTTP/D1 sintética falhou; nenhum log sensível foi exposto.");
    let suiteSummary;
    try { suiteSummary = JSON.parse(suite.output.trim()); } catch { throw new Error("Resumo da suíte sintética inválido."); }
    assert.equal(suiteSummary.ok, true);
    assert.equal(suiteSummary.data, "synthetic-only");
    assert.equal(suiteSummary.production_requests, 0);

    reporter.enter("restart");
    // This account/password is created and updated exclusively by the synthetic
    // integration suite. Cookies and record bodies stay in memory and are never
    // logged or persisted in a browser profile.
    const loginBody = { email: "paciente-a@example.test", password: "SenhaPacienteNova123" };
    const login = await localRequest(baseUrl, "/api/portal/login", controller.signal, { method: "POST", body: loginBody });
    assert.equal(login.response.status, 200, "Login sintético antes do restart.");
    const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "O servidor precisa criar um cookie sintético.");
    const records = await localRequest(baseUrl, "/api/portal/entries", controller.signal, { cookie });
    assert.equal(records.response.status, 200);
    assert.ok(records.payload.entries.length > 0, "A suíte precisa manter um registro sintético para testar persistência.");
    const beforeRestart = await snapshotSyntheticState(temporaryRoot, databasePath);
    assert.ok(beforeRestart.users.count >= 2);
    assert.ok(beforeRestart.sessions.count >= 2);
    await server.stop();
    children.delete(server);
    controller.signal.throwIfAborted();
    server = startServer();
    await waitForHealthy(server, baseUrl, controller.signal);
    assert.deepEqual(await snapshotSyntheticState(temporaryRoot, databasePath), beforeRestart,
      "Contas, registros e sessões sintéticos devem sobreviver ao restart sem alteração.");
    const session = await localRequest(baseUrl, "/api/portal/session", controller.signal, { cookie });
    assert.equal(session.response.status, 200);
    assert.equal(session.payload.user?.role, "patient");
    const restoredRecords = await localRequest(baseUrl, "/api/portal/entries", controller.signal, { cookie });
    assert.equal(restoredRecords.response.status, 200);
    assert.deepEqual(restoredRecords.payload, records.payload);
    reporter.enter("relogin");
    const logout = await localRequest(baseUrl, "/api/portal/logout", controller.signal,
      { method: "POST", cookie, csrf: session.payload.csrf });
    assert.equal(logout.response.status, 204);
    const loggedOut = await localRequest(baseUrl, "/api/portal/entries", controller.signal, { cookie });
    assert.equal(loggedOut.response.status, 401);
    const relogin = await localRequest(baseUrl, "/api/portal/login", controller.signal, { method: "POST", body: loginBody });
    assert.equal(relogin.response.status, 200);
    const reloginCookie = relogin.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(reloginCookie);
    const reloginRecords = await localRequest(baseUrl, "/api/portal/entries", controller.signal, { cookie: reloginCookie });
    assert.equal(reloginRecords.response.status, 200);
    assert.deepEqual(reloginRecords.payload, records.payload);
    return { ok: true, checks: suiteSummary.checks, migrations,
      restart: "accounts-records-sessions-preserved", relogin: true,
      data: "synthetic-only", production_requests: 0 };
  } catch (error) {
    reporter.failure();
    throw error;
  } finally {
    reporter.enter("cleanup");
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    try {
      const stopped = await Promise.allSettled([...children].map(child => child.stop()));
      if (stopped.some(result => result.status === "rejected")) {
        // Never remove a directory while one of our children could still write
        // into it. Keep only this run's synthetic TMP for a safe later cleanup.
        if (temporaryRoot) console.log(JSON.stringify({ synthetic_tmp_retained: temporaryRoot }));
        throw new Error("Falha ao encerrar os processos sintéticos.");
      }
      if (temporaryRoot) {
        if (options.keepTemp) console.log(JSON.stringify({ synthetic_tmp_retained: temporaryRoot }));
        else await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    } catch {
      reporter.failure();
      throw new Error("Falha na limpeza do ambiente sintético isolado.");
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) console.log("node scripts/run-isolated-integration.mjs [--keep-temp]\nCria um servidor local sintético exclusivo; testa HTTP/D1 e restart; remove seu TMP ao terminar.");
    else console.log(JSON.stringify(await runIsolatedIntegration(options)));
  } catch {
    // Do not print raw dependency exceptions, assertion payloads, or child logs.
    console.error("Falha no teste local isolado. Nenhum banco, sessão ou segredo de produção foi utilizado.");
    process.exitCode = 1;
  }
}
