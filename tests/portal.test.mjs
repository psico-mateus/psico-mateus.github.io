import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createInvitationCode,
  createRecoveryCode,
  derivePassword,
  decrypt,
  encrypt,
  passwordMatches,
  verifyTotp,
} from "../lib/crypto.ts";

test("passwords are salted and verified", async () => {
  const record = await derivePassword("SenhaDeTeste123", undefined, 10_000);
  assert.equal(await passwordMatches("SenhaDeTeste123", record.salt, record.hash, record.iterations), true);
  assert.equal(await passwordMatches("SenhaErrada123", record.salt, record.hash, record.iterations), false);
});

test("TOTP accepts an RFC vector once and blocks replay", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const first = await verifyTotp(secret, "287082", null, 59_000);
  assert.equal(first.valid, true);
  assert.equal(first.counter, 1);
  assert.equal((await verifyTotp(secret, "287082", 1, 59_000)).valid, false);
});

test("protected values round-trip and one-time codes are well formed", async () => {
  const secret = "a".repeat(32);
  const encrypted = await encrypt(secret, "valor sensível");
  assert.notEqual(encrypted, "valor sensível");
  assert.equal(await decrypt(secret, encrypted), "valor sensível");
  assert.match(createInvitationCode(), /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  assert.match(createRecoveryCode(), /^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/);
});

test("public UI keeps privacy and safety boundaries visible", async () => {
  const [app, privacy, worker] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /Nada é compartilhado automaticamente/);
  assert.match(app, /não é acompanhado em tempo real/i);
  assert.match(app, /Guia de Emoções/);
  assert.match(privacy, /não são usados para publicidade/);
  assert.match(worker, /Content-Security-Policy/);
  assert.doesNotMatch(app, /piloto|fictício|ambiente local/i);
});
