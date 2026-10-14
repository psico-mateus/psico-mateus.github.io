import { cleanupExpired, ensureSchema, getPortalEnv } from "@/db/runtime";
import {
  PASSWORD_ITERATIONS,
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
  randomToken,
  sha256,
  totpUri,
  verifyTotp,
} from "@/lib/crypto";
import {
  EntryThoughtReviewConflictError,
  attachThoughtReviews,
  deleteEntryThoughtReview,
  entryThoughtReviewSelectColumns,
  patchEntryThoughtReview,
  type EntryThoughtReviewJoinedColumns,
} from "@/lib/entry-thought-review";
import {
  PRIVACY_VERSION,
  PortalError,
  SESSION_SECONDS,
  audit,
  checkRateLimit,
  checkReauthenticationRateLimit,
  cleanText,
  clearSessionCookie,
  createSession,
  currentSession,
  now,
  prepareAudit,
  prepareSession,
  readJson,
  requireCsrf,
  requireSession,
  requireTrustedOrigin,
  sessionCookie,
  userByEmail,
  validateEmail,
  validateEntry,
  validatePassword,
  type UserRow,
} from "@/lib/portal";
import {
  patchPatientMapDraft,
  readPatientMapDraft,
  resetPatientMapDraft,
} from "@/lib/patient-map-draft";
import {
  listPatientMapShares,
  listPatientMapShareCopies,
  listSharedPatientMaps,
  markPatientMapShareViewed,
  revokePatientMapShare,
  sharePatientMap,
} from "@/lib/patient-map-sharing";
import {
  createPatientDataExport,
  type PatientExportAccountRow,
  type PatientExportCareAccessRow,
  type PatientExportEntryRow,
} from "@/lib/patient-data-export";
import { exportPatientNotices, handlePatientNotices } from "@/lib/patient-notices";
import {
  createMfaTransferTicket,
  isValidMfaTransferTicket,
} from "@/lib/mfa-transfer";
import {
  createProfessionalMfaRecoverySet,
  createProfessionalMfaRecoveryTicket,
  hashProfessionalMfaRecoveryCode,
  openProfessionalMfaRecoveryTicket,
  type ProfessionalMfaRecoverySet,
} from "@/lib/professional-mfa-recovery";

type RouteContext = { params: Promise<{ segments?: string[] }> };
type Input = Record<string, unknown>;
type EntryQueryRow = Record<string, unknown> & EntryThoughtReviewJoinedColumns;
type PatientExportEntryDatabaseRow = Omit<PatientExportEntryRow, "thought_review"> &
  EntryThoughtReviewJoinedColumns;
type ProfessionalMfaRecoveryUserRow = UserRow & {
  mfa_recovery_set_id: string | null;
};
type ProfessionalMfaRecoveryCodeRow = {
  id: string;
  user_id: string;
  set_id: string;
  code_hash: string;
  created_at: string;
  used_at: string | null;
  invalidated_at: string | null;
};

// Valores públicos e sem relação com contas reais. Eles mantêm o mesmo custo de
// PBKDF2 quando o e-mail não existe, reduzindo o risco de revelar cadastros pelo tempo de resposta.
const DUMMY_PASSWORD_SALT = "AAAAAAAAAAAAAAAAAAAAAAAA";
const DUMMY_PASSWORD_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const DUMMY_TOTP_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const PROFESSIONAL_MFA_RECOVERY_ERROR =
  "Não foi possível recuperar o acesso profissional.";

class PortalOperationError extends Error {
  operation: string;

  constructor(operation: string, cause: unknown) {
    super("Portal operation failed.", { cause });
    this.name = "PortalOperationError";
    this.operation = operation;
  }
}

function technicalErrorType(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/u.test(error.name)) {
    return error.name.slice(0, 80);
  }
  return "UnknownError";
}

function technicalD1Code(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "object") {
      const code = "code" in current ? String(current.code) : "";
      if (/^[A-Za-z0-9_.:-]{1,80}$/u.test(code)) return code;
    }
    if (current instanceof Error) {
      const d1Code = current.message.match(/\bD1_[A-Z0-9_]+\b/u)?.[0];
      if (d1Code) return d1Code;
      current = current.cause;
    } else {
      break;
    }
  }
  return undefined;
}

function technicalRoute(path: string): string {
  const staticRoutes = new Set([
    "/health",
    "/config",
    "/session",
    "/setup",
    "/setup/confirm",
    "/login",
    "/register",
    "/recover",
    "/recover/mfa/start",
    "/recover/mfa/confirm",
    "/logout",
    "/entries",
    "/notices",
    "/map-draft",
    "/map-sharing",
    "/export",
    "/invitations",
    "/account",
    "/account/password",
    "/account/recovery-code",
    "/account/mfa-transfer",
    "/account/mfa-transfer/confirm",
    "/account/mfa-recovery-codes",
    "/account/sessions",
    "/professional/patients",
    "/professional/accesses",
  ]);
  if (staticRoutes.has(path)) return path;
  const dynamicRoutes: Array<[RegExp, string]> = [
    [/^\/notices\/[A-Za-z0-9_-]+\/read$/u, "/notices/:noticeId/read"],
    [/^\/professional\/patients\/[A-Za-z0-9_-]+\/notices$/u, "/professional/patients/:patientId/notices"],
    [/^\/professional\/patients\/[A-Za-z0-9_-]+\/notices\/[A-Za-z0-9_-]+$/u, "/professional/patients/:patientId/notices/:noticeId"],
    [
      /^\/entries\/[A-Za-z0-9_-]+\/thought-review$/u,
      "/entries/:entryId/thought-review",
    ],
    [/^\/entries\/[A-Za-z0-9_-]+\/sharing$/u, "/entries/:entryId/sharing"],
    [/^\/entries\/[A-Za-z0-9_-]+$/u, "/entries/:entryId"],
    [/^\/invitations\/[A-Za-z0-9_-]+$/u, "/invitations/:invitationId"],
    [
      /^\/professional\/entries\/[A-Za-z0-9_-]+\/viewed$/u,
      "/professional/entries/:entryId/viewed",
    ],
    [
      /^\/professional\/patients\/[A-Za-z0-9_-]+\/map-shares$/u,
      "/professional/patients/:patientId/map-shares",
    ],
    [
      /^\/professional\/patients\/[A-Za-z0-9_-]+\/map-shares\/[a-z0-9-]+\/viewed$/u,
      "/professional/patients/:patientId/map-shares/:mapId/viewed",
    ],
    [/^\/map-sharing\/[a-z0-9-]+$/u, "/map-sharing/:mapId"],
    [
      /^\/professional\/patients\/[A-Za-z0-9_-]+\/entries$/u,
      "/professional/patients/:patientId/entries",
    ],
    [
      /^\/professional\/patients\/[A-Za-z0-9_-]+\/recovery-code$/u,
      "/professional/patients/:patientId/recovery-code",
    ],
    [
      /^\/professional\/patients\/[A-Za-z0-9_-]+\/access$/u,
      "/professional/patients/:patientId/access",
    ],
  ];
  return dynamicRoutes.find(([pattern]) => pattern.test(path))?.[1] ?? "/unknown";
}

function logTechnicalFailure(
  path: string,
  error: unknown,
  startedAt: number,
): void {
  const operationError =
    error instanceof PortalOperationError ? error : null;
  const cause = operationError?.cause ?? error;
  console.error(
    JSON.stringify({
      event: "portal_request_failed",
      route: technicalRoute(path),
      operation: operationError?.operation ?? "request.dispatch",
      error_type: technicalErrorType(cause),
      d1_code: technicalD1Code(cause),
      status: 500,
      occurrence_id: identifier("incident"),
      duration_ms: Math.max(0, Date.now() - startedAt),
    }),
  );
}

