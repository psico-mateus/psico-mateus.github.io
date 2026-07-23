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
  filterPatientEntries,
  isEntryShared,
} from "../app/patient-dashboard-data.ts";

test("passwords are salted and verified", async () => {
  assert.equal(PASSWORD_ITERATIONS, 310_000);
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
  assert.match(app, /Compartilhados/);
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
  assert.doesNotMatch(app, /piloto|fictício|ambiente local/i);
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

  assert.match(route, /GROUP BY entries\.patient_id, users\.display_name/);
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
  assert.match(dashboard, /Salvando leitura/);
  assert.match(dashboard, /Concluir leitura/);
  assert.match(dashboard, /Sua senha profissional/);
  assert.match(dashboard, /Novo código do seu autenticador/);
  assert.match(dashboard, /Ele aparece\s+somente agora/u);
  assert.match(dashboard, /AbortController/);
  assert.match(dashboard, /type="search"/);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage|dangerouslySetInnerHTML/);
  assert.doesNotMatch(`${route}\n${dashboard}`, /BREVO|Brevo/u);
});
