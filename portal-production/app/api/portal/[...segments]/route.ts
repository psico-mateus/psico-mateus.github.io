import { cleanupExpired, ensureSchema, getPortalEnv } from "@/db/runtime";
import {
  codeHash,
  createInvitationCode,
  createRecoveryCode,
  createTotpSecret,
  decrypt,
  derivePassword,
  emailHash,
  encrypt,
  identifier,
  normalizeEmail,
  passwordMatches,
  totpUri,
  verifyTotp,
} from "@/lib/crypto";
import {
  PRIVACY_VERSION,
  PortalError,
  audit,
  checkRateLimit,
  cleanText,
  clearSessionCookie,
  createSession,
  currentSession,
  now,
  readJson,
  requireCsrf,
  requireSession,
  userByEmail,
  validateEmail,
  validateEntry,
  validatePassword,
  type UserRow,
} from "@/lib/portal";

type RouteContext = { params: Promise<{ segments?: string[] }> };
type Input = Record<string, unknown>;

function json(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function noContent(headers: HeadersInit = {}): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...headers } });
}

function pathOf(segments: string[] | undefined): string {
  return `/${(segments ?? []).join("/")}`;
}

async function setupStatus() {
  const { DB } = getPortalEnv();
  const row = await DB.prepare(
    "SELECT status FROM users WHERE role = 'therapist' ORDER BY created_at LIMIT 1",
  ).first<{ status: string }>();
  return { configured: row?.status === "active", pending: row?.status === "pending_mfa" };
}