function logMaintenanceFailure(error: unknown): void {
  console.error(
    JSON.stringify({
      event: "portal_maintenance_failed",
      operation: "cleanup.expired",
      error_type: technicalErrorType(error),
      d1_code: technicalD1Code(error),
      occurrence_id: identifier("incident"),
    }),
  );
}

async function portalOperation<T>(
  operation: string,
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw new PortalOperationError(operation, error);
  }
}

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

async function consumeActiveTherapistTotpCounter(
  user: Pick<UserRow, "id" | "last_totp_counter" | "password_hash" | "totp_secret">,
  counter: number,
): Promise<boolean> {
  const { DB } = getPortalEnv();
  // O contador pode coincidir depois de uma troca do MFA. A reautenticação
  // deve continuar vinculada às credenciais verificadas, não só ao número.
  const result = await DB.prepare(
    `UPDATE users SET last_totp_counter = ?
     WHERE id = ? AND role = 'therapist' AND status = 'active'
       AND totp_enabled = 1 AND last_totp_counter IS ?
       AND password_hash = ? AND totp_secret = ?`,
  )
    .bind(counter, user.id, user.last_totp_counter, user.password_hash, user.totp_secret)
    .run();
  return result.meta.changes === 1;
}

async function professionalMfaRecoveryCodeStatus(
  request: Request,
): Promise<Response> {
  const { DB } = getPortalEnv();
  const session = await requireSession(request, "therapist");
  const status = await DB.prepare(
    `SELECT COUNT(codes.id) AS total,
            COALESCE(SUM(
              CASE
                WHEN codes.id IS NOT NULL
                  AND codes.used_at IS NULL AND codes.invalidated_at IS NULL THEN 1
                ELSE 0
              END
            ), 0) AS remaining,
            MIN(codes.created_at) AS generated_at
     FROM users
     LEFT JOIN professional_mfa_recovery_codes AS codes
       ON codes.user_id = users.id
      AND codes.set_id = users.mfa_recovery_set_id
     WHERE users.id = ? AND users.role = 'therapist' AND users.status = 'active'`,
  )
    .bind(session.userId)
    .first<{ total: number; remaining: number; generated_at: string | null }>();
  return json({
    remaining: Number(status?.remaining ?? 0),
    total: Number(status?.total ?? 0),
    generated_at: status?.generated_at ?? null,
  });
}

function prepareRecoveryCodeInsertStatements(
  database: D1Database,
  recoverySet: ProfessionalMfaRecoverySet,
  userId: string,
  guard: {
    setId: string;
    totpCiphertext: string;
    totpCounter: number;
  },
): D1PreparedStatement[] {
  return recoverySet.records.map((record) =>
    database
      .prepare(
        `INSERT INTO professional_mfa_recovery_codes
           (id, user_id, set_id, position, code_hash, created_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND role = 'therapist' AND status = 'active'
             AND mfa_recovery_set_id = ? AND totp_secret = ?
             AND last_totp_counter = ?
         )`,
      )
      .bind(
        record.id,
        userId,
        recoverySet.setId,
        record.position,
        record.codeHash,
        recoverySet.generatedAt,
        userId,
        guard.setId,
        guard.totpCiphertext,
        guard.totpCounter,
      ),
  );
}

async function generateProfessionalMfaRecoveryCodes(
  request: Request,
  input: Input,
): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const session = await requireSession(request, "therapist");
  requireCsrf(request, session);
  await checkReauthenticationRateLimit(session);
  const user = await DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(session.userId)
    .first<ProfessionalMfaRecoveryUserRow>();
  if (!user) throw new PortalError(401, "Faça login para continuar.");
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
  if (!user.totp_secret || !user.totp_enabled) {
    throw new PortalError(400, "O MFA profissional não está configurado.");
  }
  const verification = await verifyTotp(
    await decrypt(APP_SECRET, user.totp_secret),
    String(input.totp ?? ""),
    user.last_totp_counter,
  );
  if (!verification.valid || verification.counter === null) {
    throw new PortalError(400, "O código do autenticador não confere.");
  }

  const recoverySet = await createProfessionalMfaRecoverySet(
    APP_SECRET,
    user.id,
  );
  const codeStatements = prepareRecoveryCodeInsertStatements(
    DB,
    recoverySet,
    user.id,
    {
      setId: recoverySet.setId,
      totpCiphertext: user.totp_secret,
      totpCounter: verification.counter,
    },
  );
  const operationResults = await DB.batch([
    DB.prepare(
      `UPDATE users
       SET last_totp_counter = ?, mfa_recovery_set_id = ?
       WHERE id = ? AND role = 'therapist' AND status = 'active'
         AND totp_enabled = 1 AND totp_secret = ?
         AND last_totp_counter IS ? AND mfa_recovery_set_id IS ?
         AND password_hash = ?
         AND EXISTS (
           SELECT 1 FROM sessions
           WHERE token_hash = ? AND user_id = users.id AND expires_at > ?
         )`,
    ).bind(
      verification.counter,
      recoverySet.setId,
      user.id,
      user.totp_secret,
      user.last_totp_counter,
      user.mfa_recovery_set_id,
      user.password_hash,
      session.tokenHash,
      now(),
    ),
    DB.prepare(
      `UPDATE professional_mfa_recovery_codes
       SET invalidated_at = ?
       WHERE user_id = ? AND used_at IS NULL AND invalidated_at IS NULL
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND mfa_recovery_set_id = ? AND totp_secret = ?
             AND last_totp_counter = ?
         )`,
    ).bind(
      recoverySet.generatedAt,
      user.id,
      user.id,
      recoverySet.setId,
      user.totp_secret,
      verification.counter,
    ),
    ...codeStatements,
    DB.prepare(
      `INSERT INTO access_logs
         (id, user_id, action, resource_type, resource_id, created_at)
       SELECT ?, ?, 'generate_professional_mfa_recovery_codes', 'account', ?, ?
       WHERE EXISTS (
         SELECT 1 FROM users
         WHERE id = ? AND mfa_recovery_set_id = ? AND totp_secret = ?
           AND last_totp_counter = ?
       )`,
    ).bind(
      identifier("log"),
      user.id,
      recoverySet.setId,
      recoverySet.generatedAt,
      user.id,
      recoverySet.setId,
      user.totp_secret,
      verification.counter,
    ),
  ]);
  const insertedCodes = operationResults.slice(2, 2 + recoverySet.records.length);
  if (
    operationResults[0]?.meta.changes !== 1 ||
    insertedCodes.some((result) => result.meta.changes !== 1)
  ) {
    throw new PortalError(400, "O código do autenticador não confere.");
  }
  return json({
    recovery_codes: recoverySet.codes,
    generated_at: recoverySet.generatedAt,
  });
}

