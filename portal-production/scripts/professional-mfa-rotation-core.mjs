const INSPECT_PROFESSIONAL_SQL = `/* professional-mfa-rotation:inspect-professional */
SELECT id, role, status, totp_secret
FROM users
WHERE role = 'therapist'
ORDER BY id
LIMIT 2`;

const SESSION_SUMMARY_SQL = `/* professional-mfa-rotation:session-summary */
SELECT
  COALESCE(SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END), 0) AS professional_sessions,
  COALESCE(SUM(CASE WHEN user_id <> ? THEN 1 ELSE 0 END), 0) AS other_sessions
FROM sessions`;

const GUARDED_AUDIT_SQL = `/* professional-mfa-rotation:guard-audit */
WITH guarded_professional AS (
  SELECT id
  FROM users
  WHERE id = ?
    AND role = 'therapist'
    AND status = 'active'
    AND totp_secret = ?
    AND (SELECT COUNT(*) FROM users WHERE role = 'therapist') = 1
)
INSERT INTO access_logs (
  id, user_id, action, resource_type, resource_id, created_at
)
SELECT
  ?,
  (SELECT id FROM guarded_professional),
  CASE
    WHEN EXISTS (SELECT 1 FROM guarded_professional)
      THEN 'rotate_professional_mfa'
    ELSE NULL
  END,
  'account',
  (SELECT id FROM guarded_professional),
  ?`;

const UPDATE_PROFESSIONAL_SQL = `/* professional-mfa-rotation:update-professional */
UPDATE users
SET totp_secret = ?,
    totp_enabled = 1,
    last_totp_counter = NULL
WHERE id = ?
  AND role = 'therapist'
  AND status = 'active'
  AND totp_secret = ?
  AND (SELECT COUNT(*) FROM users WHERE role = 'therapist') = 1
RETURNING id`;

const DELETE_PROFESSIONAL_SESSIONS_SQL = `/* professional-mfa-rotation:delete-professional-sessions */
DELETE FROM sessions
WHERE user_id = ?`;

const POST_PROFESSIONAL_SQL = `/* professional-mfa-rotation:post-professional */
SELECT id, role, status, totp_secret, totp_enabled, last_totp_counter
FROM users
WHERE role = 'therapist'
ORDER BY id
LIMIT 2`;

const POST_AUDIT_SQL = `/* professional-mfa-rotation:post-audit */
SELECT id, user_id, action, resource_type, resource_id, created_at
FROM access_logs
WHERE id = ?
LIMIT 2`;

export class ProfessionalMfaRotationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProfessionalMfaRotationError";
    this.code = code;
  }
}

const TOTP_SECRET_PATTERN = /^[A-Z2-7]{16,}$/u;
const ENCRYPTED_SECRET_PATTERN = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/u;

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProfessionalMfaRotationError(
      "invalid-input",
      `O campo técnico ${field} não foi informado corretamente.`,
    );
  }
  return value;
}

function requirePlausibleCiphertext(value, field) {
  requireNonEmptyString(value, field);
  if (!ENCRYPTED_SECRET_PATTERN.test(value)) {
    throw new ProfessionalMfaRotationError(
      "invalid-ciphertext",
      `O campo técnico ${field} não tem o formato cifrado esperado.`,
    );
  }
  return value;
}

function requireIsoTimestamp(value) {
  requireNonEmptyString(value, "createdAt");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new ProfessionalMfaRotationError(
      "invalid-created-at",
      "A data técnica da auditoria não está em UTC no formato ISO esperado.",
    );
  }
  return value;
}

export async function decryptExistingProfessionalTotp(
  cryptoAdapter,
  { appSecret, totpSecretCiphertext },
) {
  requireNonEmptyString(appSecret, "APP_SECRET");
  requirePlausibleCiphertext(totpSecretCiphertext, "totpSecretCiphertext");
  let decrypted;
  try {
    decrypted = await cryptoAdapter.decrypt(appSecret, totpSecretCiphertext);
  } catch {
    throw new ProfessionalMfaRotationError(
      "invalid-app-secret",
      "O APP_SECRET informado não decifra o MFA profissional selecionado.",
    );
  }

  if (typeof decrypted !== "string" || !TOTP_SECRET_PATTERN.test(decrypted)) {
    throw new ProfessionalMfaRotationError(
      "invalid-existing-totp",
      "O MFA profissional armazenado não tem o formato esperado.",
    );
  }
  return decrypted;
}

