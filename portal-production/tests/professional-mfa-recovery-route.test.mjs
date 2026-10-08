import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE_URL = new URL("../app/api/portal/[...segments]/route.ts", import.meta.url);
const SCHEMA_URL = new URL("../db/schema.ts", import.meta.url);
const MIGRATION_URL = new URL("../drizzle/0007_professional_mfa_recovery.sql", import.meta.url);

test("API separa recuperação do MFA do código de senha antigo", async () => {
  const route = await readFile(ROUTE_URL, "utf8");

  for (const path of [
    "/account/mfa-recovery-codes",
    "/recover/mfa/start",
    "/recover/mfa/confirm",
  ]) {
    assert.match(route, new RegExp(path.replaceAll("/", "\\/"), "u"));
  }
  const generation = route.match(
    /async function generateProfessionalMfaRecoveryCodes[\s\S]*?(?=\nasync function startProfessionalMfaRecovery)/u,
  )?.[0] ?? "";
  assert.match(generation, /requireSession\(request, "therapist"\)/u);
  assert.match(generation, /requireCsrf\(request, session\)/u);
  assert.match(generation, /checkReauthenticationRateLimit\(session\)/u);
  assert.match(generation, /passwordMatches\(/u);
  assert.match(generation, /verifyTotp\(/u);
  assert.match(generation, /last_totp_counter IS \?/u);
  assert.match(generation, /mfa_recovery_set_id IS \?/u);
  assert.match(generation, /AND password_hash = \?/u);
  assert.match(generation, /token_hash = \? AND user_id = users.id AND expires_at > \?/u);
  assert.match(generation, /DB\.batch\(/u);
});

test("início público usa senha, HMAC individual, limite e ticket sem mutar conta", async () => {
  const route = await readFile(ROUTE_URL, "utf8");
  const start = route.match(
    /async function startProfessionalMfaRecovery[\s\S]*?(?=\nasync function confirmProfessionalMfaRecovery)/u,
  )?.[0] ?? "";

  assert.match(start, /checkRateLimit\(/u);
  assert.match(start, /new Request\(request.url\)/u);
  assert.match(start, /passwordMatches\(/u);
  assert.match(start, /hashProfessionalMfaRecoveryCode\(/u);
  assert.match(start, /used_at IS NULL/u);
  assert.match(start, /invalidated_at IS NULL/u);
  assert.match(start, /createProfessionalMfaRecoveryTicket/u);
  assert.match(start, /PROFESSIONAL_MFA_RECOVERY_ERROR/u);
  assert.doesNotMatch(start, /UPDATE users|DELETE FROM sessions|INSERT INTO sessions/u);
  assert.doesNotMatch(start, /decrypt\([^)]*totp_secret/iu);
});

test("confirmação faz CAS e troca atômica antes de emitir a nova sessão", async () => {
  const route = await readFile(ROUTE_URL, "utf8");
  const confirm = route.match(
    /async function confirmProfessionalMfaRecovery[\s\S]*?(?=\nasync function setupStatus)/u,
  )?.[0] ?? "";

  assert.match(confirm, /openProfessionalMfaRecoveryTicket/u);
  assert.match(confirm, /"professional-mfa-recovery-ticket"[\s\S]*ticket.jti/u);
  assert.match(confirm, /verifyTotp\(/u);
  assert.match(confirm, /consumption_nonce IS NULL/u);
  assert.match(confirm, /SET used_at = \?, consumption_nonce = \?/u);
  assert.match(confirm, /SET totp_secret = \?, totp_enabled = 1, last_totp_counter = \?/u);
  assert.match(confirm, /DELETE FROM sessions/u);
  assert.match(confirm, /INSERT INTO sessions/u);
  assert.match(confirm, /createProfessionalMfaRecoverySet/u);
  assert.match(confirm, /recover_professional_mfa/u);
  assert.match(confirm, /sessionCookie\(request, sessionToken\)/u);
  assert.match(confirm, /recovery_codes: replacementSet\.codes/u);
  assert.doesNotMatch(confirm, /expectedOldTotpCiphertext[^\n]*return/iu);
});

test("login profissional emite sessão e consome MFA na mesma transação guardada", async () => {
  const route = await readFile(ROUTE_URL, "utf8");
  const login = route.match(
    /async function login[\s\S]*?(?=\nasync function register)/u,
  )?.[0] ?? "";
  assert.match(login, /DB\.batch\(/u);
  assert.match(login, /INSERT INTO sessions[\s\S]*password_hash = \? AND totp_secret = \?/u);
  assert.match(login, /AND last_totp_counter IS \?/u);
  assert.match(login, /UPDATE users SET last_totp_counter = \?, last_login_at = \?/u);
  assert.doesNotMatch(login, /consumeActiveTherapistTotpCounter/u);
});

test("recuperação de senha anterior também consome o hash com CAS", async () => {
  const route = await readFile(ROUTE_URL, "utf8");
  const recovery = route.match(
    /async function recoverAccount[\s\S]*?(?=\nasync function listEntries)/u,
  )?.[0] ?? "";

  assert.match(recovery, /recovery_salt = \? AND recovery_hash = \?/u);
  assert.match(recovery, /recoveryResults\[0\]\?\.meta\.changes !== 1/u);
  assert.match(recovery, /DELETE FROM sessions[\s\S]*EXISTS/u);
  assert.match(recovery, /DELETE FROM assisted_recovery_grants[\s\S]*EXISTS/u);
});

test("migração guarda somente HMAC e metadados fora das tabelas clínicas", async () => {
  const [schema, migration] = await Promise.all([
    readFile(SCHEMA_URL, "utf8"),
    readFile(MIGRATION_URL, "utf8"),
  ]);

  assert.match(schema, /professionalMfaRecoveryCodes/u);
  assert.match(schema, /codeHash: text\("code_hash"\)/u);
  assert.doesNotMatch(schema, /professionalMfaRecoveryCodes[\s\S]*plaintext/iu);
  assert.match(migration, /CREATE TABLE `professional_mfa_recovery_codes`/u);
  assert.match(migration, /`code_hash` text NOT NULL/u);
  assert.match(migration, /ALTER TABLE `users` ADD `mfa_recovery_set_id` text/u);
  assert.doesNotMatch(migration, /ALTER TABLE `(?:entries|entry_thought_reviews|patient_map)/u);
});