async function startProfessionalMfaRecovery(
  request: Request,
  input: Input,
): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const normalizedEmail = normalizeEmail(input.email).slice(0, 181);
  await checkRateLimit(
    request,
    "professional-mfa-recovery-start",
    normalizedEmail || "invalid",
    { limit: 5, windowSeconds: 60 * 60, ipLimit: 30 },
  );
  // O limite por conta também vale quando a origem muda de IP.
  await checkRateLimit(
    new Request(request.url),
    "professional-mfa-recovery-account",
    normalizedEmail || "invalid",
    { limit: 5, windowSeconds: 60 * 60 },
  );
  const user = (await userByEmail(
    normalizedEmail,
  )) as ProfessionalMfaRecoveryUserRow | null;
  const lookupUserId = user?.id ?? "therapist_missing";
  const [passwordValid, emergencyCodeHash] = await Promise.all([
    passwordMatches(
      String(input.password ?? ""),
      user?.password_salt ?? DUMMY_PASSWORD_SALT,
      user?.password_hash ?? DUMMY_PASSWORD_HASH,
      user?.password_iterations ?? PASSWORD_ITERATIONS,
    ),
    hashProfessionalMfaRecoveryCode(
      APP_SECRET,
      lookupUserId,
      String(input.recovery_code ?? "").slice(0, 128),
    ),
  ]);
  const recoveryCode = await DB.prepare(
    `SELECT codes.id, codes.user_id, codes.set_id, codes.code_hash,
            codes.created_at, codes.used_at, codes.invalidated_at
     FROM professional_mfa_recovery_codes AS codes
     JOIN users ON users.id = codes.user_id
     WHERE codes.user_id = ? AND codes.set_id = ? AND codes.code_hash = ?
       AND codes.used_at IS NULL AND codes.invalidated_at IS NULL
       AND users.mfa_recovery_set_id = codes.set_id
       AND users.role = 'therapist' AND users.status = 'active'
       AND users.totp_enabled = 1`,
  )
    .bind(
      lookupUserId,
      user?.mfa_recovery_set_id ?? "mfa_set_missing",
      emergencyCodeHash,
    )
    .first<ProfessionalMfaRecoveryCodeRow>();
  if (
    !user ||
    user.role !== "therapist" ||
    user.status !== "active" ||
    !user.totp_secret ||
    !user.totp_enabled ||
    !user.mfa_recovery_set_id ||
    !passwordValid ||
    !recoveryCode
  ) {
    throw new PortalError(400, PROFESSIONAL_MFA_RECOVERY_ERROR);
  }
  const recovery = await createProfessionalMfaRecoveryTicket(APP_SECRET, {
    userId: user.id,
    recoveryCodeId: recoveryCode.id,
    expectedRecoverySetId: recoveryCode.set_id,
    expectedCodeHash: recoveryCode.code_hash,
    expectedPasswordHash: user.password_hash,
    expectedOldTotpCiphertext: user.totp_secret,
  });
  return json({
    ticket: recovery.ticket,
    totp_secret: recovery.totpSecret,
    expires_at: recovery.expiresAt,
  });
}

