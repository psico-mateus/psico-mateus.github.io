import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PASSWORD_ITERATIONS,
  createInvitationCode,
  createRecoveryCode,
  derivePassword,
  decrypt,
  encrypt,
  passwordMatches,
  verifyTotp,
} from "../lib/crypto.ts";
import {
  clearSessionCookie,
  parseCookies,
  sessionCookie,
} from "../lib/session-cookie.ts";
import {
  filterAndSortPatients,
  filterPatientAccesses,
  invitationStatusLabel,
  normalizePatientSearch,
  sharedCountLabel,
  splitInvitations,
  unreadCountLabel,
} from "../app/professional-dashboard-data.ts";
import {
  filterAndSortPatientEntries,
  filterPatientEntries,
  isEntryShared,
  patientEntryViewStatus,
  patientEntryViewSummary,
  remainingCharactersNearLimit,
} from "../app/patient-dashboard-data.ts";
import { copyText } from "../app/copy-text.ts";
import {
  PortalRequestError,
  formatViewTimestamp,
  portalRequest,
} from "../app/portal-client.ts";

test("portal requests translate connection and malformed-response failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(
      portalRequest("/entries"),
      (error) =>
        error instanceof PortalRequestError &&
        error.status === 0 &&
        error.message ===
          "Não foi possível se conectar. Verifique sua internet e tente novamente.",
    );

    globalThis.fetch = async () =>
      new Response("<html>resposta inesperada</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    await assert.rejects(
      portalRequest("/entries"),
      (error) =>
        error instanceof PortalRequestError &&
        error.status === 502 &&
        error.message ===
          "A resposta do serviço não pôde ser lida. Tente novamente.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session cookies keep secure attributes and tolerate corrupted values", () => {
  const secureCookie = sessionCookie(
    new Request("https://area-do-paciente.psico-mateus.workers.dev/"),
    "token com espaço",
    300,
  );
  assert.equal(
    secureCookie,
    "portal_session=token%20com%20espa%C3%A7o; HttpOnly; SameSite=Strict; Path=/; Max-Age=300; Secure",
  );
  assert.doesNotMatch(
    sessionCookie(new Request("http://localhost:3000/"), "local", 60),
    /;\s*Secure/u,
  );
  assert.equal(
    clearSessionCookie(
      new Request("https://area-do-paciente.psico-mateus.workers.dev/"),
    ),
    "portal_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure",
  );

  assert.deepEqual(
    parseCookies(
      new Request("https://example.test/", {
        headers: {
          cookie: "portal_session=%E0%A4%A; preference=sim%20por%20favor",
        },
      }),
    ),
    {
      portal_session: "",
      preference: "sim por favor",
    },
  );
});

test("passwords are salted and verified", async () => {
  assert.equal(PASSWORD_ITERATIONS, 100_000);
  const record = await derivePassword("SenhaDeTeste123", undefined, 10_000);
  assert.equal(await passwordMatches("SenhaDeTeste123", record.salt, record.hash, record.iterations), true);
  assert.equal(await passwordMatches("SenhaErrada123", record.salt, record.hash, record.iterations), false);
});

