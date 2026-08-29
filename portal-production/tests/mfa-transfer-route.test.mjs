import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE_URL = new URL("../app/api/portal/[...segments]/route.ts", import.meta.url);
const APP_URL = new URL("../app/PortalApp.tsx", import.meta.url);
const STYLES_URL = new URL("../app/globals.css", import.meta.url);

test("preparação da troca mantém MFA profissional e autorização no servidor", async () => {
  const route = await readFile(ROUTE_URL, "utf8");
  const prepare = route.match(
    /if \(path === "\/account\/mfa-transfer"\)[\s\S]*?(?=\n  if \(path === "\/account\/mfa-transfer\/confirm"\))/u,
  )?.[0] ?? "";
  const confirm = route.match(
    /if \(path === "\/account\/mfa-transfer\/confirm"\)[\s\S]*?(?=\n  const viewedEntry)/u,
  )?.[0] ?? "";

  assert.ok(prepare);
  assert.ok(confirm);
  assert.match(prepare, /requireSession\(request, "therapist"\)/u);
  assert.ok(
    prepare.indexOf("requireCsrf(request, session)") <
      prepare.indexOf("checkReauthenticationRateLimit(session)"),
    "CSRF deve ser validado antes de consumir a janela de reautenticação",
  );
  assert.match(prepare, /passwordMatches\(/u);
  assert.match(prepare, /verifyTotp\(/u);
  assert.match(prepare, /consumeActiveTherapistTotpCounter/u);
  assert.match(prepare, /createMfaTransferTicket/u);
  assert.match(prepare, /prepare_professional_mfa_transfer/u);
  assert.doesNotMatch(prepare, /UPDATE users SET totp_secret/u);
  assert.doesNotMatch(prepare, /DELETE FROM sessions/u);

  assert.match(confirm, /requireSession\(request, "therapist"\)/u);
  assert.match(confirm, /requireCsrf\(request, session\)/u);
  assert.match(confirm, /isValidMfaTransferTicket/u);
  assert.match(confirm, /verifyTotp\(/u);
  assert.match(confirm, /consumeActiveTherapistTotpCounter/u);
  assert.match(confirm, /confirm_professional_mfa_transfer/u);
  assert.doesNotMatch(confirm, /UPDATE users SET totp_secret/u);
  assert.doesNotMatch(confirm, /DELETE FROM sessions/u);
  assert.match(route, /"\/account\/mfa-transfer"/u);
  assert.match(route, /"\/account\/mfa-transfer\/confirm"/u);
});

test("chave temporária fica apenas em memória e a interface confirma o Mac", async () => {
  const app = await readFile(APP_URL, "utf8");
  const card = app.match(
    /function MfaTransferCard[\s\S]*?(?=\nfunction SetupPanel)/u,
  )?.[0] ?? "";
  const accountPanel = app.match(
    /function AccountPanel[\s\S]*?(?=\nfunction EmergencyFooter)/u,
  )?.[0] ?? "";
  const styles = await readFile(STYLES_URL, "utf8");

  assert.match(card, /Guarde o acesso também no Mac/u);
  assert.match(card, /Código de 6 dígitos mostrado no Mac/u);
  assert.match(card, /\/account\/mfa-transfer\/confirm/u);
  assert.match(card, /copyText\(details\.secret\)/u);
  assert.match(card, /aria-modal="true"/u);
  assert.match(card, /document\.addEventListener\("keydown", closeOnEscape\)/u);
  assert.match(card, /document\.addEventListener\("focusin", restoreDialogFocus\)/u);
  assert.match(card, /document\.body\.classList\.add\("mfa-transfer-open"\)/u);
  assert.match(card, /window\.setTimeout\(onExpired/u);
  assert.match(card, /Quando o iPhone novo chegar/u);
  assert.match(card, /window\.confirm/u);
  assert.doesNotMatch(card, /localStorage|sessionStorage|indexedDB/iu);

  assert.match(accountPanel, /Preparar troca de celular/u);
  assert.match(accountPanel, /\/account\/mfa-transfer/u);
  assert.match(accountPanel, /role === "therapist"/u);
  assert.match(accountPanel, /Código para recuperar a senha/u);
  assert.match(accountPanel, /não substitui o aplicativo autenticador/u);
  assert.match(styles, /\.professional-mfa-transfer\{/u);
  assert.match(styles, /\.mfa-transfer-dialog\{/u);
  assert.match(styles, /max-height:calc\(100dvh - 2rem\)/u);
  assert.match(styles, /@media print/u);
});
