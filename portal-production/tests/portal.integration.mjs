import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const baseUrl = process.env.PORTAL_TEST_BASE_URL;
const setupSecret = process.env.PORTAL_TEST_SETUP_SECRET;
const databasePath = process.env.PORTAL_TEST_DB_PATH;

if (!baseUrl || !setupSecret || !databasePath) {
  throw new Error(
    "Defina PORTAL_TEST_BASE_URL, PORTAL_TEST_SETUP_SECRET e PORTAL_TEST_DB_PATH para executar a integração.",
  );
}

const testUrl = new URL(baseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(testUrl.hostname)) {
  throw new Error("A suíte de integração aceita somente um servidor local isolado.");
}

const synthetic = {
  therapistEmail: "profissional-integracao@example.test",
  therapistPassword: "SenhaProfissional123",
  patientEmailA: "paciente-a@example.test",
  patientEmailB: "paciente-b@example.test",
  patientPasswordA: "SenhaPacienteA123",
  patientPasswordB: "SenhaPacienteB123",
  sharedName: "Pessoa de Teste",
};

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/gu, "");
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const character of clean) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const signature = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = signature[signature.length - 1] & 15;
  const binary =
    ((signature[offset] & 127) << 24) |
    ((signature[offset + 1] & 255) << 16) |
    ((signature[offset + 2] & 255) << 8) |
    (signature[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}

function session() {
  return { cookie: "", csrf: "", user: null };
}

async function api(
  path,
  {
    method = "GET",
    body,
    auth,
    includeCsrf = true,
    includeOrigin = true,
    contentType = "application/json",
  } = {},
) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", contentType);
  if (includeOrigin) headers.set("origin", testUrl.origin);
  if (auth?.cookie) headers.set("cookie", auth.cookie);
  if (auth?.csrf && includeCsrf && method !== "GET") {
    headers.set("x-csrf-token", auth.csrf);
  }
  const response = await fetch(new URL(`/api/portal${path}`, testUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie && auth) auth.cookie = setCookie.split(";")[0];
  const payload =
    response.status === 204
      ? null
      : await response.json().catch(() => ({ error: "Resposta inválida." }));
  if (auth && payload?.csrf) auth.csrf = payload.csrf;
  if (auth && payload?.user) auth.user = payload.user;
  return { response, payload };
}

function expectStatus(result, status, context) {
  assert.equal(
    result.response.status,
    status,
    `${context}: esperado ${status}, recebido ${result.response.status}`,
  );
}

async function createInvitation(therapist) {
  const result = await api("/invitations", {
    method: "POST",
    body: { valid_days: 7 },
    auth: therapist,
  });
  expectStatus(result, 201, "criação de convite");
  assert.match(result.payload.code, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/u);
  return result.payload;
}

async function expireInvitation(invitationId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath);
  try {
    const result = database
      .prepare("UPDATE invitations SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1_000).toISOString(), invitationId);
    assert.equal(result.changes, 1, "o convite sintético deve existir no banco local");
  } finally {
    database.close();
  }
}

async function setAssistedRecoveryExpiration(patientId, expiresAt) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath);
  try {
    const result = database
      .prepare("UPDATE assisted_recovery_grants SET expires_at = ? WHERE user_id = ?")
      .run(expiresAt, patientId);
    assert.equal(result.changes, 1, "a recuperação assistida deve existir no banco local");
  } finally {
    database.close();
  }
}

async function registrationState(invitationId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const count = (query) => database.prepare(query).get().value;
    const invitation = database
      .prepare("SELECT used_at, patient_id FROM invitations WHERE id = ?")
      .get(invitationId);
    return {
      patients: count("SELECT COUNT(*) AS value FROM users WHERE role = 'patient'"),
      links: count("SELECT COUNT(*) AS value FROM patient_links"),
      patientSessions: count(
        `SELECT COUNT(*) AS value
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE users.role = 'patient'`,
      ),
      registrationAudits: count(
        "SELECT COUNT(*) AS value FROM access_logs WHERE action = 'register'",
      ),
      invitationUsedAt: invitation.used_at,
      invitationPatientId: invitation.patient_id,
    };
  } finally {
    database.close();
  }
}

async function storedPrivacyVersion(userId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare("SELECT privacy_version FROM users WHERE id = ?")
      .get(userId)?.privacy_version;
  } finally {
    database.close();
  }
}

async function patientMapDraftRowCount(patientId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare(
        "SELECT COUNT(*) AS total FROM patient_map_draft_fields WHERE patient_id = ?",
      )
      .get(patientId).total;
  } finally {
    database.close();
  }
}

async function patientMapDraftRows(patientId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare(
        `SELECT content_version, field_type, field_id, generation, value,
                revision, request_id
         FROM patient_map_draft_fields
         WHERE patient_id = ?
         ORDER BY content_version, field_type, field_id`,
      )
      .all(patientId)
      .map((row) => ({ ...row }));
  } finally {
    database.close();
  }
}

async function insertSyntheticStaleMapField(patientId, contentVersion) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath);
  try {
    database
      .prepare(
        `INSERT INTO patient_map_draft_fields
          (patient_id, content_version, field_type, field_id, generation, value,
           revision, request_id, updated_at)
         VALUES (?, ?, 'synthesis', 'want-more', 1, ?, 1, ?, ?)`,
      )
      .run(
        patientId,
        contentVersion,
        JSON.stringify("Conteúdo sintético que uma limpeza antiga deveria ter removido."),
        "request-map-stale-retained-01",
        "2026-08-13T12:00:00.000Z",
      );
  } finally {
    database.close();
  }
}

async function patientMapShareRowCount(patientId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare("SELECT COUNT(*) AS total FROM patient_map_shares WHERE patient_id = ?")
      .get(patientId).total;
  } finally {
    database.close();
  }
}

async function entryThoughtReviewRowCount(entryId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare(
        "SELECT COUNT(*) AS total FROM entry_thought_reviews WHERE entry_id = ?",
      )
      .get(entryId).total;
  } finally {
    database.close();
  }
}

async function serializedAccessLogs() {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return JSON.stringify(database.prepare("SELECT * FROM access_logs").all());
  } finally {
    database.close();
  }
}

async function patientMapAuditCount() {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare(
        `SELECT COUNT(*) AS total
         FROM access_logs
         WHERE action LIKE '%map%' OR resource_type LIKE '%map%'`,
      )
      .get().total;
  } finally {
    database.close();
  }
}

async function setSyntheticRegistrationFailure(target, enabled) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath);
  const triggers = {
    batch: {
      name: "synthetic_registration_batch_failure",
      sql: `CREATE TRIGGER synthetic_registration_batch_failure
        BEFORE INSERT ON patient_links
        WHEN NEW.patient_id LIKE 'patient_%'
        BEGIN
          SELECT RAISE(ABORT, 'synthetic batch failure');
        END`,
    },
    session: {
      name: "synthetic_registration_session_failure",
      sql: `CREATE TRIGGER synthetic_registration_session_failure
        BEFORE INSERT ON sessions
        WHEN NEW.user_id LIKE 'patient_%'
        BEGIN
          SELECT RAISE(ABORT, 'synthetic session failure');
        END`,
    },
    audit: {
      name: "synthetic_registration_audit_failure",
      sql: `CREATE TRIGGER synthetic_registration_audit_failure
        BEFORE INSERT ON access_logs
        WHEN NEW.action = 'register'
        BEGIN
          SELECT RAISE(ABORT, 'synthetic audit failure');
        END`,
    },
  };
  const trigger = triggers[target];
  assert.ok(trigger, "a falha sintética precisa usar um alvo conhecido");
  try {
    database.exec(`DROP TRIGGER IF EXISTS ${trigger.name}`);
    if (enabled) database.exec(trigger.sql);
  } finally {
    database.close();
  }
}

async function registerPatient({
  invitationCode,
  email,
  password,
  adult = true,
  privacy = true,
}) {
  const patient = session();
  const result = await api("/register", {
    method: "POST",
    body: {
      invitation_code: invitationCode,
      name: synthetic.sharedName,
      email,
      password,
      adult_confirmation: adult,
      privacy_confirmation: privacy,
    },
    auth: patient,
  });
  return { patient, result };
}

async function createEntry(patient, values) {
  const result = await api("/entries", {
    method: "POST",
    body: values,
    auth: patient,
  });
  expectStatus(result, 201, "criação de registro");
  return result.payload.id;
}

const therapist = session();
const corruptedCookieSession = session();
corruptedCookieSession.cookie = "portal_session=%E0%A4%A";
const sessionWithCorruptedCookie = await api("/session", {
  auth: corruptedCookieSession,
});
expectStatus(
  sessionWithCorruptedCookie,
  200,
  "cookie de sessão corrompido tratado como acesso desconectado",
);
assert.equal(sessionWithCorruptedCookie.payload.user, null);

const untrustedOrigin = await api("/login", {
  method: "POST",
  body: {
    email: "origem-nao-confiavel@example.test",
    password: "SenhaDeOrigem123",
  },
  includeOrigin: false,
});
expectStatus(untrustedOrigin, 403, "ação mutável sem origem");

const unexpectedContentType = await api("/login", {
  method: "POST",
  body: {
    email: "formato-incorreto@example.test",
    password: "SenhaDeFormato123",
  },
  contentType: "text/plain",
});
expectStatus(unexpectedContentType, 415, "corpo mutável fora do formato JSON");

const oversizedBody = await api("/login", {
  method: "POST",
  body: {
    email: "corpo-grande@example.test",
    password: "x".repeat(65_000),
  },
});
expectStatus(oversizedBody, 413, "corpo maior que o limite");

const setup = await api("/setup", {
  method: "POST",
  body: {
    setup_secret: setupSecret,
    name: "Profissional de Integração",
    email: synthetic.therapistEmail,
    password: synthetic.therapistPassword,
  },
});
expectStatus(setup, 201, "configuração profissional");
assert.ok(setup.payload.totp_secret);
assert.ok(setup.payload.recovery_code);

