import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..");
const publicDirectory = join(directory, "public");
const dataDirectory = join(directory, "data");
const databasePath = process.env.PORTAL_DB_PATH || join(dataDirectory, "portal-demo.sqlite");
const host = process.env.PORTAL_HOST || "127.0.0.1";
const port = Number(process.env.PORTAL_PORT || 4310);

mkdirSync(dataDirectory, { recursive: true });
if (process.env.PORTAL_RESET_DB === "1" && existsSync(databasePath)) unlinkSync(databasePath);

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON");
database.exec("PRAGMA journal_mode = WAL");

const now = () => new Date().toISOString();
const identifier = () => randomBytes(16).toString("hex");
const token = () => randomBytes(32).toString("base64url");
const tokenHash = (value) => createHash("sha256").update(value).digest("hex");

function passwordRecord(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function passwordMatches(password, salt, expectedHex) {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function initializeDatabase() {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('patient', 'therapist')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS therapist_patient_links (
      id TEXT PRIMARY KEY,
      therapist_id TEXT NOT NULL REFERENCES users(id),
      patient_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
      created_at TEXT NOT NULL,
      closed_at TEXT,
      UNIQUE (therapist_id, patient_id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      happened TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      thoughts TEXT NOT NULL DEFAULT '',
      urge TEXT NOT NULL DEFAULT '',
      emotion TEXT NOT NULL DEFAULT '',
      intensity INTEGER NOT NULL DEFAULT 0 CHECK (intensity BETWEEN 0 AND 10),
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      shared_at TEXT,
      revoked_at TEXT
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  const userCount = database.prepare("SELECT COUNT(*) AS total FROM users").get().total;
  if (userCount > 0) return;

  const createdAt = now();
  const demoUsers = [
    {
      id: "patient-ana",
      name: "Ana Martins",
      email: "ana@exemplo.local",
      role: "patient",
      password: "TestePaciente!2026",
    },
    {
      id: "patient-bruno",
      name: "Bruno Almeida",
      email: "bruno@exemplo.local",
      role: "patient",
      password: "TestePaciente2!2026",
    },
    {
      id: "therapist-demo",
      name: "Mateus Ribeiro Marcos",
      email: "psico.mateus@outlook.com",
      role: "therapist",
      password: "TesteProfissional!2026",
    },
  ];
  const insertUser = database.prepare(`
    INSERT INTO users (id, name, email, role, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const user of demoUsers) {
    const password = passwordRecord(user.password);
    insertUser.run(
      user.id,
      user.name,
      user.email,
      user.role,
      password.salt,
      password.hash,
      createdAt,
    );
  }

  database
    .prepare(`
      INSERT INTO therapist_patient_links
        (id, therapist_id, patient_id, status, created_at)
      VALUES (?, ?, ?, 'active', ?)
    `)
    .run("link-demo", "therapist-demo", "patient-ana", createdAt);

  const insertEntry = database.prepare(`
    INSERT INTO entries
      (id, patient_id, title, happened, body, thoughts, urge, emotion, intensity, message,
       created_at, updated_at, shared_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertEntry.run(
    "entry-shared-demo",
    "patient-ana",
    "Antes de uma apresentação",
    "Eu me preparava para apresentar um trabalho importante.",
    "Aperto no peito e ombros tensos.",
    "Posso esquecer o que ensaiei.",
    "Revisar tudo mais uma vez.",
    "Ansiedade",
    6,
    "Talvez eu precise de preparação suficiente, sem buscar certeza total.",
    createdAt,
    createdAt,
    createdAt,
    null,
  );
  insertEntry.run(
    "entry-private-demo",
    "patient-ana",
    "Depois de uma conversa difícil",
    "A conversa terminou e eu ainda estava pensando no que gostaria de ter dito.",
    "Peso nos ombros e cansaço.",
    "Talvez eu tenha sido mal compreendida.",
    "Retomar o assunto imediatamente.",
    "Mágoa",
    5,
    "Talvez eu precise organizar melhor o que quero comunicar.",
    createdAt,
    createdAt,
    null,
    null,
  );
  insertEntry.run(
    "entry-other-patient",
    "patient-bruno",
    "Início de uma semana corrida",
    "Percebi muitas tarefas acumuladas logo pela manhã.",
    "",
    "",
    "",
    "",
    0,
    "",
    createdAt,
    createdAt,
    null,
    null,
  );
}

initializeDatabase();

// Atualiza somente a conta profissional criada por versões anteriores do protótipo.
database
  .prepare("UPDATE users SET email = ? WHERE id = ? AND email = ?")
  .run("psico.mateus@outlook.com", "therapist-demo", "profissional@exemplo.local");

function securityHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, { ...securityHeaders(), ...extraHeaders });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) reject(new Error("PAYLOAD_TOO_LARGE"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    request.on("error", reject);
  });
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const position = part.indexOf("=");
        return [part.slice(0, position), decodeURIComponent(part.slice(position + 1))];
      }),
  );
}