async function confirmProfessionalMfaRecovery(
  request: Request,
  input: Input,
): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const ticketInput = String(input.ticket ?? "").slice(0, 8_001);
  await checkRateLimit(
    request,
    "professional-mfa-recovery-confirm",
    await sha256(ticketInput),
    { limit: 8, windowSeconds: 15 * 60, ipLimit: 30 },
  );
  const ticket = await openProfessionalMfaRecoveryTicket(
    APP_SECRET,
    ticketInput,
  );
  if (ticket) {
    await checkRateLimit(
      new Request(request.url),
      "professional-mfa-recovery-ticket",
      ticket.jti,
      { limit: 8, windowSeconds: 15 * 60 },
    );
  }
  const lookupUserId = ticket?.userId ?? "therapist_missing";
  const [user, recoveryCode, verification] = await Promise.all([
    DB.prepare(
      `SELECT * FROM users
       WHERE id = ? AND role = 'therapist' AND status = 'active'
         AND totp_enabled = 1 AND password_hash = ? AND totp_secret = ?
         AND mfa_recovery_set_id = ?`,
    )
      .bind(
        lookupUserId,
        ticket?.expectedPasswordHash ?? DUMMY_PASSWORD_HASH,
        ticket?.expectedOldTotpCiphertext ?? "totp_missing",
        ticket?.expectedRecoverySetId ?? "mfa_set_missing",
      )
      .first<ProfessionalMfaRecoveryUserRow>(),
    DB.prepare(
      `SELECT id, user_id, set_id, code_hash, created_at, used_at, invalidated_at
       FROM professional_mfa_recovery_codes
       WHERE id = ? AND user_id = ? AND set_id = ? AND code_hash = ?
         AND used_at IS NULL AND invalidated_at IS NULL`,
    )
      .bind(
        ticket?.recoveryCodeId ?? "mfa_recovery_missing",
        lookupUserId,
        ticket?.expectedRecoverySetId ?? "mfa_set_missing",
        ticket?.expectedCodeHash ?? "hash_missing",
      )
      .first<ProfessionalMfaRecoveryCodeRow>(),
    verifyTotp(
      ticket?.newTotpSecret ?? DUMMY_TOTP_SECRET,
      String(input.totp ?? ""),
      null,
    ),
  ]);
  if (
    !ticket ||
    !user ||
    !recoveryCode ||
    !verification.valid ||
    verification.counter === null
  ) {
    throw new PortalError(400, PROFESSIONAL_MFA_RECOVERY_ERROR);
  }

  const recoveredAt = now();
  if (ticket.expiresAt <= recoveredAt) {
    throw new PortalError(400, PROFESSIONAL_MFA_RECOVERY_ERROR);
  }
  const consumptionNonce = identifier("mfa_recovery_use");
  const replacementSet = await createProfessionalMfaRecoverySet(
    APP_SECRET,
    user.id,
  );
  const sessionToken = randomToken(32);
  const sessionTokenHash = await sha256(sessionToken);
  const csrfToken = randomToken(24);
  const sessionExpiresAt = new Date(
    Date.now() + SESSION_SECONDS * 1_000,
  ).toISOString();
  const codeStatements = prepareRecoveryCodeInsertStatements(
    DB,
    replacementSet,
    user.id,
    {
      setId: replacementSet.setId,
      totpCiphertext: ticket.replacementTotpCiphertext,
      totpCounter: verification.counter,
    },
  );
  const operationResults = await DB.batch([
    DB.prepare(
      `UPDATE professional_mfa_recovery_codes
       SET used_at = ?, consumption_nonce = ?
       WHERE id = ? AND user_id = ? AND set_id = ? AND code_hash = ?
         AND used_at IS NULL AND invalidated_at IS NULL
         AND consumption_nonce IS NULL
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND role = 'therapist' AND status = 'active'
             AND password_hash = ? AND totp_secret = ?
             AND mfa_recovery_set_id = ? AND totp_enabled = 1
         )`,
    ).bind(
      recoveredAt,
      consumptionNonce,
      recoveryCode.id,
      user.id,
      ticket.expectedRecoverySetId,
      ticket.expectedCodeHash,
      user.id,
      ticket.expectedPasswordHash,
      ticket.expectedOldTotpCiphertext,
      ticket.expectedRecoverySetId,
    ),
    DB.prepare(
      `UPDATE users
       SET totp_secret = ?, totp_enabled = 1, last_totp_counter = ?,
           mfa_recovery_set_id = ?, last_login_at = ?
       WHERE id = ? AND role = 'therapist' AND status = 'active'
         AND password_hash = ? AND totp_secret = ?
         AND mfa_recovery_set_id = ? AND totp_enabled = 1
         AND EXISTS (
           SELECT 1 FROM professional_mfa_recovery_codes
           WHERE id = ? AND user_id = ? AND consumption_nonce = ?
             AND used_at = ?
         )`,
    ).bind(
      ticket.replacementTotpCiphertext,
      verification.counter,
      replacementSet.setId,
      recoveredAt,
      user.id,
      ticket.expectedPasswordHash,
      ticket.expectedOldTotpCiphertext,
      ticket.expectedRecoverySetId,
      recoveryCode.id,
      user.id,
      consumptionNonce,
      recoveredAt,
    ),
    DB.prepare(
      `UPDATE professional_mfa_recovery_codes
       SET invalidated_at = ?
       WHERE user_id = ? AND set_id = ? AND id <> ?
         AND used_at IS NULL AND invalidated_at IS NULL
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND mfa_recovery_set_id = ? AND totp_secret = ?
             AND last_totp_counter = ?
         )`,
    ).bind(
      recoveredAt,
      user.id,
      ticket.expectedRecoverySetId,
      recoveryCode.id,
      user.id,
      replacementSet.setId,
      ticket.replacementTotpCiphertext,
      verification.counter,
    ),
    DB.prepare(
      `DELETE FROM sessions
       WHERE user_id = ?
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND mfa_recovery_set_id = ? AND totp_secret = ?
             AND last_totp_counter = ?
         )`,
    ).bind(
      user.id,
      user.id,
      replacementSet.setId,
      ticket.replacementTotpCiphertext,
      verification.counter,
    ),
    DB.prepare(
      `INSERT INTO sessions
         (token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM users
         WHERE id = ? AND mfa_recovery_set_id = ? AND totp_secret = ?
           AND last_totp_counter = ?
       )`,
    ).bind(
      sessionTokenHash,
      user.id,
      csrfToken,
      sessionExpiresAt,
      recoveredAt,
      recoveredAt,
      user.id,
      replacementSet.setId,
      ticket.replacementTotpCiphertext,
      verification.counter,
    ),
    ...codeStatements,
    DB.prepare(
      `INSERT INTO access_logs
         (id, user_id, action, resource_type, resource_id, created_at)
       SELECT ?, ?, 'recover_professional_mfa', 'account', ?, ?
       WHERE EXISTS (
         SELECT 1 FROM users
         WHERE id = ? AND mfa_recovery_set_id = ? AND totp_secret = ?
           AND last_totp_counter = ?
       )`,
    ).bind(
      identifier("log"),
      user.id,
      replacementSet.setId,
      recoveredAt,
      user.id,
      replacementSet.setId,
      ticket.replacementTotpCiphertext,
      verification.counter,
    ),
  ]);
  const insertedCodes = operationResults.slice(5, 5 + replacementSet.records.length);
  if (
    operationResults[0]?.meta.changes !== 1 ||
    operationResults[1]?.meta.changes !== 1 ||
    operationResults[4]?.meta.changes !== 1 ||
    insertedCodes.some((result) => result.meta.changes !== 1)
  ) {
    throw new PortalError(400, PROFESSIONAL_MFA_RECOVERY_ERROR);
  }
  return json(
    {
      user: { id: user.id, name: user.display_name, role: user.role },
      csrf: csrfToken,
      recovery_codes: replacementSet.codes,
    },
    200,
    { "Set-Cookie": sessionCookie(request, sessionToken) },
  );
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
  await checkRateLimit(request, "setup", "professional", {
    limit: 5,
    windowSeconds: 30 * 60,
  });
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
  await checkRateLimit(request, "setup-confirm", "professional", {
    limit: 8,
    windowSeconds: 30 * 60,
  });
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
  const activation = await DB.prepare(
    `UPDATE users SET status = 'active', totp_enabled = 1, last_totp_counter = ?
     WHERE id = ? AND role = 'therapist' AND status = 'pending_mfa'
       AND totp_enabled = 0 AND last_totp_counter IS NULL`,
  )
    .bind(verification.counter, user.id)
    .run();
  if (activation.meta.changes !== 1) {
    throw new PortalError(400, "O código do autenticador não confere.");
  }
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
  await checkRateLimit(request, "login", normalizeEmail(email), { ipLimit: 60 });
  const user = await userByEmail(email);
  const genericError = new PortalError(401, "E-mail, senha ou código inválidos.");
  const passwordValid = await passwordMatches(
    String(input.password ?? ""),
    user?.password_salt ?? DUMMY_PASSWORD_SALT,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
    user?.password_iterations ?? PASSWORD_ITERATIONS,
  );
  if (!user || !passwordValid) throw genericError;
  if (user.status !== "active") {
    if (user.role === "patient" && user.status === "disabled") {
      throw new PortalError(
        403,
        "Seu acesso à Área do paciente foi encerrado porque este recurso é exclusivo para pacientes em acompanhamento atual. Se acredita que houve um engano, fale com Mateus.",
      );
    }
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
    const sessionToken = randomToken(32);
    const sessionTokenHash = await sha256(sessionToken);
    const csrfToken = randomToken(24);
    const createdAt = now();
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1_000).toISOString();
    // A inserção da sessão e o consumo do TOTP compartilham a transação.
    // Uma recuperação que ganhar a corrida invalida estas credenciais; se o
    // login ganhar, a recuperação remove a sessão que acabou de ser criada.
    const results = await DB.batch([
      DB.prepare(
        `INSERT INTO sessions
           (token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND role = 'therapist' AND status = 'active'
             AND password_hash = ? AND totp_secret = ? AND totp_enabled = 1
             AND last_totp_counter IS ?
         )`,
      ).bind(
        sessionTokenHash, user.id, csrfToken, expiresAt, createdAt, createdAt,
        user.id, user.password_hash, user.totp_secret, user.last_totp_counter,
      ),
      DB.prepare(
        `UPDATE users SET last_totp_counter = ?, last_login_at = ?
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = users.id
         )`,
      ).bind(verification.counter, createdAt, user.id, sessionTokenHash),
      DB.prepare(
        `INSERT INTO access_logs
           (id, user_id, action, resource_type, resource_id, created_at)
         SELECT ?, ?, 'login', 'session', NULL, ?
         WHERE EXISTS (
           SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = ?
         )`,
      ).bind(identifier("log"), user.id, createdAt, sessionTokenHash, user.id),
    ]);
    if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
      throw genericError;
    }
    return json(
      { user: { id: user.id, name: user.display_name, role: user.role }, csrf: csrfToken },
      200,
      { "Set-Cookie": sessionCookie(request, sessionToken) },
    );
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
  await portalOperation("register.rate_limit", () =>
    checkRateLimit(request, "register", normalizeEmail(email), {
      limit: 6,
      windowSeconds: 30 * 60,
      ipLimit: 30,
    }),
  );
  const name = cleanText(input.name, 100).replace(/\s+/gu, " ");
  if (name.length < 2) throw new PortalError(400, "Informe como prefere ser chamado(a).");
  const password = validatePassword(input.password);
  if (input.adult_confirmation !== true) {
    throw new PortalError(400, "Confirme que você tem 18 anos ou mais.");
  }
  if (input.privacy_confirmation !== true) {
    throw new PortalError(400, "Leia e aceite o aviso de privacidade para criar a conta.");
  }
  const invitationHash = await portalOperation("register.hash_invitation", () =>
    codeHash(APP_SECRET, String(input.invitation_code ?? ""), "invite"),
  );
  const invitation = await portalOperation<{ id: string } | null>(
    "register.validate_invitation",
    () =>
      DB.prepare(
        `SELECT invitations.id
         FROM invitations
         JOIN users ON users.id = invitations.therapist_id
         WHERE invitations.code_hash = ? AND invitations.used_at IS NULL
           AND invitations.revoked_at IS NULL AND invitations.expires_at > ?
           AND users.status = 'active'`,
      )
        .bind(invitationHash, now())
        .first<{ id: string }>(),
  );
  if (!invitation) throw new PortalError(400, "O convite é inválido ou expirou.");
  const hashedEmail = await portalOperation("register.hash_email", () =>
    emailHash(APP_SECRET, email),
  );
  if (
    await portalOperation("register.check_email", () =>
      DB.prepare("SELECT id FROM users WHERE email_hash = ?").bind(hashedEmail).first(),
    )
  ) {
    throw new PortalError(
      400,
      "Não foi possível criar a conta. Confira o convite e o e-mail ou tente entrar se você já tiver uma conta.",
    );
  }

  const passwordRecord = await portalOperation("register.hash_password", () =>
    derivePassword(password),
  );
  const recoveryCode = createRecoveryCode();
  const recoveryRecord = await portalOperation("register.hash_recovery", () =>
    derivePassword(recoveryCode),
  );
  const patientId = identifier("patient");
  const timestamp = now();
  const patient = {
    id: patientId,
    display_name: name,
    role: "patient" as const,
  };
  const session = await portalOperation("register.prepare_session", () =>
    prepareSession(request, patient),
  );
  const registrationStatements = [
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
      `UPDATE invitations
       SET used_at = ?, patient_id = ?
       WHERE id = ? AND code_hash = ? AND used_at IS NULL
         AND revoked_at IS NULL AND expires_at > ?
         AND EXISTS (
           SELECT 1 FROM users
           WHERE users.id = invitations.therapist_id
             AND users.status = 'active'
         )`,
    ).bind(timestamp, patientId, invitation.id, invitationHash, timestamp),
    DB.prepare(
      `INSERT INTO patient_links (id, therapist_id, patient_id, status, created_at)
       VALUES (
         ?,
         (
           SELECT therapist_id
           FROM invitations
           WHERE id = ? AND patient_id = ? AND used_at = ?
         ),
         ?,
         'active',
         ?
       )`,
    ).bind(
      identifier("link"),
      invitation.id,
      patientId,
      timestamp,
      patientId,
      timestamp,
    ),
    session.statement,
    prepareAudit(patientId, "register", "account"),
  ];
  try {
    await DB.batch(registrationStatements);
  } catch (error) {
    const [activeInvitation, existingUser] = await portalOperation<
      [{ id: string } | null, { id: string } | null]
    >(
      "register.verify_failed_commit",
      () =>
        Promise.all([
          DB.prepare(
            `SELECT id FROM invitations
             WHERE id = ? AND code_hash = ? AND used_at IS NULL
               AND revoked_at IS NULL AND expires_at > ?`,
          )
            .bind(invitation.id, invitationHash, now())
            .first<{ id: string }>(),
          DB.prepare("SELECT id FROM users WHERE email_hash = ?")
            .bind(hashedEmail)
            .first<{ id: string }>(),
        ]),
    );
    if (!activeInvitation) {
      throw new PortalError(400, "O convite é inválido ou expirou.");
    }
    if (existingUser) {
      throw new PortalError(
        400,
        "Não foi possível criar a conta. Confira o convite e o e-mail ou tente entrar se você já tiver uma conta.",
      );
    }
    throw new PortalOperationError("register.atomic_commit", error);
  }
  return json(
    { user: session.user, csrf: session.csrf, recovery_code: recoveryCode },
    201,
    { "Set-Cookie": session.cookie },
  );
}