const setupConfirmation = await api("/setup/confirm", {
  method: "POST",
  body: {
    setup_secret: setupSecret,
    email: synthetic.therapistEmail,
    totp: totp(setup.payload.totp_secret, Date.now() - 30_000),
  },
  auth: therapist,
});
expectStatus(setupConfirmation, 200, "confirmação de MFA");
assert.equal(therapist.user.role, "therapist");
const professionalSessionCookie =
  setupConfirmation.response.headers.get("set-cookie") ?? "";
assert.match(professionalSessionCookie, /^portal_session=[^;]+/u);
assert.match(professionalSessionCookie, /;\s*HttpOnly(?:;|$)/u);
assert.match(professionalSessionCookie, /;\s*SameSite=Strict(?:;|$)/u);
assert.match(professionalSessionCookie, /;\s*Path=\/(?:;|$)/u);
assert.match(professionalSessionCookie, /;\s*Max-Age=28800(?:;|$)/u);
assert.doesNotMatch(
  professionalSessionCookie,
  /;\s*Secure(?:;|$)/u,
  "o cookie local HTTP não deve simular o atributo Secure de produção HTTPS",
);

const professionalLoginWithoutMfa = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.therapistEmail,
    password: synthetic.therapistPassword,
    totp: "",
  },
});
expectStatus(professionalLoginWithoutMfa, 401, "login profissional sem MFA");

const professionalLogout = await api("/logout", {
  method: "POST",
  auth: therapist,
});
expectStatus(professionalLogout, 204, "saída da conta profissional");
const professionalSessionAfterLogout = await api("/professional/patients", {
  auth: therapist,
});
expectStatus(
  professionalSessionAfterLogout,
  401,
  "sessão profissional encerrada após sair",
);
const simultaneousProfessionalSessionA = session();
const simultaneousProfessionalSessionB = session();
const simultaneousProfessionalCode = totp(setup.payload.totp_secret);
const simultaneousProfessionalLogins = await Promise.all([
  api("/login", {
    method: "POST",
    body: {
      email: synthetic.therapistEmail,
      password: synthetic.therapistPassword,
      totp: simultaneousProfessionalCode,
    },
    auth: simultaneousProfessionalSessionA,
  }),
  api("/login", {
    method: "POST",
    body: {
      email: synthetic.therapistEmail,
      password: synthetic.therapistPassword,
      totp: simultaneousProfessionalCode,
    },
    auth: simultaneousProfessionalSessionB,
  }),
]);
assert.deepEqual(
  simultaneousProfessionalLogins
    .map(({ response }) => response.status)
    .sort((left, right) => left - right),
  [200, 401],
  "duas tentativas simultâneas não podem reutilizar o mesmo código MFA",
);
const successfulProfessionalSession =
  simultaneousProfessionalLogins[0].response.status === 200
    ? simultaneousProfessionalSessionA
    : simultaneousProfessionalSessionB;
Object.assign(therapist, successfulProfessionalSession);
assert.equal(therapist.user.role, "therapist");

const invitationA = await createInvitation(therapist);
const invitationB = await createInvitation(therapist);
const invitationToRevoke = await createInvitation(therapist);
const invitationForAgeCheck = await createInvitation(therapist);
const invitationToExpire = await createInvitation(therapist);
const invitationForDuplicateEmail = await createInvitation(therapist);

const invitationBeforeValidationErrors = await registrationState(
  invitationForAgeCheck.id,
);
const underageAttempt = await registerPatient({
  invitationCode: invitationForAgeCheck.code,
  email: "sem-confirmacao@example.test",
  password: "SenhaSemConfirmacao123",
  adult: false,
});
expectStatus(underageAttempt.result, 400, "cadastro sem confirmação de maioridade");
const privacyAttempt = await registerPatient({
  invitationCode: invitationForAgeCheck.code,
  email: "sem-privacidade@example.test",
  password: "SenhaSemPrivacidade123",
  privacy: false,
});
expectStatus(privacyAttempt.result, 400, "cadastro sem aceite da privacidade");
const weakPasswordAttempt = await registerPatient({
  invitationCode: invitationForAgeCheck.code,
  email: "senha-invalida@example.test",
  password: "curta1",
});
expectStatus(weakPasswordAttempt.result, 400, "cadastro com senha inválida");
const invalidInvitation = await registerPatient({
  invitationCode: "CODIGO-INVALIDO",
  email: "convite-invalido@example.test",
  password: "SenhaConviteInvalido123",
});
expectStatus(invalidInvitation.result, 400, "cadastro com convite inválido");
assert.deepEqual(
  await registrationState(invitationForAgeCheck.id),
  invitationBeforeValidationErrors,
  "erros de validação não podem consumir o convite",
);

for (let attempt = 1; attempt <= 7; attempt += 1) {
  const limited = await registerPatient({
    invitationCode: "CODIGO-INVALIDO",
    email: "limite-cadastro@example.test",
    password: "SenhaLimiteCadastro123",
  });
  expectStatus(
    limited.result,
    attempt === 7 ? 429 : 400,
    `limite de cadastro na tentativa ${attempt}`,
  );
}

const registeredA = await registerPatient({
  invitationCode: invitationA.code.replaceAll("-", " "),
  email: synthetic.patientEmailA,
  password: synthetic.patientPasswordA,
});
expectStatus(registeredA.result, 201, "cadastro do paciente A");
const patientA = registeredA.patient;
const recoveryA = registeredA.result.payload.recovery_code;
assert.equal(
  await storedPrivacyVersion(patientA.user.id),
  "2026-08-20",
  "novo cadastro deve registrar a versão atual do aviso de privacidade",
);

const duplicateEmail = await registerPatient({
  invitationCode: invitationForDuplicateEmail.code,
  email: synthetic.patientEmailA,
  password: "OutraSenhaPaciente123",
});
expectStatus(duplicateEmail.result, 400, "cadastro com e-mail duplicado");
assert.equal(
  duplicateEmail.result.payload.error,
  "Não foi possível criar a conta. Confira o convite e o e-mail ou tente entrar se você já tiver uma conta.",
  "cadastro duplicado deve responder sem confirmar a existência da conta",
);
assert.equal(
  (await registrationState(invitationForDuplicateEmail.id)).invitationUsedAt,
  null,
  "e-mail duplicado não pode consumir o convite",
);

const invitationReuse = await registerPatient({
  invitationCode: invitationA.code,
  email: "reuso@example.test",
  password: "SenhaReusoTeste123",
});
expectStatus(invitationReuse.result, 400, "reutilização do convite");

const registeredB = await registerPatient({
  invitationCode: invitationB.code,
  email: synthetic.patientEmailB,
  password: synthetic.patientPasswordB,
});
expectStatus(registeredB.result, 201, "cadastro do paciente B");
const patientB = registeredB.patient;

const mapContentVersion = "mapa-pessoal-refinado-ouro-v1";
const mapItemId = "meu-jeito.01.1";
const initialMapA = await api("/map-draft", { auth: patientA });
expectStatus(initialMapA, 200, "Meu mapa vazio do paciente");
assert.deepEqual(initialMapA.payload, {
  content_version: mapContentVersion,
  generation: 1,
  fields: [],
});
expectStatus(
  await api("/map-draft", { auth: therapist }),
  403,
  "profissional tentando consultar rascunho do Meu mapa",
);
expectStatus(
  await api("/map-draft"),
  401,
  "consulta do Meu mapa sem sessão",
);

const mapPatchWithoutCsrf = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-no-csrf-0001",
    field: {
      type: "answer",
      id: mapItemId,
      value: { response: "curious", note: "Somente um teste sintético." },
    },
  },
  auth: patientA,
  includeCsrf: false,
});
expectStatus(mapPatchWithoutCsrf, 403, "salvamento do Meu mapa sem CSRF");

const invalidMapField = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-invalid-field-01",
    field: {
      type: "answer",
      id: "item.que-nao-existe",
      value: { response: "curious", note: "" },
    },
  },
  auth: patientA,
});
expectStatus(invalidMapField, 400, "campo fora do catálogo do Meu mapa");

const unexpectedMapProperty = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-extra-property-1",
    field: { type: "answer", id: mapItemId, value: null },
    patient_id: patientB.user.id,
  },
  auth: patientA,
});
expectStatus(unexpectedMapProperty, 400, "propriedade inesperada no Meu mapa");

const mapAnswerRequestId = "request-map-answer-a-0001";
const firstMapAnswer = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: mapAnswerRequestId,
    field: {
      type: "answer",
      id: mapItemId,
      value: {
        response: "curious",
        note: "Observação inteiramente sintética e privada.",
      },
    },
  },
  auth: patientA,
});
expectStatus(firstMapAnswer, 200, "primeiro campo do Meu mapa");
assert.equal(firstMapAnswer.payload.field.revision, 1);
assert.equal(firstMapAnswer.payload.idempotent, false);

const idempotentMapRetry = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: mapAnswerRequestId,
    field: {
      type: "answer",
      id: mapItemId,
      value: {
        response: "curious",
        note: "Observação inteiramente sintética e privada.",
      },
    },
  },
  auth: patientA,
});
expectStatus(idempotentMapRetry, 200, "repetição idempotente do Meu mapa");
assert.equal(idempotentMapRetry.payload.field.revision, 1);
assert.equal(idempotentMapRetry.payload.idempotent, true);

const reusedMapRequest = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 1,
    request_id: mapAnswerRequestId,
    field: {
      type: "answer",
      id: mapItemId,
      value: { response: "not_fit", note: "Outro valor sintético." },
    },
  },
  auth: patientA,
});
expectStatus(reusedMapRequest, 409, "request_id reutilizado com outro conteúdo");
assert.equal(reusedMapRequest.payload.code, "map_draft_request_reused");