test("password derivation stays compatible with PBKDF2-HMAC-SHA256", async () => {
  const record = await derivePassword("password", "c2FsdA", 1);
  assert.equal(record.hash, "Eg-2z_z4syxD5yJSVsT4N6hlSMkszDVICAWYfLcL4Xs");
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
  const [app, installButton, layout, manifest, privacy, serviceWorker, styles, worker] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InstallAppButton.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /Nada é compartilhado automaticamente/);
  assert.match(app, /As outras perguntas podem ficar em branco/);
  assert.match(app, /O registro começa privado/);
  assert.match(app, /Você escolhe se quer compartilhar/);
  assert.match(app, /Quer complementar\?/);
  assert.match(app, /className="optional-badge">Opcional/);
  assert.match(app, /seguir direto para salvar/);
  assert.match(app, /preencha somente “Título breve” e “O que aconteceu\?”/);
  assert.match(app, /className="field-label-line"[\s\S]*?Necessário/);
  assert.doesNotMatch(app, /<details className="entry-optional"/);
  assert.match(app, /Será salvo como privado/);
  assert.match(app, /Continuará compartilhado com Mateus/);
  assert.match(app, /Salvar registro privado/);
  assert.match(app, /\{!editing \? \(\s*<section className="records-section"/);
  assert.match(app, /\{!editing \? <AccountPanel role="patient"/);
  assert.match(app, /Você escreve com privacidade/);
  assert.match(app, /Compartilhado com Mateus/);
  assert.match(app, /patient-record-card/);
  assert.match(app, /Filtrar registros por compartilhamento/);
  assert.match(app, /Privados/);
  assert.match(app, /Com Mateus/);
  assert.match(app, /não é acompanhado em tempo real/i);
  assert.match(app, /Guia de Emoções/);
  assert.match(app, /InstallAppButton/);
  assert.match(app, /Não são 12 dígitos/);
  assert.match(app, /12 caracteres; espaços também contam/);
  assert.match(app, /<details className="professional-login-details">/);
  assert.match(app, /<strong>Acesso profissional<\/strong>/);
  assert.match(app, /<small>uso exclusivo de Mateus<\/small>/);
  assert.match(
    app,
    /Este código é usado somente por Mateus para abrir o painel[\s\S]*?Pacientes podem ignorar esta opção/,
  );
  assert.match(app, /label="Código do aplicativo autenticador"[\s\S]*?name="totp"/);
  assert.match(styles, /\.professional-login-details\{/);
  assert.match(app, /addEventListener\("reset", clearRequirements\)/);
  assert.match(app, /user\?\.role !== "therapist"/);
  assert.match(app, /Para pacientes atuais/);
  assert.match(app, /Aberto a qualquer pessoa, sem conta/);
  assert.match(app, /peça a Mateus um novo código de recuperação/i);
  assert.match(app, /onRecoveryCode\(result\.recovery_code\)/);
  assert.match(
    app,
    /Senha alterada\. Guarde o novo código de recuperação antes de entrar\./,
  );
  assert.match(app, /aria-invalid=\{invalid \|\| undefined\}/);
  assert.match(app, /invalid \? errorId : ""/);
  assert.match(
    app,
    /setInvalidField\("confirmation"\)[\s\S]*?formElement\.elements\.namedItem\("confirmation"\)[\s\S]*?confirmation\.focus\(\)/,
  );
  assert.match(app, /id="access-form-message"/);
  assert.match(
    app,
    /focusOnMount=\{!message\.startsWith\("Senha alterada"\) && !invalidField\}/,
  );
  assert.match(
    app,
    /onValueChange=\{\(\) => \{[\s\S]*?setInvalidField\(null\);[\s\S]*?setMessage\(""\)/,
  );
  assert.match(app, /id="setup-form-message"/);
  assert.match(
    app,
    /errorId=\{invalidField === "confirmation" \? "setup-form-message" : undefined\}/,
  );
  assert.match(app, /id="account-form-message"/);
  assert.match(
    app,
    /setInvalidPasswordField\("confirmation"\)[\s\S]*?confirmation\.focus\(\)/,
  );
  assert.match(
    app,
    /focusOnMount=\{!message\.includes\("alterada"\) && !invalidPasswordField\}/,
  );
  assert.equal(app.match(/confirmation\.focus\(\)/g)?.length, 3);
  assert.doesNotMatch(
    app,
    /Senha alterada\.[^`]*\$\{result\.recovery_code\}/,
  );
  assert.match(
    app,
    /<Guest[\s\S]*?onRecoveryCode=\{setRecovery\}/,
  );
  assert.match(app, /<RecoveryCard code=\{recovery\}/);
  assert.match(
    app,
    /previouslyFocused\?\.isConnected[\s\S]*?document\.getElementById\("conteudo"\)\?\.focus\(\)/,
  );
  assert.match(app, /if \(passwordRequestInFlight\.current\) return/);
  assert.match(app, /if \(recoveryRequestInFlight\.current\) return/);
  assert.match(app, /if \(endSessionsRequestInFlight\.current\) return/);
  assert.match(app, /if \(deleteAccountRequestInFlight\.current\) return/);
  assert.match(app, /aria-busy=\{passwordBusy\}/);
  assert.match(app, /disabled=\{passwordBusy\}/);
  assert.match(app, /Alterando senha…/);
  assert.match(app, /disabled=\{recoveryBusy\}/);
  assert.match(app, /Gerando código…/);
  assert.match(app, /disabled=\{deletingAccount\}/);
  assert.match(app, /Excluindo conta…/);
  assert.equal(
    app.match(/if \(requestInFlight\.current\) return/g)?.length,
    3,
  );
  assert.match(app, /if \(submissionInFlight\.current\) return/);
  assert.equal(
    app.match(/if \(entryActionLocks\.current\.has\(entry\.id\)\) return/g)?.length,
    2,
  );
  assert.match(app, /disabled=\{busy\}>Cancelar/);
  assert.equal(
    app.match(/onChange=\{\(e\) => update\([^\n]+disabled=\{busy\}/g)?.length,
    8,
  );
  assert.match(app, /disabled=\{busy \|\| draft\.intensity === 0\}/);
  assert.match(app, /disabled=\{busy \|\| draft\.intensity === 10\}/);
  assert.match(app, /Atualizando compartilhamento…/);
  assert.match(app, /entryAction === "removing" \? "Excluindo…"/);
  assert.match(
    app,
    /card\?\.nextElementSibling\?\.querySelector<HTMLElement>\("summary"\)[\s\S]*?card\?\.previousElementSibling/,
  );
  assert.match(
    app,
    /const focusTarget = adjacentSummary\?\.isConnected[\s\S]*?document\.getElementById\("records-title"\)[\s\S]*?focusTarget\?\.focus\(\)/,
  );
  assert.match(
    app,
    /const \[entriesError, setEntriesError\] = useState\(""\)/,
  );
  assert.match(app, /Nenhum registro foi alterado por esta tentativa/);
  assert.match(app, /Tentar carregar os registros novamente/);
  assert.equal(
    app.match(/entriesError && entries\.length === 0 \? "—"/g)?.length,
    2,
  );
  assert.match(
    app,
    /entriesError && entries\.length === 0 \? null : entries\.length === 0/,
  );
  assert.match(app, /const \[refreshing, setRefreshing\] = useState\(false\)/);
  assert.match(app, /entriesRequestSequence\.current = sequence/);
  assert.match(app, /if \(sequence !== entriesRequestSequence\.current\) return/);
  assert.match(app, /if \(manualRefreshLock\.current\) return/);
  assert.match(app, /Atualizar resumo/);
  assert.match(app, /Atualizando seus registros/);
  assert.match(styles, /\.patient-sharing-actions\{/);
  assert.match(
    app,
    /Sua sessão terminou\. Entre novamente para continuar\./,
  );
  assert.match(app, /sessionMessage=\{sessionMessage\}/);
  assert.match(app, /onSessionLost=\{sessionEnded\}/);
  assert.match(app, /onSessionsEnded=\{sessionEnded\}/);
  assert.match(
    app,
    /mode === "login" && sessionMessage[\s\S]*?<Notice tone="info" message=\{sessionMessage\}/,
  );
  assert.match(installButton, /beforeinstallprompt/);
  assert.match(installButton, /Adicionar à Tela de Início/);
  assert.match(installButton, /MacBook e iMac/);
  assert.match(installButton, /Adicionar ao Dock/);
  assert.match(installButton, /getInstalledRelatedApps/);
  assert.match(installButton, /install-device-grid/);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.name, "Área do paciente");
  assert.equal(parsedManifest.short_name, "Área do paciente");
  assert.equal(
    parsedManifest.description,
    "Registros privados, compartilhamento opcional e leitura complementar para pacientes atuais.",
  );
  assert.equal(parsedManifest.display, "standalone");
  assert.deepEqual(parsedManifest.related_applications, [
    {
      platform: "webapp",
      url: "/manifest.webmanifest",
      id: "/",
    },
  ]);
  assert.match(serviceWorker, /respondWith\(fetch\(request\)\)/);
  assert.doesNotMatch(serviceWorker, /caches\./);
  assert.match(layout, /Espaço exclusivo para pacientes atuais/);
  assert.match(layout, /compartilhamento opcional e leitura complementar/);
  assert.match(layout, /className="skip-link" href="#conteudo"/);
  assert.match(app, /id="conteudo" tabIndex=\{-1\}/);
  assert.match(privacy, /id="conteudo" tabIndex=\{-1\}/);
  assert.match(
    styles,
    /\.skip-link:focus\{transform:translateY\(0\)\}/,
  );
  assert.match(
    styles,
    /\.install-app-button,\.guide-callout,\.skip-link\{transition:none\}/,
  );
  assert.doesNotMatch(layout, /materiais de apoio/);
  assert.doesNotMatch(installButton, /localStorage|sessionStorage/);
  assert.match(privacy, /não são usados para publicidade/);
  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /X-Robots-Tag/);
  assert.match(app, /Acompanhe seu processo/);
  assert.doesNotMatch(app, /Guarde o que aconteceu/);
  assert.doesNotMatch(app, /piloto|fictício|ambiente local/i);
});

test("patient access and editing refinements remain accessible and loss-aware", async () => {
  const [app, education, privacy, styles] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PatientEducation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /role="group" aria-label="Forma de acesso"/);
  assert.doesNotMatch(app, /role="tablist"/);
  assert.match(
    app,
    /<form className="stack" key=\{mode\} onSubmit=\{submit\} aria-busy=\{busy\}>/,
  );
  assert.match(
    app,
    /aria-pressed=\{mode === "login"\} disabled=\{busy\}/,
  );
  assert.match(
    app,
    /className="text-action" type="button" disabled=\{busy\}/,
  );
  assert.match(app, /inputMode="numeric"/);
  assert.match(app, /autoCapitalize="characters"/);
  assert.match(app, /com ou sem espaços e hífens/);
  assert.match(app, /beforeunload/);
  assert.match(app, /Descartar as alterações que ainda não foram salvas/);
  assert.match(
    app,
    /<a className="brand" href="\/" aria-label="Início da Área do paciente">/,
  );
  assert.doesNotMatch(app, /import Link from "next\/link"/);
  assert.match(app, /Alterações salvas\. O compartilhamento com Mateus foi mantido/);
  assert.match(app, /record-\$\{entry\.id\}/);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/);
  assert.match(app, /aria-label="Fechar formulário"[\s\S]*?<span aria-hidden="true">×<\/span>/);
  assert.match(app, /Ajustar intensidade sem arrastar/);
  assert.match(styles, /\.range-adjustments/);
  assert.match(styles, /\.entry-step\{[\s\S]*?border-top:1px solid var\(--line\)[\s\S]*?background:transparent/);
  assert.match(styles, /\.entry-step-optional\{[\s\S]*?box-shadow:none/);
  assert.match(styles, /\.entry-step-emotion\{[\s\S]*?background:transparent/);
  assert.match(styles, /\.optional-fields\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.optional-fields \.field\{[\s\S]*?min-width:0/);
  assert.match(styles, /\.form-requirements-note\{[\s\S]*?border-left:3px solid var\(--green-2\)/);
  assert.match(styles, /\.form-finish\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto[\s\S]*?background:transparent/);
  assert.match(styles, /\.form-finish-copy\{[\s\S]*?border-left:3px solid #9a6d27/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.site-header\{[\s\S]*?display:grid/);
  assert.match(styles, /\.entry-form-heading \.icon-button>span\{[\s\S]*?translateY\(-1px\)/);
  assert.match(app, /root\.style\.scrollBehavior = "auto"/);
  assert.match(app, /atualizado após visualização/);
  assert.match(education, /target="_blank"/);
  assert.match(education, /rel="noopener noreferrer"/);
  assert.match(app, /Tentar novamente/);
  assert.match(
    app,
    /function isSessionExpiredError\(error: unknown\): boolean[\s\S]*?error instanceof PortalRequestError && error\.status === 401/,
  );
  assert.match(app, /if \(isSessionExpiredError\(error\)\) \{\s*onSessionLost\(\)/);
  assert.match(
    app,
    /function handleAccountError\(error: unknown\)[\s\S]*?onSessionsEnded\(\)/,
  );
  assert.doesNotMatch(app, /message\.includes\("login"\)/);
  assert.doesNotMatch(app, /Nome novo, mesmo espaço/);
  assert.doesNotMatch(app, /SHOW_AREA_NAME_CHANGE_NOTICE/);
  assert.match(privacy, /entender se o recurso está[\s\S]*?sendo utilizado/u);
  assert.match(privacy, /Mateus conclui deliberadamente a visualização/);
  assert.doesNotMatch(privacy, /acompanhar a adesão|Mateus abre um registro/u);
});

test("new and legacy workers have explicit, fail-closed API modes", async () => {
  const [worker, currentConfigText, legacyConfigText, viteConfig] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.legacy.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);
  const currentConfig = JSON.parse(currentConfigText);
  const legacyConfig = JSON.parse(legacyConfigText);

  assert.equal(currentConfig.vars.PORTAL_API_MODE, "proxy");
  assert.deepEqual(currentConfig.services, [
    { binding: "LEGACY_PORTAL", service: "registros" },
  ]);
  assert.equal(legacyConfig.vars.PORTAL_API_MODE, "local");
  assert.equal(legacyConfig.services, undefined);
  assert.match(worker, /env\.PORTAL_API_MODE === "proxy"/u);
  assert.match(worker, /env\.PORTAL_API_MODE !== "local"/u);
  assert.match(worker, /if \(!env\.LEGACY_PORTAL\)/u);
  assert.match(worker, /status: 503/u);
  assert.match(viteConfig, /PORTAL_TEST_PERSIST_PATH/u);
  assert.match(viteConfig, /persistState: isolatedTestStatePath/u);
});

test("mutable portal requests require a trusted origin and JSON bodies", async () => {
  const [route, portal] = await Promise.all([
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/portal.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /requireTrustedOrigin\(request\)/u);
  assert.match(portal, /TRUSTED_PRODUCTION_ORIGINS/u);
  assert.match(portal, /area-do-paciente\.psico-mateus\.workers\.dev/u);
  assert.match(portal, /registros\.psico-mateus\.workers\.dev/u);
  assert.match(portal, /contentType !== "application\/json"/u);
  assert.match(portal, /status|415/u);
});

test("professional privacy mode renders a sanitized, action-free surface", async () => {
  const dashboard = await readFile(
    new URL("../app/ProfessionalDashboard.tsx", import.meta.url),
    "utf8",
  );
  const privacyBranch =
    dashboard.match(
      /if \(privacyMode\) \{[\s\S]*?(?=\n  const unreadEntryCount)/u,
    )?.[0] ?? "";

  assert.match(dashboard, /useState\(false\)/u);
  assert.match(dashboard, /Ocultar dados na tela/u);
  assert.match(privacyBranch, /Mostrar dados na tela/u);
  assert.match(dashboard, /aria-label="Ocultar dados na tela"/u);
  assert.match(privacyBranch, /aria-label="Mostrar dados na tela"/u);
  assert.match(privacyBranch, /Dados ocultos na tela/u);
  assert.doesNotMatch(
    privacyBranch,
    /user\.name|patient_name|latestCode|recovery\.code|entry\.title/u,
  );
  assert.match(dashboard, /setLatestCode\(""\)/u);
  assert.match(dashboard, /setRecoveryPatient\(null\)/u);
  assert.match(dashboard, /setIssuedRecovery\(null\)/u);
  assert.match(
    dashboard,
    /if \(!recoveryPatient \|\| recoveryRequestLock\.current\) return/u,
  );
  assert.match(dashboard, /recoveryRequestLock\.current = true/u);
  assert.match(dashboard, /recoveryRequestLock\.current = false/u);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage/u);
});

test("patient sees an honest view status only for currently shared entries", () => {
  const base = {
    shared_at: "2026-07-26T12:00:00.000Z",
    updated_at: "2026-07-26T11:00:00.000Z",
    revoked_at: null,
  };
  assert.deepEqual(
    patientEntryViewStatus({ ...base, shared_at: null, viewed_at: null }),
    { kind: "private" },
  );
  assert.deepEqual(patientEntryViewStatus({ ...base, viewed_at: null }), {
    kind: "unseen",
  });
  assert.deepEqual(
    patientEntryViewStatus({
      ...base,
      viewed_at: "2026-07-26T12:30:00.000Z",
    }),
    { kind: "viewed" },
  );
  assert.deepEqual(
    patientEntryViewStatus({
      ...base,
      updated_at: "2026-07-26T13:00:00.000Z",
      viewed_at: "2026-07-26T12:30:00.000Z",
    }),
    { kind: "updated" },
  );
  assert.deepEqual(
    patientEntryViewStatus({
      ...base,
      shared_at: "2026-07-26T14:00:00.000Z",
      updated_at: "2026-07-26T11:00:00.000Z",
      viewed_at: "2026-07-26T12:30:00.000Z",
    }),
    { kind: "reshared" },
  );
  assert.match(
    formatViewTimestamp("2026-07-26T12:30:00.000Z"),
    /^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/u,
  );
  assert.equal(patientEntryViewSummary({ kind: "private" }), null);
  assert.equal(
    patientEntryViewSummary({ kind: "unseen" }),
    "Ainda não visualizado",
  );
  assert.equal(
    patientEntryViewSummary({ kind: "viewed" }),
    "Visualizado por Mateus",
  );
  assert.equal(
    patientEntryViewSummary({ kind: "updated" }),
    "Atualizado após visualização",
  );
  assert.equal(
    patientEntryViewSummary({ kind: "reshared" }),
    "Compartilhado novamente · ainda não visualizado",
  );
});

test("patient view state is server-derived and excluded from the data export", async () => {
  const [route, app, privacy, updateManager, serviceWorker] = await Promise.all([
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AppUpdateManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  const patientList =
    route.match(
      /if \(session\.role === "patient"\)[\s\S]*?return result\.results;/u,
    )?.[0] ?? "";
  const exportHandler =
    route.match(
      /if \(path === "\/export"\)[\s\S]*?(?=\n  throw new PortalError)/u,
    )?.[0] ?? "";

  assert.match(patientList, /entry_views\.viewed_at/);
  assert.match(patientList, /WHERE entries\.patient_id = \?/);
  assert.match(app, /Ainda não visualizado por Mateus/);
  assert.match(app, /Visualizado por Mateus em/);
  assert.match(app, /patient-view-summary/);
  assert.match(
    app,
    /<small>\{formatDate\(entry\.created_at\)\}[\s\S]*?<span className=\{`patient-view-summary \$\{viewStatus\.kind\}`\}>/u,
  );
  assert.match(app, /patientEntryViewSummary\(viewStatus\)/);
  assert.match(app, /patient-sharing-states/);
  assert.match(app, /Ver no histórico/);
  assert.match(app, /não é acompanhada em tempo real/);
  assert.match(privacy, /Essa informação também aparece[\s\S]*?para você/u);
  assert.match(exportHandler, /delete exportedEntry\.viewed_at/);
  assert.match(updateManager, /updateViaCache: "none"/);
  assert.match(updateManager, /hasUnsavedDraft/);
  assert.match(updateManager, /Atualizar agora/);
  assert.match(serviceWorker, /SKIP_WAITING/);
  assert.doesNotMatch(serviceWorker, /addAll|caches\.open|cache\.put/u);
});

test("patient history filters private and shared entries", () => {
  const entries = [
    { id: "private", shared_at: null, revoked_at: null },
    {
      id: "shared",
      shared_at: "2026-07-23T20:00:00.000Z",
      revoked_at: null,
    },
    {
      id: "revoked",
      shared_at: "2026-07-22T20:00:00.000Z",
      revoked_at: "2026-07-23T20:30:00.000Z",
    },
  ];

  assert.equal(isEntryShared(entries[0]), false);
  assert.equal(isEntryShared(entries[1]), true);
  assert.equal(isEntryShared(entries[2]), false);
  assert.deepEqual(
    filterPatientEntries(entries, "all").map((entry) => entry.id),
    ["private", "shared", "revoked"],
  );
  assert.deepEqual(
    filterPatientEntries(entries, "private").map((entry) => entry.id),
    ["private", "revoked"],
  );
  assert.deepEqual(
    filterPatientEntries(entries, "shared").map((entry) => entry.id),
    ["shared"],
  );
});

test("patient history search stays local, ignores accents and supports ordering", () => {
  const entries = [
    {
      id: "older",
      title: "Reunião difícil",
      emotion: "frustração",
      happened: "Conversa no trabalho",
      body: "",
      thoughts: "",
      urge: "",
      message: "",
      created_at: "2026-07-20T20:00:00.000Z",
      shared_at: null,
      revoked_at: null,
    },
    {
      id: "newer",
      title: "Caminhada",
      emotion: "alívio",
      happened: "Volta no parque",
      body: "",
      thoughts: "",
      urge: "",
      message: "",
      created_at: "2026-07-27T20:00:00.000Z",
      shared_at: "2026-07-27T20:30:00.000Z",
      revoked_at: null,
    },
  ];

  assert.deepEqual(
    filterAndSortPatientEntries(entries, "all", "reuniao", "newest").map(
      (entry) => entry.id,
    ),
    ["older"],
  );
  assert.deepEqual(
    filterAndSortPatientEntries(entries, "shared", "ALIVIO", "newest").map(
      (entry) => entry.id,
    ),
    ["newer"],
  );
  assert.deepEqual(
    filterAndSortPatientEntries(entries, "all", "", "newest").map(
      (entry) => entry.id,
    ),
    ["newer", "older"],
  );
  assert.deepEqual(
    filterAndSortPatientEntries(entries, "all", "", "oldest").map(
      (entry) => entry.id,
    ),
    ["older", "newer"],
  );
});

test("record form shows character counts only near each field limit", async () => {
  const app = await readFile(
    new URL("../app/PortalApp.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(remainingCharactersNearLimit("curto", 120), null);
  assert.equal(remainingCharactersNearLimit("a".repeat(100), 120), 20);
  assert.equal(remainingCharactersNearLimit("a".repeat(119), 120), 1);
  assert.equal(remainingCharactersNearLimit("a".repeat(120), 120), 0);
  assert.equal(remainingCharactersNearLimit("a".repeat(121), 120), 0);
  assert.match(app, /Limite de caracteres atingido/);
  assert.match(app, /CharacterLimit value=\{draft\.happened\} maxLength=\{2000\}/);
});

test("patient data copy explains private records and device responsibility", async () => {
  const app = await readFile(
    new URL("../app/PortalApp.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /Baixar cópia dos meus registros/);
  assert.match(app, /inclui também os registros privados/);
  assert.match(app, /somente em um aparelho seguro/);
  assert.match(app, /Esta ação apaga permanentemente sua conta/);
});

test("account owner can securely revoke every open session", async () => {
  const [app, route] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(app, /Sessões e dispositivos/);
  assert.match(app, /Encerrar em todos os dispositivos/);
  assert.match(app, /Seus registros não serão apagados/);
  assert.match(app, /method: "DELETE"/);
  assert.match(app, /current_password: form\.get\("current_password"\)/);
  assert.match(app, /totp: form\.get\("totp"\)/);
  assert.match(route, /path === "\/account\/sessions"/);
  assert.match(route, /passwordMatches\(/);
  assert.match(route, /user\.role === "therapist"[\s\S]*?verifyTotp\(/u);
  assert.match(route, /DELETE FROM sessions WHERE user_id = \?/);
  assert.match(route, /revoke_all_sessions/);
  assert.match(route, /clearSessionCookie\(request\)/);
});

test("privacy notice explains account closure and data-rights requests", async () => {
  const [app, portal, privacy] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/portal.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /Código atual do autenticador/);
  assert.match(app, /aguarde o número exibido mudar/);
  assert.match(portal, /PRIVACY_VERSION = "2026-07-29"/);
  assert.match(privacy, /Versão de 29 de julho de 2026/);
  assert.match(privacy, /não\s+apaga automaticamente a conta nem os registros/u);
  assert.match(privacy, /Mateus deixa de acessar também os registros/);
  assert.match(privacy, /Como exercer seus direitos/);
  assert.match(privacy, /acesso, correção das informações\s+de identificação ou exclusão/u);
  assert.match(privacy, /confirmar sua identidade/);
});

test("copy buttons support Safari fallback and keep codes selectable", async () => {
  const [app, clipboard, dashboard, styles] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/copy-text.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ProfessionalDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /copyText\(code\)/);
  assert.match(dashboard, /copyText\(latestCode\)/);
  assert.match(dashboard, /copyText\(recovery\.code\)/);
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/);
  assert.match(clipboard, /document\.execCommand\("copy"\)/);
  assert.match(styles, /-webkit-user-select:all;user-select:all/);
});

test("copy falls back to a temporary selection when Clipboard API is blocked", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  let clipboardAttempted = false;
  let legacyCopyCalled = false;

  class TestElement {
    focus() {}
  }
  class TestTextArea extends TestElement {
    value = "";
    readOnly = false;
    style = {};
    setAttribute() {}
    select() {}
    setSelectionRange() {}
    remove() {}
  }

  const selection = {
    rangeCount: 0,
    getRangeAt() {
      throw new Error("No range");
    },
    removeAllRanges() {},
    addRange() {},
  };

  try {
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: TestElement,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          async writeText() {
            clipboardAttempted = true;
            throw new Error("NotAllowedError");
          },
        },
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: null,
        getSelection: () => selection,
        createElement: () => new TestTextArea(),
        body: { appendChild() {} },
        execCommand(command) {
          assert.equal(command, "copy");
          legacyCopyCalled = true;
          return true;
        },
      },
    });

    await copyText("TESTE-1234");
    assert.equal(clipboardAttempted, true);
    assert.equal(legacyCopyCalled, true);
  } finally {
    for (const [name, descriptor] of [
      ["navigator", originalNavigator],
      ["document", originalDocument],
      ["HTMLElement", originalHTMLElement],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test("professional activity exposes counts without private record fields", async () => {
  const [dashboard, route, privacy] = await Promise.all([
    readFile(new URL("../app/ProfessionalDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/portal/[...segments]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /Mantidos privados/);
  assert.match(dashboard, /patient\.private_count/);
  assert.match(route, /AS private_count/);
  assert.match(route, /HAVING COUNT\(entries\.id\) > 0/);
  assert.match(privacy, /não vê título, emoção,\s+data nem qualquer parte do conteúdo dos privados/);
});

test("mobile layout keeps the portal within the viewport", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const finalMobileRules =
    styles.match(
      /Mantém a entrada do portal[\s\S]*?@media\(max-width:850px\)\{[\s\S]*?@media\(max-width:560px\)\{[\s\S]*$/u,
    )?.[0] ?? "";

  assert.match(finalMobileRules, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(finalMobileRules, /\.guest-intro,\.auth-card\{[\s\S]*?min-width:0/);
  assert.match(finalMobileRules, /\.guest-layout\{[\s\S]*?padding:0 1rem/);
  assert.match(finalMobileRules, /\.disclosure-action\{[\s\S]*?calc\(100% - 2\.7rem\)/);
  assert.match(finalMobileRules, /#selected-patient-title[\s\S]*?scroll-margin-top:8\.5rem/);
});

test("public Worker build does not duplicate the Sites database binding", async () => {
  const [viteConfig, packageJson] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(viteConfig, /CLOUDFLARE_PUBLIC_DEPLOY === "1"/);
  assert.match(viteConfig, /d1 && !isPublicWorkerBuild/);
  assert.match(
    viteConfig,
    /\.\.\.\(!isPublicWorkerBuild[\s\S]*?PORTAL_API_MODE: "local"/u,
  );
  assert.match(scripts["build:worker"], /CLOUDFLARE_PUBLIC_DEPLOY=1/);
  assert.match(scripts["deploy:worker"], /pnpm build:worker && wrangler deploy/);
});

test("professional patient search ignores case and accents without merging equal names", () => {
  const patients = [
    {
      patient_id: "patient_beta",
      patient_name: "Álvaro",
      shared_count: 2,
      unread_count: 0,
      latest_shared_at: "2026-07-21T18:00:00.000Z",
    },
    {
      patient_id: "patient_alpha",
      patient_name: "Álvaro",
      shared_count: 1,
      unread_count: 2,
      latest_shared_at: "2026-07-22T18:00:00.000Z",
    },
    {
      patient_id: "patient_gamma",
      patient_name: "Beatriz",
      shared_count: 3,
      unread_count: 1,
      latest_shared_at: "2026-07-20T18:00:00.000Z",
    },
  ];

  assert.equal(normalizePatientSearch("  ÁLVAro "), "alvaro");
  assert.deepEqual(
    filterAndSortPatients(patients, "alv", "alphabetical").map(
      (patient) => patient.patient_id,
    ),
    ["patient_alpha", "patient_beta"],
  );
  assert.deepEqual(
    filterAndSortPatients(patients, "", "recent").map(
      (patient) => patient.patient_id,
    ),
    ["patient_alpha", "patient_beta", "patient_gamma"],
  );
  assert.deepEqual(
    filterAndSortPatients(patients, "", "unread").map(
      (patient) => patient.patient_id,
    ),
    ["patient_alpha", "patient_gamma", "patient_beta"],
  );
  assert.equal(sharedCountLabel(1), "1 registro compartilhado");
  assert.equal(sharedCountLabel(2), "2 registros compartilhados");
  assert.equal(unreadCountLabel(0), "Tudo visto");
  assert.equal(unreadCountLabel(1), "1 registro ainda não visto");
  assert.equal(unreadCountLabel(3), "3 registros ainda não vistos");
});

test("patient access list keeps active accounts first and filters by name", () => {
  const accesses = [
    {
      patient_id: "patient_revoked",
      patient_name: "Beatriz",
      access_status: "revoked",
      created_at: "2026-07-20T10:00:00.000Z",
      revoked_at: "2026-07-22T10:00:00.000Z",
      last_login_at: null,
      shared_count: 0,
    },
    {
      patient_id: "patient_active_b",
      patient_name: "Álvaro",
      access_status: "active",
      created_at: "2026-07-20T10:00:00.000Z",
      revoked_at: null,
      last_login_at: null,
      shared_count: 1,
    },
    {
      patient_id: "patient_active_a",
      patient_name: "Ana",
      access_status: "active",
      created_at: "2026-07-20T10:00:00.000Z",
      revoked_at: null,
      last_login_at: null,
      shared_count: 2,
    },
  ];

  assert.deepEqual(
    filterPatientAccesses(accesses, "").map((patient) => patient.patient_id),
    ["patient_active_b", "patient_active_a", "patient_revoked"],
  );
  assert.deepEqual(
    filterPatientAccesses(accesses, "alv").map((patient) => patient.patient_id),
    ["patient_active_b"],
  );
});

test("invitation status separates active codes from compact history", () => {
  const invitations = [
    {
      id: "invite_active",
      status: "active",
      created_at: "2026-07-22T10:00:00.000Z",
      expires_at: "2026-07-29T10:00:00.000Z",
      used_at: null,
      revoked_at: null,
    },
    {
      id: "invite_used",
      status: "used",
      created_at: "2026-07-20T10:00:00.000Z",
      expires_at: "2026-07-27T10:00:00.000Z",
      used_at: "2026-07-21T10:00:00.000Z",
      revoked_at: null,
    },
    {
      id: "invite_expired",
      status: "expired",
      created_at: "2026-07-01T10:00:00.000Z",
      expires_at: "2026-07-08T10:00:00.000Z",
      used_at: null,
      revoked_at: null,
    },
    {
      id: "invite_revoked",
      status: "revoked",
      created_at: "2026-07-18T10:00:00.000Z",
      expires_at: "2026-07-25T10:00:00.000Z",
      used_at: null,
      revoked_at: "2026-07-19T10:00:00.000Z",
    },
  ];

  const result = splitInvitations(invitations);
  assert.deepEqual(result.active.map((invitation) => invitation.id), ["invite_active"]);
  assert.deepEqual(
    result.history.map((invitation) => invitation.id),
    ["invite_used", "invite_expired", "invite_revoked"],
  );
  assert.equal(invitationStatusLabel("revoked"), "Revogado");
});

test("professional API groups by stable patient id and filters every detail query", async () => {
  const [route, dashboard, portal, worker] = await Promise.all([
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/ProfessionalDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/portal.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /GROUP BY users\.id, users\.display_name/);
  assert.match(route, /patient_links\.therapist_id = \?/);
  assert.match(route, /entries\.shared_at IS NOT NULL AND entries\.revoked_at IS NULL/);
  assert.match(route, /patient_links\.patient_id = \?/);
  assert.match(route, /invitations\.expires_at > \?/);
  assert.match(route, /expires_at <= \? THEN 'expired'/);
  assert.match(route, /\/professional\/accesses/);
  assert.match(route, /revoke_patient_access/);
  assert.match(route, /issue_assisted_recovery/);
  assert.match(route, /mark_entry_viewed/);
  assert.match(route, /entry_views/);
  assert.match(route, /viewedEntry = path\.match\([\s\S]*?viewed/u);
  assert.match(route, /ON CONFLICT\(entry_id, therapist_id\) DO UPDATE/);
  assert.match(route, /assisted_recovery_grants/);
  assert.match(route, /\/recovery-code/);
  assert.match(route, /A senha profissional não confere/);
  assert.match(route, /novo código valerá por 24 horas|24 \* 60 \* 60/u);
  assert.match(
    route,
    /UPDATE assisted_recovery_grants SET expires_at = \? WHERE user_id = \?/u,
  );
  assert.match(route, /DELETE FROM sessions WHERE user_id = \?/);
  assert.match(route, /patient_links\.therapist_id = \? AND patient_links\.patient_id = \?/);
  assert.match(portal, /expires_at > \?/);
  assert.match(worker, /Cache-Control", "no-store, max-age=0"/);
  assert.doesNotMatch(
    route.match(/async function listSharedPatients[\s\S]*?return result\.results;/u)?.[0] ?? "",
    /email_hash|password|recovery|totp_secret/u,
  );
  assert.match(dashboard, /useState<ProfessionalArea>\("records"\)/);
  assert.match(dashboard, /Acessos de pacientes/);
  assert.match(dashboard, /Revogar acesso/);
  assert.match(dashboard, /Restaurar acesso/);
  assert.match(dashboard, /Gerar recuperação/);
  assert.match(dashboard, /Com pendências primeiro/);
  assert.match(dashboard, /Não vistos/);
  assert.match(dashboard, /Vistos/);
  assert.match(dashboard, /Salvando visualização/);
  assert.match(dashboard, /Concluir visualização/);
  assert.match(dashboard, /const restoreFocusAfterView = useRef\(false\)/);
  assert.match(
    dashboard,
    /if \(!restoreFocusAfterView\.current \|\| viewing\) return;[\s\S]*?if \(!unread\) summaryRef\.current\?\.focus\(\)/,
  );
  assert.match(
    dashboard,
    /restoreFocusAfterView\.current = true;[\s\S]*?onViewed\(entry\.id\)/,
  );
  assert.match(
    dashboard,
    /setNotice\(null\);[\s\S]*?Visualização confirmada\. O paciente poderá ver essa confirmação no histórico\./,
  );
  assert.match(
    dashboard,
    /onGenerateRecovery\(patient, event\.currentTarget\)/,
  );
  assert.match(
    dashboard,
    /const recoveryTriggerRef = useRef<HTMLButtonElement \| null>\(null\)/,
  );
  assert.match(
    dashboard,
    /if \(trigger\?\.isConnected\)[\s\S]*?trigger\.focus\(\)[\s\S]*?patient-access-title/,
  );
  assert.equal(
    dashboard.match(/restoreRecoveryTriggerFocus\(\);/g)?.length,
    2,
  );
  assert.match(
    dashboard,
    /id="patient-access-title" tabIndex=\{-1\}/,
  );
  assert.match(
    dashboard,
    /const titleRef = useRef<HTMLHeadingElement>\(null\)[\s\S]*?titleRef\.current\?\.focus\(\)/,
  );
  assert.match(
    dashboard,
    /id="issued-recovery-title" ref=\{titleRef\} tabIndex=\{-1\}/,
  );
  assert.match(
    dashboard,
    /onRevoke\(invitation, event\.currentTarget\)/,
  );
  assert.match(
    dashboard,
    /item\?\.nextElementSibling\?\.querySelector<HTMLButtonElement>\("button"\)[\s\S]*?item\?\.previousElementSibling/,
  );
  assert.match(
    dashboard,
    /shouldRestoreFocus = true[\s\S]*?adjacentAction\?\.isConnected[\s\S]*?active-invitations-title[\s\S]*?focusTarget\?\.focus\(\)/,
  );
  assert.match(
    dashboard,
    /id="active-invitations-title" tabIndex=\{-1\}/,
  );
  const disclosureToggle =
    dashboard.match(/onToggle=\{\(event\) => \{[\s\S]*?\}\}/u)?.[0] ?? "";
  assert.doesNotMatch(disclosureToggle, /onViewed/u);
  assert.match(dashboard, /Sua senha profissional/);
  assert.match(dashboard, /Código atual do autenticador/);
  assert.match(dashboard, /aguarde o número exibido mudar/);
  assert.match(dashboard, /Ele aparece\s+somente agora/u);
  assert.match(dashboard, /AbortController/);
  assert.match(dashboard, /type="search"/);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage|dangerouslySetInnerHTML/);
  assert.doesNotMatch(`${route}\n${dashboard}`, /BREVO|Brevo/u);
});

test("registration commits account, invitation, link, session and audit atomically", async () => {
  const [route, portal] = await Promise.all([
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/portal.ts", import.meta.url), "utf8"),
  ]);
  const registration =
    route.match(
      /async function register[\s\S]*?(?=\nasync function recoverAccount)/u,
    )?.[0] ?? "";

  assert.match(registration, /DB\.batch\(registrationStatements\)/);
  assert.match(registration, /session\.statement/);
  assert.match(registration, /prepareAudit\(patientId, "register", "account"\)/);
  assert.match(registration, /UPDATE invitations[\s\S]*?used_at IS NULL/u);
  assert.match(
    registration,
    /SELECT therapist_id[\s\S]*?patient_id = \? AND used_at = \?/u,
  );
  assert.doesNotMatch(registration, /SELECT \* FROM users WHERE id/);
  assert.doesNotMatch(registration, /await createSession/);
  assert.match(portal, /export async function prepareSession/);
  assert.match(portal, /export function prepareAudit/);
});

test("local restore rehearsal stays synthetic and offline", async () => {
  const [rehearsal, packageSource] = await Promise.all([
    readFile(
      new URL("../scripts/rehearse-local-restore.mjs", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(
    packageJson.scripts["test:restore-local"],
    "node scripts/rehearse-local-restore.mjs",
  );
  assert.match(rehearsal, /mkdtemp/);
  assert.match(rehearsal, /data: "synthetic-only"/);
  assert.match(rehearsal, /production_requests: 0/);
  assert.match(rehearsal, /PRAGMA integrity_check/);
  assert.match(rehearsal, /PRAGMA foreign_key_check/);
  assert.doesNotMatch(
    rehearsal,
    /fetch\(|XMLHttpRequest|WebSocket|https?:\/\/|wrangler|cloudflare/iu,
  );
});

test("public smoke check stays unauthenticated and read-only", async () => {
  const [script, packageText] = await Promise.all([
    readFile(new URL("../scripts/smoke-public.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(
    packageJson.scripts["test:smoke-public"],
    "node scripts/smoke-public.mjs",
  );
  assert.match(script, /scope: "public-read-only"/u);
  assert.match(script, /authenticated_requests: 0/u);
  assert.match(script, /production_writes: 0/u);
  assert.match(script, /method: "GET"/u);
  assert.match(script, /\/api\/portal\/health/u);
  assert.doesNotMatch(
    script,
    /method:\s*"(?:POST|PUT|PATCH|DELETE)"|authorization|x-csrf-token|cookie\s*:/iu,
  );
});

test("unexpected registration errors emit only bounded technical metadata", async () => {
  const route = await readFile(
    new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
    "utf8",
  );
  const logger =
    route.match(
      /function logTechnicalFailure[\s\S]*?(?=\nasync function portalOperation)/u,
    )?.[0] ?? "";

  assert.match(logger, /portal_request_failed/);
  assert.match(logger, /occurrence_id/);
  assert.match(logger, /duration_ms/);
  assert.match(logger, /technicalRoute\(path\)/);
  assert.doesNotMatch(logger, /route:\s*path/u);
  assert.doesNotMatch(
    logger,
    /input|email|password|invitation_code|recovery_code|cookie|token|cf-connecting-ip/u,
  );
  assert.doesNotMatch(logger, /console\.error\(\s*error/u);
});

test("registration errors do not confirm an existing account and request bodies stop at the limit", async () => {
  const [route, portal, security] = await Promise.all([
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/portal.ts", import.meta.url), "utf8"),
    readFile(new URL("../../SECURITY.md", import.meta.url), "utf8"),
  ]);
  const registration =
    route.match(
      /async function register[\s\S]*?(?=\nasync function recoverAccount)/u,
    )?.[0] ?? "";
  const routeNormalizer =
    route.match(
      /function technicalRoute[\s\S]*?(?=\nfunction logTechnicalFailure)/u,
    )?.[0] ?? "";

  assert.doesNotMatch(registration, /Já existe uma conta com este e-mail/u);
  assert.match(registration, /Não foi possível criar a conta/);
  assert.match(routeNormalizer, /\/entries\/:entryId/);
  assert.match(routeNormalizer, /\/professional\/patients\/:patientId/);
  assert.match(routeNormalizer, /"\/unknown"/);
  assert.match(portal, /request\.body\?\.getReader\(\)/);
  assert.match(portal, /receivedBytes > maximumBytes/);
  assert.match(portal, /if \(!tooLarge\) raw \+= decoder\.decode/);
  assert.match(portal, /if \(tooLarge\) throw new PortalError\(413/);
  assert.match(security, /Não publique detalhes/);
  assert.doesNotMatch(security, /senha real|token real|código real/iu);
});
