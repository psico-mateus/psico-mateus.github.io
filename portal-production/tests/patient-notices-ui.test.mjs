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

  async function openPortal(role, viewport = { width: 1440, height: 1000 }, initialControls = {}, reducedMotion = "no-preference") {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion });
    contexts.add(context);
    const page = await context.newPage();
    const controls = {
      notices: [structuredClone(noticeOne), structuredClone(noticeTwo)],
      earlierNotices: [],
      nextCursor: null,
      readFailure: 0,
      readGate: null,
      sendFailure: 0,
      professionalListFailure: 0,
      listFailure: 0,
      listGate: null,
      mutations: [],
      unexpected: [],
      runtimeErrors: [],
      expectedHttpFailures: [],
      harnessWarnings: [],
      listRequests: [],
      sentByRequestId: new Map(),
      professionalNotices: new Map([
        [firstPatientId, [structuredClone(noticeOne)]],
        [secondPatientId, []],
      ]),
    };
    Object.assign(controls, initialControls);
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
      if (path === "/professional/accesses" && method === "GET") return respond({ patients: controls.accesses ?? [
        { patient_id: firstPatientId, patient_name: firstPatientName, access_status: "active", created_at: timestamp, revoked_at: null, last_login_at: null, shared_count: 0 },
        { patient_id: secondPatientId, patient_name: secondPatientName, access_status: "active", created_at: timestamp, revoked_at: null, last_login_at: null, shared_count: 0 },
        { patient_id: "synthetic-revoked", patient_name: "Paciente Sintético Revogado", access_status: "revoked", created_at: timestamp, revoked_at: timestamp, last_login_at: null, shared_count: 0 },
      ] });
      if (path === "/notices" && method === "GET") {
        controls.listRequests.push(url.searchParams.get("cursor"));
        if (controls.listGate) await controls.listGate;
        if (controls.listFailure) return respond({ error: "Falha sintética ao carregar os avisos." }, controls.listFailure);
        return respond({ notices: url.searchParams.has("cursor") ? controls.earlierNotices : controls.notices, unread_count: controls.notices.filter((notice) => !notice.read_at).length, next_cursor: url.searchParams.has("cursor") ? null : controls.nextCursor });
      }
      const readMatch = path.match(/^\/notices\/([^/]+)\/read$/u);
      if (readMatch && method === "POST") {
        if (controls.readGate) await controls.readGate;
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
    await expect(page.getByRole("heading", { level: 1, name: role === "patient" ? "Olá, Paciente Sintético." : "Olá, Mateus.", exact: true })).toBeVisible();
    if (role === "patient") {
      const inbox = page.locator(".patient-notices");
      await expect(inbox.getByRole("heading", { name: "Avisos de Mateus", exact: true })).toBeVisible();
      await expect(inbox.getByRole("button", { name: "Atualizar avisos", exact: true })).toBeEnabled();
      if (controls.listFailure) {
        await expect(inbox.getByRole("alert")).toBeVisible();
      } else if (controls.notices.length > 0) {
        await expect(inbox.locator(".notice-item-heading").first()).toBeVisible();
      } else {
        await expect(inbox.getByText("Nenhum aviso por aqui no momento.", { exact: true })).toBeVisible();
      }
      await expect(inbox.getByRole("button", { name: "Atualizar avisos", exact: true })).toHaveText("Atualizar");
      await assertPatientNoticesReadability(page);
    }
    await expect(page).toHaveTitle(/Área do paciente/u);
    assert.equal(new URL(page.url()).origin, new URL(baseUrl).origin);
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    await page.screenshot({ path: resolve(outputDir, `${role}-first-viewport-${viewport.width}-${browserName}.png`), fullPage: false });
    return { page, controls, context };
  }

  async function assertPatientNoticesReadability(page) {
    const inbox = page.locator(".patient-notices");
    if (await inbox.count() === 0) return;
    await expect(inbox.getByRole("heading", { name: "Avisos de Mateus", exact: true })).toBeVisible();
    for (const counter of await inbox.locator(".notices-count").all()) await expect(counter).toBeVisible();
    for (const state of await inbox.locator(".notice-item-summary .notice-item-meta").all()) {
      await expect(state).toBeVisible();
      await expect(state).toContainText(/Não lido|Lido/u);
    }
    const texts = await inbox.locator([
      ".notices-title", ".notices-subtitle", ".notices-count", ".notice-item-heading",
      ".notice-body", ".notices-empty", ".patient-notices-all-read",
      ".notices-summary-action", ".notices-error > p",
    ].join(", ")).evaluateAll((elements) => elements.filter((element) =>
      element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== "hidden",
    ).map((element) => ({ text: element.textContent.trim(), fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize) })));
    for (const item of texts) assert.ok(item.fontSize >= 16, `${item.text}: main notice text must remain at least 16px.`);
    const targets = await inbox.locator("button, summary").evaluateAll((elements) => elements.filter((element) =>
      element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== "hidden",
    ).map((element) => {
      const bounds = element.getBoundingClientRect();
      return { text: element.textContent.trim(), fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize), width: bounds.width, height: bounds.height };
    }));
    for (const target of targets) {
      assert.ok(target.width >= 44 && target.height >= 44, `${target.text}: notice controls must remain at least 44 × 44px.`);
      assert.ok(target.fontSize >= 16, `${target.text}: notice controls must remain at least 16px.`);
    }
  }

  async function checkHealthy(page, controls, label) {
    assert.deepEqual(controls.unexpected, [], "No request may fall through the mocked API.");
    assert.deepEqual(controls.runtimeErrors, [], "No app runtime errors or warnings.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal overflow.");
    await assertPatientNoticesReadability(page);
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

  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }], ["narrow-mobile", { width: 320, height: 740 }]]) {
    test(`patient ${label}: opening is read-only; explicit mark-read survives failure and preserves focus`, async () => {
      const { page, controls } = await openPortal("patient", viewport, {}, label === "narrow-mobile" ? "reduce" : "no-preference");
      const inbox = page.locator(".patient-notices");
      await expect(inbox.locator(".notices-count")).toHaveText("1 não lido");
      await expect(inbox.locator(".notices-count")).toBeVisible();
      await expect(inbox.getByRole("heading", { name: "Avisos de Mateus" })).toBeVisible();
      await expect(inbox.locator(".notice-item-heading").first()).toBeVisible();
      assert.equal(controls.mutations.length, 0);
      const notice = inbox.locator(".notice-item").first();
      await expect(notice.locator(".notice-body")).not.toBeVisible();
      const previewTime = notice.locator("summary time");
      await expect(previewTime).toBeVisible();
      await expect(previewTime).toHaveAttribute("datetime", timestamp);
      await expect(previewTime).not.toContainText(/\d{1,2}:\d{2}/u);
      await expect(notice.locator("summary .notice-item-meta")).toContainText("Não lido");
      await expect(inbox.locator(".notice-item").nth(1).locator("summary .notice-item-meta")).toContainText("Lido");
      await notice.locator("summary").click();
      if (label === "narrow-mobile") {
        // Read computed styles immediately after opening: no delayed transition
        // may leave a downward chevron beside the already-visible close label.
        const chevron = await notice.locator(".patient-notice-chevron").evaluate((element) => {
          const styles = window.getComputedStyle(element);
          const matrix = new DOMMatrixReadOnly(styles.transform);
          return {
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            transition: styles.transitionProperty,
            matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
          };
        });
        assert.equal(chevron.reducedMotion, true, "The narrow-mobile case must honor reduced motion.");
        assert.equal(chevron.transition, "none", "The chevron must not transition even under global reduced-motion duration overrides.");
        const openMatrix = [-1, 0, 0, -1, 0, 0];
        assert.ok(chevron.matrix.every((value, index) => Math.abs(value - openMatrix[index]) < 0.000001),
          "The open chevron must immediately point upward (180-degree rotation).");
      }
      await expect(notice.locator(".notice-body")).toContainText("<img src=x onerror=alert(1)>");
      const fullTimestamp = await page.evaluate((value) =>
        new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)), timestamp);
      await expect(notice.locator(".notice-sent-at")).toBeVisible();
      await expect(notice.locator(".notice-sent-at")).toContainText("Enviado em");
      await expect(notice.locator(".notice-sent-at time")).toHaveAttribute("datetime", timestamp);
      await expect(notice.locator(".notice-sent-at time")).toHaveText(fullTimestamp);
      await expect(notice.locator(".notice-sent-at time")).toContainText(/\d{1,2}:\d{2}/u);
      await expect(notice.locator("img")).toHaveCount(0);
      assert.ok((await notice.locator(".notice-item-heading").boundingBox()).width >= 120, "Expanded notice titles keep a readable column instead of collapsing beside a legacy disclosure marker.");
      assert.equal(controls.mutations.length, 0, "Opening/rendering never marks a notice read.");
      controls.readFailure = 503;
      await notice.getByRole("button", { name: "Marcar como lido" }).click();
      await expect(notice.getByRole("alert")).toContainText("Falha sintética");
      await expect(inbox.locator(".notices-count")).toHaveText("1 não lido");
      await expect(inbox.locator(".notices-count")).toBeVisible();
      await notice.getByRole("button", { name: "Marcar como lido" }).click();
      await expect(notice.locator(".notice-item-meta").last()).toContainText("Leitura confirmada");
      await expect(notice.locator("summary .notice-item-meta")).toBeVisible();
      await expect(notice.locator("summary .notice-item-meta")).toContainText("Lido");
      await expect(inbox.locator(".notices-count")).toHaveCount(0);
      await expect(inbox.getByText("Você já confirmou a leitura de todos os avisos.")).toBeVisible();
      await expect(notice.locator("summary")).toBeFocused();
      assert.equal(controls.mutations.length, 2);
      assert.ok(controls.mutations.every((mutation) => mutation.csrf === "synthetic-csrf" && mutation.method === "POST"));
      await expect(inbox.getByRole("textbox")).toHaveCount(0);
      await checkHealthy(page, controls, `patient-read-${label}`);
    });
  }

  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    for (const readFailure of [0, 404]) {
      test(`patient ${label}: delayed ${readFailure ? "unavailable notice" : "mark-read"} preserves focus moved elsewhere`, async () => {
        const { page, controls } = await openPortal("patient", viewport, {}, "reduce");
        const inbox = page.locator(".patient-notices");
        const notice = inbox.locator(".notice-item").filter({ hasText: noticeOne.title });
        let releaseRead;
        controls.readGate = new Promise((release) => { releaseRead = release; });
        controls.readFailure = readFailure;
        try {
          await notice.locator("summary").click();
          await notice.getByRole("button", { name: "Marcar como lido", exact: true }).focus();
          await page.keyboard.press("Enter");
          await expect(notice.getByRole("button", { name: "Confirmando…", exact: true })).toBeDisabled();
          await expect.poll(() => controls.mutations.length).toBe(1);
          const nextAction = page.getByRole("button", { name: /^Ver recursos/u });
          await nextAction.focus();
          await expect(nextAction).toBeFocused();
          releaseRead();
          if (readFailure) {
            await expect(inbox.getByRole("alert")).toContainText("não está mais disponível");
            await expect(notice).toHaveCount(0);
          } else {
            await expect(notice.locator("summary .notice-item-meta")).toContainText("Lido");
            await expect(inbox.getByRole("status").filter({ hasText: "Aviso marcado como lido." })).toBeAttached();
          }
          await page.evaluate(() => new Promise((release) => {
            window.requestAnimationFrame(() => window.requestAnimationFrame(release));
          }));
          await expect(nextAction).toBeFocused();
          assert.deepEqual(controls.mutations, [{
            path: `/notices/${noticeOne.id}/read`, method: "POST", payload: {}, csrf: "synthetic-csrf",
          }]);
          await checkHealthy(page, controls, `patient-delayed-${readFailure || "read"}-preserves-focus-${label}`);
        } finally {
          releaseRead();
        }
      });
    }
  }

  for (const readFailure of [404, 403]) {
    test(`patient: delayed ${readFailure} keeps useful focus when its focused notice disappears`, async () => {
      const { page, controls } = await openPortal("patient", { width: 390, height: 844 }, {}, "reduce");
      const inbox = page.locator(".patient-notices");
      const notice = inbox.locator(".notice-item").filter({ hasText: noticeOne.title });
      let releaseRead;
      controls.readGate = new Promise((release) => { releaseRead = release; });
      controls.readFailure = readFailure;
      try {
        await notice.locator("summary").click();
        await notice.getByRole("button", { name: "Marcar como lido", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(notice.getByRole("button", { name: "Confirmando…", exact: true })).toBeDisabled();
        const removedFocus = readFailure === 403
          ? inbox.locator(".notice-item").filter({ hasText: noticeTwo.title }).locator("summary")
          : notice.locator("summary");
        await removedFocus.focus();
        await expect(removedFocus).toBeFocused();
        releaseRead();
        await expect(inbox.getByRole("alert")).toContainText("não está mais disponível");
        await expect(notice).toHaveCount(0);
        if (readFailure === 403) await expect(inbox.locator(".notice-item")).toHaveCount(0);
        await expect(inbox.getByRole("heading", { name: "Avisos de Mateus", exact: true })).toBeFocused();
        assert.equal(controls.mutations.length, 1);
        await checkHealthy(page, controls, `patient-delayed-${readFailure}-removed-focus-mobile`);
      } finally {
        releaseRead();
      }
    });
  }

  test("patient: an initial list failure is visible without opening a panel and retry is read-only", async () => {
    const { page, controls } = await openPortal("patient", { width: 390, height: 844 }, { listFailure: 503 });
    const inbox = page.locator(".patient-notices");
    await expect(inbox.getByRole("heading", { name: "Avisos de Mateus" })).toBeVisible();
    await expect(inbox.getByRole("alert")).toHaveText("Falha sintética ao carregar os avisos.");
    await expect(inbox.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await expect(inbox.getByText("Nenhum aviso por aqui no momento.")).toHaveCount(0);
    await expect(inbox.getByText("Você já confirmou a leitura de todos os avisos.")).toHaveCount(0);
    await expect(inbox.locator(".notices-count")).toHaveCount(0);
    controls.listFailure = 0;
    await inbox.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(inbox.locator(".notice-item-heading")).toHaveCount(2);
    await expect(inbox.locator(".notices-count")).toHaveText("1 não lido");
    await expect(inbox.locator(".notices-count")).toBeVisible();
    assert.equal(controls.mutations.length, 0);
    await checkHealthy(page, controls, "patient-initial-failure-retry-mobile");
  });

  for (const width of [390, 1366]) {
    for (const failure of [0, 503]) {
      test(`patient ${width}px: manual notice refresh keeps keyboard focus, deduplicates and announces only success (${failure})`, async () => {
        const { page, controls } = await openPortal("patient", { width, height: 900 });
        const inbox = page.locator(".patient-notices");
        const refresh = inbox.locator(".patient-notices-refresh");
        let releaseList;
        controls.listGate = new Promise((release) => { releaseList = release; });
        controls.listFailure = failure;
        try {
          await expect(inbox.getByRole("status").filter({ hasText: "Seus avisos foram atualizados." })).toHaveCount(0);
          await refresh.focus();
          await page.keyboard.press("Enter");
          await expect.poll(() => controls.listRequests.length).toBe(2);
          await expect(refresh).toHaveText("Carregando…");
          await expect(refresh).toBeFocused();
          await expect(refresh).toHaveAttribute("aria-disabled", "true");
          await page.keyboard.press("Enter");
          await page.keyboard.press("Enter");
          assert.equal(controls.listRequests.length, 2, "A pending refresh must not start another request.");
          releaseList();
          await expect(refresh).toHaveText("Atualizar");
          await expect(refresh).toBeFocused();
          const completed = inbox.getByRole("status").filter({ hasText: "Seus avisos foram atualizados." });
          if (failure) {
            await expect(inbox.getByRole("alert")).toContainText("Falha sintética");
            await expect(completed).toHaveCount(0);
          } else {
            await expect(completed).toBeAttached();
          }
          assert.equal(controls.mutations.length, 0, "Refresh must remain read-only.");
          await checkHealthy(page, controls, `patient-refresh-${width}-${failure}`);
        } finally {
          releaseList();
        }
      });
    }
  }

  test("patient: preview shows two titles; expanding and paging never mark notices read", async () => {
    const additional = { ...noticeTwo, id: "synthetic-third", title: "Terceiro aviso sintético" };
    const earlier = { ...noticeTwo, id: "synthetic-earlier-preview", title: "Aviso de outra página" };
    const { page, controls } = await openPortal("patient", { width: 390, height: 844 }, {
      notices: [structuredClone(noticeOne), structuredClone(noticeTwo), additional],
      earlierNotices: [structuredClone(noticeTwo), earlier],
      nextCursor: "synthetic-preview-cursor",
    });
    const inbox = page.locator(".patient-notices");
    await expect(inbox.locator(".notice-item")).toHaveCount(2);
    await expect(inbox.getByRole("button", { name: "Ver avisos anteriores" })).toHaveCount(0);
    await expect(inbox.getByText(additional.title)).toHaveCount(0);
    await inbox.getByRole("button", { name: "Ver todos os avisos (3+)" }).click();
    await expect(inbox.locator(".notice-item")).toHaveCount(3);
    await expect(inbox.getByText(additional.title)).toBeVisible();
    await expect(inbox.locator(".notice-item").nth(2).locator("summary")).toBeFocused();
    const firstNotice = inbox.locator(".notice-item").first();
    await firstNotice.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(firstNotice.locator(".notice-body")).toBeVisible();
    assert.equal(controls.mutations.length, 0, "Opening, expanding and reading are read-only.");
    await firstNotice.getByRole("button", { name: "Marcar como lido" }).click();
    await expect(firstNotice.locator("summary")).toBeFocused();
    await expect(inbox.locator(".notice-item")).toHaveCount(3);
    await expect(firstNotice.locator(".notice-body")).toBeVisible();
    await inbox.getByRole("button", { name: "Ver avisos anteriores" }).click();
    await expect(inbox.locator(".notice-item")).toHaveCount(4);
    await expect(inbox.getByText(earlier.title)).toBeVisible();
    assert.deepEqual(controls.listRequests, [null, "synthetic-preview-cursor"]);
    assert.equal(controls.mutations.length, 1, "Only the explicit mark-read button mutates data.");
    await checkHealthy(page, controls, "patient-expanded-preview-mobile");
  });

  test("patient: pagination deduplicates, refresh recovers errors, and empty state is clear", async () => {
    const { page, controls } = await openPortal("patient");
    const inbox = page.locator(".patient-notices");
    controls.nextCursor = "synthetic-cursor";
    controls.earlierNotices = [structuredClone(noticeTwo), { ...noticeTwo, id: "synthetic-earlier", title: "Aviso mais antigo" }];
    await inbox.getByRole("button", { name: "Atualizar avisos" }).click();
    await expect(inbox.getByRole("button", { name: "Ver avisos anteriores" })).toHaveCount(0);
    await inbox.getByRole("button", { name: "Ver todos os avisos (2+)" }).click();
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

  for (const width of [320, 390]) {
    test(`patient ${width}px: compact empty notices still refresh and reveal a new notice`, async () => {
      const { page, controls } = await openPortal("patient", { width, height: 844 }, { notices: [] });
      const inbox = page.locator(".patient-notices");
      const refresh = inbox.getByRole("button", { name: "Atualizar avisos", exact: true });
      await expect(inbox).toHaveClass(/is-empty/u);
      await expect(inbox.locator(".patient-notices-footer")).toHaveCount(0);
      await expect(inbox.locator(".notices-list")).not.toBeVisible();
      const bounds = await inbox.boundingBox();
      assert.ok(bounds && bounds.height < 210,
        "An empty notice panel must not take the space of a full message card at normal text size.");
      await expect(refresh).toBeEnabled();
      controls.listFailure = 503;
      await refresh.click();
      await expect(inbox.getByRole("alert")).toBeVisible();
      await expect(inbox).not.toHaveClass(/is-empty/u);
      await expect(inbox.getByText("Nenhum aviso por aqui no momento.")).toHaveCount(0);
      controls.listFailure = 0;
      controls.notices = [structuredClone(noticeOne)];
      await inbox.getByRole("button", { name: "Tentar novamente" }).click();
      await expect(inbox.locator(".notice-item-heading")).toHaveText(noticeOne.title);
      await expect(inbox.locator(".notices-count")).toHaveText("1 não lido");
      await expect(inbox).not.toHaveClass(/is-empty/u);
      await expect(inbox.locator(".patient-notices-footer")).toContainText("não recebem respostas");
      await inbox.locator(".notice-item > summary").click();
      await expect(inbox.locator(".notice-body")).toHaveText(noticeOne.body);
      assert.equal(controls.mutations.length, 0, "Refresh and opening a notice cannot confirm its reading.");
      await checkHealthy(page, controls, `patient-empty-refresh-${width}`);
    });
  }

  test("patient: unavailable notice removes stale text; expired session returns to login", async () => {
    const { page, controls } = await openPortal("patient");
    const inbox = page.locator(".patient-notices");
    await inbox.locator(".notice-item").first().locator("summary").click();
    controls.readFailure = 404;
    await inbox.getByRole("button", { name: "Marcar como lido" }).click();
    await expect(inbox.getByRole("alert")).toContainText("não está mais disponível");
    await expect(inbox.getByRole("heading", { name: "Avisos de Mateus" })).toBeFocused();
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

  for (const [label, viewport] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 1000 }]]) {
    test(`professional ${label}: showing fewer accesses cannot silently hide an unsent notice beyond patient fifteen`, async () => {
      const accesses = Array.from({ length: 16 }, (_, index) => ({
        patient_id: `synthetic-paging-${String(index + 1).padStart(2, "0")}`,
        patient_name: `Paciente de Teste ${String(index + 1).padStart(2, "0")}`,
        access_status: "active", created_at: timestamp, revoked_at: null, last_login_at: null, shared_count: 0,
      }));
      const { page, controls } = await openPortal("therapist", viewport, { accesses });
      await page.getByRole("button", { name: /^Acessos de pacientes/u }).click();
      await expect(page.locator(".patient-access-card")).toHaveCount(15);
      await page.getByRole("button", { name: /Mostrar mais acessos/u }).click();
      await expect(page.locator(".patient-access-card")).toHaveCount(16);
      await page.getByRole("button", { name: `Avisos para ${accesses[15].patient_name}`, exact: true }).click();
      const panel = page.locator(".professional-patient-notices");
      await panel.getByLabel("Título do aviso").fill("Rascunho sintético do paciente dezesseis");
      await panel.getByLabel("Texto do aviso").fill("Texto sintético que não pode ser perdido ao recolher a lista.");
      page.once("dialog", dialog => dialog.dismiss());
      await page.getByRole("button", { name: /Mostrar somente os primeiros 15 acessos/u }).click();
      await expect(page.locator(".patient-access-card")).toHaveCount(16);
      await expect(panel.getByLabel("Título do aviso")).toHaveValue("Rascunho sintético do paciente dezesseis");
      await expect(panel.getByLabel("Texto do aviso")).toHaveValue("Texto sintético que não pode ser perdido ao recolher a lista.");
      assert.equal(controls.mutations.length, 0);
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: /Mostrar somente os primeiros 15 acessos/u }).click();
      await expect(page.locator(".patient-access-card")).toHaveCount(15);
      await expect(panel).toHaveCount(0);
      await expect(page.locator("#patient-access-title")).toBeFocused();
      assert.equal(await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }), false, "Only an explicitly discarded draft may disappear.");
      await page.getByRole("button", { name: /Mostrar mais acessos/u }).click();
      await page.getByRole("button", { name: `Avisos para ${accesses[15].patient_name}`, exact: true }).click();
      await expect(panel.getByLabel("Título do aviso")).toHaveValue("");
      await expect(panel.getByLabel("Texto do aviso")).toHaveValue("");
      assert.equal(controls.mutations.length, 0);
      await checkHealthy(page, controls, `professional-paging-draft-${label}`);
    });
  }

  test("professional: showing fewer accesses retains an unsent notice still among the first fifteen", async () => {
    const accesses = Array.from({ length: 16 }, (_, index) => ({
      patient_id: `synthetic-retained-${String(index + 1).padStart(2, "0")}`,
      patient_name: `Paciente de Teste ${String(index + 1).padStart(2, "0")}`,
      access_status: "active", created_at: timestamp, revoked_at: null, last_login_at: null, shared_count: 0,
    }));
    const { page, controls } = await openPortal("therapist", { width: 390, height: 844 }, { accesses });
    await page.getByRole("button", { name: /^Acessos de pacientes/u }).click();
    await page.getByRole("button", { name: /Mostrar mais acessos/u }).click();
    await page.getByRole("button", { name: `Avisos para ${accesses[0].patient_name}`, exact: true }).click();
    const panel = page.locator(".professional-patient-notices");
    await panel.getByLabel("Título do aviso").fill("Rascunho sintético preservado");
    await panel.getByLabel("Texto do aviso").fill("Continua entre os primeiros quinze acessos.");
    const dialogs = [];
    page.on("dialog", dialog => { dialogs.push(dialog.type()); void dialog.dismiss(); });
    await page.getByRole("button", { name: /Mostrar somente os primeiros 15 acessos/u }).click();
    await expect(page.locator(".patient-access-card")).toHaveCount(15);
    await expect(panel.getByLabel("Título do aviso")).toHaveValue("Rascunho sintético preservado");
    await expect(panel.getByLabel("Texto do aviso")).toHaveValue("Continua entre os primeiros quinze acessos.");
    assert.deepEqual(dialogs, [], "Keeping the composer visible must not prompt unnecessary discard.");
    assert.equal(controls.mutations.length, 0);
    await checkHealthy(page, controls, "professional-paging-retained-draft");
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