const mapPosition = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-position-a-0001",
    field: {
      type: "position",
      id: "meu-jeito",
      value: { sectionIndex: 0, itemIndex: 1 },
    },
  },
  auth: patientA,
});
expectStatus(mapPosition, 200, "posição válida do Meu mapa");

const longSyntheticSynthesis = '"'.repeat(1_000);
const mapSynthesis = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-synthesis-a-001",
    field: {
      type: "synthesis",
      id: "already-fits",
      value: longSyntheticSynthesis,
    },
  },
  auth: patientA,
});
expectStatus(mapSynthesis, 200, "síntese de 1000 caracteres escapados");

const oversizedMapSynthesis = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-synthesis-too-long",
    field: {
      type: "synthesis",
      id: "want-more",
      value: "x".repeat(1_001),
    },
  },
  auth: patientA,
});
expectStatus(oversizedMapSynthesis, 400, "síntese além do limite");

const patientBMapAnswer = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-answer-b-0001",
    field: {
      type: "answer",
      id: mapItemId,
      value: { response: "fits", note: "Outro paciente sintético." },
    },
  },
  auth: patientB,
});
expectStatus(patientBMapAnswer, 200, "campo isolado do paciente B");
const patientBMap = await api("/map-draft", { auth: patientB });
assert.equal(patientBMap.payload.fields.length, 1);
assert.equal(patientBMap.payload.fields[0].value.response, "fits");
const persistedMapA = await api("/map-draft", { auth: patientA });
assert.equal(persistedMapA.payload.fields.length, 3);
assert.equal(
  persistedMapA.payload.fields.find((field) => field.type === "answer").value.response,
  "curious",
);
assert.equal(
  persistedMapA.payload.fields.find((field) => field.type === "synthesis").value,
  longSyntheticSynthesis,
);
assert.equal(await patientMapAuditCount(), 0, "Meu mapa não deve gerar auditoria de conteúdo");

const revoked = await api(`/invitations/${invitationToRevoke.id}`, {
  method: "DELETE",
  auth: therapist,
});
expectStatus(revoked, 204, "revogação de convite");
const revokedReuse = await registerPatient({
  invitationCode: invitationToRevoke.code,
  email: "revogado@example.test",
  password: "SenhaRevogada123",
});
expectStatus(revokedReuse.result, 400, "uso de convite revogado");

await expireInvitation(invitationToExpire.id);
const expiredReuse = await registerPatient({
  invitationCode: invitationToExpire.code,
  email: "expirado@example.test",
  password: "SenhaExpirada123",
});
expectStatus(expiredReuse.result, 400, "uso de convite expirado");

const privateEntryA = await createEntry(patientA, {
  title: "Registro privado sintético",
  happened: "Conteúdo privado de teste.",
  body: "",
  thoughts: "",
  urge: "",
  emotion: "",
  intensity: 0,
  message: "",
});
const sharedEntryA = await createEntry(patientA, {
  title: "Título sintético muito longo ".repeat(4).trim(),
  happened:
    "Primeiro parágrafo sintético.\n\nSegundo parágrafo com https://example.test/caminho/muito-longo-sem-dados-reais e <script>texto</script>.",
  body: "Tensão sintética.",
  thoughts: "Pensamento sintético.",
  urge: "Ação sintética.",
  emotion: "Ansiedade / Alívio",
  intensity: 10,
  message: "Conteúdo sintético para retomar.",
});
const sharedEntryB = await createEntry(patientB, {
  title: "Outro registro sintético",
  happened: "Situação inteiramente fictícia.",
  body: "",
  thoughts: "",
  urge: "",
  emotion: "Alegria",
  intensity: 0,
  message: "",
});

const initialEntriesWithReviewShape = await api("/entries", { auth: patientA });
expectStatus(
  initialEntriesWithReviewShape,
  200,
  "forma inicial da revisão de pensamento",
);
assert.ok(
  initialEntriesWithReviewShape.payload.entries.every(
    (entry) => entry.thought_review === null,
  ),
  "cada registro sem revisão deve expor thought_review nulo",
);

const thoughtReviewBody = {
  source_thought: "  Pensamento sintético.\r\n  ",
  supporting_context: "Um contexto sintético faz a interpretação parecer possível.",
  missing_context: "",
  alternative_view: "",
  current_view: "",
  expected_revision: 0,
};
expectStatus(
  await api(`/entries/${sharedEntryA}/thought-review`, {
    method: "PATCH",
    body: thoughtReviewBody,
  }),
  401,
  "revisão sem sessão",
);
expectStatus(
  await api(`/entries/${sharedEntryA}/thought-review`, {
    method: "PATCH",
    body: thoughtReviewBody,
    auth: therapist,
  }),
  403,
  "profissional alterando revisão",
);
expectStatus(
  await api(`/entries/${sharedEntryA}/thought-review`, {
    method: "PATCH",
    body: thoughtReviewBody,
    auth: patientB,
  }),
  404,
  "paciente B alterando revisão do paciente A",
);
expectStatus(
  await api(`/entries/${sharedEntryA}/thought-review`, {
    method: "PATCH",
    body: thoughtReviewBody,
    auth: patientA,
    includeCsrf: false,
  }),
  403,
  "revisão sem CSRF",
);
expectStatus(
  await api(`/entries/${sharedEntryA}/thought-review`, {
    method: "PATCH",
    body: { ...thoughtReviewBody, patient_id: patientB.user.id },
    auth: patientA,
  }),
  400,
  "revisão com propriedade inesperada",
);
expectStatus(
  await api(`/entries/${sharedEntryA}/thought-review`, {
    method: "PATCH",
    body: { ...thoughtReviewBody, source_thought: "x".repeat(1_501) },
    auth: patientA,
  }),
  400,
  "revisão acima do limite",
);

const createdThoughtReview = await api(
  `/entries/${sharedEntryA}/thought-review`,
  {
    method: "PATCH",
    body: thoughtReviewBody,
    auth: patientA,
  },
);
expectStatus(createdThoughtReview, 200, "criação da revisão de pensamento");
assert.equal(createdThoughtReview.payload.thought_review.revision, 1);
assert.equal(
  createdThoughtReview.payload.thought_review.source_thought,
  "Pensamento sintético.",
);
assert.equal(
  createdThoughtReview.payload.thought_review.missing_context,
  "",
  "as respostas complementares continuam opcionais",
);

const entryBeforeCreateConflict = (
  await api("/entries", { auth: patientA })
).payload.entries.find((entry) => entry.id === sharedEntryA);
const duplicateCreateReview = await api(
  `/entries/${sharedEntryA}/thought-review`,
  {
    method: "PATCH",
    body: thoughtReviewBody,
    auth: patientA,
  },
);
expectStatus(duplicateCreateReview, 409, "criação concorrente da revisão");
assert.equal(
  duplicateCreateReview.payload.code,
  "entry_thought_review_conflict",
);
assert.equal(duplicateCreateReview.payload.current_review.revision, 1);
const entryAfterCreateConflict = (
  await api("/entries", { auth: patientA })
).payload.entries.find((entry) => entry.id === sharedEntryA);
assert.equal(
  entryAfterCreateConflict.updated_at,
  entryBeforeCreateConflict.updated_at,
  "um conflito não pode marcar o registro como alterado",
);

const concurrentReviewBodies = [
  {
    ...thoughtReviewBody,
    supporting_context: "Atualização sintética da primeira aba.",
    expected_revision: 1,
  },
  {
    ...thoughtReviewBody,
    supporting_context: "Atualização sintética da segunda aba.",
    expected_revision: 1,
  },
];
const concurrentReviewResults = await Promise.all(
  concurrentReviewBodies.map((body) =>
    api(`/entries/${sharedEntryA}/thought-review`, {
      method: "PATCH",
      body,
      auth: patientA,
    }),
  ),
);
assert.deepEqual(
  concurrentReviewResults.map((result) => result.response.status).sort(),
  [200, 409],
  "somente uma aba pode vencer a mesma revisão",
);
const winningThoughtReview = concurrentReviewResults.find(
  (result) => result.response.status === 200,
).payload.thought_review;
const losingThoughtReview = concurrentReviewResults.find(
  (result) => result.response.status === 409,
);
assert.equal(winningThoughtReview.revision, 2);
assert.equal(
  losingThoughtReview.payload.code,
  "entry_thought_review_conflict",
);
assert.deepEqual(
  losingThoughtReview.payload.current_review,
  winningThoughtReview,
  "a aba perdedora recebe a versão realmente salva",
);

const staleDeleteReview = await api(
  `/entries/${sharedEntryA}/thought-review`,
  {
    method: "DELETE",
    body: { expected_revision: 1 },
    auth: patientA,
  },
);
expectStatus(staleDeleteReview, 409, "exclusão com revisão antiga");
assert.equal(staleDeleteReview.payload.code, "entry_thought_review_conflict");
assert.equal(staleDeleteReview.payload.current_review.revision, 2);

