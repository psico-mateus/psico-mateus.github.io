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
  } = {},
) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
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

async function registerPatient({
  invitationCode,
  email,
  password,
  adult = true,
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
      privacy_confirmation: true,
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
    totp: totp(setup.payload.totp_secret),
  },
  auth: therapist,
});
expectStatus(setupConfirmation, 200, "confirmação de MFA");
assert.equal(therapist.user.role, "therapist");

const professionalLoginWithoutMfa = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.therapistEmail,
    password: synthetic.therapistPassword,
    totp: "",
  },
});
expectStatus(professionalLoginWithoutMfa, 401, "login profissional sem MFA");

const invitationA = await createInvitation(therapist);
const invitationB = await createInvitation(therapist);
const invitationToRevoke = await createInvitation(therapist);
const invitationForAgeCheck = await createInvitation(therapist);
const invitationToExpire = await createInvitation(therapist);

const underageAttempt = await registerPatient({
  invitationCode: invitationForAgeCheck.code,
  email: "sem-confirmacao@example.test",
  password: "SenhaSemConfirmacao123",
  adult: false,
});
expectStatus(underageAttempt.result, 400, "cadastro sem confirmação de maioridade");

const registeredA = await registerPatient({
  invitationCode: invitationA.code.replaceAll("-", " "),
  email: synthetic.patientEmailA,
  password: synthetic.patientPasswordA,
});
expectStatus(registeredA.result, 201, "cadastro do paciente A");
const patientA = registeredA.patient;
const recoveryA = registeredA.result.payload.recovery_code;

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
assert.doesNotMatch(JSON.stringify(summaries.payload), /example\.test|password|recovery|totp/iu);

const entriesForA = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
expectStatus(entriesForA, 200, "registros compartilhados do paciente A");
assert.deepEqual(entriesForA.payload.entries.map((entry) => entry.id), [sharedEntryA]);
assert.equal(entriesForA.payload.entries[0].emotion, "Ansiedade / Alívio");
assert.match(entriesForA.payload.entries[0].happened, /<script>texto<\/script>/u);
assert.ok(!entriesForA.payload.entries.some((entry) => entry.id === privateEntryA));

const entriesForB = await api(
  `/professional/patients/${patientB.user.id}/entries`,
  { auth: therapist },
);
expectStatus(entriesForB, 200, "registros compartilhados do paciente B");
assert.deepEqual(entriesForB.payload.entries.map((entry) => entry.id), [sharedEntryB]);

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
const revokedPatientLogin = await api("/login", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    password: synthetic.patientPasswordA,
  },
});
expectStatus(revokedPatientLogin, 401, "login após revogação");

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

const exportResult = await api("/export", { auth: patientA });
expectStatus(exportResult, 200, "exportação do paciente");
assert.match(
  exportResult.response.headers.get("content-disposition") ?? "",
  /meus-registros\.json/u,
);

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
const afterEntryDeletion = await api(
  `/professional/patients/${patientA.user.id}/entries`,
  { auth: therapist },
);
assert.deepEqual(afterEntryDeletion.payload.entries, []);

const recovery = await api("/recover", {
  method: "POST",
  body: {
    email: synthetic.patientEmailA,
    recovery_code: recoveryA,
    new_password: "SenhaPacienteNova123",
  },
});
expectStatus(recovery, 200, "recuperação de conta");
const oldSessionAfterRecovery = await api("/entries", { auth: patientA });
expectStatus(oldSessionAfterRecovery, 401, "sessão anterior após recuperação");

const deleteAccountB = await api("/account", {
  method: "DELETE",
  body: { current_password: synthetic.patientPasswordB },
  auth: patientB,
});
expectStatus(deleteAccountB, 204, "exclusão da conta do paciente B");
const afterAccountDeletion = await api("/professional/patients", { auth: therapist });
expectStatus(afterAccountDeletion, 200, "lista após exclusão de conta");
assert.equal(afterAccountDeletion.payload.patients.length, 0);

console.log(
  JSON.stringify({
    ok: true,
    checks: 52,
    data: "synthetic-only",
    production_requests: 0,
  }),
);