export async function prepareValidatedTotpReplacement(
  cryptoAdapter,
  {
    appSecret,
    oldTotpSecret,
    newTotpSecret,
    confirmationCode,
    timestamp = Date.now(),
  },
) {
  requireNonEmptyString(appSecret, "APP_SECRET");
  if (!TOTP_SECRET_PATTERN.test(oldTotpSecret) || !TOTP_SECRET_PATTERN.test(newTotpSecret)) {
    throw new ProfessionalMfaRotationError(
      "invalid-totp-secret",
      "A chave TOTP anterior ou a nova não tem o formato esperado.",
    );
  }
  if (oldTotpSecret === newTotpSecret) {
    throw new ProfessionalMfaRotationError(
      "unchanged-totp-secret",
      "A nova chave TOTP precisa ser diferente da anterior.",
    );
  }
  if (typeof confirmationCode !== "string" || !/^\d{6}$/u.test(confirmationCode)) {
    throw new ProfessionalMfaRotationError(
      "invalid-confirmation-code",
      "O código do novo autenticador não foi confirmado.",
    );
  }
  if (!Number.isFinite(timestamp)) {
    throw new ProfessionalMfaRotationError(
      "invalid-timestamp",
      "O instante usado para confirmar o autenticador é inválido.",
    );
  }

  const newCodeResult = await cryptoAdapter.verifyTotp(
    newTotpSecret,
    confirmationCode,
    null,
    timestamp,
  );
  if (newCodeResult?.valid !== true) {
    throw new ProfessionalMfaRotationError(
      "invalid-confirmation-code",
      "O código do novo autenticador não foi confirmado.",
    );
  }
  if (
    typeof newCodeResult.counter !== "number" ||
    !Number.isSafeInteger(newCodeResult.counter) ||
    newCodeResult.counter < 0
  ) {
    throw new ProfessionalMfaRotationError(
      "invalid-confirmation-result",
      "O autenticador retornou um contador técnico inválido.",
    );
  }

  const acceptedByOldSecret = await cryptoAdapter.verifyTotp(
    oldTotpSecret,
    confirmationCode,
    null,
    timestamp,
  );
  if (acceptedByOldSecret?.valid === true) {
    throw new ProfessionalMfaRotationError(
      "totp-code-collision",
      "O código coincidiu com o MFA anterior; gere uma nova chave antes de continuar.",
    );
  }

  return {
    newTotpSecret,
    replacementTotpCiphertext: requirePlausibleCiphertext(
      await cryptoAdapter.encrypt(appSecret, newTotpSecret),
      "replacementTotpCiphertext",
    ),
    acceptedCounter: newCodeResult.counter,
  };
}

function rowsFrom(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function requireCount(value, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ProfessionalMfaRotationError(
      "invalid-session-summary",
      `A contagem técnica ${field} retornada pelo banco é inválida.`,
    );
  }
  return value;
}

export async function inspectProfessionalTarget(database) {
  const result = await database.prepare(INSPECT_PROFESSIONAL_SQL).all();
  const professionals = rowsFrom(result);

  if (professionals.length !== 1) {
    throw new ProfessionalMfaRotationError(
      "professional-count",
      "A manutenção exige exatamente uma conta profissional no banco selecionado.",
    );
  }

  const [professional] = professionals;
  if (
    typeof professional.id !== "string" ||
    professional.id.trim().length === 0 ||
    professional.role !== "therapist" ||
    professional.status !== "active" ||
    typeof professional.totp_secret !== "string" ||
    !ENCRYPTED_SECRET_PATTERN.test(professional.totp_secret)
  ) {
    throw new ProfessionalMfaRotationError(
      "professional-state",
      "A conta profissional não está em um estado compatível com a rotação controlada.",
    );
  }

  return {
    id: professional.id,
    role: professional.role,
    status: professional.status,
    totpSecretCiphertext: professional.totp_secret,
  };
}

export async function readSessionSummary(database, professionalId) {
  const result = await database
    .prepare(SESSION_SUMMARY_SQL)
    .bind(professionalId, professionalId)
    .all();
  const [summary] = rowsFrom(result);
  if (rowsFrom(result).length !== 1) {
    throw new ProfessionalMfaRotationError(
      "invalid-session-summary",
      "O banco não retornou uma única linha de resumo das sessões.",
    );
  }
  return {
    professionalSessions: requireCount(summary?.professional_sessions, "professionalSessions"),
    otherSessions: requireCount(summary?.other_sessions, "otherSessions"),
  };
}