const temporaryPrivateReview = await api(
  `/entries/${privateEntryA}/thought-review`,
  {
    method: "PATCH",
    body: {
      ...thoughtReviewBody,
      source_thought: "Pensamento privado sintético.",
    },
    auth: patientA,
  },
);
expectStatus(temporaryPrivateReview, 200, "revisão de registro privado");
expectStatus(
  await api(`/entries/${privateEntryA}/thought-review`, {
    method: "DELETE",
    body: {
      expected_revision: temporaryPrivateReview.payload.thought_review.revision,
      shared: true,
    },
    auth: patientA,
  }),
  400,
  "exclusão de revisão com propriedade inesperada",
);
expectStatus(
  await api(`/entries/${privateEntryA}/thought-review`, {
    method: "DELETE",
    body: {
      expected_revision: temporaryPrivateReview.payload.thought_review.revision,
    },
    auth: patientA,
    includeCsrf: false,
  }),
  403,
  "exclusão de revisão sem CSRF",
);
expectStatus(
  await api(`/entries/${privateEntryA}/thought-review`, {
    method: "DELETE",
    body: {
      expected_revision: temporaryPrivateReview.payload.thought_review.revision,
    },
    auth: patientA,
    includeOrigin: false,
  }),
  403,
  "exclusão de revisão sem origem confiável",
);
const deletedPrivateReview = await api(
  `/entries/${privateEntryA}/thought-review`,
  {
    method: "DELETE",
    body: {
      expected_revision: temporaryPrivateReview.payload.thought_review.revision,
    },
    auth: patientA,
  },
);
expectStatus(deletedPrivateReview, 200, "exclusão somente da revisão");
assert.ok(deletedPrivateReview.payload.updated_at);
assert.equal(await entryThoughtReviewRowCount(privateEntryA), 0);
const entriesAfterPrivateReviewDeletion = await api("/entries", {
  auth: patientA,
});
assert.equal(
  entriesAfterPrivateReviewDeletion.payload.entries.find(
    (entry) => entry.id === privateEntryA,
  ).thought_review,
  null,
);
const persistentPrivateReview = await api(
  `/entries/${privateEntryA}/thought-review`,
  {
    method: "PATCH",
    body: {
      ...thoughtReviewBody,
      source_thought: "Revisão que deve continuar inteiramente privada.",
      supporting_context: "Conteúdo privado sintético e invisível ao profissional.",
    },
    auth: patientA,
  },
);
expectStatus(
  persistentPrivateReview,
  200,
  "revisão que permanece em registro privado",
);

const missingCsrf = await api(`/entries/${privateEntryA}/sharing`, {
  method: "PATCH",
  body: { shared: true },
  auth: patientA,
  includeCsrf: false,
});
expectStatus(missingCsrf, 403, "compartilhamento sem CSRF");

for (const [patient, entryId] of [
  [patientA, sharedEntryA],
  [patientB, sharedEntryB],
]) {
  const sharing = await api(`/entries/${entryId}/sharing`, {
    method: "PATCH",
    body: { shared: true },
    auth: patient,
  });
  expectStatus(sharing, 200, "compartilhamento explícito");
}

const patientLogout = await api("/logout", {
  method: "POST",
  auth: patientA,
});
expectStatus(patientLogout, 204, "saída da conta do paciente");
const patientSessionAfterLogout = await api("/entries", { auth: patientA });
expectStatus(
  patientSessionAfterLogout,
  401,
  "sessão do paciente encerrada após sair",
);
const patientRelogin = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    password: synthetic.patientPasswordA,
  },
  auth: patientA,
});
expectStatus(patientRelogin, 200, "novo login do paciente");
const persistedEntriesAfterRelogin = await api("/entries", { auth: patientA });
expectStatus(
  persistedEntriesAfterRelogin,
  200,
  "registros preservados após sair e entrar novamente",
);
assert.deepEqual(
  new Set(persistedEntriesAfterRelogin.payload.entries.map((entry) => entry.id)),
  new Set([privateEntryA, sharedEntryA]),
);

const patientASecondSession = session();
const patientASecondLogin = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    password: synthetic.patientPasswordA,
  },
  auth: patientASecondSession,
});
expectStatus(patientASecondLogin, 200, "segunda sessão do paciente");

const mapAfterRelogin = await api("/map-draft", { auth: patientA });
expectStatus(mapAfterRelogin, 200, "Meu mapa preservado depois de novo login");
assert.equal(mapAfterRelogin.payload.fields.length, 3);

const firstTabMapUpdate = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 1,
    request_id: "request-map-first-tab-0002",
    field: {
      type: "answer",
      id: mapItemId,
      value: { response: "contextual", note: "Alteração da primeira aba." },
    },
  },
  auth: patientA,
});
expectStatus(firstTabMapUpdate, 200, "alteração do Meu mapa na primeira aba");
assert.equal(firstTabMapUpdate.payload.field.revision, 2);

const staleSecondTabMapUpdate = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 1,
    request_id: "request-map-stale-tab-0001",
    field: {
      type: "answer",
      id: mapItemId,
      value: { response: "tolerate", note: "Alteração concorrente sintética." },
    },
  },
  auth: patientASecondSession,
});
expectStatus(staleSecondTabMapUpdate, 409, "conflito entre duas abas do Meu mapa");
assert.equal(staleSecondTabMapUpdate.payload.code, "map_draft_field_conflict");
assert.equal(staleSecondTabMapUpdate.payload.field.revision, 2);
assert.equal(staleSecondTabMapUpdate.payload.field.value.response, "contextual");

const resolvedSecondTabMapUpdate = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 2,
    request_id: "request-map-resolved-tab-001",
    field: {
      type: "answer",
      id: mapItemId,
      value: { response: "tolerate", note: "Conflito resolvido de forma sintética." },
    },
  },
  auth: patientASecondSession,
});
expectStatus(resolvedSecondTabMapUpdate, 200, "conflito do Meu mapa resolvido");
assert.equal(resolvedSecondTabMapUpdate.payload.field.revision, 3);

const mapTombstone = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 3,
    request_id: "request-map-tombstone-a-001",
    field: { type: "answer", id: mapItemId, value: null },
  },
  auth: patientA,
});
expectStatus(mapTombstone, 200, "tombstone de campo do Meu mapa");
assert.equal(mapTombstone.payload.field.value, null);
assert.equal(mapTombstone.payload.field.revision, 4);
const mapWithTombstone = await api("/map-draft", { auth: patientA });
assert.equal(
  mapWithTombstone.payload.fields.find((field) => field.type === "answer").value,
  null,
);

const mapClearWithoutCsrf = await api("/map-draft", {
  method: "DELETE",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    request_id: "request-map-clear-no-csrf-1",
  },
  auth: patientA,
  includeCsrf: false,
});
expectStatus(mapClearWithoutCsrf, 403, "limpeza do Meu mapa sem CSRF");

const mapClearWithExtraProperty = await api("/map-draft", {
  method: "DELETE",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    request_id: "request-map-clear-extra-0001",
    patient_id: patientB.user.id,
  },
  auth: patientA,
});
expectStatus(mapClearWithExtraProperty, 400, "limpeza do Meu mapa com dado inesperado");

const mapClearRequestId = "request-map-clear-a-0001";
const clearedMap = await api("/map-draft", {
  method: "DELETE",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    request_id: mapClearRequestId,
  },
  auth: patientA,
});
expectStatus(clearedMap, 200, "limpeza integral do Meu mapa");
assert.equal(clearedMap.payload.generation, 2);
assert.equal(clearedMap.payload.idempotent, false);
await insertSyntheticStaleMapField(patientA.user.id, mapContentVersion);
assert.equal(
  (await patientMapDraftRows(patientA.user.id)).length,
  2,
  "o cenário de regressão deve conter uma linha residual de geração antiga",
);
const idempotentMapClear = await api("/map-draft", {
  method: "DELETE",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    request_id: mapClearRequestId,
  },
  auth: patientA,
});
expectStatus(idempotentMapClear, 200, "repetição idempotente da limpeza do Meu mapa");
assert.equal(idempotentMapClear.payload.generation, 2);
assert.equal(idempotentMapClear.payload.idempotent, true);
assert.deepEqual((await api("/map-draft", { auth: patientA })).payload.fields, []);
assert.deepEqual(
  await patientMapDraftRows(patientA.user.id),
  [
    {
      content_version: mapContentVersion,
      field_type: "state",
      field_id: "__state__",
      generation: 2,
      value: null,
      revision: 1,
      request_id: mapClearRequestId,
    },
  ],
  "limpar deve remover fisicamente respostas, sínteses, posições e tombstones antigos",
);
assert.equal(
  (await patientMapDraftRows(patientB.user.id)).length,
  2,
  "limpar o mapa de um paciente não pode remover o conteúdo de outro",
);

const staleGenerationMapPatch = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 4,
    request_id: "request-map-stale-generation",
    field: { type: "answer", id: mapItemId, value: null },
  },
  auth: patientASecondSession,
});
expectStatus(staleGenerationMapPatch, 409, "aba antiga depois de limpar o Meu mapa");
assert.equal(staleGenerationMapPatch.payload.code, "map_draft_generation_conflict");
assert.equal(staleGenerationMapPatch.payload.generation, 2);
assert.equal(
  (await patientMapDraftRows(patientA.user.id)).length,
  1,
  "uma aba antiga não pode ressuscitar conteúdo apagado",
);

const mapAfterGenerationReset = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 2,
    base_revision: 0,
    request_id: "request-map-new-generation-01",
    field: {
      type: "answer",
      id: mapItemId,
      value: { response: "unknown", note: "Resposta da nova geração." },
    },
  },
  auth: patientA,
});
expectStatus(mapAfterGenerationReset, 200, "campo recriado depois da limpeza");
assert.equal(mapAfterGenerationReset.payload.field.revision, 1);
assert.equal((await api("/map-draft", { auth: patientA })).payload.fields.length, 1);
const oldClearAfterNewContent = await api("/map-draft", {
  method: "DELETE",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    request_id: mapClearRequestId,
  },
  auth: patientASecondSession,
});
expectStatus(
  oldClearAfterNewContent,
  200,
  "repetição da limpeza depois de novo conteúdo",
);
assert.equal(oldClearAfterNewContent.payload.idempotent, true);
assert.equal(
  (await api("/map-draft", { auth: patientA })).payload.fields.length,
  1,
  "repetir uma limpeza antiga não pode apagar conteúdo da geração atual",
);

const therapistMapPatch = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 1,
    base_revision: 0,
    request_id: "request-map-professional-0001",
    field: { type: "answer", id: mapItemId, value: null },
  },
  auth: therapist,
});
expectStatus(therapistMapPatch, 403, "profissional tentando alterar o Meu mapa");