async function createTherapistSetup(request: Request, input: Input): Promise<Response> {
  const { DB, APP_SECRET, SETUP_SECRET } = getPortalEnv();
  await checkRateLimit(request, "setup", "professional", 5, 30 * 60);
  if (String(input.setup_secret ?? "") !== SETUP_SECRET) {
    throw new PortalError(403, "Código de configuração inválido.");
  }
  const existing = await DB.prepare("SELECT id, status FROM users WHERE role = 'therapist' LIMIT 1")
    .first<{ id: string; status: string }>();
  if (existing?.status === "active") {
    throw new PortalError(409, "A conta profissional já foi configurada.");
  }
  if (existing) {
    await DB.prepare("DELETE FROM users WHERE id = ? AND status = 'pending_mfa'").bind(existing.id).run();
  }

  const name = cleanText(input.name, 100).replace(/\s+/gu, " ");
  if (name.length < 2) throw new PortalError(400, "Informe como seu nome deve aparecer.");
  const email = validateEmail(input.email);
  const password = validatePassword(input.password);
  const passwordRecord = await derivePassword(password);
  const recoveryCode = createRecoveryCode();
  const recoveryRecord = await derivePassword(recoveryCode);
  const totpSecret = createTotpSecret();
  const userId = identifier("therapist");
  const createdAt = now();

  await DB.prepare(
    `INSERT INTO users
      (id, display_name, email_hash, role, status, password_salt, password_hash,
       password_iterations, recovery_salt, recovery_hash, totp_secret, totp_enabled,
       privacy_version, created_at)
     VALUES (?, ?, ?, 'therapist', 'pending_mfa', ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      userId,
      name,
      await emailHash(APP_SECRET, email),
      passwordRecord.salt,
      passwordRecord.hash,
      passwordRecord.iterations,
      recoveryRecord.salt,
      recoveryRecord.hash,
      await encrypt(APP_SECRET, totpSecret),
      PRIVACY_VERSION,
      createdAt,
    )
    .run();
  await audit(userId, "start_professional_setup", "account");
  return json(
    {
      recovery_code: recoveryCode,
      totp_secret: totpSecret,
      totp_uri: totpUri(totpSecret, email),
      message: "Guarde o código de recuperação e confirme o autenticador.",
    },
    201,
  );
}

async function confirmTherapistSetup(request: Request, input: Input): Promise<Response> {
  const { DB, APP_SECRET, SETUP_SECRET } = getPortalEnv();
  await checkRateLimit(request, "setup-confirm", "professional", 8, 30 * 60);
  if (String(input.setup_secret ?? "") !== SETUP_SECRET) {
    throw new PortalError(403, "Código de configuração inválido.");
  }
  const email = validateEmail(input.email);
  const user = await userByEmail(email);
  if (!user || user.role !== "therapist" || user.status !== "pending_mfa" || !user.totp_secret) {
    throw new PortalError(400, "Não há uma configuração pendente para este acesso.");
  }
  const secret = await decrypt(APP_SECRET, user.totp_secret);
  const verification = await verifyTotp(secret, String(input.totp ?? ""), null);
  if (!verification.valid || verification.counter === null) {
    throw new PortalError(400, "O código do autenticador não confere.");
  }
  await DB.prepare(
    `UPDATE users SET status = 'active', totp_enabled = 1, last_totp_counter = ? WHERE id = ?`,
  )
    .bind(verification.counter, user.id)
    .run();
  const activeUser = (await DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>()) as UserRow;
  const session = await createSession(request, activeUser);
  await audit(user.id, "complete_professional_setup", "account");
  return json(
    { user: session.user, csrf: session.csrf },
    200,
    { "Set-Cookie": session.cookie },
  );
}

async function login(request: Request, input: Input): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const email = validateEmail(input.email);
  await checkRateLimit(request, "login", normalizeEmail(email));
  const user = await userByEmail(email);
  const genericError = new PortalError(401, "E-mail, senha ou código inválidos.");
  if (!user || user.status !== "active") throw genericError;
  if (
    !(await passwordMatches(
      String(input.password ?? ""),
      user.password_salt,
      user.password_hash,
      user.password_iterations,
    ))
  ) {
    throw genericError;
  }
  if (user.role === "therapist") {
    if (!user.totp_secret || !user.totp_enabled) throw genericError;
    const secret = await decrypt(APP_SECRET, user.totp_secret);
    const verification = await verifyTotp(
      secret,
      String(input.totp ?? ""),
      user.last_totp_counter,
    );
    if (!verification.valid || verification.counter === null) throw genericError;
    await DB.prepare("UPDATE users SET last_totp_counter = ? WHERE id = ?")
      .bind(verification.counter, user.id)
      .run();
  }
  const session = await createSession(request, user);
  await DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now(), user.id).run();
  await audit(user.id, "login", "session");
  return json(
    { user: session.user, csrf: session.csrf },
    200,
    { "Set-Cookie": session.cookie },
  );
}

async function register(request: Request, input: Input): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const email = validateEmail(input.email);
  await checkRateLimit(request, "register", normalizeEmail(email), 6, 30 * 60);
  const name = cleanText(input.name, 100).replace(/\s+/gu, " ");
  if (name.length < 2) throw new PortalError(400, "Informe como prefere ser chamado(a).");
  const password = validatePassword(input.password);
  if (input.adult_confirmation !== true) {
    throw new PortalError(400, "Confirme que você tem 18 anos ou mais.");
  }
  if (input.privacy_confirmation !== true) {
    throw new PortalError(400, "Leia e aceite o aviso de privacidade para criar a conta.");
  }
  const invitationHash = await codeHash(APP_SECRET, String(input.invitation_code ?? ""), "invite");
  const invitation = await DB.prepare(
    `SELECT invitations.id, invitations.therapist_id
     FROM invitations
     JOIN users ON users.id = invitations.therapist_id
     WHERE invitations.code_hash = ? AND invitations.used_at IS NULL
       AND invitations.revoked_at IS NULL AND invitations.expires_at > ?
       AND users.status = 'active'`,
  )
    .bind(invitationHash, now())
    .first<{ id: string; therapist_id: string }>();
  if (!invitation) throw new PortalError(400, "O convite é inválido ou expirou.");
  const hashedEmail = await emailHash(APP_SECRET, email);
  if (await DB.prepare("SELECT id FROM users WHERE email_hash = ?").bind(hashedEmail).first()) {
    throw new PortalError(409, "Já existe uma conta com este e-mail.");
  }

  const passwordRecord = await derivePassword(password);
  const recoveryCode = createRecoveryCode();
  const recoveryRecord = await derivePassword(recoveryCode);
  const patientId = identifier("patient");
  const timestamp = now();
  await DB.batch([
    DB.prepare(
      `INSERT INTO users
        (id, display_name, email_hash, role, status, password_salt, password_hash,
         password_iterations, recovery_salt, recovery_hash, totp_enabled,
         privacy_version, adult_confirmed_at, created_at)
       VALUES (?, ?, ?, 'patient', 'active', ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(
      patientId,
      name,
      hashedEmail,
      passwordRecord.salt,
      passwordRecord.hash,
      passwordRecord.iterations,
      recoveryRecord.salt,
      recoveryRecord.hash,
      PRIVACY_VERSION,
      timestamp,
      timestamp,
    ),
    DB.prepare(
      `INSERT INTO patient_links (id, therapist_id, patient_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
    ).bind(identifier("link"), invitation.therapist_id, patientId, timestamp),
    DB.prepare(
      "UPDATE invitations SET used_at = ?, patient_id = ? WHERE id = ? AND used_at IS NULL",
    ).bind(timestamp, patientId, invitation.id),
  ]);
  const patient = (await DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(patientId)
    .first<UserRow>()) as UserRow;
  const session = await createSession(request, patient);
  await audit(patientId, "register", "account");
  return json(
    { user: session.user, csrf: session.csrf, recovery_code: recoveryCode },
    201,
    { "Set-Cookie": session.cookie },
  );
}

async function recoverAccount(request: Request, input: Input): Promise<Response> {
  const { DB } = getPortalEnv();
  const email = validateEmail(input.email);
  await checkRateLimit(request, "recover", normalizeEmail(email), 5, 60 * 60);
  const user = await userByEmail(email);
  const genericError = new PortalError(400, "Não foi possível confirmar o código de recuperação.");
  if (!user || user.status !== "active") throw genericError;
  if (
    !(await passwordMatches(
      String(input.recovery_code ?? ""),
      user.recovery_salt,
      user.recovery_hash,
      user.password_iterations,
    ))
  ) {
    throw genericError;
  }
  const assistedRecovery = await DB.prepare(
    "SELECT expires_at FROM assisted_recovery_grants WHERE user_id = ?",
  )
    .bind(user.id)
    .first<{ expires_at: string }>();
  if (assistedRecovery && assistedRecovery.expires_at <= now()) throw genericError;
  const newPassword = validatePassword(input.new_password);
  const passwordRecord = await derivePassword(newPassword);
  const newRecoveryCode = createRecoveryCode();
  const recoveryRecord = await derivePassword(newRecoveryCode);
  await DB.batch([
    DB.prepare(
      `UPDATE users SET password_salt = ?, password_hash = ?, password_iterations = ?,
        recovery_salt = ?, recovery_hash = ? WHERE id = ?`,
    ).bind(
      passwordRecord.salt,
      passwordRecord.hash,
      passwordRecord.iterations,
      recoveryRecord.salt,
      recoveryRecord.hash,
      user.id,
    ),
    DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    DB.prepare("DELETE FROM assisted_recovery_grants WHERE user_id = ?").bind(user.id),
  ]);
  await audit(user.id, "recover_account", "account");
  return json({ ok: true, recovery_code: newRecoveryCode });
}

async function listEntries(session: Awaited<ReturnType<typeof requireSession>>) {
  const { DB } = getPortalEnv();
  if (session.role === "patient") {
    const result = await DB.prepare(
      `SELECT id, title, happened, body, thoughts, urge, emotion, intensity, message,
              created_at, updated_at, shared_at, revoked_at
       FROM entries WHERE patient_id = ? ORDER BY created_at DESC`,
    )
      .bind(session.userId)
      .all();
    return result.results;
  }
  await audit(session.userId, "view_shared_entries", "entry_list");
  const result = await DB.prepare(
    `SELECT entries.id, entries.title, entries.happened, entries.body, entries.thoughts,
            entries.urge, entries.emotion, entries.intensity, entries.message,
            entries.created_at, entries.updated_at, entries.shared_at,
            users.display_name AS patient_name
     FROM entries
     JOIN users ON users.id = entries.patient_id
     JOIN patient_links ON patient_links.patient_id = entries.patient_id
     WHERE patient_links.therapist_id = ? AND patient_links.status = 'active'
       AND entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
     ORDER BY entries.shared_at DESC`,
  )
    .bind(session.userId)
    .all();
  return result.results;
}

async function listSharedPatients(
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const { DB } = getPortalEnv();
  const result = await DB.prepare(
    `SELECT entries.patient_id,
            users.display_name AS patient_name,
            COUNT(entries.id) AS shared_count,
            SUM(
              CASE
                WHEN entry_views.viewed_at IS NULL
                  OR entry_views.viewed_at < CASE
                    WHEN entries.updated_at > entries.shared_at
                      THEN entries.updated_at
                    ELSE entries.shared_at
                  END
                THEN 1
                ELSE 0
              END
            ) AS unread_count,
            MAX(entries.shared_at) AS latest_shared_at
     FROM entries
     JOIN users ON users.id = entries.patient_id
     JOIN patient_links ON patient_links.patient_id = entries.patient_id
     LEFT JOIN entry_views
       ON entry_views.entry_id = entries.id
      AND entry_views.therapist_id = ?
     WHERE patient_links.therapist_id = ? AND patient_links.status = 'active'
       AND users.status = 'active'
       AND entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
     GROUP BY entries.patient_id, users.display_name
     ORDER BY unread_count DESC, latest_shared_at DESC`,
  )
    .bind(session.userId, session.userId)
    .all();
  await audit(session.userId, "view_shared_patients", "patient_list");
  return result.results;
}

async function listPatientAccesses(
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const { DB } = getPortalEnv();
  const result = await DB.prepare(
    `SELECT users.id AS patient_id,
            users.display_name AS patient_name,
            CASE
              WHEN users.status = 'active' AND patient_links.status = 'active'
                THEN 'active'
              ELSE 'revoked'
            END AS access_status,
            patient_links.created_at,
            patient_links.closed_at AS revoked_at,
            users.last_login_at,
            COALESCE(SUM(
              CASE
                WHEN entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
                  THEN 1
                ELSE 0
              END
            ), 0) AS shared_count
     FROM patient_links
     JOIN users ON users.id = patient_links.patient_id
     LEFT JOIN entries ON entries.patient_id = users.id
     WHERE patient_links.therapist_id = ? AND users.role = 'patient'
     GROUP BY users.id, users.display_name, users.status, patient_links.status,
              patient_links.created_at, patient_links.closed_at, users.last_login_at
     ORDER BY
       CASE
         WHEN users.status = 'active' AND patient_links.status = 'active' THEN 0
         ELSE 1
       END,
       users.display_name COLLATE NOCASE,
       users.id`,
  )
    .bind(session.userId)
    .all();
  await audit(session.userId, "view_patient_accesses", "patient_access_list");
  return result.results;
}

async function listSharedEntriesForPatient(
  session: Awaited<ReturnType<typeof requireSession>>,
  patientId: string,
) {
  const { DB } = getPortalEnv();
  const result = await DB.prepare(
    `SELECT entries.id, entries.title, entries.happened, entries.body,
            entries.thoughts, entries.urge, entries.emotion, entries.intensity,
            entries.message, entries.created_at, entries.updated_at, entries.shared_at,
            entry_views.viewed_at,
            CASE
              WHEN entry_views.viewed_at IS NULL
                OR entry_views.viewed_at < CASE
                  WHEN entries.updated_at > entries.shared_at
                    THEN entries.updated_at
                  ELSE entries.shared_at
                END
              THEN 1
              ELSE 0
            END AS is_unread
     FROM entries
     JOIN users ON users.id = entries.patient_id
     JOIN patient_links ON patient_links.patient_id = entries.patient_id
     LEFT JOIN entry_views
       ON entry_views.entry_id = entries.id
      AND entry_views.therapist_id = ?
     WHERE patient_links.therapist_id = ? AND patient_links.patient_id = ?
       AND patient_links.status = 'active' AND users.status = 'active'
       AND entries.patient_id = ?
       AND entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
     ORDER BY is_unread DESC, entries.shared_at DESC`,
  )
    .bind(session.userId, session.userId, patientId, patientId)
    .all();
  await audit(session.userId, "view_shared_entries", "patient_entries", patientId);
  return result.results;
}

async function handleGet(request: Request, path: string): Promise<Response> {
  const { DB, PUBLIC_SITE_URL, GUIDE_URL } = getPortalEnv();
  if (path === "/health") return json({ ok: true, mode: "production" });
  if (path === "/config") {
    return json({
      ...(await setupStatus()),
      privacy_version: PRIVACY_VERSION,
      public_site_url: PUBLIC_SITE_URL ?? "https://psico-mateus.github.io/",
      guide_url: GUIDE_URL ?? "https://psico-mateus.github.io/guia-emocoes/",
    });
  }
  if (path === "/session") {
    const session = await currentSession(request);
    return json(
      session
        ? { user: { id: session.userId, name: session.name, role: session.role }, csrf: session.csrfToken }
        : { user: null },
    );
  }
  if (path === "/entries") {
    const session = await requireSession(request);
    return json({ entries: await listEntries(session) });
  }
  if (path === "/professional/patients") {
    const session = await requireSession(request, "therapist");
    return json({ patients: await listSharedPatients(session) });
  }
  if (path === "/professional/accesses") {
    const session = await requireSession(request, "therapist");
    return json({ patients: await listPatientAccesses(session) });
  }
  const professionalEntries = path.match(
    /^\/professional\/patients\/([A-Za-z0-9_-]+)\/entries$/u,
  );
  if (professionalEntries) {
    const session = await requireSession(request, "therapist");
    return json({
      entries: await listSharedEntriesForPatient(session, professionalEntries[1]),
    });
  }
  if (path === "/invitations") {
    const session = await requireSession(request, "therapist");
    const timestamp = now();
    const result = await DB.prepare(
      `SELECT id, expires_at, created_at, used_at, revoked_at,
              CASE
                WHEN used_at IS NOT NULL THEN 'used'
                WHEN revoked_at IS NOT NULL THEN 'revoked'
                WHEN expires_at <= ? THEN 'expired'
                ELSE 'active'
              END AS status
       FROM invitations
       WHERE therapist_id = ?
       ORDER BY created_at DESC`,
    )
      .bind(timestamp, session.userId)
      .all();
    return json({ invitations: result.results, status_at: timestamp });
  }
  if (path === "/export") {
    const session = await requireSession(request, "patient");
    const entries = await listEntries(session);
    await audit(session.userId, "export", "entry_list");
    return json(
      {
        exported_at: now(),
        description: "Cópia dos Registros entre sessões exportada pelo titular.",
        entries,
      },
      200,
      { "Content-Disposition": 'attachment; filename="meus-registros.json"' },
    );
  }
  throw new PortalError(404, "Recurso não encontrado.");
}

async function handlePost(request: Request, path: string): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const input = await readJson(request);
  if (path === "/setup") return createTherapistSetup(request, input);
  if (path === "/setup/confirm") return confirmTherapistSetup(request, input);
  if (path === "/login") return login(request, input);
  if (path === "/register") return register(request, input);
  if (path === "/recover") return recoverAccount(request, input);
  const viewedEntry = path.match(
    /^\/professional\/entries\/([A-Za-z0-9_-]+)\/viewed$/u,
  );
  if (viewedEntry) {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    const entry = await DB.prepare(
      `SELECT entries.id
       FROM entries
       JOIN users ON users.id = entries.patient_id
       JOIN patient_links ON patient_links.patient_id = entries.patient_id
       WHERE entries.id = ?
         AND patient_links.therapist_id = ?
         AND patient_links.status = 'active'
         AND users.status = 'active'
         AND entries.shared_at IS NOT NULL
         AND entries.revoked_at IS NULL`,
    )
      .bind(viewedEntry[1], session.userId)
      .first<{ id: string }>();
    if (!entry) throw new PortalError(404, "Registro compartilhado não encontrado.");
    const viewedAt = now();
    await DB.prepare(
      `INSERT INTO entry_views (entry_id, therapist_id, viewed_at)
       VALUES (?, ?, ?)
       ON CONFLICT(entry_id, therapist_id) DO UPDATE SET
         viewed_at = excluded.viewed_at`,
    )
      .bind(entry.id, session.userId, viewedAt)
      .run();
    await audit(session.userId, "mark_entry_viewed", "entry", entry.id);
    return json({ viewed_at: viewedAt });
  }
  const assistedRecovery = path.match(
    /^\/professional\/patients\/([A-Za-z0-9_-]+)\/recovery-code$/u,
  );
  if (assistedRecovery) {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    await checkRateLimit(request, "assisted-recovery", session.userId, 8, 60 * 60);
    const therapist = (await DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(session.userId)
      .first<UserRow>()) as UserRow;
    if (
      !(await passwordMatches(
        String(input.current_password ?? ""),
        therapist.password_salt,
        therapist.password_hash,
        therapist.password_iterations,
      ))
    ) {
      throw new PortalError(400, "A senha profissional não confere.");
    }
    if (!therapist.totp_secret || !therapist.totp_enabled) {
      throw new PortalError(400, "O MFA profissional não está configurado.");
    }
    const verification = await verifyTotp(
      await decrypt(APP_SECRET, therapist.totp_secret),
      String(input.totp ?? ""),
      therapist.last_totp_counter,
    );
    if (!verification.valid || verification.counter === null) {
      throw new PortalError(
        400,
        "O código do autenticador não confere. Se acabou de entrar, aguarde o próximo código.",
      );
    }
    const patient = await DB.prepare(
      `SELECT users.id, users.password_iterations
       FROM patient_links
       JOIN users ON users.id = patient_links.patient_id
       WHERE patient_links.therapist_id = ? AND patient_links.patient_id = ?
         AND patient_links.status = 'active' AND users.status = 'active'
         AND users.role = 'patient'`,
    )
      .bind(session.userId, assistedRecovery[1])
      .first<{ id: string; password_iterations: number }>();
    if (!patient) throw new PortalError(404, "Paciente ativo não encontrado.");

    const recoveryCode = createRecoveryCode();
    const recoveryRecord = await derivePassword(
      recoveryCode,
      undefined,
      patient.password_iterations,
    );
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    await DB.batch([
      DB.prepare(
        "UPDATE users SET recovery_salt = ?, recovery_hash = ? WHERE id = ?",
      ).bind(recoveryRecord.salt, recoveryRecord.hash, patient.id),
      DB.prepare(
        `INSERT INTO assisted_recovery_grants (user_id, issued_by, expires_at, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           issued_by = excluded.issued_by,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at`,
      ).bind(patient.id, session.userId, expiresAt, createdAt),
      DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(patient.id),
      DB.prepare("UPDATE users SET last_totp_counter = ? WHERE id = ?").bind(
        verification.counter,
        therapist.id,
      ),
    ]);
    await audit(
      session.userId,
      "issue_assisted_recovery",
      "patient_account",
      patient.id,
    );
    return json({ recovery_code: recoveryCode, expires_at: expiresAt }, 201);
  }
  if (path === "/logout") {
    const session = await requireSession(request);
    requireCsrf(request, session);
    await DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash).run();
    await audit(session.userId, "logout", "session");
    return noContent({ "Set-Cookie": clearSessionCookie(request) });
  }
  if (path === "/entries") {
    const session = await requireSession(request, "patient");
    requireCsrf(request, session);
    const entry = validateEntry(input);
    const entryId = identifier("entry");
    const timestamp = now();
    await DB.prepare(
      `INSERT INTO entries
        (id, patient_id, title, happened, body, thoughts, urge, emotion, intensity,
         message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        entryId,
        session.userId,
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
      )
      .run();
    await audit(session.userId, "create", "entry", entryId);
    return json({ id: entryId }, 201);
  }
  if (path === "/invitations") {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    const code = createInvitationCode();
    const invitationId = identifier("invite");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
    await DB.prepare(
      `INSERT INTO invitations (id, code_hash, therapist_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        invitationId,
        await codeHash(APP_SECRET, code, "invite"),
        session.userId,
        expiresAt,
        createdAt,
      )
      .run();
    await audit(session.userId, "create", "invitation", invitationId);
    return json({ id: invitationId, code, expires_at: expiresAt }, 201);
  }
  if (path === "/account/recovery-code") {
    const session = await requireSession(request);
    requireCsrf(request, session);
    const user = (await DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(session.userId)
      .first<UserRow>()) as UserRow;
    if (
      !(await passwordMatches(
        String(input.current_password ?? ""),
        user.password_salt,
        user.password_hash,
        user.password_iterations,
      ))
    ) {
      throw new PortalError(400, "A senha atual não confere.");
    }
    if (user.role === "therapist") {
      if (!user.totp_secret) throw new PortalError(400, "O MFA profissional não está configurado.");
      const verification = await verifyTotp(
        await decrypt(APP_SECRET, user.totp_secret),
        String(input.totp ?? ""),
        user.last_totp_counter,
      );
      if (!verification.valid || verification.counter === null) {
        throw new PortalError(400, "O código do autenticador não confere.");
      }
      await DB.prepare("UPDATE users SET last_totp_counter = ? WHERE id = ?")
        .bind(verification.counter, user.id)
        .run();
    }
    const recoveryCode = createRecoveryCode();
    const record = await derivePassword(recoveryCode);
    await DB.batch([
      DB.prepare("UPDATE users SET recovery_salt = ?, recovery_hash = ? WHERE id = ?")
        .bind(record.salt, record.hash, user.id),
      DB.prepare("DELETE FROM assisted_recovery_grants WHERE user_id = ?").bind(user.id),
    ]);
    await audit(user.id, "rotate_recovery_code", "account");
    return json({ recovery_code: recoveryCode });
  }
  throw new PortalError(404, "Recurso não encontrado.");
}

async function handlePatch(request: Request, path: string): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const input = await readJson(request);
  if (path === "/account/password") {
    const session = await requireSession(request);
    requireCsrf(request, session);
    const user = (await DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(session.userId)
      .first<UserRow>()) as UserRow;
    if (
      !(await passwordMatches(
        String(input.current_password ?? ""),
        user.password_salt,
        user.password_hash,
        user.password_iterations,
      ))
    ) {
      throw new PortalError(400, "A senha atual não confere.");
    }
    const newPassword = validatePassword(input.new_password);
    if (String(input.current_password ?? "") === newPassword) {
      throw new PortalError(400, "Escolha uma senha diferente da atual.");
    }
    if (user.role === "therapist") {
      if (!user.totp_secret) throw new PortalError(400, "O MFA profissional não está configurado.");
      const verification = await verifyTotp(
        await decrypt(APP_SECRET, user.totp_secret),
        String(input.totp ?? ""),
        user.last_totp_counter,
      );
      if (!verification.valid || verification.counter === null) {
        throw new PortalError(400, "O código do autenticador não confere.");
      }
      await DB.prepare("UPDATE users SET last_totp_counter = ? WHERE id = ?")
        .bind(verification.counter, user.id)
        .run();
    }
    const record = await derivePassword(newPassword);
    await DB.batch([
      DB.prepare(
        `UPDATE users SET password_salt = ?, password_hash = ?, password_iterations = ? WHERE id = ?`,
      ).bind(record.salt, record.hash, record.iterations, user.id),
      DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").bind(
        user.id,
        session.tokenHash,
      ),
    ]);
    await audit(user.id, "change_password", "account");
    return json({ ok: true });
  }

  const patientAccess = path.match(
    /^\/professional\/patients\/([A-Za-z0-9_-]+)\/access$/u,
  );
  if (patientAccess) {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    if (typeof input.active !== "boolean") {
      throw new PortalError(400, "Informe se o acesso deve ficar ativo.");
    }
    const patient = await DB.prepare(
      `SELECT users.id, users.status, patient_links.status AS link_status
       FROM patient_links
       JOIN users ON users.id = patient_links.patient_id
       WHERE patient_links.therapist_id = ? AND patient_links.patient_id = ?
         AND users.role = 'patient'`,
    )
      .bind(session.userId, patientAccess[1])
      .first<{ id: string; status: string; link_status: string }>();
    if (!patient) throw new PortalError(404, "Paciente não encontrado.");

    const timestamp = now();
    await DB.batch([
      DB.prepare("UPDATE users SET status = ? WHERE id = ? AND role = 'patient'").bind(
        input.active ? "active" : "disabled",
        patient.id,
      ),
      input.active
        ? DB.prepare(
            `UPDATE patient_links SET status = 'active', closed_at = NULL
             WHERE therapist_id = ? AND patient_id = ?`,
          ).bind(session.userId, patient.id)
        : DB.prepare(
            `UPDATE patient_links SET status = 'closed', closed_at = ?
             WHERE therapist_id = ? AND patient_id = ?`,
          ).bind(timestamp, session.userId, patient.id),
      DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(patient.id),
      DB.prepare(
        "UPDATE assisted_recovery_grants SET expires_at = ? WHERE user_id = ?",
      ).bind(timestamp, patient.id),
    ]);
    await audit(
      session.userId,
      input.active ? "restore_patient_access" : "revoke_patient_access",
      "patient_account",
      patient.id,
    );
    return json({
      ok: true,
      access_status: input.active ? "active" : "revoked",
    });
  }

  const sharing = path.match(/^\/entries\/([A-Za-z0-9_-]+)\/sharing$/u);
  if (sharing) {
    const session = await requireSession(request, "patient");
    requireCsrf(request, session);
    const entry = await DB.prepare("SELECT id FROM entries WHERE id = ? AND patient_id = ?")
      .bind(sharing[1], session.userId)
      .first<{ id: string }>();
    if (!entry) throw new PortalError(404, "Registro não encontrado.");
    if (typeof input.shared !== "boolean") {
      throw new PortalError(400, "Informe o estado do compartilhamento.");
    }
    const timestamp = now();
    if (input.shared) {
      await DB.prepare(
        "UPDATE entries SET shared_at = ?, revoked_at = NULL, updated_at = ? WHERE id = ?",
      )
        .bind(timestamp, timestamp, entry.id)
        .run();
      await audit(session.userId, "share", "entry", entry.id);
    } else {
      await DB.prepare("UPDATE entries SET revoked_at = ?, updated_at = ? WHERE id = ?")
        .bind(timestamp, timestamp, entry.id)
        .run();
      await audit(session.userId, "revoke_sharing", "entry", entry.id);
    }
    return json({ ok: true });
  }

  const entryMatch = path.match(/^\/entries\/([A-Za-z0-9_-]+)$/u);
  if (entryMatch) {
    const session = await requireSession(request, "patient");
    requireCsrf(request, session);
    const entry = await DB.prepare("SELECT id FROM entries WHERE id = ? AND patient_id = ?")
      .bind(entryMatch[1], session.userId)
      .first<{ id: string }>();
    if (!entry) throw new PortalError(404, "Registro não encontrado.");
    const values = validateEntry(input);
    await DB.prepare(
      `UPDATE entries SET title = ?, happened = ?, body = ?, thoughts = ?, urge = ?,
        emotion = ?, intensity = ?, message = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(
        values.title,
        values.happened,
        values.body,
        values.thoughts,
        values.urge,
        values.emotion,
        values.intensity,
        values.message,
        now(),
        entry.id,
      )
      .run();
    await audit(session.userId, "update", "entry", entry.id);
    return json({ ok: true });
  }

  throw new PortalError(404, "Recurso não encontrado.");
}

async function handleDelete(request: Request, path: string): Promise<Response> {
  const { DB } = getPortalEnv();
  const session = await requireSession(request);
  requireCsrf(request, session);
  const invitation = path.match(/^\/invitations\/([A-Za-z0-9_-]+)$/u);
  if (invitation) {
    if (session.role !== "therapist") throw new PortalError(403, "Ação não permitida.");
    const revokedAt = now();
    const result = await DB.prepare(
      `UPDATE invitations SET revoked_at = ?
       WHERE id = ? AND therapist_id = ? AND used_at IS NULL
         AND revoked_at IS NULL AND expires_at > ?`,
    )
      .bind(revokedAt, invitation[1], session.userId, revokedAt)
      .run();
    if (!result.meta.changes) {
      throw new PortalError(409, "Este convite já não está ativo. A lista foi atualizada.");
    }
    await audit(session.userId, "revoke", "invitation", invitation[1]);
    return noContent();
  }
  const entry = path.match(/^\/entries\/([A-Za-z0-9_-]+)$/u);
  if (entry) {
    if (session.role !== "patient") throw new PortalError(403, "Ação não permitida.");
    const result = await DB.prepare("DELETE FROM entries WHERE id = ? AND patient_id = ?")
      .bind(entry[1], session.userId)
      .run();
    if (!result.meta.changes) throw new PortalError(404, "Registro não encontrado.");
    await audit(session.userId, "delete", "entry", entry[1]);
    return noContent();
  }
  if (path === "/account") {
    if (session.role !== "patient") throw new PortalError(403, "A conta profissional não pode ser excluída aqui.");
    const input = await readJson(request);
    const user = (await DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(session.userId)
      .first<UserRow>()) as UserRow;
    if (
      !(await passwordMatches(
        String(input.current_password ?? ""),
        user.password_salt,
        user.password_hash,
        user.password_iterations,
      ))
    ) {
      throw new PortalError(400, "A senha atual não confere.");
    }
    await audit(user.id, "delete_account", "account");
    await DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
    return noContent({ "Set-Cookie": clearSessionCookie(request) });
  }
  throw new PortalError(404, "Recurso não encontrado.");
}

async function route(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  const path = pathOf(segments);
  try {
    await ensureSchema();
    if (Math.random() < 0.01) await cleanupExpired();
    if (request.method === "GET") return await handleGet(request, path);
    if (request.method === "POST") return await handlePost(request, path);
    if (request.method === "PATCH") return await handlePatch(request, path);
    if (request.method === "DELETE") return await handleDelete(request, path);
    return json({ error: "Método não permitido." }, 405, { Allow: "GET, POST, PATCH, DELETE" });
  } catch (error) {
    if (error instanceof PortalError) return json({ error: error.message }, error.status);
    return json({ error: "Não foi possível concluir a ação. Tente novamente." }, 500);
  }
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