function currentSession(request) {
  const sessionToken = parseCookies(request).portal_session;
  if (!sessionToken) return null;
  return (
    database
      .prepare(`
        SELECT sessions.token_hash, sessions.csrf_token, sessions.expires_at,
               users.id AS user_id, users.name, users.email, users.role
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      `)
      .get(tokenHash(sessionToken), now()) || null
  );
}

function requireSession(request, response, role) {
  const session = currentSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Faça login para continuar." });
    return null;
  }
  if (role && session.role !== role) {
    sendJson(response, 403, { error: "Esta ação não está disponível para este perfil." });
    return null;
  }
  return session;
}

function requireCsrf(request, response, session) {
  if (request.headers["x-csrf-token"] !== session.csrf_token) {
    sendJson(response, 403, { error: "A sessão não pôde confirmar esta ação." });
    return false;
  }
  return true;
}

function logAccess(userId, action, resourceType, resourceId = null) {
  database
    .prepare(`
      INSERT INTO access_logs (id, user_id, action, resource_type, resource_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(identifier(), userId, action, resourceType, resourceId, now());
}

function publicUser(session) {
  return { id: session.user_id, name: session.name, email: session.email, role: session.role };
}

function userPayload(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function createSessionFor(user) {
  const sessionToken = token();
  const csrfToken = token();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString();
  database
    .prepare(`
      INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(tokenHash(sessionToken), user.id, csrfToken, expiresAt, now());
  return {
    payload: { user: userPayload(user), csrf: csrfToken },
    cookie: `portal_session=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/espaco/; Max-Age=28800`,
  };
}

function cleanText(value, maximum) {
  return String(value || "").trim().slice(0, maximum);
}

function validateAccount(input) {
  const name = cleanText(input.name, 100).replace(/\s+/g, " ");
  const email = cleanText(input.email, 180).toLowerCase();
  const password = String(input.password || "");
  if (name.length < 2) return { error: "Informe seu nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe um e-mail válido." };
  if (password.length > 200 || password.length < 12 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return { error: "Use uma senha com pelo menos 12 caracteres, incluindo letras e números." };
  }
  if (input.adult_confirmation !== true) {
    return { error: "Confirme que você tem 18 anos ou mais para criar a conta nesta etapa." };
  }
  return { account: { name, email, password } };
}

function validateNewPassword(value) {
  const password = String(value || "");
  if (password.length > 200 || password.length < 12 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return "Use uma senha nova com pelo menos 12 caracteres, incluindo letras e números.";
  }
  return null;
}

function validateEntry(input) {
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
  if (!entry.title || !entry.happened) return { error: "Preencha o título e o que aconteceu." };
  if (!Number.isInteger(entry.intensity) || entry.intensity < 0 || entry.intensity > 10) {
    return { error: "A intensidade precisa estar entre 0 e 10." };
  }
  return { entry };
}

function listEntriesFor(session) {
  if (session.role === "patient") {
    return database
      .prepare(`
        SELECT id, title, happened, body, thoughts, urge, emotion, intensity, message,
               created_at, updated_at, shared_at, revoked_at
        FROM entries
        WHERE patient_id = ?
        ORDER BY created_at DESC
      `)
      .all(session.user_id);
  }
  logAccess(session.user_id, "view_shared_entries", "entry_list");
  return database
    .prepare(`
      SELECT entries.id, entries.title, entries.happened, entries.body, entries.thoughts,
             entries.urge, entries.emotion, entries.intensity, entries.message,
             entries.created_at, entries.updated_at, entries.shared_at, users.name AS patient_name
      FROM entries
      JOIN users ON users.id = entries.patient_id
      JOIN therapist_patient_links AS links ON links.patient_id = entries.patient_id
      WHERE links.therapist_id = ? AND links.status = 'active'
        AND entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
      ORDER BY entries.shared_at DESC
    `)
    .all(session.user_id);
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, mode: "local-prototype" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    const session = currentSession(request);
    sendJson(response, 200, session ? { user: publicUser(session), csrf: session.csrf_token } : { user: null });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const input = await readJson(request);
    const email = cleanText(input.email, 180).toLowerCase();
    const user = database.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !passwordMatches(String(input.password || ""), user.password_salt, user.password_hash)) {
      sendJson(response, 401, { error: "E-mail ou senha inválidos." });
      return;
    }
    const session = createSessionFor(user);
    logAccess(user.id, "login", "session");
    sendJson(response, 200, session.payload, { "Set-Cookie": session.cookie });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/register") {
    const validation = validateAccount(await readJson(request));
    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }
    const account = validation.account;
    if (database.prepare("SELECT id FROM users WHERE email = ?").get(account.email)) {
      sendJson(response, 409, { error: "Este e-mail já está cadastrado." });
      return;
    }
    const therapist = database
      .prepare("SELECT id FROM users WHERE role = 'therapist' ORDER BY created_at LIMIT 1")
      .get();
    if (!therapist) {
      sendJson(response, 503, { error: "O cadastro está temporariamente indisponível." });
      return;
    }
    const patientId = `patient-${identifier()}`;
    const createdAt = now();
    const password = passwordRecord(account.password);
    try {
      database.exec("BEGIN IMMEDIATE");
      database
        .prepare(`
          INSERT INTO users (id, name, email, role, password_salt, password_hash, created_at)
          VALUES (?, ?, ?, 'patient', ?, ?, ?)
        `)
        .run(patientId, account.name, account.email, password.salt, password.hash, createdAt);
      database
        .prepare(`
          INSERT INTO therapist_patient_links
            (id, therapist_id, patient_id, status, created_at)
          VALUES (?, ?, ?, 'active', ?)
        `)
        .run(identifier(), therapist.id, patientId, createdAt);
      database.exec("COMMIT");
    } catch {
      database.exec("ROLLBACK");
      sendJson(response, 409, { error: "Não foi possível criar a conta com estes dados." });
      return;
    }
    const user = database.prepare("SELECT * FROM users WHERE id = ?").get(patientId);
    const session = createSessionFor(user);
    logAccess(user.id, "register", "account");
    sendJson(response, 201, session.payload, { "Set-Cookie": session.cookie });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const session = requireSession(request, response);
    if (!session || !requireCsrf(request, response, session)) return;
    logAccess(session.user_id, "logout", "session");
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(session.token_hash);
    sendJson(response, 200, { ok: true }, { "Set-Cookie": "portal_session=; HttpOnly; SameSite=Strict; Path=/espaco/; Max-Age=0" });
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/account/password") {
    const session = requireSession(request, response);
    if (!session || !requireCsrf(request, response, session)) return;
    const input = await readJson(request);
    const user = database.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);
    if (!passwordMatches(String(input.current_password || ""), user.password_salt, user.password_hash)) {
      sendJson(response, 400, { error: "A senha atual não confere." });
      return;
    }
    const passwordError = validateNewPassword(input.new_password);
    if (passwordError) {
      sendJson(response, 400, { error: passwordError });
      return;
    }
    if (String(input.current_password) === String(input.new_password)) {
      sendJson(response, 400, { error: "Escolha uma senha diferente da atual." });
      return;
    }
    const password = passwordRecord(String(input.new_password));
    database
      .prepare("UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?")
      .run(password.salt, password.hash, user.id);
    database
      .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
      .run(user.id, session.token_hash);
    logAccess(user.id, "change_password", "account");
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/entries") {
    const session = requireSession(request, response);
    if (!session) return;
    sendJson(response, 200, { entries: listEntriesFor(session) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/entries") {
    const session = requireSession(request, response, "patient");
    if (!session || !requireCsrf(request, response, session)) return;
    const validation = validateEntry(await readJson(request));
    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }
    const entryId = identifier();
    const timestamp = now();
    const entry = validation.entry;
    database
      .prepare(`
        INSERT INTO entries
          (id, patient_id, title, happened, body, thoughts, urge, emotion, intensity,
           message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entryId,
        session.user_id,
        entry.title,
        entry.happened,
        entry.body,
        entry.thoughts,
        entry.urge,
        entry.emotion,
        entry.intensity,
        entry.message,
        timestamp,
        timestamp,
      );
    logAccess(session.user_id, "create", "entry", entryId);
    sendJson(response, 201, { id: entryId });
    return;
  }

  const sharingMatch = url.pathname.match(/^\/api\/entries\/([A-Za-z0-9_-]+)\/sharing$/);
  if (request.method === "PATCH" && sharingMatch) {
    const session = requireSession(request, response, "patient");
    if (!session || !requireCsrf(request, response, session)) return;
    const entry = database.prepare("SELECT id FROM entries WHERE id = ? AND patient_id = ?").get(sharingMatch[1], session.user_id);
    if (!entry) {
      sendJson(response, 404, { error: "Registro não encontrado." });
      return;
    }
    const input = await readJson(request);
    if (typeof input.shared !== "boolean") {
      sendJson(response, 400, { error: "Informe o estado do compartilhamento." });
      return;
    }
    const timestamp = now();
    if (input.shared) {
      database.prepare("UPDATE entries SET shared_at = ?, revoked_at = NULL, updated_at = ? WHERE id = ?").run(timestamp, timestamp, entry.id);
      logAccess(session.user_id, "share", "entry", entry.id);
    } else {
      database.prepare("UPDATE entries SET revoked_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, entry.id);
      logAccess(session.user_id, "revoke_sharing", "entry", entry.id);
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  const entryMatch = url.pathname.match(/^\/api\/entries\/([A-Za-z0-9_-]+)$/);
  if (request.method === "DELETE" && entryMatch) {
    const session = requireSession(request, response, "patient");
    if (!session || !requireCsrf(request, response, session)) return;
    const entry = database.prepare("SELECT id FROM entries WHERE id = ? AND patient_id = ?").get(entryMatch[1], session.user_id);
    if (!entry) {
      sendJson(response, 404, { error: "Registro não encontrado." });
      return;
    }
    database.prepare("DELETE FROM entries WHERE id = ?").run(entry.id);
    logAccess(session.user_id, "delete", "entry", entry.id);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export") {
    const session = requireSession(request, response, "patient");
    if (!session) return;
    const entries = listEntriesFor(session);
    logAccess(session.user_id, "export", "entry_list");
    response.writeHead(200, {
      ...securityHeaders("application/json; charset=utf-8"),
      "Content-Disposition": 'attachment; filename="meus-registros.json"',
    });
    response.end(JSON.stringify({ exported_at: now(), prototype: true, user: publicUser(session), entries }, null, 2));
    return;
  }

  sendJson(response, 404, { error: "Recurso não encontrado." });
}

const portalFiles = new Map([
  ["/espaco/", [join(publicDirectory, "index.html"), "text/html; charset=utf-8"]],
  ["/espaco/styles.css", [join(publicDirectory, "styles.css"), "text/css; charset=utf-8"]],
  ["/espaco/app.js", [join(publicDirectory, "app.js"), "text/javascript; charset=utf-8"]],
  ["/espaco/brand-logo.svg", [join(repositoryRoot, "assets/images/logo-mateus.svg"), "image/svg+xml"]],
]);

function servePortalStatic(response, pathname) {
  const file = portalFiles.get(pathname);
  response.writeHead(200, securityHeaders(file[1]));
  response.end(readFileSync(file[0]));
}

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);

const publicRootFiles = new Set([
  "/",
  "/index.html",
  "/404.html",
  "/robots.txt",
  "/sitemap.xml",
  "/sw.js",
]);
const publicDirectories = [
  "/assets/",
  "/cuidados/",
  "/guia/",
  "/guia-emocoes/",
  "/privacidade/",
];

function serveRepositoryStatic(response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Endereço inválido.");
    return;
  }
  const isPublicPath =
    publicRootFiles.has(decodedPath) ||
    publicDirectories.some(
      (prefix) => decodedPath === prefix.slice(0, -1) || decodedPath.startsWith(prefix),
    );
  if (!isPublicPath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Página não encontrada.");
    return;
  }
  const requested = resolve(repositoryRoot, `.${decodedPath}`);
  if (requested !== repositoryRoot && !requested.startsWith(`${repositoryRoot}${sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Acesso negado.");
    return;
  }
  const filePath = existsSync(requested) && statSync(requested).isDirectory()
    ? join(requested, "index.html")
    : requested;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Página não encontrada.");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(readFileSync(filePath));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  try {
    if (url.pathname === "/espaco") {
      response.writeHead(308, { Location: "/espaco/" });
      response.end();
    } else if (url.pathname.startsWith("/espaco/api/")) {
      const apiUrl = new URL(url);
      apiUrl.pathname = apiUrl.pathname.slice("/espaco".length);
      await handleApi(request, response, apiUrl);
    } else if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else if (request.method === "GET" && portalFiles.has(url.pathname)) {
      servePortalStatic(response, url.pathname);
    } else if (request.method === "GET") serveRepositoryStatic(response, url.pathname);
    else sendJson(response, 405, { error: "Método não permitido." }, { Allow: "GET" });
  } catch (error) {
    const status = error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    sendJson(response, status, { error: status === 413 ? "Conteúdo muito grande." : "Não foi possível processar a solicitação." });
  }
});

server.listen(port, host, () => {
  console.log(`Site e portal de teste disponíveis em http://${host}:${port}`);
  console.log(`Registros entre sessões: http://${host}:${port}/espaco/`);
  console.log("Ainda não use informações clínicas reais.");
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