expectStatus(
  await api("/map-sharing", { auth: therapist }),
  403,
  "profissional tentando consultar estado privado de compartilhamento",
);
const mapShareWithoutCsrf = await api("/map-sharing/meu-jeito", {
  method: "PATCH",
  body: { shared: true },
  auth: patientA,
  includeCsrf: false,
});
expectStatus(mapShareWithoutCsrf, 403, "compartilhamento do mapa sem CSRF");
expectStatus(
  await api("/map-sharing/mapa-inexistente", {
    method: "PATCH",
    body: { shared: true },
    auth: patientA,
  }),
  404,
  "compartilhamento de parte inexistente",
);
const shareMapA = await api("/map-sharing/meu-jeito", {
  method: "PATCH",
  body: { shared: true },
  auth: patientA,
});
expectStatus(shareMapA, 200, "compartilhamento explícito do mapa A");
assert.equal(shareMapA.payload.share.map_id, "meu-jeito");
const shareMapB = await api("/map-sharing/meu-jeito", {
  method: "PATCH",
  body: { shared: true },
  auth: patientB,
});
expectStatus(shareMapB, 200, "compartilhamento explícito do mapa B");

const patientShareState = await api("/map-sharing", { auth: patientA });
expectStatus(patientShareState, 200, "paciente consulta compartilhamentos do mapa");
assert.equal(patientShareState.payload.shares.length, 1);
assert.equal(patientShareState.payload.shares[0].viewed_at, null);
const patientCannotReadProfessionalMap = await api(
  `/professional/patients/${patientB.user.id}/map-shares`,
  { auth: patientA },
);
expectStatus(patientCannotReadProfessionalMap, 403, "paciente acessando mapa de outro paciente");

const professionalMapA = await api(
  `/professional/patients/${patientA.user.id}/map-shares`,
  { auth: therapist },
);
expectStatus(professionalMapA, 200, "profissional consulta mapa compartilhado");
assert.equal(professionalMapA.payload.shares.length, 1);
assert.equal(professionalMapA.payload.shares[0].map_id, "meu-jeito");
assert.equal(professionalMapA.payload.shares[0].answers.length, 1);
assert.equal(professionalMapA.payload.shares[0].answers[0].response_label, "Ainda não sei");
assert.equal(professionalMapA.payload.shares[0].is_unread, 1);
assert.doesNotMatch(JSON.stringify(professionalMapA.payload), /already-fits|síntese/iu);

const mapViewedWithoutCsrf = await api(
  `/professional/patients/${patientA.user.id}/map-shares/meu-jeito/viewed`,
  { method: "POST", body: {}, auth: therapist, includeCsrf: false },
);
expectStatus(mapViewedWithoutCsrf, 403, "visualização do mapa sem CSRF");
const markMapViewed = await api(
  `/professional/patients/${patientA.user.id}/map-shares/meu-jeito/viewed`,
  { method: "POST", body: {}, auth: therapist },
);
expectStatus(markMapViewed, 200, "mapa marcado como visualizado");
assert.equal(
  (await api("/map-sharing", { auth: patientA })).payload.shares[0].viewed_at,
  markMapViewed.payload.viewed_at,
);

const revokeMapShare = await api("/map-sharing/meu-jeito", {
  method: "PATCH",
  body: { shared: false },
  auth: patientA,
});
expectStatus(revokeMapShare, 200, "retirada do compartilhamento do mapa");
assert.equal(await patientMapShareRowCount(patientA.user.id), 0);
assert.deepEqual(
  (
    await api(`/professional/patients/${patientA.user.id}/map-shares`, {
      auth: therapist,
    })
  ).payload.shares,
  [],
);
expectStatus(
  await api("/map-sharing/meu-jeito", {
    method: "PATCH",
    body: { shared: true },
    auth: patientA,
  }),
  200,
  "novo compartilhamento do mapa para testar encerramento de acesso",
);
const clearMapWithShare = await api("/map-draft", {
  method: "DELETE",
  body: {
    content_version: mapContentVersion,
    generation: 2,
    request_id: "request-map-clear-shared-0001",
  },
  auth: patientA,
});
expectStatus(clearMapWithShare, 200, "limpeza de mapa com cópia compartilhada");
assert.deepEqual(
  await patientMapDraftRows(patientA.user.id),
  [
    {
      content_version: mapContentVersion,
      field_type: "state",
      field_id: "__state__",
      generation: 3,
      value: null,
      revision: 2,
      request_id: "request-map-clear-shared-0001",
    },
  ],
  "uma nova limpeza também deve preservar somente o estado mínimo",
);
assert.equal(
  await patientMapShareRowCount(patientA.user.id),
  0,
  "limpar o mapa deve apagar também suas cópias compartilhadas",
);
expectStatus(
  await api("/map-draft", {
    method: "PATCH",
    body: {
      content_version: mapContentVersion,
      generation: 3,
      base_revision: 0,
      request_id: "request-map-after-shared-clear",
      field: {
        type: "answer",
        id: mapItemId,
        value: { response: "fits", note: "Nova resposta sintética." },
      },
    },
    auth: patientA,
  }),
  200,
  "novo campo após limpar mapa compartilhado",
);
expectStatus(
  await api("/map-sharing/meu-jeito", {
    method: "PATCH",
    body: { shared: true },
    auth: patientA,
  }),
  200,
  "compartilhamento recriado para testar encerramento de acesso",
);
const delayedOldClearAfterNewShare = await api("/map-draft", {
  method: "DELETE",
  body: {
    content_version: mapContentVersion,
    generation: 2,
    request_id: "request-map-clear-shared-0001",
  },
  auth: patientA,
});
expectStatus(
  delayedOldClearAfterNewShare,
  200,
  "repetição antiga da limpeza depois de um novo compartilhamento",
);
assert.equal(delayedOldClearAfterNewShare.payload.idempotent, true);
assert.equal(
  await patientMapShareRowCount(patientA.user.id),
  1,
  "repetir uma limpeza antiga não pode revogar um compartilhamento novo",
);
assert.equal(
  (await api("/map-draft", { auth: patientA })).payload.fields.length,
  1,
  "repetir uma limpeza antiga não pode remover conteúdo da geração atual",
);

const revokeSessionsWithoutCsrf = await api("/account/sessions", {
  method: "DELETE",
  body: { current_password: synthetic.patientPasswordA },
  auth: patientA,
  includeCsrf: false,
});
expectStatus(revokeSessionsWithoutCsrf, 403, "revogação de sessões sem CSRF");

const revokeSessionsWithoutPassword = await api("/account/sessions", {
  method: "DELETE",
  body: {},
  auth: patientA,
});
expectStatus(
  revokeSessionsWithoutPassword,
  400,
  "revogação de sessões sem informar a senha atual",
);

const revokeSessionsWrongPassword = await api("/account/sessions", {
  method: "DELETE",
  body: { current_password: "SenhaPacienteIncorreta123" },
  auth: patientA,
});
expectStatus(
  revokeSessionsWrongPassword,
  400,
  "revogação de sessões com a senha atual incorreta",
);
expectStatus(
  await api("/entries", { auth: patientASecondSession }),
  200,
  "segunda sessão preservada após confirmação inválida",
);

const revokePatientSessions = await api("/account/sessions", {
  method: "DELETE",
  body: { current_password: synthetic.patientPasswordA },
  auth: patientA,
});
expectStatus(revokePatientSessions, 204, "revogação de todas as sessões do paciente");
expectStatus(
  await api("/entries", { auth: patientA }),
  401,
  "sessão atual encerrada pela revogação global",
);
expectStatus(
  await api("/entries", { auth: patientASecondSession }),
  401,
  "segunda sessão encerrada pela revogação global",
);

const patientReloginAfterSessionRevocation = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    password: synthetic.patientPasswordA,
  },
  auth: patientA,
});
expectStatus(
  patientReloginAfterSessionRevocation,
  200,
  "novo login depois de encerrar todos os dispositivos",
);
expectStatus(
  await api("/entries", { auth: patientA }),
  200,
  "registros preservados após encerrar todas as sessões",
);

const patientCannotListProfessional = await api("/professional/patients", {
  auth: patientA,
});
expectStatus(patientCannotListProfessional, 403, "paciente no endpoint profissional");
const patientCannotListAccesses = await api("/professional/accesses", {
  auth: patientA,
});
expectStatus(patientCannotListAccesses, 403, "paciente listando acessos");
const patientCannotCreateInvite = await api("/invitations", {
  method: "POST",
  body: { valid_days: 7 },
  auth: patientA,
});
expectStatus(patientCannotCreateInvite, 403, "paciente criando convite");

const summaries = await api("/professional/patients", { auth: therapist });
expectStatus(summaries, 200, "lista profissional por paciente");
assert.equal(summaries.payload.patients.length, 2);
assert.equal(new Set(summaries.payload.patients.map((item) => item.patient_id)).size, 2);
assert.ok(summaries.payload.patients.every((item) => item.patient_name === synthetic.sharedName));
assert.ok(summaries.payload.patients.every((item) => item.shared_count === 1));
assert.ok(summaries.payload.patients.every((item) => item.unread_count === 1));
assert.ok(summaries.payload.patients.every((item) => item.shared_map_count === 1));
assert.ok(summaries.payload.patients.every((item) => item.unread_map_count === 1));
assert.deepEqual(summaries.payload.activity, {
  total_count: 3,
  shared_count: 2,
  private_count: 1,
});
assert.equal(
  summaries.payload.patients.find(
    (patient) => patient.patient_id === patientA.user.id,
  ).private_count,
  1,
);
assert.equal(
  summaries.payload.patients.find(
    (patient) => patient.patient_id === patientB.user.id,
  ).private_count,
  0,
);
assert.doesNotMatch(JSON.stringify(summaries.payload), /example\.test|password|recovery|totp/iu);