export async function executeAtomicProfessionalMfaRotation(
  database,
  {
    professionalId,
    expectedTotpCiphertext,
    replacementTotpCiphertext,
    auditId,
    createdAt,
  },
) {
  requireNonEmptyString(professionalId, "professionalId");
  requirePlausibleCiphertext(expectedTotpCiphertext, "expectedTotpCiphertext");
  requirePlausibleCiphertext(replacementTotpCiphertext, "replacementTotpCiphertext");
  requireNonEmptyString(auditId, "auditId");
  requireIsoTimestamp(createdAt);
  if (expectedTotpCiphertext === replacementTotpCiphertext) {
    throw new ProfessionalMfaRotationError(
      "unchanged-ciphertext",
      "A nova chave cifrada precisa ser diferente da chave atual.",
    );
  }

  const statements = [
    database
      .prepare(UPDATE_PROFESSIONAL_SQL)
      .bind(replacementTotpCiphertext, professionalId, expectedTotpCiphertext),
    database
      .prepare(GUARDED_AUDIT_SQL)
      .bind(professionalId, replacementTotpCiphertext, auditId, createdAt),
    database.prepare(DELETE_PROFESSIONAL_SESSIONS_SQL).bind(professionalId),
  ];

  let results;
  try {
    results = await database.batch(statements);
  } catch {
    throw new ProfessionalMfaRotationError(
      "atomic-write-failed",
      "A operação atômica não foi confirmada. Não repita a rotação antes da pós-verificação.",
    );
  }

  if (!Array.isArray(results) || results.length !== statements.length) {
    throw new ProfessionalMfaRotationError(
      "unexpected-batch-result",
      "A resposta do lote está incompleta. Não repita a rotação antes da pós-verificação.",
    );
  }

  const updatedRows = rowsFrom(results?.[0]);
  if (updatedRows.length !== 1 || updatedRows[0]?.id !== professionalId) {
    throw new ProfessionalMfaRotationError(
      "unexpected-update-count",
      "O D1 não confirmou a alteração de exatamente uma conta profissional.",
    );
  }

  return { statements: results.length, updatedProfessionalId: professionalId };
}

export async function readRotationEvidence(database, { professionalId, auditId }) {
  const professionalResult = await database.prepare(POST_PROFESSIONAL_SQL).all();
  const professionals = rowsFrom(professionalResult);
  const sessionSummary = await readSessionSummary(database, professionalId);
  const auditResult = await database.prepare(POST_AUDIT_SQL).bind(auditId).all();

  return {
    professionals,
    sessionSummary,
    audits: rowsFrom(auditResult),
  };
}

export function assertSuccessfulRotationEvidence(
  evidence,
  { professionalId, replacementTotpCiphertext, otherSessionsBefore, auditId, createdAt },
) {
  if (evidence.professionals.length !== 1) {
    throw new ProfessionalMfaRotationError(
      "post-professional-count",
      "A pós-verificação não encontrou exatamente uma conta profissional.",
    );
  }

  const [professional] = evidence.professionals;
  if (
    professional.id !== professionalId ||
    professional.role !== "therapist" ||
    professional.status !== "active" ||
    professional.totp_secret !== replacementTotpCiphertext ||
    Number(professional.totp_enabled) !== 1 ||
    professional.last_totp_counter !== null
  ) {
    throw new ProfessionalMfaRotationError(
      "post-mfa-state",
      "A pós-verificação encontrou um estado de MFA diferente do esperado.",
    );
  }

  if (evidence.sessionSummary.professionalSessions !== 0) {
    throw new ProfessionalMfaRotationError(
      "post-professional-sessions",
      "Ainda existem sessões da conta profissional após a rotação.",
    );
  }

  if (evidence.sessionSummary.otherSessions !== otherSessionsBefore) {
    throw new ProfessionalMfaRotationError(
      "post-other-sessions",
      "A contagem de sessões de pacientes mudou durante a manutenção.",
    );
  }

  if (evidence.audits.length !== 1) {
    throw new ProfessionalMfaRotationError(
      "post-audit-count",
      "O evento técnico da rotação não foi confirmado.",
    );
  }

  const [audit] = evidence.audits;
  if (
    audit.id !== auditId ||
    audit.user_id !== professionalId ||
    audit.action !== "rotate_professional_mfa" ||
    audit.resource_type !== "account" ||
    audit.resource_id !== professionalId ||
    audit.created_at !== createdAt
  ) {
    throw new ProfessionalMfaRotationError(
      "post-audit-state",
      "O evento técnico da rotação está diferente do esperado.",
    );
  }

  return { professionalId, auditId };
}

export const professionalMfaRotationSql = Object.freeze({
  inspectProfessional: INSPECT_PROFESSIONAL_SQL,
  sessionSummary: SESSION_SUMMARY_SQL,
  guardedAudit: GUARDED_AUDIT_SQL,
  updateProfessional: UPDATE_PROFESSIONAL_SQL,
  deleteProfessionalSessions: DELETE_PROFESSIONAL_SESSIONS_SQL,
  postProfessional: POST_PROFESSIONAL_SQL,
  postAudit: POST_AUDIT_SQL,
});
