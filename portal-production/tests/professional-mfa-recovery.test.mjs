import assert from "node:assert/strict";
import test from "node:test";
import { decrypt, encrypt } from "../lib/crypto.ts";

import {
  PROFESSIONAL_MFA_RECOVERY_CODE_COUNT,
  PROFESSIONAL_MFA_RECOVERY_TICKET_TTL_MS,
  createProfessionalMfaRecoverySet,
  createProfessionalMfaRecoveryTicket,
  hashProfessionalMfaRecoveryCode,
  openProfessionalMfaRecoveryTicket,
} from "../lib/professional-mfa-recovery.ts";

const APP_SECRET = "segredo-sintetico-comprido-para-recuperacao-profissional";
const OTHER_APP_SECRET = "outro-segredo-sintetico-comprido-e-independente";
const USER_ID = "therapist_synthetic_recovery";
const INSTANT = Date.parse("2026-08-29T12:00:00.000Z");

test("conjunto profissional tem oito códigos base32 independentes de 80 bits", async () => {
  const recoverySet = await createProfessionalMfaRecoverySet(
    APP_SECRET,
    USER_ID,
    INSTANT,
  );

  assert.equal(recoverySet.codes.length, PROFESSIONAL_MFA_RECOVERY_CODE_COUNT);
  assert.equal(recoverySet.records.length, PROFESSIONAL_MFA_RECOVERY_CODE_COUNT);
  assert.equal(new Set(recoverySet.codes).size, PROFESSIONAL_MFA_RECOVERY_CODE_COUNT);
  assert.equal(
    new Set(recoverySet.records.map((record) => record.codeHash)).size,
    PROFESSIONAL_MFA_RECOVERY_CODE_COUNT,
  );
  assert.equal(recoverySet.generatedAt, "2026-08-29T12:00:00.000Z");
  recoverySet.codes.forEach((code, index) => {
    assert.match(code, /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/u);
    assert.equal(code.replaceAll("-", "").length * 5, 80);
    assert.equal(recoverySet.records[index].position, index + 1);
    assert.notEqual(recoverySet.records[index].codeHash, code);
    assert.match(recoverySet.records[index].codeHash, /^[A-Za-z0-9_-]{43}$/u);
    assert.notEqual(recoverySet.records[index].codeHash, code.replaceAll("-", ""));
  });
});

test("HMAC do código é normalizado e vinculado ao profissional", async () => {
  const code = "ABCD-EF23-GH45-JK67";
  const expected = await hashProfessionalMfaRecoveryCode(
    APP_SECRET,
    USER_ID,
    code,
  );
  assert.equal(
    await hashProfessionalMfaRecoveryCode(
      APP_SECRET,
      USER_ID,
      "abcd ef23 gh45 jk67",
    ),
    expected,
  );
  assert.notEqual(
    await hashProfessionalMfaRecoveryCode(
      APP_SECRET,
      "therapist_other",
      code,
    ),
    expected,
  );
  assert.notEqual(
    await hashProfessionalMfaRecoveryCode(OTHER_APP_SECRET, USER_ID, code),
    expected,
  );
});

test("ticket de recuperação é cifrado, vinculado e vence em dez minutos", async () => {
  const binding = {
    userId: USER_ID,
    recoveryCodeId: "mfa_recovery_synthetic",
    expectedRecoverySetId: "mfa_set_synthetic",
    expectedCodeHash: "hash-sintetico-comprido-sem-codigo-em-texto",
    expectedPasswordHash: "password-hash-sintetico-comprido-e-seguro",
    expectedOldTotpCiphertext: "iv-sintetico.cifra-totp-antiga-sintetica-e-comprida",
  };
  const recovery = await createProfessionalMfaRecoveryTicket(
    APP_SECRET,
    binding,
    INSTANT,
  );
  const opened = await openProfessionalMfaRecoveryTicket(
    APP_SECRET,
    recovery.ticket,
    INSTANT,
  );

  assert.ok(opened);
  assert.equal(opened.userId, binding.userId);
  assert.equal(opened.recoveryCodeId, binding.recoveryCodeId);
  assert.equal(opened.expectedRecoverySetId, binding.expectedRecoverySetId);
  assert.equal(opened.newTotpSecret, recovery.totpSecret);
  assert.notEqual(opened.replacementTotpCiphertext, recovery.totpSecret);
  assert.equal(
    recovery.expiresAt,
    new Date(INSTANT + PROFESSIONAL_MFA_RECOVERY_TICKET_TTL_MS).toISOString(),
  );
  for (const privateValue of [
    ...Object.values(binding),
    recovery.totpSecret,
  ]) {
    assert.equal(recovery.ticket.includes(privateValue), false);
  }
  assert.ok(
    await openProfessionalMfaRecoveryTicket(
      APP_SECRET,
      recovery.ticket,
      INSTANT + PROFESSIONAL_MFA_RECOVERY_TICKET_TTL_MS - 1,
    ),
  );
  assert.equal(
    await openProfessionalMfaRecoveryTicket(
      APP_SECRET,
      recovery.ticket,
      INSTANT + PROFESSIONAL_MFA_RECOVERY_TICKET_TTL_MS,
    ),
    null,
  );
  assert.equal(
    await openProfessionalMfaRecoveryTicket(
      APP_SECRET,
      recovery.ticket,
      INSTANT - 1,
    ),
    null,
  );
  assert.equal(
    await openProfessionalMfaRecoveryTicket(
      OTHER_APP_SECRET,
      recovery.ticket,
      INSTANT,
    ),
    null,
  );
});