async function recoverAccount(request: Request, input: Input): Promise<Response> {
  const { DB } = getPortalEnv();
  const email = validateEmail(input.email);
  await checkRateLimit(request, "recover", normalizeEmail(email), {
    limit: 5,
    windowSeconds: 60 * 60,
    ipLimit: 30,
  });
  const user = await userByEmail(email);
  const genericError = new PortalError(400, "Não foi possível confirmar o código de recuperação.");
  const recoveryCodeValid = await passwordMatches(
    String(input.recovery_code ?? ""),
    user?.recovery_salt ?? DUMMY_PASSWORD_SALT,
    user?.recovery_hash ?? DUMMY_PASSWORD_HASH,
    user?.password_iterations ?? PASSWORD_ITERATIONS,
  );
  if (!user || user.status !== "active" || !recoveryCodeValid) throw genericError;
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
  const recoveryResults = await DB.batch([
    DB.prepare(
      `UPDATE users SET password_salt = ?, password_hash = ?, password_iterations = ?,
        recovery_salt = ?, recovery_hash = ?
       WHERE id = ? AND status = 'active'
         AND recovery_salt = ? AND recovery_hash = ?
         AND password_iterations = ?
         AND NOT EXISTS (
           SELECT 1 FROM assisted_recovery_grants
           WHERE user_id = users.id AND expires_at <= ?
         )`,
    ).bind(
      passwordRecord.salt,
      passwordRecord.hash,
      passwordRecord.iterations,
      recoveryRecord.salt,
      recoveryRecord.hash,
      user.id,
      user.recovery_salt,
      user.recovery_hash,
      user.password_iterations,
      now(),
    ),
    DB.prepare(
      `DELETE FROM sessions
       WHERE user_id = ?
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND password_salt = ? AND password_hash = ?
             AND recovery_salt = ? AND recovery_hash = ?
         )`,
    ).bind(
      user.id,
      user.id,
      passwordRecord.salt,
      passwordRecord.hash,
      recoveryRecord.salt,
      recoveryRecord.hash,
    ),
    DB.prepare(
      `DELETE FROM assisted_recovery_grants
       WHERE user_id = ?
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND password_salt = ? AND password_hash = ?
             AND recovery_salt = ? AND recovery_hash = ?
         )`,
    ).bind(
      user.id,
      user.id,
      passwordRecord.salt,
      passwordRecord.hash,
      recoveryRecord.salt,
      recoveryRecord.hash,
    ),
    DB.prepare(
      `INSERT INTO access_logs
         (id, user_id, action, resource_type, resource_id, created_at)
       SELECT ?, ?, 'recover_account', 'account', NULL, ?
       WHERE EXISTS (
         SELECT 1 FROM users
         WHERE id = ? AND password_salt = ? AND password_hash = ?
           AND recovery_salt = ? AND recovery_hash = ?
       )`,
    ).bind(
      identifier("log"), user.id, now(), user.id,
      passwordRecord.salt, passwordRecord.hash, recoveryRecord.salt, recoveryRecord.hash,
    ),
  ]);
  if (recoveryResults[0]?.meta.changes !== 1) throw genericError;
  return json({ ok: true, recovery_code: newRecoveryCode });
}

async function listEntries(session: Awaited<ReturnType<typeof requireSession>>) {
  const { DB } = getPortalEnv();
  if (session.role === "patient") {
    const result = await DB.prepare(
      `SELECT entries.id, entries.title, entries.happened, entries.body,
              entries.thoughts, entries.urge, entries.emotion, entries.intensity,
              entries.message, entries.created_at, entries.updated_at,
              entries.shared_at, entries.revoked_at, entry_views.viewed_at,
              ${entryThoughtReviewSelectColumns}
       FROM entries
       LEFT JOIN patient_links
         ON patient_links.patient_id = entries.patient_id
        AND patient_links.status = 'active'
       LEFT JOIN entry_views
         ON entry_views.entry_id = entries.id
        AND entry_views.therapist_id = patient_links.therapist_id
       LEFT JOIN entry_thought_reviews
         ON entry_thought_reviews.entry_id = entries.id
       WHERE entries.patient_id = ?
       ORDER BY entries.created_at DESC`,
    )
      .bind(session.userId)
      .all<EntryQueryRow>();
    return attachThoughtReviews(result.results);
  }
  await audit(session.userId, "view_shared_entries", "entry_list");
  const result = await DB.prepare(
    `SELECT entries.id, entries.title, entries.happened, entries.body, entries.thoughts,
            entries.urge, entries.emotion, entries.intensity, entries.message,
            entries.created_at, entries.updated_at, entries.shared_at,
            users.display_name AS patient_name,
            ${entryThoughtReviewSelectColumns}
     FROM entries
     JOIN users ON users.id = entries.patient_id
     JOIN patient_links ON patient_links.patient_id = entries.patient_id
     LEFT JOIN entry_thought_reviews
       ON entry_thought_reviews.entry_id = entries.id
     WHERE patient_links.therapist_id = ? AND patient_links.status = 'active'
       AND entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
     ORDER BY entries.shared_at DESC`,
  )
    .bind(session.userId)
    .all<EntryQueryRow>();
  return attachThoughtReviews(result.results);
}