const entriesForA = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
expectStatus(entriesForA, 200, "registros compartilhados do paciente A");
assert.deepEqual(entriesForA.payload.entries.map((entry) => entry.id), [sharedEntryA]);
assert.equal(entriesForA.payload.entries[0].emotion, "Ansiedade / Alívio");
assert.match(entriesForA.payload.entries[0].happened, /<script>texto<\/script>/u);
assert.equal(entriesForA.payload.entries[0].is_unread, 1);
assert.equal(entriesForA.payload.entries[0].viewed_at, null);
assert.deepEqual(
  entriesForA.payload.entries[0].thought_review,
  winningThoughtReview,
  "o profissional recebe a revisão somente junto do registro compartilhado",
);
assert.ok(!entriesForA.payload.entries.some((entry) => entry.id === privateEntryA));
assert.doesNotMatch(
  JSON.stringify(entriesForA.payload),
  /inteiramente privada|Conteúdo privado sintético e invisível/iu,
  "o acesso profissional não pode receber a revisão de um registro privado",
);

const entriesForB = await api(
  `/professional/patients/${patientB.user.id}/entries`,
  { auth: therapist },
);
expectStatus(entriesForB, 200, "registros compartilhados do paciente B");
assert.deepEqual(entriesForB.payload.entries.map((entry) => entry.id), [sharedEntryB]);
assert.equal(entriesForB.payload.entries[0].is_unread, 1);
assert.equal(entriesForB.payload.entries[0].thought_review, null);

const patientCannotMarkViewed = await api(
  `/professional/entries/${sharedEntryB}/viewed`,
  {
    method: "POST",
    body: {},
    auth: patientA,
  },
);
expectStatus(
  patientCannotMarkViewed,
  403,
  "paciente marcando registro como visto",
);
const viewedWithoutCsrf = await api(
  `/professional/entries/${sharedEntryA}/viewed`,
  {
    method: "POST",
    body: {},
    auth: therapist,
    includeCsrf: false,
  },
);
expectStatus(viewedWithoutCsrf, 403, "leitura profissional sem CSRF");
const unknownEntryViewed = await api(
  "/professional/entries/entry_inexistente/viewed",
  {
    method: "POST",
    body: {},
    auth: therapist,
  },
);
expectStatus(unknownEntryViewed, 404, "leitura de registro sem acesso");
const markEntryAViewed = await api(
  `/professional/entries/${sharedEntryA}/viewed`,
  {
    method: "POST",
    body: {},
    auth: therapist,
  },
);
expectStatus(markEntryAViewed, 200, "registro marcado como visto");
assert.ok(new Date(markEntryAViewed.payload.viewed_at).getTime() <= Date.now());
const entriesAfterViewed = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
expectStatus(entriesAfterViewed, 200, "lista após leitura profissional");
assert.equal(entriesAfterViewed.payload.entries[0].is_unread, 0);
assert.equal(
  entriesAfterViewed.payload.entries[0].viewed_at,
  markEntryAViewed.payload.viewed_at,
);
const summariesAfterViewed = await api("/professional/patients", {
  auth: therapist,
});
expectStatus(summariesAfterViewed, 200, "contadores após leitura profissional");
assert.equal(
  summariesAfterViewed.payload.patients.find(
    (patient) => patient.patient_id === patientA.user.id,
  ).unread_count,
  0,
);
const patientEntriesAfterViewed = await api("/entries", { auth: patientA });
expectStatus(
  patientEntriesAfterViewed,
  200,
  "paciente consulta a situação de visualização",
);
assert.equal(
  patientEntriesAfterViewed.payload.entries.find(
    (entry) => entry.id === sharedEntryA,
  ).viewed_at,
  markEntryAViewed.payload.viewed_at,
);
assert.equal(
  summariesAfterViewed.payload.patients.find(
    (patient) => patient.patient_id === patientB.user.id,
  ).unread_count,
  1,
);

const initialAccesses = await api("/professional/accesses", { auth: therapist });
expectStatus(initialAccesses, 200, "lista profissional de acessos");
assert.equal(initialAccesses.payload.patients.length, 2);
assert.ok(
  initialAccesses.payload.patients.every(
    (patient) => patient.access_status === "active",
  ),
);
assert.doesNotMatch(
  JSON.stringify(initialAccesses.payload),
  /email|password|recovery|totp/iu,
);

const patientCannotRevokeAccess = await api(
  `/professional/patients/${patientB.user.id}/access`,
  {
    method: "PATCH",
    body: { active: false },
    auth: patientA,
  },
);
expectStatus(patientCannotRevokeAccess, 403, "paciente revogando outro acesso");

const unknownPatientAccess = await api(
  "/professional/patients/patient_inexistente/access",
  {
    method: "PATCH",
    body: { active: false },
    auth: therapist,
  },
);
expectStatus(unknownPatientAccess, 404, "revogação sem vínculo");

const revokePatientA = await api(
  `/professional/patients/${patientA.user.id}/access`,
  {
    method: "PATCH",
    body: { active: false },
    auth: therapist,
  },
);
expectStatus(revokePatientA, 200, "revogação de acesso do paciente");
assert.equal(revokePatientA.payload.access_status, "revoked");

const revokedPatientSession = await api("/entries", { auth: patientA });
expectStatus(revokedPatientSession, 401, "sessão encerrada após revogação");

const revokedPatientWrongPassword = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    password: "SenhaIncorreta123",
  },
});
expectStatus(
  revokedPatientWrongPassword,
  401,
  "login revogado com senha incorreta",
);
assert.equal(
  revokedPatientWrongPassword.payload.error,
  "E-mail, senha ou código inválidos.",
);

const revokedPatientLogin = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    password: synthetic.patientPasswordA,
  },
});
expectStatus(revokedPatientLogin, 403, "login após revogação");
assert.equal(
  revokedPatientLogin.payload.error,
  "Seu acesso à Área do paciente foi encerrado porque este recurso é exclusivo para pacientes em acompanhamento atual. Se acredita que houve um engano, fale com Mateus.",
);
assert.equal(
  revokedPatientLogin.response.headers.get("set-cookie"),
  null,
  "login revogado não deve criar sessão",
);

const accessesAfterRevocation = await api("/professional/accesses", {
  auth: therapist,
});
assert.equal(
  accessesAfterRevocation.payload.patients.find(
    (patient) => patient.patient_id === patientA.user.id,
  ).access_status,
  "revoked",
);
const professionalAfterPatientRevocation = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
assert.deepEqual(professionalAfterPatientRevocation.payload.entries, []);
assert.equal(
  await patientMapShareRowCount(patientA.user.id),
  0,
  "encerrar o acesso deve apagar as cópias compartilhadas do mapa",
);

const restorePatientA = await api(
  `/professional/patients/${patientA.user.id}/access`,
  {
    method: "PATCH",
    body: { active: true },
    auth: therapist,
  },
);
expectStatus(restorePatientA, 200, "restauração de acesso do paciente");
assert.equal(restorePatientA.payload.access_status, "active");
const restoredPatientLogin = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    password: synthetic.patientPasswordA,
  },
  auth: patientA,
});
expectStatus(restoredPatientLogin, 200, "login após restauração");
const patientReviewsAfterAccessRestore = await api("/entries", {
  auth: patientA,
});
expectStatus(
  patientReviewsAfterAccessRestore,
  200,
  "revisões preservadas durante o acesso encerrado",
);
assert.equal(
  patientReviewsAfterAccessRestore.payload.entries.find(
    (entry) => entry.id === sharedEntryA,
  ).thought_review.revision,
  2,
);
assert.equal(
  patientReviewsAfterAccessRestore.payload.entries.find(
    (entry) => entry.id === privateEntryA,
  ).thought_review.source_thought,
  "Revisão que deve continuar inteiramente privada.",
);
const professionalAfterRestore = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
assert.deepEqual(professionalAfterRestore.payload.entries.map((entry) => entry.id), [
  sharedEntryA,
]);

const unknownPatient = await api("/professional/patients/patient_inexistente/entries", {
  auth: therapist,
});
expectStatus(unknownPatient, 200, "identificador de paciente sem vínculo");
assert.deepEqual(unknownPatient.payload.entries, []);

const patientAEditsB = await api(`/entries/${sharedEntryB}`, {
  method: "PATCH",
  body: {
    title: "Tentativa sintética",
    happened: "Não deve alterar.",
    body: "",
    thoughts: "",
    urge: "",
    emotion: "",
    intensity: 5,
    message: "",
  },
  auth: patientA,
});
expectStatus(patientAEditsB, 404, "paciente A editando registro de B");
const patientADeletesB = await api(`/entries/${sharedEntryB}`, {
  method: "DELETE",
  auth: patientA,
});
expectStatus(patientADeletesB, 404, "paciente A excluindo registro de B");

const professionalEditsEntry = await api(`/entries/${sharedEntryB}`, {
  method: "PATCH",
  body: {
    title: "Tentativa profissional",
    happened: "Não deve alterar.",
    body: "",
    thoughts: "",
    urge: "",
    emotion: "",
    intensity: 5,
    message: "",
  },
  auth: therapist,
});
expectStatus(professionalEditsEntry, 403, "profissional editando registro");

const updatedText = "Texto sintético atualizado enquanto compartilhado.";
const patientUpdate = await api(`/entries/${sharedEntryA}`, {
  method: "PATCH",
  body: {
    title: "Registro sintético atualizado",
    happened: updatedText,
    body: "",
    thoughts: "",
    urge: "",
    emotion: "Calma / Curiosidade",
    intensity: 0,
    message: "",
  },
  auth: patientA,
});
expectStatus(patientUpdate, 200, "edição pelo proprietário");
const updatedProfessionalView = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
assert.equal(updatedProfessionalView.payload.entries[0].happened, updatedText);
assert.equal(updatedProfessionalView.payload.entries[0].is_unread, 1);
assert.equal(
  updatedProfessionalView.payload.entries[0].thought_review.source_thought,
  "Pensamento sintético.",
  "editar o pensamento original não pode apagar nem sobrescrever a revisão",
);

