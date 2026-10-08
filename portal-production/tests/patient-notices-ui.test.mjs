import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import axe from "axe-core";

const baseUrl = process.env.PORTAL_NOTICES_UI_BASE_URL;
const browserName = process.env.PORTAL_NOTICES_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_NOTICES_UI_OUTPUT ?? "/tmp/area-paciente-notices-ui");
if (!["chromium", "webkit"].includes(browserName)) throw new Error("Use chromium ou webkit para validar os avisos.");
if (baseUrl && !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(new URL(baseUrl).hostname)) {
  throw new Error("Os testes de avisos aceitam somente um servidor local isolado.");
}

test("notices keep text in component state and mutations in explicit handlers", async () => {
  const [patient, professional, dashboard] = await Promise.all([
    readFile(new URL("../app/PatientNotices.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ProfessionalPatientNotices.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ProfessionalDashboard.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of [patient, professional]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage|console\.(?:log|warn|error)|dangerouslySetInnerHTML/u);
    assert.match(source, /key=\{`\$\{props\.patientId\}:\$\{props\.csrf\}`\}/u);
  }
  assert.match(patient, /onClick=\{\(\) => void markRead\(notice\)\}/u);
  assert.match(professional, /client_request_id: submission\.current\.id/u);
  assert.match(professional, /Confirmar remoção/u);
  assert.match(professional, /onDraftStateChange\?\.\(hasDraft\)/u);
  assert.match(professional, /beforeunload/u);
  assert.match(dashboard, /confirmNoticeDraftDiscard/u);
});

describe("rendered notices — mocked API only (Browser plugin not available)", { skip: !baseUrl }, () => {
  let browser;
  let expect;
  const contexts = new Set();
  const timestamp = "2026-10-08T12:00:00.000Z";
  const patientId = "synthetic-patient";
  const firstPatientId = "synthetic-active-no-records";
  const secondPatientId = "synthetic-active-second";
  const firstPatientName = "Paciente Sintético Sem Registros";
  const secondPatientName = "Paciente Sintético Dois";
  const noticeOne = {
    id: "synthetic-notice-one",
    title: "Uma informação para sua próxima visita",
    body: "Conteúdo sintético usado somente neste teste.\n<img src=x onerror=alert(1)>",
    created_at: timestamp,
    read_at: null,
  };
  const noticeTwo = {
    id: "synthetic-notice-two",
    title: "Informação anterior",
    body: "Outro aviso sintético de teste.",
    created_at: "2026-10-07T12:00:00.000Z",
    read_at: timestamp,
  };

  before(async () => {
    const playwright = await import("../../node_modules/@playwright/test/index.mjs");
    expect = playwright.expect;
    browser = await playwright[browserName].launch({ headless: true });
    await mkdir(outputDir, { recursive: true });
  });
  after(async () => {
    for (const context of contexts) await context.close();
    await browser?.close();
  });

  async function openPortal(role, viewport = { width: 1440, height: 1000 }) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    contexts.add(context);
    const page = await context.newPage();
    const controls = {
      notices: [structuredClone(noticeOne), structuredClone(noticeTwo)],
      earlierNotices: [],
      nextCursor: null,
      readFailure: 0,
      sendFailure: 0,
      professionalListFailure: 0,
      listFailure: 0,
      mutations: [],
      unexpected: [],
      runtimeErrors: [],
      expectedHttpFailures: [],
      harnessWarnings: [],
      sentByRequestId: new Map(),
      professionalNotices: new Map([
        [firstPatientId, [structuredClone(noticeOne)]],
        [secondPatientId, []],
      ]),
    };
    page.on("pageerror", (error) => controls.runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") {
        controls.harnessWarnings.push(text);
        return;
      }
      if (/Failed to load resource: the server responded with a status of (?:401|403|404|500|503)\b/u.test(text)) {
        controls.expectedHttpFailures.push(text);
      } else controls.runtimeErrors.push(text);
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseUrl).origin) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.route("**/api/portal/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/portal/u, "");
      const method = request.method();
      const respond = (payload, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      if (method !== "GET") {
        controls.mutations.push({ path, method, payload: request.postData() ? request.postDataJSON() : null, csrf: request.headers()["x-csrf-token"] });
      }
      if (path === "/config") return respond({ configured: true, pending: false, privacy_version: "2026-08-20" });
      if (path === "/session") return respond({ user: { id: role === "patient" ? patientId : "synthetic-therapist", name: role === "patient" ? "Paciente Sintético" : "Mateus", role }, csrf: "synthetic-csrf" });
      if (path === "/entries" && method === "GET") return respond({ entries: [] });
      if (path === "/map-sharing" && method === "GET") return respond({ shares: [] });
      if (path === "/map-draft" && method === "GET") return respond({ content_version: "mapa-pessoal-refinado-ouro-v1", generation: 1, fields: [] });
      if (path === "/account/mfa-recovery-codes" && method === "GET") return respond({ remaining: 8, total: 8, generated_at: timestamp });
      if (path === "/professional/patients" && method === "GET") return respond({ patients: [], activity: { total_count: 0, shared_count: 0, private_count: 0 } });
      if (path === "/professional/accesses" && method === "GET") return respond({ patients: [
        { patient_id: firstPatientId, patient_name: firstPatientName, access_status: "active", created_at: timestamp, revoked_at: null, last_login_at: null, shared_count: 0 },
        { patient_id: secondPatientId, patient_name: secondPatientName, access_status: "active", created_at: timestamp, revoked_at: null, last_login_at: null, shared_count: 0 },
        { patient_id: "synthetic-revoked", patient_name: "Paciente Sintético Revogado", access_status: "revoked", created_at: timestamp, revoked_at: timestamp, last_login_at: null, shared_count: 0 },
      ] });
      if (path === "/notices" && method === "GET") {
        if (controls.listFailure) return respond({ error: "Falha sintética ao carregar os avisos." }, controls.listFailure);
        return respond({ notices: url.searchParams.has("cursor") ? controls.earlierNotices : controls.notices, unread_count: controls.notices.filter((notice) => !notice.read_at).length, next_cursor: url.searchParams.has("cursor") ? null : controls.nextCursor });
      }
      const readMatch = path.match(/^\/notices\/([^/]+)\/read$/u);
      if (readMatch && method === "POST") {
        if (controls.readFailure) {
          const status = controls.readFailure;
          controls.readFailure = 0;
          return respond({ error: "Falha sintética ao confirmar a leitura." }, status);
        }
        const notice = controls.notices.find((item) => item.id === readMatch[1]);
        notice.read_at = timestamp;
        return respond({ notice });
      }
      const professionalMatch = path.match(/^\/professional\/patients\/([^/]+)\/notices(?:\/([^/]+))?$/u);
      if (professionalMatch) {
        const id = professionalMatch[1];
        const notices = controls.professionalNotices.get(id) ?? [];
        if (method === "GET") {
          if (controls.professionalListFailure) return respond({ error: "Acesso sintético não disponível." }, controls.professionalListFailure);
          return respond({ notices, unread_count: notices.filter((notice) => !notice.read_at).length, next_cursor: null });
        }
        if (method === "POST") {
          const payload = request.postDataJSON();
          let notice = controls.sentByRequestId.get(payload.client_request_id);
          if (!notice) {
            notice = { id: `synthetic-sent-${controls.sentByRequestId.size + 1}`, title: payload.title, body: payload.body, read_at: null, created_at: timestamp };
            controls.sentByRequestId.set(payload.client_request_id, notice);
            notices.unshift(notice);
          }
          if (controls.sendFailure) {
            const status = controls.sendFailure;
            controls.sendFailure = 0;
            return respond({ error: "Falha sintética após o recebimento. Tente novamente." }, status);
          }
          return respond({ notice }, 201);
        }
        if (method === "DELETE") {
          controls.professionalNotices.set(id, notices.filter((notice) => notice.id !== professionalMatch[2]));
          return route.fulfill({ status: 204 });
        }
      }
      if (path === "/invitations" && method === "GET") return respond({ invitations: [] });
      if (path === "/logout" && method === "POST") return respond({ ok: true });
      controls.unexpected.push(`${method} ${path}`);
      return respond({ error: "Rota não simulada; nenhuma requisição foi encaminhada ao servidor." }, 500);
    });
    await page.goto(baseUrl);
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveTitle(/Área do paciente/u);
    assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin);
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    await page.screenshot({ path: resolve(outputDir, `${role}-first-viewport-${viewport.width}-${browserName}.png`), fullPage: false });
    return { page, controls, context };
  }

  async function checkHealthy(page, controls, label) {
    assert.deepEqual(controls.unexpected, [], "No request may fall through the mocked API.");
    assert.deepEqual(controls.runtimeErrors, [], "No app runtime errors or warnings.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal overflow.");
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
    });
    assert.deepEqual(violations, [], "Automated accessibility check.");
    // Avoid full-page capture artifacts from the sticky header/hidden fixed skip link.
    const captureStyle = await page.addStyleTag({ content: ".site-header{position:relative!important;top:auto!important}.skip-link{display:none!important}" });
    try {
      await page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: true });
    } finally {
      await captureStyle.evaluate((element) => element.remove());
    }
  }

  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    test(`patient ${label}: opening is read-only; explicit mark-read survives failure and preserves focus`, async () => {
      const { page, controls } = await openPortal("patient", viewport);
      const inbox = page.locator(".patient-notices");
      await expect(inbox.locator(".notices-count")).toHaveText("1 não lido");
      await expect(inbox).not.toHaveAttribute("open", "");
      assert.equal(controls.mutations.length, 0);
      await inbox.locator(":scope > summary").click();
      const notice = inbox.locator(".notice-item").first();
      await notice.locator("summary").click();
      await expect(notice.locator(".notice-body")).toContainText("<img src=x onerror=alert(1)>");
      await expect(notice.locator("img")).toHaveCount(0);
      assert.equal(controls.mutations.length, 0, "Opening/rendering never marks a notice read.");
      controls.readFailure = 503;
      await notice.getByRole("button", { name: "Marcar como lido" }).click();
      await expect(notice.getByRole("alert")).toContainText("Falha sintética");
      await expect(inbox.locator(".notices-count")).toHaveText("1 não lido");
      await notice.getByRole("button", { name: "Marcar como lido" }).click();
      await expect(notice.locator(".notice-item-meta").last()).toContainText("Leitura confirmada");
      await expect(inbox.locator(".notices-count")).toHaveCount(0);
      await expect(notice.locator("summary")).toBeFocused();
      assert.equal(controls.mutations.length, 2);
      assert.ok(controls.mutations.every((mutation) => mutation.csrf === "synthetic-csrf" && mutation.method === "POST"));
      await expect(inbox.getByRole("textbox")).toHaveCount(0);
      await checkHealthy(page, controls, `patient-read-${label}`);
    });
  }

  test("patient: pagination deduplicates, refresh recovers errors, and empty state is clear", async () => {
    const { page, controls } = await openPortal("patient");
    const inbox = page.locator(".patient-notices");
    await inbox.locator(":scope > summary").click();
    controls.nextCursor = "synthetic-cursor";
    controls.earlierNotices = [structuredClone(noticeTwo), { ...noticeTwo, id: "synthetic-earlier", title: "Aviso mais antigo" }];
    await inbox.getByRole("button", { name: "Atualizar avisos" }).click();
    await inbox.getByRole("button", { name: "Ver avisos anteriores" }).click();
    await expect(inbox.locator(".notice-item")).toHaveCount(3);
    controls.listFailure = 503;
    await inbox.getByRole("button", { name: "Atualizar avisos" }).click();
    await expect(inbox.getByRole("alert")).toContainText("Falha sintética");
    await expect(inbox.locator(".notice-item")).toHaveCount(3);
    controls.listFailure = 0;
    controls.nextCursor = null;
    controls.notices = [];
    await inbox.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(inbox.getByText("Nenhum aviso por aqui no momento.")).toBeVisible();
    await expect(inbox.locator(".notice-item")).toHaveCount(0);
    assert.equal(controls.mutations.length, 0);
    await checkHealthy(page, controls, "patient-empty-desktop");
  });

  test("patient: unavailable notice removes stale text; expired session returns to login", async () => {
    const { page, controls } = await openPortal("patient");
    const inbox = page.locator(".patient-notices");
    await inbox.locator(":scope > summary").click();
    await inbox.locator(".notice-item").first().locator("summary").click();
    controls.readFailure = 404;
    await inbox.getByRole("button", { name: "Marcar como lido" }).click();
    await expect(inbox.getByRole("alert")).toContainText("não está mais disponível");
    await expect(inbox.locator(".notice-item-heading").filter({ hasText: noticeOne.title })).toHaveCount(0);
    await inbox.getByRole("button", { name: "Atualizar avisos" }).click();
    await expect(inbox.locator(".notice-item-heading").first()).toHaveText(noticeOne.title);
    await inbox.locator(".notice-item").first().locator("summary").click();
    controls.readFailure = 401;
    await inbox.getByRole("button", { name: "Marcar como lido" }).click();
    await expect(page.getByText("Sua sessão terminou. Entre novamente para continuar.")).toBeVisible();
    await expect(page.locator(".patient-notices")).toHaveCount(0);
    assert.deepEqual(controls.unexpected, []);
    assert.deepEqual(controls.runtimeErrors, []);
  });

  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    test(`professional ${label}: no-shared-record patient can receive one idempotent notice; removal requires confirmation`, async () => {
      const { page, controls } = await openPortal("therapist", viewport);
      await page.getByRole("button", { name: /^Acessos de pacientes/u }).click();
      await expect(page.getByRole("button", { name: "Avisos para Paciente Sintético Revogado" })).toHaveCount(0);
      await page.getByRole("button", { name: `Avisos para ${firstPatientName}`, exact: true }).click();
      const panel = page.locator(".professional-patient-notices");
      await expect(panel.getByLabel("Título do aviso")).toBeVisible();
      await expect(panel.getByText(/não é um chat/u)).toBeVisible();
      await panel.getByLabel("Título do aviso").fill("  Aviso sintético de teste  ");
      await panel.getByLabel("Texto do aviso").fill("  Texto sintético.\nSegunda linha.  ");
      controls.sendFailure = 503;
      await panel.getByRole("button", { name: "Enviar aviso", exact: true }).click();
      await expect(panel.getByRole("alert")).toContainText("Falha sintética após o recebimento");
      await expect(panel.getByLabel("Título do aviso")).toHaveValue("  Aviso sintético de teste  ");
      await panel.getByRole("button", { name: "Enviar aviso", exact: true }).click();
      await expect(panel.getByRole("status")).toContainText("Aviso enviado");
      await expect(panel.getByLabel("Título do aviso")).toHaveValue("");
      const sends = controls.mutations.filter((mutation) => mutation.method === "POST");
      assert.equal(sends.length, 2);
      assert.equal(sends[0].payload.client_request_id, sends[1].payload.client_request_id);
      assert.equal(sends[0].payload.title, "Aviso sintético de teste");
      assert.equal(sends[0].payload.body, "Texto sintético.\nSegunda linha.");
      assert.ok(sends.every((mutation) => mutation.csrf === "synthetic-csrf"));
      const sent = panel.locator(".notice-item").filter({ hasText: "Aviso sintético de teste" });
      await expect(sent).toHaveCount(1);
      await sent.locator("summary").click();
      await sent.getByRole("button", { name: "Remover aviso", exact: true }).click();
      assert.equal(controls.mutations.filter((mutation) => mutation.method === "DELETE").length, 0);
      await sent.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(sent.getByRole("button", { name: "Confirmar remoção" })).toHaveCount(0);
      await sent.getByRole("button", { name: "Remover aviso", exact: true }).click();
      await sent.getByRole("button", { name: "Confirmar remoção" }).click();
      await expect(sent).toHaveCount(0);
      await expect(panel.getByRole("status")).toHaveText("Aviso removido do portal.");
      await expect(panel.getByRole("heading", { name: `Avisos para ${firstPatientName}` })).toBeFocused();
      await checkHealthy(page, controls, `professional-notices-${label}`);
    });
  }

  test("professional: draft guards patient switching, closing, navigation and reload without leaking drafts", async () => {
    const { page, controls } = await openPortal("therapist");
    await page.getByRole("button", { name: /^Acessos de pacientes/u }).click();
    const firstToggle = page.getByRole("button", { name: `Avisos para ${firstPatientName}`, exact: true });
    const secondToggle = page.getByRole("button", { name: `Avisos para ${secondPatientName}`, exact: true });
    await firstToggle.click();
    const panel = page.locator(".professional-patient-notices");
    await panel.getByLabel("Título do aviso").fill("Rascunho sintético não enviado");
    await panel.getByLabel("Texto do aviso").fill("Texto sintético em memória.");
    const cancelDialog = () => page.once("dialog", (dialog) => dialog.dismiss());
    cancelDialog();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(panel).toBeVisible();
    cancelDialog();
    await secondToggle.click();
    await expect(firstToggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByLabel("Título do aviso")).toHaveValue("Rascunho sintético não enviado");
    cancelDialog();
    await firstToggle.click();
    await expect(panel).toBeVisible();
    cancelDialog();
    await page.getByRole("button", { name: /^Convites/u }).click();
    await expect(panel).toBeVisible();
    assert.equal(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true);
    page.once("dialog", (dialog) => dialog.accept());
    await secondToggle.click();
    await expect(panel.getByRole("heading", { name: `Avisos para ${secondPatientName}` })).toBeVisible();
    await expect(panel.getByLabel("Título do aviso")).toHaveValue("");
    await expect(panel.getByLabel("Texto do aviso")).toHaveValue("");
    assert.equal(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.ok(!storage.includes("Rascunho sintético") && !storage.includes("Texto sintético em memória"));
    assert.equal(controls.mutations.length, 0);
    await checkHealthy(page, controls, "professional-empty-desktop");
  });

  test("professional: denied refreshed access clears notices and composer", async () => {
    const { page, controls } = await openPortal("therapist");
    await page.getByRole("button", { name: /^Acessos de pacientes/u }).click();
    await page.getByRole("button", { name: `Avisos para ${firstPatientName}`, exact: true }).click();
    const panel = page.locator(".professional-patient-notices");
    await panel.getByLabel("Título do aviso").fill("Rascunho de acesso revogado");
    controls.professionalListFailure = 404;
    await panel.getByRole("button", { name: "Atualizar avisos" }).click();
    await expect(panel.getByRole("alert")).toHaveText("Acesso sintético não disponível.");
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel.locator(".notice-item")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Enviar aviso", exact: true })).toHaveCount(0);
    assert.equal(controls.mutations.length, 0);
    await checkHealthy(page, controls, "professional-access-lost-desktop");
  });
});