async function listSharedPatients(
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const { DB } = getPortalEnv();
  const result = await DB.prepare(
    `SELECT users.id AS patient_id,
            users.display_name AS patient_name,
            COALESCE(SUM(
              CASE
                WHEN entries.id IS NOT NULL
                  AND entries.shared_at IS NOT NULL
                  AND entries.revoked_at IS NULL
                THEN 1
                ELSE 0
              END
            ), 0) AS shared_count,
            COALESCE(SUM(
              CASE
                WHEN entries.id IS NOT NULL
                  AND (entries.shared_at IS NULL OR entries.revoked_at IS NOT NULL)
                THEN 1
                ELSE 0
              END
            ), 0) AS private_count,
            COALESCE(SUM(
              CASE
                WHEN entries.shared_at IS NOT NULL
                  AND entries.revoked_at IS NULL
                  AND (
                    entry_views.viewed_at IS NULL
                    OR entry_views.viewed_at < CASE
                      WHEN entries.updated_at > entries.shared_at
                        THEN entries.updated_at
                      ELSE entries.shared_at
                    END
                  )
                THEN 1
                ELSE 0
              END
            ), 0) AS unread_count,
            MAX(
              CASE
                WHEN entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
                  THEN entries.shared_at
                ELSE NULL
              END
            ) AS latest_shared_at,
            (
              SELECT COUNT(*) FROM patient_map_shares
              WHERE patient_map_shares.patient_id = users.id
                AND patient_map_shares.therapist_id = patient_links.therapist_id
            ) AS shared_map_count,
            (
              SELECT COUNT(*) FROM patient_map_shares
              WHERE patient_map_shares.patient_id = users.id
                AND patient_map_shares.therapist_id = patient_links.therapist_id
                AND (
                  patient_map_shares.viewed_at IS NULL
                  OR patient_map_shares.viewed_at < patient_map_shares.shared_at
                )
            ) AS unread_map_count,
            (
              SELECT MAX(patient_map_shares.shared_at) FROM patient_map_shares
              WHERE patient_map_shares.patient_id = users.id
                AND patient_map_shares.therapist_id = patient_links.therapist_id
            ) AS latest_map_shared_at
     FROM patient_links
     JOIN users ON users.id = patient_links.patient_id
     LEFT JOIN entries ON entries.patient_id = users.id
     LEFT JOIN entry_views
       ON entry_views.entry_id = entries.id
      AND entry_views.therapist_id = ?
     WHERE patient_links.therapist_id = ? AND patient_links.status = 'active'
       AND users.status = 'active'
       AND users.role = 'patient'
     GROUP BY users.id, users.display_name
     HAVING COUNT(entries.id) > 0 OR EXISTS (
       SELECT 1 FROM patient_map_shares
       WHERE patient_map_shares.patient_id = users.id
         AND patient_map_shares.therapist_id = patient_links.therapist_id
     )
     ORDER BY (unread_count + unread_map_count) DESC,
              COALESCE(latest_map_shared_at, latest_shared_at) DESC`,
  )
    .bind(session.userId, session.userId)
    .all();
  await audit(session.userId, "view_shared_patients", "patient_list");
  return result.results;
}

