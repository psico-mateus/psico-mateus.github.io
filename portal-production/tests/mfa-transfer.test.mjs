import assert from "node:assert/strict";
import test from "node:test";

import {
  MFA_TRANSFER_TICKET_TTL_MS,
  createMfaTransferTicket,
  isValidMfaTransferTicket,
} from "../lib/mfa-transfer.ts";

const APP_SECRET = "segredo-sintetico-comprido-para-testar-ticket-mfa";
const INSTANT = Date.parse("2026-08-24T12:00:00.000Z");
const BINDING = {
  userId: "therapist_synthetic",
  sessionTokenHash: "session-token-hash-synthetic",
  expectedTotpCiphertext: "ciphertext-synthetic-without-real-secret",
};

test("ticket de preparação do MFA é cifrado, vinculado e temporário", async () => {
  const transfer = await createMfaTransferTicket(APP_SECRET, BINDING, INSTANT);

  assert.equal(
    transfer.expiresAt,
    new Date(INSTANT + MFA_TRANSFER_TICKET_TTL_MS).toISOString(),
  );
  assert.ok(transfer.ticket.length >= 80);
  for (const privateValue of Object.values(BINDING)) {
    assert.doesNotMatch(transfer.ticket, new RegExp(privateValue, "u"));
  }
  assert.equal(
    await isValidMfaTransferTicket(APP_SECRET, transfer.ticket, BINDING, INSTANT),
    true,
  );
  assert.equal(
    await isValidMfaTransferTicket(
      APP_SECRET,
      transfer.ticket,
      BINDING,
      INSTANT + MFA_TRANSFER_TICKET_TTL_MS - 1,
    ),
    true,
  );
  assert.equal(
    await isValidMfaTransferTicket(
      APP_SECRET,
      transfer.ticket,
      BINDING,
      INSTANT + MFA_TRANSFER_TICKET_TTL_MS,
    ),
    false,
  );
});

test("ticket não atravessa conta, sessão, chave ativa ou segredo da aplicação", async () => {
  const { ticket } = await createMfaTransferTicket(APP_SECRET, BINDING, INSTANT);

  for (const changedBinding of [
    { ...BINDING, userId: "other-therapist" },
    { ...BINDING, sessionTokenHash: "other-session" },
    { ...BINDING, expectedTotpCiphertext: "rotated-totp-ciphertext" },
  ]) {
    assert.equal(
      await isValidMfaTransferTicket(APP_SECRET, ticket, changedBinding, INSTANT),
      false,
    );
  }
  assert.equal(
    await isValidMfaTransferTicket("outro-segredo-da-aplicacao", ticket, BINDING, INSTANT),
    false,
  );
  assert.equal(
    await isValidMfaTransferTicket(APP_SECRET, ticket, BINDING, INSTANT - 1),
    false,
    "um relógio anterior ao instante de emissão não deve ampliar a validade",
  );
});

test("ticket adulterado ou malformado é rejeitado sem lançar erro", async () => {
  const { ticket } = await createMfaTransferTicket(APP_SECRET, BINDING, INSTANT);
  const tamperIndex = Math.floor(ticket.length / 2);
  const tamperedCharacter = ticket[tamperIndex] === "A" ? "B" : "A";
  const tampered = `${ticket.slice(0, tamperIndex)}${tamperedCharacter}${ticket.slice(tamperIndex + 1)}`;

  for (const value of [undefined, null, "", "curto", "x".repeat(4_001), tampered]) {
    assert.equal(
      await isValidMfaTransferTicket(APP_SECRET, value, BINDING, INSTANT),
      false,
    );
  }
});
