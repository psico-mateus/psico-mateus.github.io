import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../app/PortalApp.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const docsUrl = new URL("../docs/recuperacao-acesso-profissional.md", import.meta.url);

test("professional login offers an independent two-step MFA recovery", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /Não tenho mais acesso ao autenticador/u);
  assert.match(app, /"\/recover\/mfa\/start"/u);
  assert.match(app, /email: form\.get\("email"\)/u);
  assert.match(app, /password: form\.get\("password"\)/u);
  assert.match(app, /recovery_code: form\.get\("recovery_code"\)/u);
  assert.match(app, /Você ainda não entrou/u);
  assert.match(app, /"\/recover\/mfa\/confirm"/u);
  assert.match(app, /ticket: details\.ticket/u);
  assert.match(app, /Código de 6 dígitos do novo autenticador/u);
  assert.match(app, /onRecovered\(result\.user, result\.csrf, result\.recovery_codes\)/u);
  assert.doesNotMatch(app, /localStorage[\s\S]*?mfa/u);
  assert.doesNotMatch(app, /sessionStorage[\s\S]*?mfa/u);
});

test("professional account can inspect and replace one-time emergency codes", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /Códigos emergenciais do autenticador/u);
  assert.match(app, /"\/account\/mfa-recovery-codes"/u);
  assert.match(app, /Criar 8 novos códigos/u);
  assert.match(app, /Todos os códigos emergenciais anteriores deixarão de funcionar/u);
  assert.match(app, /current_password: form\.get\("current_password"\)/u);
  assert.match(app, /totp: form\.get\("totp"\)/u);
  assert.match(app, /recovery_codes: string\[\]/u);
  assert.match(app, /Cada código funciona uma única vez/u);
});

test("emergency codes are shown once with private export choices", async () => {
  const [app, styles] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(app, /Copiar todos/u);
  assert.match(app, /Baixar arquivo TXT/u);
  assert.match(app, /Imprimir cópia privada/u);
  assert.match(app, /Depois de fechar, estes códigos não serão mostrados novamente/u);
  assert.match(app, /URL\.createObjectURL/u);
  assert.match(app, /URL\.revokeObjectURL/u);
  assert.match(app, /setMfaRecoveryCodes\(\[\]\)/u);
  assert.match(styles, /body\.recovery-codes-open \*\{visibility:hidden!important\}/u);
  assert.match(styles, /body\.recovery-codes-open \.recovery-codes-list/u);
  assert.match(styles, /-webkit-user-select:all/u);
});

test("copy and documentation distinguish password recovery from MFA recovery", async () => {
  const [app, docs] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(docsUrl, "utf8"),
  ]);

  assert.match(app, /Ele recupera a senha, mas não substitui o aplicativo autenticador/u);
  assert.match(app, /sem depender do celular antigo, do Mac ou de atendimento externo/u);
  assert.match(app, /Mac é apenas uma opção/u);
  assert.match(docs, /Recuperar sem o celular antigo nem o Mac/u);
  assert.match(docs, /o novo autenticador precisa gerar um código correto/u);
  assert.match(docs, /não existe um bypass público[\s\S]*?do MFA/u);
});
