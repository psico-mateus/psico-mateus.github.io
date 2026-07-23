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
} from "../app/professional-dashboard-data.ts";

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
  assert.match(app, /não é acompanhado em tempo real/i);
  assert.match(app, /Guia de Emoções/);
  assert.match(app, /InstallAppButton/);
  assert.match(installButton, /beforeinstallprompt/);
  assert.match(installButton, /Adicionar à Tela de Início/);
  assert.match(installButton, /MacBook ou iMac/);
  assert.match(installButton, /Adicionar ao Dock/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(serviceWorker, /respondWith\(fetch\(request\)\)/);
  assert.doesNotMatch(serviceWorker, /caches\./);
  assert.doesNotMatch(installButton, /localStorage|sessionStorage/);
  assert.match(privacy, /não são usados para publicidade/);
  assert.match(worker, /Content-Security-Policy/);
  assert.doesNotMatch(app, /piloto|fictício|ambiente local/i);
});

test("professional patient search ignores case and accents without merging equal names", () => {
  const patients = [
    {
      patient_id: "patient_beta",
      patient_name: "Álvaro",
      shared_count: 2,
      latest_shared_at: "2026-07-21T18:00:00.000Z",
    },
    {
      patient_id: "patient_alpha",
      patient_name: "Álvaro",
      shared_count: 1,
      latest_shared_at: "2026-07-22T18:00:00.000Z",
    },
    {
      patient_id: "patient_gamma",
      patient_name: "Beatriz",
      shared_count: 3,
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
  assert.equal(sharedCountLabel(1), "1 registro compartilhado");
  assert.equal(sharedCountLabel(2), "2 registros compartilhados");
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
  assert.match(dashboard, /AbortController/);
  assert.match(dashboard, /type="search"/);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage|dangerouslySetInnerHTML/);
});