async function professionalActivitySummary(
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const { DB } = getPortalEnv();
  return (
    await DB.prepare(
      `SELECT COUNT(entries.id) AS total_count,
              COALESCE(SUM(
                CASE
                  WHEN entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
                    THEN 1
                  ELSE 0
                END
              ), 0) AS shared_count,
              COALESCE(SUM(
                CASE
                  WHEN entries.id IS NOT NULL
                    AND (entries.shared_at IS NULL OR entries.revoked_at IS NOT NULL)
                    THEN 1
                  ELSE 0
                END
              ), 0) AS private_count
       FROM patient_links
       JOIN users ON users.id = patient_links.patient_id
       LEFT JOIN entries ON entries.patient_id = users.id
       WHERE patient_links.therapist_id = ?
         AND patient_links.status = 'active'
         AND users.status = 'active'
         AND users.role = 'patient'`,
    )
      .bind(session.userId)
      .first()
  ) ?? { total_count: 0, shared_count: 0, private_count: 0 };
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
            ${entryThoughtReviewSelectColumns},
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
     LEFT JOIN entry_thought_reviews
       ON entry_thought_reviews.entry_id = entries.id
     WHERE patient_links.therapist_id = ? AND patient_links.patient_id = ?
       AND patient_links.status = 'active' AND users.status = 'active'
       AND entries.patient_id = ?
       AND entries.shared_at IS NOT NULL AND entries.revoked_at IS NULL
     ORDER BY is_unread DESC, entries.shared_at DESC`,
  )
    .bind(session.userId, session.userId, patientId, patientId)
    .all<EntryQueryRow>();
  await audit(session.userId, "view_shared_entries", "patient_entries", patientId);
  return attachThoughtReviews(result.results);
}

async function handleGet(request: Request, path: string): Promise<Response> {
  const { DB, PUBLIC_SITE_URL, GUIDE_URL } = getPortalEnv();
  if (path === "/health") return json({ ok: true, mode: "production" });
  if (path === "/config") {
    const publicSiteUrl =
      PUBLIC_SITE_URL ?? "https://psico-mateus.github.io/";
    return json({
      ...(await setupStatus()),
      privacy_version: PRIVACY_VERSION,
      public_site_url: publicSiteUrl,
      guide_url: GUIDE_URL ?? "https://psico-mateus.github.io/guia-emocoes/",
      care_url: new URL("cuidados/", publicSiteUrl).toString(),
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
  if (path === "/account/mfa-recovery-codes") {
    return professionalMfaRecoveryCodeStatus(request);
  }
  if (path === "/entries") {
    const session = await requireSession(request);
    return json({ entries: await listEntries(session) });
  }
  if (path === "/map-draft") {
    const session = await requireSession(request, "patient");
    return json(await readPatientMapDraft(DB, session.userId));
  }
  if (path === "/map-sharing") {
    const session = await requireSession(request, "patient");
    return json({ shares: await listPatientMapShares(DB, session.userId) });
  }
  if (path === "/professional/patients") {
    const session = await requireSession(request, "therapist");
    const [patients, activity] = await Promise.all([
      listSharedPatients(session),
      professionalActivitySummary(session),
    ]);
    return json({ patients, activity });
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
  const professionalMapShares = path.match(
    /^\/professional\/patients\/([A-Za-z0-9_-]+)\/map-shares$/u,
  );
  if (professionalMapShares) {
    const session = await requireSession(request, "therapist");
    const shares = await listSharedPatientMaps(
      DB,
      session.userId,
      professionalMapShares[1],
    );
    await audit(
      session.userId,
      "view_shared_patient_maps",
      "patient_map_list",
      professionalMapShares[1],
    );
    return json({ shares });
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
    const [account, careAccess, entryResult, patientMapDraft, patientMapShares, notices] =
      await Promise.all([
        DB.prepare(
          `SELECT display_name, role, status, privacy_version,
                  adult_confirmed_at, created_at, last_login_at
           FROM users
           WHERE id = ? AND role = 'patient'`,
        )
          .bind(session.userId)
          .first<PatientExportAccountRow>(),
        DB.prepare(
          `SELECT status, created_at, closed_at
           FROM patient_links
           WHERE patient_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
        )
          .bind(session.userId)
          .first<Exclude<PatientExportCareAccessRow, null>>(),
        DB.prepare(
          `SELECT entries.id, entries.title, entries.happened, entries.body,
                  entries.thoughts, entries.urge, entries.emotion, entries.intensity,
                  entries.message, entries.created_at, entries.updated_at,
                  entries.shared_at, entries.revoked_at,
                  ${entryThoughtReviewSelectColumns},
                  (
                    SELECT MAX(entry_views.viewed_at)
                    FROM entry_views
                    JOIN patient_links AS viewing_link
                      ON viewing_link.therapist_id = entry_views.therapist_id
                     AND viewing_link.patient_id = entries.patient_id
                    WHERE entry_views.entry_id = entries.id
                      AND viewing_link.status = 'active'
                  ) AS viewed_at
           FROM entries
           LEFT JOIN entry_thought_reviews
             ON entry_thought_reviews.entry_id = entries.id
           WHERE entries.patient_id = ?
           ORDER BY entries.created_at DESC`,
        )
          .bind(session.userId)
          .all<PatientExportEntryDatabaseRow>(),
        readPatientMapDraft(DB, session.userId),
        listPatientMapShareCopies(DB, session.userId),
        exportPatientNotices(DB, session.userId),
      ]);
    if (!account) throw new PortalError(404, "Conta não encontrada.");
    const exportedAt = now();
    const payload = createPatientDataExport({
      exportedAt,
      account,
      careAccess: careAccess ?? null,
      entries: attachThoughtReviews<PatientExportEntryDatabaseRow>(
        entryResult.results,
      ),
      patientMapDraft,
      patientMapShares,
      notices,
    });
    await audit(session.userId, "export", "patient_data");
    return json(
      payload,
      200,
      {
        "Content-Disposition":
          'attachment; filename="meus-dados-area-do-paciente.json"',
      },
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
  if (path === "/recover/mfa/start") {
    return startProfessionalMfaRecovery(request, input);
  }
  if (path === "/recover/mfa/confirm") {
    return confirmProfessionalMfaRecovery(request, input);
  }
  if (path === "/account/mfa-recovery-codes") {
    return generateProfessionalMfaRecoveryCodes(request, input);
  }
  if (path === "/account/mfa-transfer") {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    await checkReauthenticationRateLimit(session);
    const user = await DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(session.userId)
      .first<UserRow>();
    if (!user) throw new PortalError(401, "Faça login para continuar.");
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
    if (!user.totp_secret || !user.totp_enabled) {
      throw new PortalError(400, "O MFA profissional não está configurado.");
    }
    const totpSecret = await decrypt(APP_SECRET, user.totp_secret);
    const verification = await verifyTotp(
      totpSecret,
      String(input.totp ?? ""),
      user.last_totp_counter,
    );
    if (!verification.valid || verification.counter === null) {
      throw new PortalError(400, "O código do autenticador não confere.");
    }
    if (!(await consumeActiveTherapistTotpCounter(user, verification.counter))) {
      throw new PortalError(400, "O código do autenticador não confere.");
    }
    const transfer = await createMfaTransferTicket(APP_SECRET, {
      userId: user.id,
      sessionTokenHash: session.tokenHash,
      expectedTotpCiphertext: user.totp_secret,
    });
    await audit(user.id, "prepare_professional_mfa_transfer", "account");
    return json({
      totp_secret: totpSecret,
      ticket: transfer.ticket,
      expires_at: transfer.expiresAt,
    });
  }
  if (path === "/account/mfa-transfer/confirm") {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    await checkReauthenticationRateLimit(session);
    const user = await DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(session.userId)
      .first<UserRow>();
    if (!user) throw new PortalError(401, "Faça login para continuar.");
    if (!user.totp_secret || !user.totp_enabled) {
      throw new PortalError(400, "O MFA profissional não está configurado.");
    }
    const ticketValid = await isValidMfaTransferTicket(
      APP_SECRET,
      input.ticket,
      {
        userId: user.id,
        sessionTokenHash: session.tokenHash,
        expectedTotpCiphertext: user.totp_secret,
      },
    );
    if (!ticketValid) {
      throw new PortalError(400, "A preparação expirou. Comece novamente.");
    }
    const verification = await verifyTotp(
      await decrypt(APP_SECRET, user.totp_secret),
      String(input.totp ?? ""),
      user.last_totp_counter,
    );
    if (!verification.valid || verification.counter === null) {
      throw new PortalError(400, "O código do Mac não confere. Use o número que aparece agora.");
    }
    if (!(await consumeActiveTherapistTotpCounter(user, verification.counter))) {
      throw new PortalError(400, "O código do Mac não confere. Use o número que aparece agora.");
    }
    await audit(user.id, "confirm_professional_mfa_transfer", "account");
    return json({ ok: true });
  }
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
  const viewedMapShare = path.match(
    /^\/professional\/patients\/([A-Za-z0-9_-]+)\/map-shares\/([a-z0-9-]+)\/viewed$/u,
  );
  if (viewedMapShare) {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    const viewedAt = await markPatientMapShareViewed(
      DB,
      session.userId,
      viewedMapShare[1],
      viewedMapShare[2],
    );
    await audit(
      session.userId,
      "mark_patient_map_viewed",
      "patient_map",
      `${viewedMapShare[1]}:${viewedMapShare[2]}`,
    );
    return json({ viewed_at: viewedAt });
  }
  const assistedRecovery = path.match(
    /^\/professional\/patients\/([A-Za-z0-9_-]+)\/recovery-code$/u,
  );
  if (assistedRecovery) {
    const session = await requireSession(request, "therapist");
    requireCsrf(request, session);
    await checkRateLimit(request, "assisted-recovery", session.userId, {
      limit: 8,
      windowSeconds: 60 * 60,
    });
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
    if (!(await consumeActiveTherapistTotpCounter(therapist, verification.counter))) {
      throw new PortalError(
        400,
        "O código do autenticador não confere. Se acabou de entrar, aguarde o próximo código.",
      );
    }
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
    await checkReauthenticationRateLimit(session);
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
      if (!(await consumeActiveTherapistTotpCounter(user, verification.counter))) {
        throw new PortalError(400, "O código do autenticador não confere.");
      }
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
  if (path === "/map-draft") {
    const session = await requireSession(request, "patient");
    requireCsrf(request, session);
    const result = await patchPatientMapDraft(DB, session.userId, input);
    return result.ok ? json(result.payload) : json(result.payload, 409);
  }
  const mapSharing = path.match(/^\/map-sharing\/([a-z0-9-]+)$/u);
  if (mapSharing) {
    const session = await requireSession(request, "patient");
    requireCsrf(request, session);
    if (typeof input.shared !== "boolean") {
      throw new PortalError(400, "Informe o estado do compartilhamento.");
    }
    if (input.shared) {
      const share = await sharePatientMap(DB, session.userId, mapSharing[1]);
      await audit(session.userId, "share_patient_map", "patient_map", mapSharing[1]);
      return json({ ok: true, share });
    }
    await revokePatientMapShare(DB, session.userId, mapSharing[1]);
    await audit(
      session.userId,
      "revoke_patient_map_sharing",
      "patient_map",
      mapSharing[1],
    );
    return json({ ok: true });
  }
  if (path === "/account/password") {
    const session = await requireSession(request);
    requireCsrf(request, session);
    await checkReauthenticationRateLimit(session);
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
      if (!(await consumeActiveTherapistTotpCounter(user, verification.counter))) {
        throw new PortalError(400, "O código do autenticador não confere.");
      }
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

  const thoughtReview = path.match(
    /^\/entries\/([A-Za-z0-9_-]+)\/thought-review$/u,
  );
  if (thoughtReview) {
    const session = await requireSession(request, "patient");
    requireCsrf(request, session);
    const result = await patchEntryThoughtReview(
      DB,
      session.userId,
      thoughtReview[1],
      input,
    );
    return json({
      thought_review: result.thoughtReview,
      updated_at: result.entryUpdatedAt,
    });
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
      ...(input.active
        ? []
        : [
            DB.prepare(
              "DELETE FROM patient_map_shares WHERE patient_id = ? AND therapist_id = ?",
            ).bind(patient.id, session.userId),
          ]),
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
        "UPDATE entries SET shared_at = ?, revoked_at = NULL WHERE id = ?",
      )
        .bind(timestamp, entry.id)
        .run();
      await audit(session.userId, "share", "entry", entry.id);
    } else {
      await DB.prepare("UPDATE entries SET revoked_at = ? WHERE id = ?")
        .bind(timestamp, entry.id)
        .run();
      await audit(session.userId, "revoke_sharing", "entry", entry.id);
    }
    return json({ ok: true });
  }

  const entryMatch = path.match(/^\/entries\/([A-Za-z0-9_-]+)$/u);
  if (entryMatch) {
    const session = await requireSession(request, "patient");
    requireCsrf(request, session);
    const entry = await DB.prepare("SELECT id, updated_at FROM entries WHERE id = ? AND patient_id = ?")
      .bind(entryMatch[1], session.userId)
      .first<{ id: string; updated_at: string }>();
    if (!entry) throw new PortalError(404, "Registro não encontrado.");
    // Older installed clients omit this field. Preserve their existing request
    // contract while new clients protect the version they actually opened.
    const expectedUpdatedAt = input.expected_updated_at === undefined
      ? entry.updated_at
      : input.expected_updated_at;
    if (
      typeof expectedUpdatedAt !== "string" ||
      expectedUpdatedAt.length > 40 ||
      !Number.isFinite(Date.parse(expectedUpdatedAt))
    ) {
      throw new PortalError(400, "A versão do registro não pôde ser confirmada.");
    }
    const conflictMessage = "Este registro foi alterado em outra aba ou aparelho. Copie suas alterações antes de sair e reabra o registro atualizado para compará-las.";
    if (expectedUpdatedAt !== entry.updated_at) {
      throw new PortalError(409, conflictMessage);
    }
    const values = validateEntry(input);
    // Always advance the version, including two saves in the same millisecond.
    const previousTime = Date.parse(entry.updated_at);
    const timestamp = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
    const saved = await DB.prepare(
      `UPDATE entries SET title = ?, happened = ?, body = ?, thoughts = ?, urge = ?,
        emotion = ?, intensity = ?, message = ?, updated_at = ?
        WHERE id = ? AND patient_id = ? AND updated_at = ?`,
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
        timestamp,
        entry.id,
        session.userId,
        expectedUpdatedAt,
      )
      .run();
    if (saved.meta.changes !== 1) throw new PortalError(409, conflictMessage);
    await audit(session.userId, "update", "entry", entry.id);
    return json({ ok: true, updated_at: timestamp });
  }

  throw new PortalError(404, "Recurso não encontrado.");
}