const sharingRevoked = await api(`/entries/${sharedEntryA}/sharing`, {
  method: "PATCH",
  body: { shared: false },
  auth: patientA,
});
expectStatus(sharingRevoked, 200, "retirada do compartilhamento");
const afterRevocation = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
assert.deepEqual(afterRevocation.payload.entries, []);
const activityAfterRevocation = await api("/professional/patients", {
  auth: therapist,
});
const patientAActivity = activityAfterRevocation.payload.patients.find(
  (patient) => patient.patient_id === patientA.user.id,
);
assert.equal(patientAActivity.shared_count, 0);
assert.equal(patientAActivity.private_count, 2);

const sharedAgain = await api(`/entries/${sharedEntryA}/sharing`, {
  method: "PATCH",
  body: { shared: true },
  auth: patientA,
});
expectStatus(sharedAgain, 200, "novo compartilhamento");
const afterSharingAgain = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
assert.deepEqual(afterSharingAgain.payload.entries.map((entry) => entry.id), [sharedEntryA]);
assert.equal(afterSharingAgain.payload.entries[0].is_unread, 1);

const viewedBeforeThoughtReviewEdit = await api(
  `/professional/entries/${sharedEntryA}/viewed`,
  {
    method: "POST",
    body: {},
    auth: therapist,
  },
);
expectStatus(
  viewedBeforeThoughtReviewEdit,
  200,
  "visualização antes de editar a revisão",
);
const editedThoughtReview = await api(
  `/entries/${sharedEntryA}/thought-review`,
  {
    method: "PATCH",
    body: {
      source_thought: winningThoughtReview.source_thought,
      supporting_context: winningThoughtReview.supporting_context,
      missing_context: "Uma informação sintética que não combina totalmente.",
      alternative_view: "Uma leitura alternativa sintética e não otimista.",
      current_view: "A interpretação ficou um pouco mais incerta.",
      expected_revision: winningThoughtReview.revision,
    },
    auth: patientA,
  },
);
expectStatus(editedThoughtReview, 200, "edição da revisão compartilhada");
assert.equal(editedThoughtReview.payload.thought_review.revision, 3);
const professionalAfterThoughtReviewEdit = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
expectStatus(
  professionalAfterThoughtReviewEdit,
  200,
  "leitura profissional após editar a revisão",
);
assert.equal(
  professionalAfterThoughtReviewEdit.payload.entries[0].is_unread,
  1,
  "editar a revisão deve tornar o registro compartilhado não lido",
);
assert.equal(
  professionalAfterThoughtReviewEdit.payload.entries[0].thought_review.current_view,
  "A interpretação ficou um pouco mais incerta.",
);
const patientAfterThoughtReviewEdit = await api("/entries", { auth: patientA });
assert.equal(
  patientAfterThoughtReviewEdit.payload.entries.find(
    (entry) => entry.id === sharedEntryA,
  ).thought_review.revision,
  3,
);
const finalEntryView = await api(
  `/professional/entries/${sharedEntryA}/viewed`,
  {
    method: "POST",
    body: {},
    auth: therapist,
  },
);
expectStatus(finalEntryView, 200, "visualização final da revisão");

const exportDeletedAnswer = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 3,
    base_revision: 0,
    request_id: "request-export-answer-create",
    field: {
      type: "answer",
      id: "meu-jeito.01.2",
      value: { response: "curious", note: "Será apagada antes da cópia." },
    },
  },
  auth: patientA,
});
expectStatus(exportDeletedAnswer, 200, "resposta temporária antes da exportação");
expectStatus(
  await api("/map-draft", {
    method: "PATCH",
    body: {
      content_version: mapContentVersion,
      generation: 3,
      base_revision: exportDeletedAnswer.payload.field.revision,
      request_id: "request-export-answer-delete",
      field: { type: "answer", id: "meu-jeito.01.2", value: null },
    },
    auth: patientA,
  }),
  200,
  "resposta apagada antes da exportação",
);
const exportDeletedSynthesis = await api("/map-draft", {
  method: "PATCH",
  body: {
    content_version: mapContentVersion,
    generation: 3,
    base_revision: 0,
    request_id: "request-export-synth-create",
    field: {
      type: "synthesis",
      id: "want-more",
      value: "Síntese temporária que será apagada.",
    },
  },
  auth: patientA,
});
expectStatus(exportDeletedSynthesis, 200, "síntese temporária antes da exportação");
expectStatus(
  await api("/map-draft", {
    method: "PATCH",
    body: {
      content_version: mapContentVersion,
      generation: 3,
      base_revision: exportDeletedSynthesis.payload.field.revision,
      request_id: "request-export-synth-delete",
      field: { type: "synthesis", id: "want-more", value: null },
    },
    auth: patientA,
  }),
  200,
  "síntese apagada antes da exportação",
);

const mapSharedForExport = await api("/map-sharing/meu-jeito", {
  method: "PATCH",
  body: { shared: true },
  auth: patientA,
});
expectStatus(mapSharedForExport, 200, "mapa compartilhado para exportação");
const mapViewedForExport = await api(
  `/professional/patients/${patientA.user.id}/map-shares/meu-jeito/viewed`,
  { method: "POST", body: {}, auth: therapist },
);
expectStatus(mapViewedForExport, 200, "visualização do mapa antes da exportação");
expectStatus(
  await api("/export"),
  401,
  "exportação sem sessão",
);
expectStatus(
  await api("/export", { auth: therapist }),
  403,
  "exportação com sessão profissional",
);

const exportResult = await api("/export", { auth: patientA });
expectStatus(exportResult, 200, "exportação do paciente");
assert.match(
  exportResult.response.headers.get("content-disposition") ?? "",
  /meus-dados-area-do-paciente\.json/u,
);
assert.equal(exportResult.payload.format, "area-do-paciente-export");
assert.equal(exportResult.payload.format_version, 3);
assert.equal(exportResult.payload.account.display_name, synthetic.sharedName);
assert.equal(exportResult.payload.account.account_type, "patient");
assert.equal(exportResult.payload.account.account_status, "active");
assert.equal(exportResult.payload.account.care_access.status, "active");
assert.ok(
  exportResult.payload.entries.some((entry) => entry.id === sharedEntryA),
  "entries deve continuar no nível principal por compatibilidade",
);
const exportedSharedEntry = exportResult.payload.entries.find(
  (entry) => entry.id === sharedEntryA,
);
const exportedPrivateEntry = exportResult.payload.entries.find(
  (entry) => entry.id === privateEntryA,
);
assert.equal(exportedPrivateEntry.sharing.status, "private");
assert.equal(
  exportedPrivateEntry.thought_review.source_thought,
  "Revisão que deve continuar inteiramente privada.",
  "a cópia do titular inclui a própria revisão privada",
);
assert.equal(exportedSharedEntry.sharing.status, "shared");
assert.equal(
  exportedSharedEntry.sharing.viewed_at,
  finalEntryView.payload.viewed_at,
);
assert.equal(
  exportedSharedEntry.thought_review.current_view,
  "A interpretação ficou um pouco mais incerta.",
);
assert.equal(
  "revision" in exportedSharedEntry.thought_review,
  false,
  "a cópia do titular não deve expor metadado técnico de concorrência",
);
assert.match(exportedSharedEntry.sharing.viewed_at_meaning, /não significa resposta/iu);
assert.equal(exportResult.payload.patient_map.draft.content_version, mapContentVersion);
assert.equal(exportResult.payload.patient_map.draft.answers.length, 1);
assert.equal(
  exportResult.payload.patient_map.draft.answers[0].note,
  "Nova resposta sintética.",
);
assert.equal(exportResult.payload.patient_map.draft.synthesis.length, 0);
assert.equal(
  exportResult.payload.patient_map.draft.answers.some(
    (answer) => answer.item_id === "meu-jeito.01.2",
  ),
  false,
  "conteúdo apagado do mapa não pode entrar na exportação",
);
assert.equal(exportResult.payload.patient_map.sharing.active_copies.length, 1);
assert.equal(
  exportResult.payload.patient_map.sharing.active_copies[0].viewed_at,
  mapViewedForExport.payload.viewed_at,
);
assert.match(
  exportResult.payload.patient_map.sharing.active_copies[0].viewed_at_meaning,
  /não significa resposta/iu,
);

const exportedKeys = new Set();
function collectExportedKeys(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(collectExportedKeys);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    exportedKeys.add(key);
    collectExportedKeys(child);
  }
}
collectExportedKeys(exportResult.payload);
for (const forbiddenKey of [
  "email_hash",
  "password_salt",
  "password_hash",
  "password_iterations",
  "recovery_salt",
  "recovery_hash",
  "totp_secret",
  "totp_enabled",
  "last_totp_counter",
  "therapist_id",
  "patient_id",
  "token_hash",
  "csrf_token",
  "request_id",
  "generation",
  "revision",
  "snapshot",
  "access_logs",
  "sessions",
]) {
  assert.equal(
    exportedKeys.has(forbiddenKey),
    false,
    `a exportação não pode conter ${forbiddenKey}`,
  );
}

const invitations = await api("/invitations", { auth: therapist });
expectStatus(invitations, 200, "lista de convites");
assert.ok(
  invitations.payload.invitations.some(
    (invitation) => invitation.id === invitationToRevoke.id && invitation.status === "revoked",
  ),
);
assert.ok(
  invitations.payload.invitations.some(
    (invitation) => invitation.id === invitationA.id && invitation.status === "used",
  ),
);
assert.ok(
  invitations.payload.invitations.some(
    (invitation) =>
      invitation.id === invitationForAgeCheck.id && invitation.status === "active",
  ),
);
assert.ok(
  invitations.payload.invitations.some(
    (invitation) =>
      invitation.id === invitationToExpire.id && invitation.status === "expired",
  ),
);
assert.ok(invitations.payload.invitations.every((invitation) => !("code" in invitation)));

