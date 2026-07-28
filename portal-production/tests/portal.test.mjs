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
  remainingCharactersNearLimit,
} from "../app/patient-dashboard-data.ts";
import { copyText } from "../app/copy-text.ts";
import { formatViewTimestamp } from "../app/portal-client.ts";

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
  const [app, installButton, manifest, privacy, serviceWorker, worker] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InstallAppButton.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /Nada é compartilhado automaticamente/);
  assert.match(app, /Não precisa preencher tudo/);
  assert.match(app, /Aprofundar este registro/);
  assert.match(app, /Privado ao salvar/);
  assert.match(app, /Compartilhado com Mateus/);
  assert.match(app, /patient-record-card/);
  assert.match(app, /Filtrar registros por compartilhamento/);
  assert.match(app, /Privados/);
  assert.match(app, /Com Mateus/);
  assert.match(app, /não é acompanhado em tempo real/i);
  assert.match(app, /Guia de Emoções/);
  assert.match(app, /InstallAppButton/);
  assert.match(app, /user\?\.role !== "therapist"/);
  assert.match(app, /Para pacientes atuais/);
  assert.match(app, /Aberto a qualquer pessoa, sem conta/);
  assert.match(app, /peça a Mateus um novo código de recuperação/i);
  assert.match(installButton, /beforeinstallprompt/);
  assert.match(installButton, /Adicionar à Tela de Início/);
  assert.match(installButton, /MacBook e iMac/);
  assert.match(installButton, /Adicionar ao Dock/);
  assert.match(installButton, /getInstalledRelatedApps/);
  assert.match(installButton, /install-device-grid/);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.name, "Área do paciente");
  assert.equal(parsedManifest.short_name, "Área do paciente");
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
  assert.match(app, /inputMode="numeric"/);
  assert.match(app, /autoCapitalize="characters"/);
  assert.match(app, /com ou sem espaços e hífens/);
  assert.match(app, /beforeunload/);
  assert.match(app, /Descartar as alterações que ainda não foram salvas/);
  assert.match(app, /Alterações salvas\. O compartilhamento com Mateus foi mantido/);
  assert.match(app, /record-\$\{entry\.id\}/);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/);
  assert.match(app, /Ajustar intensidade sem arrastar/);
  assert.match(styles, /\.range-adjustments/);
  assert.match(app, /root\.style\.scrollBehavior = "auto"/);
  assert.match(app, /atualizado após visualização/);
  assert.match(education, /target="_blank"/);
  assert.match(education, /rel="noopener noreferrer"/);
  assert.match(app, /Tentar novamente/);
  assert.doesNotMatch(app, /Nome novo, mesmo espaço/);
  assert.doesNotMatch(app, /SHOW_AREA_NAME_CHANGE_NOTICE/);
  assert.match(privacy, /entender se o recurso está[\s\S]*?sendo utilizado/u);
  assert.match(privacy, /Mateus conclui deliberadamente a visualização/);
  assert.doesNotMatch(privacy, /acompanhar a adesão|Mateus abre um registro/u);
});

test("new and legacy workers have explicit, fail-closed API modes", async () => {
  const [worker, currentConfigText, legacyConfigText] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.legacy.jsonc", import.meta.url), "utf8"),
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
  assert.match(privacyBranch, /Dados ocultos na tela/u);
  assert.doesNotMatch(
    privacyBranch,
    /user\.name|patient_name|latestCode|recovery\.code|entry\.title/u,
  );
  assert.match(dashboard, /setLatestCode\(""\)/u);
  assert.match(dashboard, /setRecoveryPatient\(null\)/u);
  assert.match(dashboard, /setIssuedRecovery\(null\)/u);
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
});

test("patient view state is server-derived and excluded from the data export", async () => {
  const [route, app, privacy] = await Promise.all([
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
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
  assert.match(app, /não é acompanhada em tempo real/);
  assert.match(privacy, /Essa informação também aparece[\s\S]*?para você/u);
  assert.match(exportHandler, /delete exportedEntry\.viewed_at/);
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
  const disclosureToggle =
    dashboard.match(/onToggle=\{\(event\) => \{[\s\S]*?\}\}/u)?.[0] ?? "";
  assert.doesNotMatch(disclosureToggle, /onViewed/u);
  assert.match(dashboard, /Sua senha profissional/);
  assert.match(dashboard, /Novo código do seu autenticador/);
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