async function handleDelete(request: Request, path: string): Promise<Response> {
  const { DB, APP_SECRET } = getPortalEnv();
  const session = await requireSession(request);
  requireCsrf(request, session);
  if (path === "/map-draft") {
    if (session.role !== "patient") {
      throw new PortalError(403, "Esta ação não está disponível para este perfil.");
    }
    const input = await readJson(request);
    const result = await resetPatientMapDraft(DB, session.userId, input);
    if (result.ok && !result.payload.idempotent) {
      await audit(session.userId, "clear_patient_map", "patient_map");
    }
    return result.ok ? json(result.payload) : json(result.payload, 409);
  }
  if (path === "/account/sessions") {
    const input = await readJson(request);
    await checkReauthenticationRateLimit(session);
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
      if (!user.totp_secret || !user.totp_enabled) {
        throw new PortalError(400, "O MFA profissional não está configurado.");
      }
      const verification = await verifyTotp(
        await decrypt(APP_SECRET, user.totp_secret),
        String(input.totp ?? ""),
        user.last_totp_counter,
      );
      if (!verification.valid || verification.counter === null) {
        throw new PortalError(
          400,
          "O código do autenticador não confere. Se acabou de entrar, aguarde o próximo código.",
        );
      }
      if (!(await consumeActiveTherapistTotpCounter(user, verification.counter))) {
        throw new PortalError(
          400,
          "O código do autenticador não confere. Se acabou de entrar, aguarde o próximo código.",
        );
      }
      await DB.batch([
        DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
        prepareAudit(user.id, "revoke_all_sessions", "account"),
      ]);
    } else {
      await DB.batch([
        DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
        prepareAudit(user.id, "revoke_all_sessions", "account"),
      ]);
    }
    return noContent({ "Set-Cookie": clearSessionCookie(request) });
  }
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
  const thoughtReview = path.match(
    /^\/entries\/([A-Za-z0-9_-]+)\/thought-review$/u,
  );
  if (thoughtReview) {
    if (session.role !== "patient") throw new PortalError(403, "Ação não permitida.");
    const input = await readJson(request);
    const result = await deleteEntryThoughtReview(
      DB,
      session.userId,
      thoughtReview[1],
      input,
    );
    return json({
      deleted: true,
      entry_id: thoughtReview[1],
      updated_at: result.updatedAt,
    });
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
    await checkReauthenticationRateLimit(session);
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
  const startedAt = Date.now();
  const { segments } = await context.params;
  const path = pathOf(segments);
  try {
    await ensureSchema();
    if (Math.random() < 0.01) {
      try {
        await cleanupExpired();
      } catch (error) {
        // Limpeza de dados já vencidos é manutenção: uma falha transitória não
        // deve transformar login, cadastro ou salvamento válidos em erro 500.
        logMaintenanceFailure(error);
      }
    }
    const noticesResponse = await handlePatientNotices(request, path);
    if (noticesResponse) return noticesResponse;
    if (request.method === "GET") return await handleGet(request, path);
    requireTrustedOrigin(request);
    if (request.method === "POST") return await handlePost(request, path);
    if (request.method === "PATCH") return await handlePatch(request, path);
    if (request.method === "DELETE") return await handleDelete(request, path);
    return json({ error: "Método não permitido." }, 405, { Allow: "GET, POST, PATCH, DELETE" });
  } catch (error) {
    if (error instanceof EntryThoughtReviewConflictError) {
      return json(
        {
          error: error.message,
          code: "entry_thought_review_conflict",
          current_review: error.currentReview,
        },
        error.status,
      );
    }
    if (error instanceof PortalError) return json({ error: error.message }, error.status);
    logTechnicalFailure(path, error, startedAt);
    return json({ error: "Não foi possível concluir a ação. Tente novamente." }, 500);
  }
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