const deletedSharedEntry = await api(`/entries/${sharedEntryA}`, {
  method: "DELETE",
  auth: patientA,
});
expectStatus(deletedSharedEntry, 204, "exclusão de registro pelo proprietário");
assert.equal(
  await entryThoughtReviewRowCount(sharedEntryA),
  0,
  "excluir o registro deve excluir a revisão anexada em cascata",
);
const afterEntryDeletion = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
assert.deepEqual(afterEntryDeletion.payload.entries, []);

const patientCannotIssueRecovery = await api(
  `/professional/patients/${patientB.user.id}/recovery-code`,
  {
    method: "POST",
    body: {
      current_password: synthetic.therapistPassword,
      totp: "000000",
    },
    auth: patientA,
  },
);
expectStatus(
  patientCannotIssueRecovery,
  403,
  "paciente tentando gerar recuperação de outra conta",
);

const assistedRecoveryWithoutCsrf = await api(
  `/professional/patients/${patientA.user.id}/recovery-code`,
  {
    method: "POST",
    body: {
      current_password: synthetic.therapistPassword,
      totp: "000000",
    },
    auth: therapist,
    includeCsrf: false,
  },
);
expectStatus(
  assistedRecoveryWithoutCsrf,
  403,
  "recuperação assistida sem CSRF",
);

const assistedRecoveryWithoutPassword = await api(
  `/professional/patients/${patientA.user.id}/recovery-code`,
  {
    method: "POST",
    body: {
      current_password: "SenhaProfissionalIncorreta123",
      totp: "000000",
    },
    auth: therapist,
  },
);
expectStatus(
  assistedRecoveryWithoutPassword,
  400,
  "recuperação assistida sem senha profissional válida",
);

const assistedRecoveryWithoutMfa = await api(
  `/professional/patients/${patientA.user.id}/recovery-code`,
  {
    method: "POST",
    body: {
      current_password: synthetic.therapistPassword,
      totp: "000000",
    },
    auth: therapist,
  },
);
expectStatus(
  assistedRecoveryWithoutMfa,
  400,
  "recuperação assistida sem MFA válido",
);

const assistedRecovery = await api(
  `/professional/patients/${patientA.user.id}/recovery-code`,
  {
    method: "POST",
    body: {
      current_password: synthetic.therapistPassword,
      totp: totp(setup.payload.totp_secret, Date.now() + 30_000),
    },
    auth: therapist,
  },
);
expectStatus(assistedRecovery, 201, "recuperação assistida pelo profissional");
assert.match(
  assistedRecovery.payload.recovery_code,
  /^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/u,
);
assert.ok(new Date(assistedRecovery.payload.expires_at).getTime() > Date.now());
const patientSessionAfterAssistedRecovery = await api("/entries", { auth: patientA });
expectStatus(
  patientSessionAfterAssistedRecovery,
  401,
  "sessão encerrada após recuperação assistida",
);

const revokeAfterAssistedRecovery = await api(
  `/professional/patients/${patientA.user.id}/access`,
  {
    method: "PATCH",
    body: { active: false },
    auth: therapist,
  },
);
expectStatus(
  revokeAfterAssistedRecovery,
  200,
  "revogação após recuperação assistida",
);
const restoreAfterAssistedRecovery = await api(
  `/professional/patients/${patientA.user.id}/access`,
  {
    method: "PATCH",
    body: { active: true },
    auth: therapist,
  },
);
expectStatus(
  restoreAfterAssistedRecovery,
  200,
  "restauração após recuperação assistida",
);
const invalidatedByAccessChange = await api("/recover", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    recovery_code: assistedRecovery.payload.recovery_code,
    new_password: "SenhaPacienteNova123",
  },
});
expectStatus(
  invalidatedByAccessChange,
  400,
  "código assistido após mudança de acesso",
);

const previousRecoveryCode = await api("/recover", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    recovery_code: recoveryA,
    new_password: "SenhaPacienteNova123",
  },
});
expectStatus(previousRecoveryCode, 400, "código anterior após recuperação assistida");

await setAssistedRecoveryExpiration(
  patientA.user.id,
  new Date(Date.now() - 1_000).toISOString(),
);
const expiredAssistedRecovery = await api("/recover", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    recovery_code: assistedRecovery.payload.recovery_code,
    new_password: "SenhaPacienteNova123",
  },
});
expectStatus(expiredAssistedRecovery, 400, "recuperação assistida vencida");

await setAssistedRecoveryExpiration(
  patientA.user.id,
  new Date(Date.now() + 60_000).toISOString(),
);
const recovery = await api("/recover", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    recovery_code: assistedRecovery.payload.recovery_code,
    new_password: "SenhaPacienteNova123",
  },
});
expectStatus(recovery, 200, "uso único da recuperação assistida");
const oldSessionAfterRecovery = await api("/entries", { auth: patientA });
expectStatus(oldSessionAfterRecovery, 401, "sessão anterior após recuperação");
const reusedAssistedRecovery = await api("/recover", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    recovery_code: assistedRecovery.payload.recovery_code,
    new_password: "OutraSenhaPaciente123",
  },
});
expectStatus(reusedAssistedRecovery, 400, "reutilização da recuperação assistida");

const patientBReviewBeforeAccountDeletion = await api(
  `/entries/${sharedEntryB}/thought-review`,
  {
    method: "PATCH",
    body: {
      source_thought: "Pensamento sintético do paciente B.",
      supporting_context: "",
      missing_context: "",
      alternative_view: "",
      current_view: "",
      expected_revision: 0,
    },
    auth: patientB,
  },
);
expectStatus(
  patientBReviewBeforeAccountDeletion,
  200,
  "revisão antes de excluir a conta",
);
assert.equal(await entryThoughtReviewRowCount(sharedEntryB), 1);

assert.ok(
  (await patientMapDraftRowCount(patientB.user.id)) > 0,
  "o paciente B deve ter rascunho sintético antes de excluir a conta",
);
assert.equal(
  await patientMapShareRowCount(patientB.user.id),
  1,
  "o paciente B deve ter uma cópia compartilhada antes de excluir a conta",
);
const deleteAccountB = await api("/account", {
  method: "DELETE",
  body: { current_password: synthetic.patientPasswordB },
  auth: patientB,
});
expectStatus(deleteAccountB, 204, "exclusão da conta do paciente B");
assert.equal(
  await patientMapDraftRowCount(patientB.user.id),
  0,
  "a exclusão da conta deve remover o Meu mapa em cascata",
);
assert.equal(
  await patientMapShareRowCount(patientB.user.id),
  0,
  "a exclusão da conta deve remover compartilhamentos do mapa em cascata",
);
assert.equal(
  await entryThoughtReviewRowCount(sharedEntryB),
  0,
  "a exclusão da conta deve remover revisões de pensamento em cascata",
);
assert.doesNotMatch(
  await serializedAccessLogs(),
  /Atualização sintética da (?:primeira|segunda) aba|interpretação ficou um pouco mais incerta/iu,
  "a auditoria não pode conter o texto da revisão",
);
const afterAccountDeletion = await api("/professional/patients", { auth: therapist });
expectStatus(afterAccountDeletion, 200, "lista após exclusão de conta");
assert.equal(afterAccountDeletion.payload.patients.length, 1);
assert.equal(afterAccountDeletion.payload.patients[0].patient_id, patientA.user.id);
assert.equal(afterAccountDeletion.payload.patients[0].shared_count, 0);
assert.equal(afterAccountDeletion.payload.patients[0].private_count, 1);

for (const [target, suffix] of [
  ["batch", "lote"],
  ["session", "sessao"],
  ["audit", "auditoria"],
]) {
  const invitation = await createInvitation(therapist);
  const beforeFailure = await registrationState(invitation.id);
  await setSyntheticRegistrationFailure(target, true);
  let failedRegistration;
  try {
    failedRegistration = await registerPatient({
      invitationCode: invitation.code,
      email: `falha-${suffix}@example.test`,
      password: `SenhaFalha${suffix}123`,
    });
  } finally {
    await setSyntheticRegistrationFailure(target, false);
  }
  expectStatus(
    failedRegistration.result,
    500,
    `falha sintética durante ${target}`,
  );
  assert.deepEqual(
    await registrationState(invitation.id),
    beforeFailure,
    `a falha em ${target} não pode deixar cadastro parcial`,
  );

  const retry = await registerPatient({
    invitationCode: invitation.code,
    email: `falha-${suffix}@example.test`,
    password: `SenhaFalha${suffix}123`,
  });
  expectStatus(retry.result, 201, `nova tentativa após falha em ${target}`);
  const retrySession = await api("/session", { auth: retry.patient });
  expectStatus(retrySession, 200, `sessão após nova tentativa em ${target}`);
  assert.equal(retrySession.payload.user.role, "patient");
  const invitationReuseAfterRetry = await registerPatient({
    invitationCode: invitation.code,
    email: `reuso-${suffix}@example.test`,
    password: `SenhaReuso${suffix}123`,
  });
  expectStatus(
    invitationReuseAfterRetry.result,
    400,
    `uso único depois da nova tentativa em ${target}`,
  );
  const cleanupPatient = await api("/account", {
    method: "DELETE",
    body: { current_password: `SenhaFalha${suffix}123` },
    auth: retry.patient,
  });
  expectStatus(cleanupPatient, 204, `limpeza do paciente sintético de ${target}`);
}

console.log(
  JSON.stringify({
    ok: true,
    checks: 152,
    data: "synthetic-only",
    production_requests: 0,
  }),
);