test("ticket malformado ou adulterado falha fechado", async () => {
  const recovery = await createProfessionalMfaRecoveryTicket(
    APP_SECRET,
    {
      userId: USER_ID,
      recoveryCodeId: "mfa_recovery_synthetic",
      expectedRecoverySetId: "mfa_set_synthetic",
      expectedCodeHash: "hash-sintetico-comprido-sem-codigo-em-texto",
      expectedPasswordHash: "password-hash-sintetico-comprido-e-seguro",
      expectedOldTotpCiphertext: "iv-sintetico.cifra-totp-antiga-sintetica-e-comprida",
    },
    INSTANT,
  );
  const index = Math.floor(recovery.ticket.length / 2);
  const replacement = recovery.ticket[index] === "A" ? "B" : "A";
  const tampered = `${recovery.ticket.slice(0, index)}${replacement}${recovery.ticket.slice(index + 1)}`;

  for (const value of [
    null, undefined, "", "curto", "x".repeat(8_001), tampered,
    `${recovery.ticket}.sufixo`, `${recovery.ticket}=`, ` ${recovery.ticket}`,
  ]) {
    assert.equal(
      await openProfessionalMfaRecoveryTicket(APP_SECRET, value, INSTANT),
      null,
    );
  }
});

test("ticket rejeita segredo novo incompatível com sua cifra e base64 não canônico", async () => {
  const recovery = await createProfessionalMfaRecoveryTicket(APP_SECRET, {
    userId: USER_ID,
    recoveryCodeId: "mfa_recovery_synthetic",
    expectedRecoverySetId: "mfa_set_synthetic",
    expectedCodeHash: "hash-sintetico-comprido-sem-codigo-em-texto",
    expectedPasswordHash: "password-hash-sintetico-comprido-e-seguro",
    expectedOldTotpCiphertext: "iv-sintetico.cifra-totp-antiga-sintetica-e-comprida",
  }, INSTANT);
  const payload = JSON.parse(await decrypt(APP_SECRET, recovery.ticket));
  payload.replacementTotpCiphertext = await encrypt(APP_SECRET, "A".repeat(32));
  const mismatched = await encrypt(APP_SECRET, JSON.stringify(payload));
  assert.equal(await openProfessionalMfaRecoveryTicket(APP_SECRET, mismatched, INSTANT), null);

  // A mudança somente dos bits descartados pelo base64 decodifica para os
  // mesmos bytes, mas não pode criar outra representação válida do ticket.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let paddedPayload = JSON.parse(await decrypt(APP_SECRET, recovery.ticket));
  let canonical;
  do {
    paddedPayload.testPadding = `${paddedPayload.testPadding ?? ""}x`;
    canonical = await encrypt(APP_SECRET, JSON.stringify(paddedPayload));
  } while (canonical.split(".")[1].length % 4 === 0);
  const alternative = canonical.slice(0, -1) + alphabet[alphabet.indexOf(canonical.at(-1)) + 1];
  assert.equal(await decrypt(APP_SECRET, alternative), await decrypt(APP_SECRET, canonical));
  assert.equal(await openProfessionalMfaRecoveryTicket(APP_SECRET, alternative, INSTANT), null);
});
