import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import axe from "axe-core";

const baseUrl = process.env.PORTAL_RECORDS_UI_BASE_URL;
const browserName = process.env.PORTAL_RECORDS_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_RECORDS_UI_OUTPUT ?? "/tmp/area-paciente-records-ui");
if (!["chromium", "webkit"].includes(browserName)) throw new Error("Use chromium ou webkit para validar os registros.");
if (baseUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)
    || !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)
    || url.username || url.password) {
    throw new Error("Os testes de registros aceitam somente um servidor local isolado.");
  }
}

const timestamp = "2026-10-08T12:00:00.000Z";
const neutralEntry = {
  happened: "Conteúdo sintético e neutro para conferir o formulário local.",
  body: "", thoughts: "", urge: "", emotion: "Dúvida", intensity: 4, message: "",
  created_at: timestamp, updated_at: timestamp, revoked_at: null, thought_review: null,
};
const syntheticEntries = [
  { ...neutralEntry, id: "synthetic-record-private", title: "Registro privado sintético", shared_at: null, viewed_at: null },
  { ...neutralEntry, id: "synthetic-record-shared", title: "Registro compartilhado sintético", shared_at: timestamp, viewed_at: null },
  { ...neutralEntry, id: "synthetic-record-viewed", title: "Registro visualizado sintético", shared_at: timestamp, viewed_at: timestamp },
];

// Browser plugin not available. The installed Playwright browsers exercise only
// a localhost document with every API response simulated and foreign URLs blocked.
// Flow: patient history -> state/filter/editor/sharing action -> truthful counts,
// visible privacy, preserved drafts, explicit mutations and predictable focus.
describe("patient records — isolated mocked API only", { skip: !baseUrl }, () => {
  let browser;
  let expect;
  const fixtures = new Set();

  before(async () => {
    const playwright = await import("../../node_modules/@playwright/test/index.mjs");
    expect = playwright.expect;
    browser = await playwright[browserName].launch({ headless: true });
    await mkdir(outputDir, { recursive: true });
  });
  after(async () => {
    for (const fixture of fixtures) {
      fixture.releaseEntries();
      fixture.releaseSharing();
      fixture.releaseDeleting();
      await fixture.context.close();
    }
    await browser?.close();
  });
  afterEach(async () => {
    for (const fixture of fixtures) {
      fixture.releaseEntries();
      fixture.releaseSharing();
      fixture.releaseDeleting();
      await fixture.context.close();
    }
    fixtures.clear();
  });

  async function openRecords({ entries = syntheticEntries, pendingEntries = false, pendingSharing = false, pendingDeleting = false, entriesStatus = 200,
    expandSearch = true,
    viewport = { width: 390, height: 844 } } = {}) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    let releaseEntries;
    const entriesGate = new Promise((release) => { releaseEntries = release; });
    if (!pendingEntries) releaseEntries();
    let releaseSharing;
    const sharingGate = new Promise((release) => { releaseSharing = release; });
    if (!pendingSharing) releaseSharing();
    let releaseDeleting;
    const deletingGate = new Promise((release) => { releaseDeleting = release; });
    if (!pendingDeleting) releaseDeleting();
    const patient = { id: "synthetic-records-patient", name: "Paciente Sintético", role: "patient" };
    const controls = {
      entries: structuredClone(entries), entriesStatus, sharingFailure: 0, saveFailure: 0,
      loginUser: patient, entriesRequests: 0,
      unexpected: [], foreignRequests: [], runtimeErrors: [], expectedHttpFailures: [], mutations: [],
    };
    const fixture = { context, page, controls, releaseEntries, releaseSharing, releaseDeleting };
    fixtures.add(fixture);
    page.on("pageerror", (error) => controls.runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (!["warning", "error"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") return;
      if (/Failed to load resource: the server responded with a status of (?:401|409|503)\b/u.test(text)) {
        controls.expectedHttpFailures.push(text);
        return;
      }
      controls.runtimeErrors.push(text);
    });
    const origin = new URL(baseUrl).origin;
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        controls.foreignRequests.push(url.origin);
        return route.abort();
      }
      return route.continue();
    });
    await page.route("**/api/portal/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/portal/u, "");
      const method = request.method();
      const respond = (payload, status = 200) => route.fulfill({ status,
        contentType: "application/json", body: JSON.stringify(payload) });
      if (url.origin !== origin) {
        controls.foreignRequests.push(url.origin);
        return route.abort();
      }
      if (method !== "GET") controls.mutations.push({ path, method,
        payload: request.postData() ? request.postDataJSON() : null,
        csrf: request.headers()["x-csrf-token"] });
      if (path === "/config" && method === "GET") return respond({ configured: true, pending: false,
        privacy_version: "2026-10-08", public_site_url: "https://psico-mateus.github.io/",
        guide_url: "https://psico-mateus.github.io/guia-emocoes/", care_url: "https://psico-mateus.github.io/cuidados/" });
      if (path === "/session" && method === "GET") return respond({
        user: { id: "synthetic-records-patient", name: "Paciente Sintético", role: "patient" }, csrf: "synthetic-records-csrf" });
      if (path === "/login" && method === "POST") return respond({ user: controls.loginUser, csrf: "synthetic-reauthenticated-csrf" });
      if (path === "/logout" && method === "POST") return respond({ ok: true });
      if (path === "/map-draft" && method === "GET") return respond({
        content_version: "mapa-pessoal-refinado-ouro-v1", generation: 1, fields: [] });
      if (path === "/map-sharing" && method === "GET") return respond({ shares: [] });
      if (path === "/notices" && method === "GET") return respond({ notices: [], unread_count: 0, next_cursor: null });
      if (path === "/entries" && method === "GET") {
        controls.entriesRequests += 1;
        await entriesGate;
        return controls.entriesStatus === 200 ? respond({ entries: controls.entries })
          : respond({ error: "Falha sintética ao carregar os registros." }, controls.entriesStatus);
      }
      const sharing = path.match(/^\/entries\/([^/]+)\/sharing$/u);
      if (sharing && method === "PATCH") {
        await sharingGate;
        if (controls.sharingFailure) {
          const status = controls.sharingFailure;
          controls.sharingFailure = 0;
          return respond({ error: "Falha sintética ao atualizar o compartilhamento." }, status);
        }
        const entry = controls.entries.find((item) => item.id === sharing[1]);
        if (!entry) return respond({ error: "Registro sintético não encontrado." }, 404);
        const payload = request.postDataJSON();
        entry.shared_at = payload.shared ? timestamp : entry.shared_at;
        entry.revoked_at = payload.shared ? null : timestamp;
        return respond({ ok: true });
      }
      if (path === "/entries" && method === "POST") {
        if (controls.saveFailure) return respond({ error: "Falha sintética ao salvar. Tente novamente." }, controls.saveFailure);
        const id = `synthetic-record-created-${controls.entries.length + 1}`;
        controls.entries.push({ ...neutralEntry, ...request.postDataJSON(), id, shared_at: null, viewed_at: null });
        return respond({ id });
      }
      const thoughtReview = path.match(/^\/entries\/([^/]+)\/thought-review$/u);
      if (thoughtReview && method === "PATCH") {
        const entry = controls.entries.find(item => item.id === thoughtReview[1]);
        if (!entry) return respond({ error: "Registro sintético ausente." }, 404);
        const { expected_revision, ...draft } = request.postDataJSON();
        if (expected_revision !== (entry.thought_review?.revision ?? 0)) return respond({
          code: "entry_thought_review_conflict", current_review: entry.thought_review,
          error: "Conflito sintético de revisão.",
        }, 409);
        entry.thought_review = { ...draft, revision: expected_revision + 1, created_at: timestamp, updated_at: timestamp };
        return respond({ thought_review: entry.thought_review, updated_at: timestamp });
      }
      const editing = path.match(/^\/entries\/([^/]+)$/u);
      if (editing && method === "DELETE") {
        await deletingGate;
        controls.entries = controls.entries.filter(entry => entry.id !== editing[1]);
        return respond({ ok: true });
      }
      if (editing && method === "PATCH") {
        if (controls.saveFailure) return respond({ error: "Falha sintética ao salvar. Tente novamente." }, controls.saveFailure);
        const entry = controls.entries.find((item) => item.id === editing[1]);
        if (!entry) return respond({ error: "Registro sintético não encontrado." }, 404);
        const { expected_updated_at, ...draft } = request.postDataJSON();
        if (expected_updated_at !== undefined && expected_updated_at !== entry.updated_at) {
          return respond({ error: "Este registro foi alterado em outra aba ou aparelho. Copie suas alterações antes de sair e reabra o registro atualizado para compará-las." }, 409);
        }
        Object.assign(entry, draft, { updated_at: timestamp });
        return respond({ ok: true });
      }
      controls.unexpected.push(`${method} ${path}`);
      return respond({ error: "Rota não simulada; nenhuma requisição foi encaminhada ao servidor." }, 500);
    });
    const url = new URL(baseUrl);
    url.hash = "registros";
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Área do paciente/u);
    await expect(page.getByRole("heading", { level: 1, name: "Meus registros", exact: true })).toBeVisible();
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    assert.equal(new URL(page.url()).origin, origin);
    if (expandSearch && !pendingEntries && entriesStatus === 200 && entries.length > 0) {
      await openSearchPanel(page);
    }
    return fixture;
  }

  async function loaded(fixture) {
    await expect(fixture.page.locator(".patient-records-heading-actions").getByRole("button", { name: "Atualizar", exact: true })).toBeEnabled();
  }

  async function checkHealthy(fixture, label) {
    const { page, controls } = fixture;
    assert.deepEqual(controls.unexpected, [], "All API responses must be mocked.");
    assert.deepEqual(controls.foreignRequests, [], "No foreign network requests.");
    assert.deepEqual(controls.runtimeErrors, [], "No unexpected browser error or warning.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal overflow.");
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
    });
    assert.deepEqual(violations, [], "Automated accessibility checks.");
    await page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: false });
  }

  async function assertUsefulHistoryFocus(page) {
    await expect.poll(() => page.evaluate(() => {
      const element = document.activeElement;
      return element instanceof HTMLElement && element.isConnected && element.matches(
        "#records-title, .patient-record-card > summary, .patient-entry-toolbar button, .patient-record-search input",
      );
    })).toBe(true);
  }

  async function settleLayout(page) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
  }

  async function openSearchPanel(page) {
    const panel = page.locator(".patient-record-search-panel");
    const summary = panel.locator(":scope > summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Buscar e ordenar");
    if (await panel.getAttribute("open") === null) await summary.click();
    await expect(panel).toHaveAttribute("open", "");
  }

  async function openNewEditor(fixture) {
    await loaded(fixture);
    await fixture.page.getByRole("button", { name: "Novo registro", exact: true }).click();
    const form = fixture.page.locator("#entry-editor");
    await expect(form).toBeVisible();
    return form;
  }

  async function expireSession(fixture) {
    fixture.controls.entriesStatus = 401;
    await fixture.page.evaluate(() => {
      const previousNow = Date.now;
      Date.now = () => previousNow() + 61_000;
      window.dispatchEvent(new Event("focus"));
    });
    await expect(fixture.page.locator("#auth-title")).toHaveText("Entre na sua conta");
    await expect(fixture.page.getByText("Sua sessão terminou.", { exact: false })).toBeVisible();
  }

  async function loginAgain(fixture) {
    const auth = fixture.page.locator(".auth-card form");
    await auth.getByLabel("E-mail", { exact: true }).fill("synthetic-patient@example.invalid");
    await auth.getByLabel("Senha", { exact: true }).fill("senha-sintetica-isolada");
    await auth.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(fixture.page.locator(".patient-navigation")).toBeVisible();
  }

  async function assertOptionalFieldsVisible(form) {
    await expect(form.locator(".entry-optional-disclosure")).toHaveCount(0);
    await expect(form.getByRole("heading", { name: "Corpo, pensamentos e vontade", exact: true })).toBeVisible();
    for (const label of ["O que percebeu no corpo?", "Quais pensamentos apareceram?", "O que teve vontade de fazer?"]) {
      const field = form.getByLabel(label);
      await expect(field).toBeVisible();
      assert.equal(await field.evaluate((node) => Boolean(node.closest("details"))), false,
        "Optional fields must not require finding and opening a disclosure.");
    }
    await expect(form.getByLabel("O que quero levar")).toBeVisible();
  }

  const optionalDraft = {
    body: "Percepção corporal sintética.",
    thoughts: "Pensamento sintético que deve continuar guardado.",
    urge: "Vontade sintética de fazer uma pausa.",
    emotion: "Dúvida", intensity: 3,
    message: "Observação sintética para retomar em sessão.",
  };

  test("pending history never displays a false zero count", async () => {
    const fixture = await openRecords({ pendingEntries: true });
    await expect(fixture.page.locator(".patient-loading")).toContainText("Carregando seus registros…");
    await expect(fixture.page.locator(".patient-records-heading-actions .count")).not.toHaveText(/^(?:0 registros|0 de 0)$/u);
    await expect(fixture.page.locator(".patient-records-heading-actions .count")).toHaveText("Carregando…");
    await checkHealthy(fixture, "records-pending");
    fixture.releaseEntries();
    await loaded(fixture);
  });

  test("failed initial history is unavailable, not a zero-record history", async () => {
    const fixture = await openRecords({ entriesStatus: 503 });
    await loaded(fixture);
    await expect(fixture.page.getByRole("alert")).toContainText("Falha sintética");
    await expect(fixture.page.locator(".patient-records-heading-actions .count")).not.toHaveText(/^(?:0 registros|0 de 0)$/u);
    await expect(fixture.page.locator(".patient-records-heading-actions .count")).toHaveText("Contagem indisponível");
    await expect(fixture.page.locator(".patient-empty-state")).toHaveCount(0);
    assert.equal(fixture.controls.mutations.length, 0);
    await checkHealthy(fixture, "records-initial-error");
  });

  test("confirmed empty history may display zero and an invitation to start", async () => {
    const fixture = await openRecords({ entries: [] });
    await loaded(fixture);
    await expect(fixture.page.locator(".patient-records-heading-actions .count")).toHaveText("0 registros");
    await expect(fixture.page.getByRole("heading", { name: "Ainda não há registros.", exact: true })).toBeVisible();
    await expect(fixture.page.locator(".patient-empty-state .empty-state-number")).toHaveCount(0);
    await settleLayout(fixture.page);
    const createColor = await fixture.page.locator(".patient-records-heading-actions")
      .getByRole("button", { name: "Novo registro", exact: true })
      .evaluate(node => getComputedStyle(node).backgroundColor);
    const firstRecord = fixture.page.locator(".patient-empty-state")
      .getByRole("button", { name: "Criar o primeiro registro", exact: true });
    await expect(firstRecord).toHaveCSS("background-color", createColor);
    assert.equal(fixture.controls.mutations.length, 0);
    await checkHealthy(fixture, "records-confirmed-empty");
    await fixture.page.locator(".patient-records-heading-actions .count").click();
    await settleLayout(fixture.page);
    await fixture.page.screenshot({ path: resolve(outputDir, `records-empty-presentation-${browserName}.png`), fullPage: false });
  });

  test("loaded history retains accurate total and sharing filters", async () => {
    const fixture = await openRecords();
    await loaded(fixture);
    await expect(fixture.page.locator(".patient-records-heading-actions .count")).toHaveText("3 registros");
    const filters = fixture.page.getByRole("group", { name: "Filtrar registros por compartilhamento" });
    await expect(filters.getByRole("button", { name: "Privados 1", exact: true })).toBeVisible();
    await expect(filters.getByRole("button", { name: "Com Mateus 2", exact: true })).toBeVisible();
    await expect(fixture.page.locator(".patient-record-card")).toHaveCount(3);
    await checkHealthy(fixture, "records-loaded");
  });

  for (const state of ["shared", "viewed"]) {
    test(`opened ${state} record groups the reading state with its limits without changing clinical content`, async () => {
      const fixture = await openRecords({ viewport: { width: 320, height: 844 } });
      const { page, controls } = fixture;
      await loaded(fixture);
      const card = page.locator(`#record-synthetic-record-${state}`);
      await card.locator(":scope > summary").click();
      const viewNote = card.locator("aside.patient-record-view-note");
      await expect(viewNote).toHaveCount(1);
      await expect(viewNote).toBeVisible();
      await expect(viewNote.locator(".patient-view-status")).toContainText(state === "viewed"
        ? "Visualizado por Mateus em" : "Ainda não visualizado por Mateus");
      await expect(viewNote.locator(".patient-view-explanation")).toHaveText(
        "A confirmação mostra que Mateus marcou este registro como visualizado. Isso não significa resposta, avaliação clínica completa ou acompanhamento em tempo real.",
      );
      await expect(card.locator(".patient-record-content > .patient-view-status, .patient-record-content > .patient-view-explanation")).toHaveCount(0);
      await expect(card.locator(".entry-details")).toContainText(neutralEntry.happened);
      assert.equal(await viewNote.evaluate(note => {
        const details = note.parentElement.querySelector(".entry-details");
        return Boolean(details && (note.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING));
      }), true, "The grouped status must appear before, not replace, the original record content.");
      await expect(page.locator("#record-synthetic-record-private aside.patient-record-view-note")).toHaveCount(0);
      assert.equal(controls.mutations.length, 0, "Opening a patient's reading state must remain read-only.");
      await viewNote.scrollIntoViewIfNeeded();
      await checkHealthy(fixture, `records-grouped-view-${state}`);
    });
  }

  for (const mode of ["new", "private", "shared"]) {
    test(`editor ${mode}: current privacy is visible before the first field section`, async () => {
      const fixture = await openRecords();
      await loaded(fixture);
      if (mode === "new") {
        await fixture.page.getByRole("button", { name: "Novo registro", exact: true }).click();
      } else {
        const card = fixture.page.locator(`#record-synthetic-record-${mode}`);
        await card.locator(":scope > summary").click();
        await card.getByRole("button", { name: "Editar", exact: true }).click();
      }
      const form = fixture.page.locator("#entry-editor");
      await expect(form).toBeVisible();
      const intro = form.locator(":scope > .entry-form-intro");
      await expect(intro).toHaveCount(1);
      await expect(intro).toBeVisible();
      const privacy = intro.locator(".entry-privacy-note");
      await expect(privacy).toHaveCount(1);
      await expect(privacy).toBeVisible();
      await expect(privacy).toContainText(mode === "shared" ? /compartilhado com Mateus/iu : /privado/iu);
      await expect(intro.locator(".form-requirements-note")).toContainText("Para salvar, bastam dois campos:");
      await expect(intro.locator(".form-requirements-note")).toContainText("O restante é opcional.");
      await expect(form.locator(":scope > .entry-privacy-note, :scope > .form-requirements-note")).toHaveCount(0);
      await expect(form.locator(".entry-form-heading > div > p:not(.eyebrow)")).toHaveCount(0);
      const privacyBounds = await privacy.boundingBox();
      const firstStepBounds = await form.locator(".entry-step").first().boundingBox();
      assert.ok(privacyBounds && firstStepBounds && privacyBounds.y + privacyBounds.height <= firstStepBounds.y,
        "Privacy state must be clear before writing, not only at the end of the form.");
      assert.equal(fixture.controls.mutations.length, 0);
      await checkHealthy(fixture, `records-editor-${mode}`);
    });
  }

  for (const viewport of [
    { width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 640, height: 900 }, { width: 1366, height: 900 },
  ]) {
    test(`history ${viewport.width}px: months organize the filtered history without hiding reading status or actions`, async () => {
      const monthEntries = [
        { ...syntheticEntries[0], created_at: "2026-10-08T12:00:00.000Z" },
        { ...syntheticEntries[1], created_at: "2026-09-18T12:00:00.000Z" },
        { ...syntheticEntries[2], created_at: "2026-10-07T12:00:00.000Z" },
      ];
      const fixture = await openRecords({ entries: monthEntries, viewport });
      const { page, controls } = fixture;
      page.setDefaultTimeout(5_000);
      await loaded(fixture);
      const months = page.locator(".patient-record-month");
      await expect(months).toHaveCount(2);
      await expect(months.first().locator("h2")).toHaveText("Outubro de 2026");
      await expect(months.first().locator(".patient-record-month-heading > span")).toHaveText("2 registros");
      await expect(months.last().locator("h2")).toHaveText("Setembro de 2026");
      await expect(months.last().locator(".patient-record-month-heading > span")).toHaveText("1 registro");
      await expect(page.locator(".patient-record-card > summary strong")).toHaveText([
        monthEntries[0].title, monthEntries[2].title, monthEntries[1].title,
      ]);
      await expect(page.locator("#record-synthetic-record-viewed .patient-view-summary")).toHaveText("Visualizado por Mateus");
      await page.getByLabel("Ordenar").selectOption("oldest");
      await expect(months.first().locator("h2")).toHaveText("Setembro de 2026");
      await page.getByRole("button", { name: "Privados 1", exact: true }).click();
      await expect(months).toHaveCount(1);
      await expect(months.locator("h2")).toHaveText("Outubro de 2026");
      await expect(months.locator(".patient-record-month-heading > span")).toHaveText("1 registro");
      await page.getByRole("button", { name: "Todos 3", exact: true }).click();
      await page.getByLabel("Buscar nos meus registros").fill("compartilhado sintético");
      await expect(months).toHaveCount(1);
      await expect(months.locator("h2")).toHaveText("Setembro de 2026");
      await page.getByRole("button", { name: "Limpar busca e filtros", exact: true }).click();
      const viewedCard = page.locator("#record-synthetic-record-viewed");
      await viewedCard.locator(":scope > summary").click();
      await expect(viewedCard.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
      await expect(viewedCard.getByRole("button", { name: "Excluir", exact: true })).toBeVisible();
      await expect(viewedCard.getByRole("button", { name: "Deixar privado novamente", exact: true })).toBeVisible();
      await viewedCard.locator(":scope > summary").click();
      assert.equal(controls.mutations.length, 0, "Grouping, filtering and opening must not alter records.");
      await page.locator("#records-title").scrollIntoViewIfNeeded();
      await checkHealthy(fixture, `records-months-${viewport.width}`);
    });

    test(`history ${viewport.width}px: filters stay together, count baselines align and Guide follows the records`, async () => {
      const fixture = await openRecords({ viewport });
      const { page, controls } = fixture;
      await loaded(fixture);
      const finder = page.locator(".patient-record-finder");
      const search = page.getByLabel("Buscar nos meus registros");
      if (viewport.width <= 640) {
        const actions = page.locator(".patient-records-heading-actions");
        const update = await actions.getByRole("button", { name: "Atualizar", exact: true }).boundingBox();
        const create = await actions.getByRole("button", { name: "Novo registro", exact: true }).boundingBox();
        assert.ok(update && create && Math.abs(update.y - create.y) <= 1 && Math.abs(update.width - create.width) <= 1,
          `The two history actions should share one balanced row, not wrap into detached rows: ${JSON.stringify({ update, create })}`);
      }
      await expect(finder.getByRole("group", { name: "Filtrar registros por compartilhamento" })).toBeVisible();
      await expect(search).toHaveAccessibleDescription("Pode combinar palavras. A busca acontece somente nesta tela.");
      await settleLayout(page);
      const finderTargets = await finder.locator("button, input, select, .patient-record-search-panel > summary").evaluateAll(nodes => nodes.map(node => {
        const bounds = node.getBoundingClientRect();
        return { tag: node.tagName, width: bounds.width, height: bounds.height };
      }));
      assert.ok(finderTargets.length > 0 && finderTargets.every(target => target.width >= 44 && target.height >= 44),
        `Every history filter, search and ordering control must retain a 44×44px target: ${JSON.stringify(finderTargets)}`);
      const readingOrder = await page.evaluate(() => {
        const finder = document.querySelector(".patient-record-finder");
        const records = document.querySelector(".patient-record-list");
        const guide = document.querySelector(".records-guide-callout");
        return Boolean(finder && records && guide
          && (finder.compareDocumentPosition(records) & Node.DOCUMENT_POSITION_FOLLOWING)
          && (records.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      assert.equal(readingOrder, true, "Optional Guide promotion must not come before the history controls or records.");
      if (viewport.width <= 390) {
        const counts = await finder.locator(".patient-entry-toolbar button small").evaluateAll(nodes =>
          nodes.map(node => {
            const count = node.getBoundingClientRect();
            const button = node.closest("button").getBoundingClientRect();
            return { center: count.top + count.height / 2,
              inside: count.left >= button.left && count.right <= button.right
                && count.top >= button.top && count.bottom <= button.bottom };
          }),
        );
        assert.ok(counts.every(count => count.inside)
          && Math.max(...counts.map(count => count.center)) - Math.min(...counts.map(count => count.center)) <= 1,
        "Sharing filter counts must remain centered on one balanced row and inside their buttons when a label wraps.");
      }
      const viewed = page.locator("#record-synthetic-record-viewed .patient-view-summary");
      await expect(viewed).toBeVisible();
      const historyText = await page.locator(".patient-record-summary-copy .status, .patient-record-summary-copy > small, .patient-record-toggle")
        .evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => Number.parseFloat(getComputedStyle(node).fontSize)));
      assert.ok(historyText.length > 0 && historyText.every(size => size >= 16),
        "Sharing status, record metadata and the opening hint must stay readable.");
      await search.fill("visualizado");
      await expect(page.locator(".patient-record-card")).toHaveCount(1);
      await expect(viewed).toBeVisible();
      assert.equal(controls.mutations.length, 0, "Organizing the history is read-only.");
      await checkHealthy(fixture, `history-finder-${viewport.width}`);
    });

    test(`editor ${viewport.width}px: optional questions are visible in a clear reading order`, async () => {
      const fixture = await openRecords({ viewport });
      const form = await openNewEditor(fixture);
      await assertOptionalFieldsVisible(form);
      await expect(form.locator(".entry-step")).toHaveCount(4);
      await expect(form.locator(".entry-step-heading > span")).toHaveCount(0);
      await expect(form.locator("input[required], textarea[required]")).toHaveCount(2);
      const groupedSections = await form.locator(".entry-step").evaluateAll((sections) => sections.map((section) => {
        const heading = document.getElementById(section.getAttribute("aria-labelledby"));
        const style = getComputedStyle(section);
        return { headingInside: Boolean(heading && section.contains(heading)),
          visible: section.getClientRects().length > 0,
          divider: Number.parseFloat(style.borderTopWidth) >= 1
            && !["none", "hidden"].includes(style.borderTopStyle)
            && !["transparent", "rgba(0, 0, 0, 0)"].includes(style.borderTopColor) };
      }));
      assert.ok(groupedSections.every(section => section.headingInside && section.visible && section.divider),
        "All four visible question sections must retain their heading and a clear top divider without requiring nested boxes.");
      const sessionSection = form.locator(".entry-step-optional");
      await expect(sessionSection.locator(".entry-step-heading p")).toHaveCount(0);
      const sessionField = sessionSection.locator(".session-note-field");
      await expect(sessionField.locator("#entry-session-note-help")).toBeVisible();
      await expect(sessionField.locator("#entry-session-note-help")).toContainText(/assunto|dúvida/u);
      assert.ok((await form.getByLabel("O que quero levar").getAttribute("aria-describedby")).split(/\s+/u)
        .includes("entry-session-note-help"), "The session-note guidance must stay associated with its writing field.");
      await expect(sessionSection.locator("#entry-session-note-privacy")).toContainText("não envia mensagem nem pedido de resposta imediata");
      const shortcut = form.locator(".optional-save-shortcut");
      await expect(shortcut).toHaveCount(1);
      await expect(shortcut).toContainText("O restante é opcional");
      const layout = await form.evaluate((node) => {
        const selectors = [".entry-step-situation", ".optional-save-shortcut", ".entry-step-emotion", ".entry-step-details", ".entry-step-optional"];
        return selectors.map((selector) => {
          const element = node.querySelector(selector);
          const bounds = element.getBoundingClientRect();
          return { selector, top: bounds.top, bottom: bounds.bottom };
        });
      });
      for (let index = 1; index < layout.length; index += 1) {
        assert.ok(layout[index - 1].bottom <= layout[index].top,
          `${layout[index - 1].selector} must precede ${layout[index].selector}.`);
      }
      const controls = await form.locator("button, input, textarea, summary, .field-help-link").evaluateAll((nodes) =>
        nodes.filter((node) => node.getClientRects().length).map((node) => {
          const bounds = node.getBoundingClientRect();
          return { tag: node.tagName, width: bounds.width, height: bounds.height,
            font: Number.parseFloat(getComputedStyle(node).fontSize), shortcut: Boolean(node.closest(".optional-save-shortcut")) };
        }));
      for (const control of controls) {
        assert.ok(control.width >= 44 && control.height >= 44, `Touch target ${control.tag} must be at least 44×44px.`);
        if (["INPUT", "TEXTAREA"].includes(control.tag) || control.shortcut) {
          assert.ok(control.font >= 16, "Writing fields and the early save action must retain readable 16px text.");
        }
      }
      const readingText = await form.locator([
        ".entry-form-intro > p", ".entry-privacy-note", ".form-requirements-note",
        ".entry-step-heading p", ".field-label-line > span", ".field > span:not(.field-label-line)",
        ".field > label", ".field-help-link", ".range-scale", ".optional-save-shortcut strong",
        ".optional-save-shortcut p > span", ".session-note-field > small:not(.character-limit)",
        ".session-note-prompts > summary", ".session-note-prompts li", ".session-note-privacy",
        ".form-finish-copy p",
      ].join(", ")).evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({
        text: node.textContent.trim(), font: Number.parseFloat(getComputedStyle(node).fontSize),
      })));
      assert.ok(readingText.length > 0, "The form must retain visible labels and instructions.");
      for (const text of readingText) {
        assert.ok(text.font >= 16, `Labels, instructions and help must be readable at 16px or more: ${text.text}`);
      }
      const guideLink = await form.locator(".field-help-link").evaluate((link) => {
        const note = link.querySelector(".external-link-note");
        const bounds = note.getBoundingClientRect();
        const style = getComputedStyle(note);
        return { display: getComputedStyle(link).display, noteWidth: bounds.width, noteHeight: bounds.height,
          noteFont: Number.parseFloat(style.fontSize), noteLineHeight: Number.parseFloat(style.lineHeight) };
      });
      assert.equal(guideLink.display, "block", "The Guide link and its new-tab note must flow as ordinary text.");
      assert.ok(guideLink.noteWidth >= guideLink.noteFont * 3
        && guideLink.noteHeight <= guideLink.noteLineHeight * 2 + 1,
      "The new-tab note must not be squeezed into a narrow vertical column.");
      await form.locator(".entry-step-details").scrollIntoViewIfNeeded();
      await checkHealthy(fixture, `records-editor-visible-optionals-${viewport.width}`);
    });
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    test(`history search ${viewport.width}px: combined words find one record across fields and stay local`, async () => {
      const entries = syntheticEntries.map(entry => ({ ...entry,
        title: entry.id === "synthetic-record-private" ? "Conversa no trabalho" : entry.title,
        emotion: entry.id === "synthetic-record-private" ? "Ansiedade" : entry.emotion,
      }));
      const fixture = await openRecords({ entries, viewport });
      const { page, controls } = fixture;
      await loaded(fixture);
      const readsBeforeSearch = controls.entriesRequests;
      const search = page.getByLabel("Buscar nos meus registros");
      await search.fill("  ansiedade, trabalho!  ");
      await expect(page.locator(".patient-record-card")).toHaveCount(1);
      await expect(page.locator(".patient-record-card > summary strong")).toHaveText("Conversa no trabalho");
      await expect(page.locator(".patient-records-heading-actions .count")).toHaveText("1 de 3");
      await page.getByRole("button", { name: "Com Mateus 2", exact: true }).click();
      await expect(page.locator(".patient-record-card")).toHaveCount(0);
      await page.getByRole("button", { name: "Limpar busca e filtros", exact: true }).click();
      await expect(search).toBeFocused();
      await expect(page.locator(".patient-record-card")).toHaveCount(3);
      assert.equal(controls.entriesRequests, readsBeforeSearch, "Typing and filtering must not transmit the search or request records again.");
      assert.equal(controls.mutations.length, 0);
      assert.deepEqual(controls.entries, entries, "Search must never rewrite, share or hide saved content permanently.");
      await checkHealthy(fixture, `history-combined-terms-${viewport.width}`);
    });

    test(`history search ${viewport.width}px: secondary controls start closed, records stay visible and keyboard opens the native panel`, async () => {
      const fixture = await openRecords({ viewport, expandSearch: false });
      const { page, controls } = fixture;
      await loaded(fixture);
      const panel = page.locator(".patient-record-search-panel");
      const summary = panel.locator(":scope > summary");
      const search = page.getByLabel("Buscar nos meus registros");
      const order = page.getByLabel("Ordenar");
      const filters = page.getByRole("group", { name: "Filtrar registros por compartilhamento" });
      await expect(panel).not.toHaveAttribute("open", "");
      await expect(summary).toContainText("Buscar e ordenar");
      await expect(search).toHaveCount(1);
      await expect(search).not.toBeVisible();
      await expect(order).not.toBeVisible();
      for (const name of ["Todos 3", "Privados 1", "Com Mateus 2"]) {
        await expect(filters.getByRole("button", { name, exact: true })).toBeVisible();
      }
      await expect(page.locator(".patient-record-card")).toHaveCount(3);
      await expect(page.locator("#record-synthetic-record-viewed > summary .patient-view-summary")).toHaveText("Visualizado por Mateus");
      await settleLayout(page);
      const firstTitle = await page.locator(".patient-record-card > summary strong").first().boundingBox();
      assert.ok(firstTitle && firstTitle.y >= 0 && firstTitle.y + firstTitle.height <= viewport.height,
        `The first record title must appear in the initial viewport without opening secondary controls: ${JSON.stringify(firstTitle)}`);
      await checkHealthy(fixture, `history-search-closed-${viewport.width}`);
      // Keep the initial focus evidence above; this second image shows the same
      // layout after an ordinary pointer interaction, without changing focus CSS.
      await page.locator(".patient-records-heading-actions .count").click();
      await settleLayout(page);
      await page.screenshot({ path: resolve(outputDir, `history-presentation-${viewport.width}-${browserName}.png`), fullPage: false });

      await filters.getByRole("button", { name: "Com Mateus 2", exact: true }).focus();
      const key = browserName === "webkit" ? "Alt+Tab" : "Tab";
      await page.keyboard.press(key);
      await expect(summary).toBeFocused();
      await settleLayout(page);
      assert.ok(await summary.evaluate(node => Number.parseFloat(getComputedStyle(node).outlineWidth)) >= 2,
        "The search-panel keyboard focus must remain visible.");
      await page.keyboard.press("Enter");
      await expect(panel).toHaveAttribute("open", "");
      await expect(search).toBeVisible();
      await expect(order).toBeVisible();
      await page.keyboard.press(key);
      await expect(search).toBeFocused();
      await page.keyboard.press(browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab");
      await expect(summary).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(panel).not.toHaveAttribute("open", "");
      await expect(search).not.toBeVisible();
      assert.equal(controls.mutations.length, 0, "Opening secondary history controls must not change or share records.");
      await checkHealthy(fixture, `history-search-keyboard-${viewport.width}`);
    });

    test(`history search ${viewport.width}px: active search and ordering stay disclosed when closed, and clearing outside restores focus`, async () => {
      const fixture = await openRecords({ viewport, expandSearch: false });
      const { page, controls } = fixture;
      await loaded(fixture);
      await openSearchPanel(page);
      await page.getByRole("button", { name: "Com Mateus 2", exact: true }).click();
      const panel = page.locator(".patient-record-search-panel");
      const summary = panel.locator(":scope > summary");
      const search = page.getByLabel("Buscar nos meus registros");
      const order = page.getByLabel("Ordenar");
      await order.selectOption("oldest");
      await expect(summary).toContainText("Mais antigos primeiro");
      await summary.click();
      await expect(panel).not.toHaveAttribute("open", "");
      await expect(search).not.toBeVisible();
      await expect(summary).toContainText("Mais antigos primeiro");
      await openSearchPanel(page);
      await search.fill("visualizado");
      await expect(order).toHaveValue("oldest");
      await expect(page.locator(".patient-record-card")).toHaveCount(1);
      await expect(summary).toContainText("Busca ativa");
      await expect(summary).toContainText("Mais antigos primeiro");
      await summary.click();
      await expect(panel).not.toHaveAttribute("open", "");
      await expect(search).not.toBeVisible();
      await expect(summary).toContainText("Busca ativa");
      await expect(summary).toContainText("Mais antigos primeiro");
      const clear = page.getByRole("button", { name: "Limpar busca e filtros", exact: true });
      await expect(clear).toBeVisible();
      assert.equal(await clear.evaluate(node => Boolean(node.closest(".patient-record-search-panel"))), false,
        "Clearing an active search must be available outside the closed secondary panel.");
      await expect(page.locator("#record-synthetic-record-viewed > summary .patient-view-summary")).toBeVisible();
      await checkHealthy(fixture, `history-search-active-closed-${viewport.width}`);
      await clear.click();
      await expect(panel).toHaveAttribute("open", "");
      await expect(search).toBeFocused();
      await expect(search).toHaveValue("");
      await expect(order).toHaveValue("newest");
      await expect(page.getByRole("button", { name: "Todos 3", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".patient-record-card")).toHaveCount(3);
      await expect(page.locator(".patient-records-heading-actions .count")).toHaveText("3 registros");
      await expect(summary).not.toContainText("Busca ativa");
      await expect(summary).not.toContainText("Mais antigos primeiro");
      await expect(clear).toHaveCount(0);
      assert.equal(controls.mutations.length, 0, "Filtering, sorting and clearing must remain read-only.");
      await checkHealthy(fixture, `history-search-cleared-focus-${viewport.width}`);
    });

    test(`history search ${viewport.width}px: showing all from an empty sharing filter opens the closed search panel before focus recovery`, async () => {
      const entries = syntheticEntries.filter(entry => entry.shared_at !== null);
      const fixture = await openRecords({ entries, viewport, expandSearch: false });
      const { page, controls } = fixture;
      await loaded(fixture);
      const panel = page.locator(".patient-record-search-panel");
      await expect(panel).not.toHaveAttribute("open", "");
      await page.getByRole("button", { name: "Privados 0", exact: true }).click();
      await expect(page.locator(".patient-record-card")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Nenhum registro privado agora.", exact: true })).toBeVisible();
      await expect(panel).not.toHaveAttribute("open", "");
      await page.getByRole("button", { name: "Mostrar todos", exact: true }).click();
      await expect(panel).toHaveAttribute("open", "");
      await expect(page.getByLabel("Buscar nos meus registros")).toBeFocused();
      await expect(page.locator(".patient-record-card")).toHaveCount(2);
      await expect(page.getByRole("button", { name: "Todos 2", exact: true })).toHaveAttribute("aria-pressed", "true");
      assert.equal(controls.mutations.length, 0, "Recovering all records and focus must not alter sharing or content.");
      assert.deepEqual(controls.entries, entries);
      await checkHealthy(fixture, `history-search-empty-filter-recovery-${viewport.width}`);
    });

    test(`patient design ${viewport.width}px: history and writing share the home action color and title-first reading order`, async () => {
      const fixture = await openRecords({ viewport });
      const { page, controls } = fixture;
      await loaded(fixture);
      const create = page.locator(".patient-records-heading-actions")
        .getByRole("button", { name: "Novo registro", exact: true });
      const createColor = await create.evaluate(node => getComputedStyle(node).backgroundColor);
      const cardLayout = await page.locator(".patient-record-card > summary").evaluateAll(summaries => summaries.map(summary => {
        const title = summary.querySelector(".patient-record-summary-copy > strong");
        const status = summary.querySelector(".patient-record-statuses");
        const titleBounds = title?.getBoundingClientRect();
        const statusBounds = status?.getBoundingClientRect();
        return {
          titleFirst: Boolean(title && status && (title.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING)),
          visualOrder: Boolean(titleBounds && statusBounds && titleBounds.bottom <= statusBounds.top + 1),
          statusVisible: Boolean(status && status.getClientRects().length > 0),
        };
      }));
      assert.equal(cardLayout.length, 3);
      assert.ok(cardLayout.every(card => card.titleFirst && card.visualOrder && card.statusVisible),
        "The record title must lead both DOM and visible reading order; sharing state must remain visible below it.");
      const viewed = page.locator("#record-synthetic-record-viewed > summary .patient-view-summary");
      const unseen = page.locator("#record-synthetic-record-shared > summary .patient-view-summary");
      await expect(viewed).toHaveText("Visualizado por Mateus");
      await expect(viewed).toBeVisible();
      await expect(unseen).toBeVisible();
      await expect(page.locator("#record-synthetic-record-private > summary .status.private")).toBeVisible();
      await expect(page.locator(".patient-record-card[open]")).toHaveCount(0);

      await page.locator(".patient-navigation").getByRole("button", { name: "Início", exact: true }).click();
      await expect(page.locator("#patient-home-title")).toBeVisible();
      const homeAction = page.locator(".patient-home .patient-mobile-record:visible, .patient-home .patient-start-card.primary:visible");
      await expect(homeAction).toHaveCount(1);
      await expect(homeAction).toContainText("Registrar algo");
      const homeColor = await homeAction.evaluate(node => getComputedStyle(node).backgroundColor);
      assert.notEqual(homeColor, "rgba(0, 0, 0, 0)", "The primary home action must retain a visible fill.");
      assert.equal(createColor, homeColor, "Creating from the history should use the same primary color as Registrar algo.");
      await homeAction.click();
      const form = page.locator("#entry-editor");
      await expect(form).toBeVisible();
      const save = form.getByRole("button", { name: "Salvar registro privado", exact: true });
      assert.equal(await save.evaluate(node => getComputedStyle(node).backgroundColor), homeColor,
        "Saving should keep the same primary action identity as the home and history.");
      await assertOptionalFieldsVisible(form);
      await expect(form.locator("input[required], textarea[required]")).toHaveCount(2);
      assert.equal(controls.mutations.length, 0, "Navigating between the coherent patient surfaces must not save or share data.");
      await form.locator(".entry-form-heading").scrollIntoViewIfNeeded();
      await checkHealthy(fixture, `patient-design-identity-${viewport.width}`);
    });

    test(`history ${viewport.width}px at 200% text: filters fit, reading states stay visible and summaries support keyboard focus`, async () => {
      const fixture = await openRecords({ viewport });
      const { page, controls } = fixture;
      await loaded(fixture);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await settleLayout(page);
      assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
      await expect(page.locator("#record-synthetic-record-viewed > summary .patient-view-summary")).toHaveText("Visualizado por Mateus");
      await expect(page.locator("#record-synthetic-record-viewed > summary .patient-view-summary")).toBeVisible();
      await expect(page.locator("#record-synthetic-record-shared > summary .patient-view-summary")).toBeVisible();
      const targets = await page.locator(".patient-record-finder button, .patient-record-finder input, .patient-record-finder select, .patient-record-card > summary")
        .evaluateAll(nodes => nodes.map(node => {
          const bounds = node.getBoundingClientRect();
          return { tag: node.tagName, left: bounds.left, right: bounds.right,
            width: bounds.width, height: bounds.height,
            font: Number.parseFloat(getComputedStyle(node).fontSize), viewportWidth: window.innerWidth };
        }));
      assert.ok(targets.length > 0);
      for (const target of targets) {
        assert.ok(target.width >= 44 && target.height >= 44,
          `${target.tag} must keep a 44×44px target at text zoom: ${JSON.stringify(target)}`);
        assert.ok(target.left >= -1 && target.right <= target.viewportWidth + 1,
          `${target.tag} must not extend horizontally beyond the viewport at text zoom.`);
        assert.ok(target.font >= 16, `${target.tag} must not shrink to compensate for text zoom.`);
      }
      const summary = page.locator("#record-synthetic-record-private > summary");
      await page.getByLabel("Ordenar").focus();
      await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
      await expect(summary).toBeFocused();
      await settleLayout(page);
      await expect(summary).toHaveCSS("outline-offset", "-4px");
      await expect(summary).toBeFocused();
      const focus = await summary.evaluate(node => {
        const style = getComputedStyle(node);
        return { width: Number.parseFloat(style.outlineWidth), offset: Number.parseFloat(style.outlineOffset),
          style: style.outlineStyle, color: style.outlineColor,
          focus: node.matches(":focus"), focusVisible: node.matches(":focus-visible"),
          activeTag: document.activeElement?.tagName };
      });
      assert.ok(focus.width >= 2 && !["none", "hidden"].includes(focus.style)
        && !["transparent", "rgba(0, 0, 0, 0)"].includes(focus.color), "A keyboard-focused record must have a visible outline.");
      assert.ok(focus.offset <= -focus.width,
        `The summary outline must stay inside its clipping card: ${JSON.stringify(focus)}`);
      await page.keyboard.press("Enter");
      await expect(page.locator("#record-synthetic-record-private")).toHaveAttribute("open", "");
      await expect(page.locator("#record-synthetic-record-private .entry-details")).toContainText(neutralEntry.happened);
      await page.keyboard.press("Enter");
      await expect(page.locator("#record-synthetic-record-private")).not.toHaveAttribute("open", "");
      await expect(summary).toBeFocused();
      assert.equal(controls.mutations.length, 0, "Reading and keyboard disclosure must remain read-only.");
      await checkHealthy(fixture, `records-history-text-200-percent-${viewport.width}`);
    });
  }

  test("editor at 200% text with reduced motion keeps optional fields readable without overflow", async () => {
    const fixture = await openRecords({ viewport: { width: 1366, height: 900 } });
    const form = await openNewEditor(fixture);
    await fixture.page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await assertOptionalFieldsVisible(form);
    assert.equal(await fixture.page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    const fieldsFit = await form.locator("input, textarea").evaluateAll((nodes) => nodes.every((node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    }));
    assert.equal(fieldsFit, true, "Text zoom must not push writing fields outside the viewport.");
    await form.locator(".entry-step-details").scrollIntoViewIfNeeded();
    await checkHealthy(fixture, "records-editor-text-200-percent");
  });

  test("keyboard reaches the early save action and each optional field without another opening step", async () => {
    const fixture = await openRecords();
    const form = await openNewEditor(fixture);
    const key = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await form.getByLabel("O que aconteceu?").focus();
    await fixture.page.keyboard.press(key);
    await expect(form.locator(".optional-save-shortcut").getByRole("button", { name: "Salvar agora como privado", exact: true })).toBeFocused();
    await fixture.page.keyboard.press(key);
    await expect(form.getByLabel("Emoção principal, se souber")).toBeFocused();
    await form.getByLabel("O que percebeu no corpo?").focus();
    for (const label of ["Quais pensamentos apareceram?", "O que teve vontade de fazer?", "O que quero levar"]) {
      await fixture.page.keyboard.press(key);
      const field = form.getByLabel(label);
      await expect(field).toBeFocused();
      assert.ok(await field.evaluate((node) => Number.parseFloat(getComputedStyle(node).outlineWidth)) >= 2,
        "Keyboard focus must remain visible.");
    }
    assert.equal(fixture.controls.mutations.length, 0);
    await checkHealthy(fixture, "records-editor-keyboard-optionals");
  });

  test("early save accepts only title and situation and creates a private record", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    const form = await openNewEditor(fixture);
    const draft = { title: "Mínimo sintético", happened: "Situação sintética suficiente para salvar.",
      body: "", thoughts: "", urge: "", emotion: "", intensity: 5, message: "" };
    await form.getByLabel("Título breve").fill(draft.title);
    await form.getByLabel("O que aconteceu?").fill(draft.happened);
    await form.getByRole("button", { name: "Salvar agora como privado", exact: true }).click();
    await expect(form).toHaveCount(0);
    assert.deepEqual(controls.mutations, [{ path: "/entries", method: "POST", payload: draft, csrf: "synthetic-records-csrf" }]);
    const saved = controls.entries.at(-1);
    assert.equal(saved.shared_at, null);
    const card = page.locator(`#record-${saved.id}`);
    await expect(card).toBeVisible();
    await expect(card.locator(".status.private")).toBeVisible();
    await expect(card.locator(":scope > summary")).toBeFocused();
    // The navigation effect must not overwrite the post-save destination later.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(card.locator(":scope > summary")).toBeFocused();
    await checkHealthy(fixture, "records-early-save-minimum");
  });

  test("early save includes optional answers already written farther down the form", async () => {
    const fixture = await openRecords();
    const { controls } = fixture;
    const form = await openNewEditor(fixture);
    const draft = { title: "Registro completo sintético", happened: "Situação sintética com detalhes opcionais.", ...optionalDraft };
    await form.getByLabel("Título breve").fill(draft.title);
    await form.getByLabel("O que aconteceu?").fill(draft.happened);
    for (const [label, value] of [
      ["O que percebeu no corpo?", draft.body], ["Quais pensamentos apareceram?", draft.thoughts],
      ["O que teve vontade de fazer?", draft.urge], ["O que quero levar", draft.message],
      ["Emoção principal, se souber", draft.emotion],
    ]) await form.getByLabel(label).fill(value);
    await form.locator("#entry-intensity").press("ArrowLeft");
    await form.locator("#entry-intensity").press("ArrowLeft");
    await expect(form.locator("#entry-intensity")).toHaveValue(String(draft.intensity));
    await form.getByRole("button", { name: "Salvar agora como privado", exact: true }).click();
    await expect(form).toHaveCount(0);
    assert.deepEqual(controls.mutations, [{ path: "/entries", method: "POST", payload: draft, csrf: "synthetic-records-csrf" }]);
    for (const [field, value] of Object.entries(draft)) assert.equal(controls.entries.at(-1)[field], value);
    assert.equal(controls.entries.at(-1).shared_at, null);
    await checkHealthy(fixture, "records-early-save-with-optionals");
  });

  test("empty required fields block early saving before any API mutation", async () => {
    const fixture = await openRecords();
    const form = await openNewEditor(fixture);
    const shortcut = form.getByRole("button", { name: "Salvar agora como privado", exact: true });
    const title = form.getByLabel("Título breve");
    const happened = form.getByLabel("O que aconteceu?");
    await shortcut.click();
    await expect(title).toBeFocused();
    assert.equal(await title.evaluate((node) => node.validity.valueMissing), true);
    assert.equal(fixture.controls.mutations.length, 0);
    await title.fill("Título sintético sem situação ainda");
    await shortcut.click();
    await expect(happened).toBeFocused();
    assert.equal(await happened.evaluate((node) => node.validity.valueMissing), true);
    assert.equal(fixture.controls.mutations.length, 0);
    await checkHealthy(fixture, "records-early-save-required-fields");
  });

  for (const action of ["early", "final"]) {
    test(`${action} save: whitespace-only required answers are rejected locally without changing the draft`, async () => {
      const fixture = await openRecords();
      const form = await openNewEditor(fixture);
      const title = form.getByLabel("Título breve");
      const happened = form.getByLabel("O que aconteceu?");
      const save = form.getByRole("button", {
        name: action === "early" ? "Salvar agora como privado" : "Salvar registro privado", exact: true,
      });
      const originalTitle = "   ";
      const originalHappened = " \n \n  ";
      await title.fill(originalTitle);
      await happened.fill(originalHappened);
      await form.getByLabel("O que percebeu no corpo?").fill(optionalDraft.body);
      await save.click();
      await expect(title).toBeFocused();
      await expect(title).toHaveAttribute("aria-invalid", "true");
      await expect(form.locator("#entry-title-error")).toBeVisible();
      assert.ok((await title.getAttribute("aria-describedby")).split(/\s+/u).includes("entry-title-error"),
        "The title error must be linked to its field.");
      await expect(happened).not.toHaveAttribute("aria-invalid", "true");
      await expect(form.locator("#entry-happened-error")).toHaveCount(0);
      await expect(title).toHaveValue(originalTitle);
      await expect(happened).toHaveValue(originalHappened);
      assert.equal(fixture.controls.mutations.length, 0, "Whitespace validation must happen before an API request.");

      await form.getByLabel("O que percebeu no corpo?").fill(`${optionalDraft.body} Complemento sintético.`);
      await expect(form.locator("#entry-title-error")).toBeVisible();
      const validTitle = "  Título sintético com espaços preservados  ";
      await title.fill(validTitle);
      await expect(form.locator("#entry-title-error")).toHaveCount(0);
      await expect(title).not.toHaveAttribute("aria-invalid", "true");
      await expect(title).toHaveValue(validTitle);
      await save.click();
      await expect(happened).toBeFocused();
      await expect(happened).toHaveAttribute("aria-invalid", "true");
      await expect(form.locator("#entry-happened-error")).toBeVisible();
      assert.ok((await happened.getAttribute("aria-describedby")).split(/\s+/u).includes("entry-happened-error"),
        "The situation error must be linked to its field.");
      await expect(title).toHaveValue(validTitle);
      await expect(happened).toHaveValue(originalHappened);
      assert.equal(fixture.controls.mutations.length, 0);

      await title.fill(`${validTitle} Revisado.`);
      await expect(form.locator("#entry-happened-error")).toBeVisible();
      const validHappened = "   Texto de uma situação sintética.\n   ";
      await happened.fill(validHappened);
      await expect(form.locator("#entry-happened-error")).toHaveCount(0);
      await expect(happened).not.toHaveAttribute("aria-invalid", "true");
      await expect(happened).toHaveValue(validHappened);
      await expect(form.getByLabel("O que percebeu no corpo?")).toHaveValue(`${optionalDraft.body} Complemento sintético.`);
      assert.equal(fixture.controls.mutations.length, 0, "Correcting a field must not save automatically.");
      await checkHealthy(fixture, `records-${action}-save-whitespace-required-fields`);
    });
  }

  for (const mode of ["private", "shared"]) {
    test(`editing ${mode}: visible optional values survive early save without changing sharing`, async () => {
      const entries = syntheticEntries.map((entry) => ({ ...entry, ...optionalDraft }));
      const fixture = await openRecords({ entries });
      const { page, controls } = fixture;
      await loaded(fixture);
      const id = `synthetic-record-${mode}`;
      const original = structuredClone(controls.entries.find((entry) => entry.id === id));
      const card = page.locator(`#record-${id}`);
      await card.locator(":scope > summary").click();
      await card.getByRole("button", { name: "Editar", exact: true }).click();
      const form = page.locator("#entry-editor");
      await assertOptionalFieldsVisible(form);
      for (const [label, value] of [
        ["O que percebeu no corpo?", original.body], ["Quais pensamentos apareceram?", original.thoughts],
        ["O que teve vontade de fazer?", original.urge], ["O que quero levar", original.message],
        ["Emoção principal, se souber", original.emotion],
      ]) await expect(form.getByLabel(label)).toHaveValue(value);
      await expect(form.locator("#entry-intensity")).toHaveValue(String(original.intensity));
      const title = `${original.title} revisado`;
      await form.getByLabel("Título breve").fill(title);
      await form.getByRole("button", { name: "Salvar alterações agora", exact: true }).click();
      await expect(form).toHaveCount(0);
      assert.deepEqual(controls.mutations, [{ path: `/entries/${id}`, method: "PATCH",
        payload: { title, happened: original.happened, ...optionalDraft, expected_updated_at: original.updated_at }, csrf: "synthetic-records-csrf" }]);
      const saved = controls.entries.find((entry) => entry.id === id);
      assert.equal(saved.shared_at, original.shared_at);
      assert.equal(saved.revoked_at, original.revoked_at);
      for (const [field, value] of Object.entries(optionalDraft)) assert.equal(saved[field], value);
      await expect(card.locator(mode === "shared" ? ".status.shared" : ".status.private")).toBeVisible();
      await checkHealthy(fixture, `records-edit-${mode}-optionals-preserved`);
    });
  }

  test("stale entry edit preserves every local answer and does not overwrite a newer version", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    await loaded(fixture);
    const id = "synthetic-record-private";
    const card = page.locator(`#record-${id}`);
    const original = structuredClone(controls.entries.find((entry) => entry.id === id));
    await card.locator(":scope > summary").click();
    await card.getByRole("button", { name: "Editar", exact: true }).click();
    const form = page.locator("#entry-editor");
    const localTitle = "Edição sintética ainda não salva";
    const localHappened = "Situação sintética que deve continuar nesta tela.";
    await form.getByLabel("Título breve").fill(localTitle);
    await form.getByLabel("O que aconteceu?").fill(localHappened);
    for (const [label, value] of [
      ["O que percebeu no corpo?", optionalDraft.body],
      ["Quais pensamentos apareceram?", optionalDraft.thoughts],
      ["O que teve vontade de fazer?", optionalDraft.urge],
      ["O que quero levar", optionalDraft.message],
    ]) await form.getByLabel(label).fill(value);
    const remoteEntry = controls.entries.find((entry) => entry.id === id);
    remoteEntry.title = "Versão sintética salva em outro aparelho";
    remoteEntry.happened = "Outra situação sintética já salva.";
    remoteEntry.updated_at = "2026-10-14T14:00:00.000Z";
    await form.getByRole("button", { name: "Salvar alterações agora", exact: true }).click();
    const alert = form.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("outra aba ou aparelho");
    await expect(alert).toContainText("Copie suas alterações");
    await expect(alert).toBeFocused();
    await expect(form.getByLabel("Título breve")).toHaveValue(localTitle);
    await expect(form.getByLabel("O que aconteceu?")).toHaveValue(localHappened);
    for (const [label, value] of [
      ["O que percebeu no corpo?", optionalDraft.body],
      ["Quais pensamentos apareceram?", optionalDraft.thoughts],
      ["O que teve vontade de fazer?", optionalDraft.urge],
      ["O que quero levar", optionalDraft.message],
    ]) await expect(form.getByLabel(label)).toHaveValue(value);
    assert.equal(controls.mutations.length, 1);
    assert.equal(controls.mutations[0].payload.expected_updated_at, original.updated_at);
    assert.equal(remoteEntry.happened, "Outra situação sintética já salva.");
    assert.equal(remoteEntry.title, "Versão sintética salva em outro aparelho");
    assert.equal(remoteEntry.shared_at, original.shared_at);
    await checkHealthy(fixture, "records-stale-edit-draft-preserved");
  });

  for (const scenario of [
    { filter: "Privados 1", id: "private", action: "Compartilhar com Mateus", shared: true },
    { filter: "Com Mateus 2", id: "shared", action: "Deixar privado novamente", shared: false },
  ]) {
    test(`${scenario.action}: disappearing filtered card restores useful history focus`, async () => {
      const fixture = await openRecords();
      const { page, controls } = fixture;
      await loaded(fixture);
      await page.getByRole("group", { name: "Filtrar registros por compartilhamento" }).getByRole("button", { name: scenario.filter, exact: true }).click();
      const card = page.locator(`#record-synthetic-record-${scenario.id}`);
      await card.locator(":scope > summary").click();
      const action = card.getByRole("button", { name: scenario.action, exact: true });
      await action.focus();
      page.once("dialog", (dialog) => dialog.accept());
      await page.keyboard.press("Enter");
      await expect(card).toHaveCount(0);
      await assertUsefulHistoryFocus(page);
      assert.equal(controls.mutations.length, 1);
      assert.deepEqual(controls.mutations[0], {
        path: `/entries/synthetic-record-${scenario.id}/sharing`, method: "PATCH",
        payload: { shared: scenario.shared }, csrf: "synthetic-records-csrf",
      });
      await checkHealthy(fixture, `records-filter-${scenario.id}-focus`);
    });
  }

  test("sharing without a filter keeps a useful focus when the card remains", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    await loaded(fixture);
    const card = page.locator("#record-synthetic-record-private");
    await card.locator(":scope > summary").click();
    await card.getByRole("button", { name: "Compartilhar com Mateus", exact: true }).focus();
    page.once("dialog", (dialog) => dialog.accept());
    await page.keyboard.press("Enter");
    await expect(card.locator(".status.shared")).toBeVisible();
    await expect(page.locator(".patient-record-card")).toHaveCount(3);
    await assertUsefulHistoryFocus(page);
    assert.equal(controls.mutations.length, 1);
    assert.deepEqual(controls.mutations[0].payload, { shared: true });
    assert.equal(controls.mutations[0].csrf, "synthetic-records-csrf");
    await checkHealthy(fixture, "records-unfiltered-sharing-focus");
  });

  test("sharing completion does not steal focus after the patient moves elsewhere", async () => {
    const fixture = await openRecords({ pendingSharing: true });
    const { page, controls } = fixture;
    await loaded(fixture);
    await page.getByRole("group", { name: "Filtrar registros por compartilhamento" })
      .getByRole("button", { name: "Privados 1", exact: true }).click();
    const card = page.locator("#record-synthetic-record-private");
    await card.locator(":scope > summary").click();
    await card.getByRole("button", { name: "Compartilhar com Mateus", exact: true }).focus();
    page.once("dialog", (dialog) => dialog.accept());
    await page.keyboard.press("Enter");
    await expect.poll(() => controls.mutations.length).toBe(1);
    const search = page.getByLabel("Buscar nos meus registros");
    await search.focus();
    await expect(search).toBeFocused();
    fixture.releaseSharing();
    await expect(card).toHaveCount(0);
    await loaded(fixture);
    await page.evaluate(() => new Promise((release) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(release));
    }));
    await expect(search).toBeFocused();
    assert.equal(controls.mutations.length, 1);
    assert.deepEqual(controls.mutations[0].payload, { shared: true });
    assert.equal(controls.mutations[0].csrf, "synthetic-records-csrf");
    await checkHealthy(fixture, "records-sharing-preserves-moved-focus");
  });

  test("cancelled sharing is read-only; failed sharing preserves privacy and focuses its error", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    await loaded(fixture);
    const card = page.locator("#record-synthetic-record-private");
    await card.locator(":scope > summary").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await card.getByRole("button", { name: "Compartilhar com Mateus", exact: true }).click();
    assert.equal(controls.mutations.length, 0);
    await expect(card.locator(".status.private")).toBeVisible();
    controls.sharingFailure = 503;
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Compartilhar com Mateus", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Falha sintética ao atualizar o compartilhamento.");
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(card.locator(".status.private")).toBeVisible();
    await expect(card.getByRole("button", { name: "Compartilhar com Mateus", exact: true })).toBeEnabled();
    await expect(page.getByText("Registro compartilhado com Mateus.", { exact: true })).toHaveCount(0);
    assert.equal(controls.entries[0].shared_at, null);
    assert.equal(controls.mutations.length, 1);
    assert.equal(controls.mutations[0].csrf, "synthetic-records-csrf");
    await checkHealthy(fixture, "records-sharing-cancel-error");
  });

  test("deleting restores visible keyboard focus without taking focus moved to search", async () => {
    for (const moveFocus of [false, true]) {
      const fixture = await openRecords({ pendingDeleting: true });
      const { page, controls } = fixture;
      await loaded(fixture);
      const card = page.locator("#record-synthetic-record-private");
      await card.locator(":scope > summary").click();
      await card.getByRole("button", { name: "Excluir", exact: true }).focus();
      page.once("dialog", dialog => dialog.accept());
      await page.keyboard.press("Enter");
      await expect.poll(() => controls.mutations.length).toBe(1);
      const search = page.getByLabel("Buscar nos meus registros");
      if (moveFocus) await search.focus();
      fixture.releaseDeleting();
      await expect(card).toHaveCount(0);
      await loaded(fixture);
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      if (moveFocus) await expect(search).toBeFocused();
      else {
        await assertUsefulHistoryFocus(page);
        const nextSummary = page.locator("#record-synthetic-record-shared > summary");
        await expect(nextSummary).toBeFocused();
        await expect(nextSummary).toHaveCSS("outline-offset", "-4px");
      }
      await checkHealthy(fixture, `records-delete-focus-${moveFocus ? "moved" : "restored"}`);
    }
  });

  test("expired session recovers a new draft only after the same patient logs in and never auto-saves", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    const form = await openNewEditor(fixture);
    const requestsBefore = controls.entriesRequests;
    await form.getByLabel("Título breve").fill("Última tecla sintética preservada");
    await form.getByLabel("O que aconteceu?").fill("Texto sintético com espaços  e quebra\nde linha.");
    await form.getByLabel("O que quero levar").fill(optionalDraft.message);
    await form.getByLabel("O que percebeu no corpo?").fill(optionalDraft.body);
    await form.getByLabel("Quais pensamentos apareceram?").fill(optionalDraft.thoughts);
    await form.getByLabel("O que teve vontade de fazer?").fill(optionalDraft.urge);
    assert.equal(controls.entriesRequests, requestsBefore, "Typing must not recreate load/session callbacks and fetch history.");
    await expireSession(fixture);
    await expect(page.locator("#entry-editor")).toHaveCount(0);
    assert.equal(await page.locator("body").innerText().then(text => text.includes("Última tecla sintética")), false);
    assert.equal(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true, "Guest recovery must still prevent an unannounced reload/update.");
    const stored = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].join(" "));
    assert.equal(stored.includes("Última tecla sintética"), false, "No clinical draft is stored on the device.");
    controls.entriesStatus = 200;
    await loginAgain(fixture);
    await expect(form.getByLabel("Título breve")).toHaveValue("Última tecla sintética preservada");
    for (const [label, value] of [["O que quero levar", optionalDraft.message], ["O que percebeu no corpo?", optionalDraft.body],
      ["Quais pensamentos apareceram?", optionalDraft.thoughts], ["O que teve vontade de fazer?", optionalDraft.urge]]) {
      await expect(form.getByLabel(label)).toHaveValue(value);
    }
    assert.deepEqual(controls.mutations.map(({ path }) => path), ["/login"]);
    await form.getByRole("button", { name: "Salvar agora como privado", exact: true }).click();
    await expect(form).toHaveCount(0);
    assert.equal(controls.mutations.at(-1).csrf, "synthetic-reauthenticated-csrf");
    assert.equal(controls.entries.at(-1).shared_at, null);
    await expect(page.getByText("Seu texto não salvo foi recuperado nesta aba.", { exact: false })).toHaveCount(0);
    await checkHealthy(fixture, "records-recovery-new-saved");
  });

  test("expired session keeps a paused draft paused until an explicit resume", async () => {
    const fixture = await openRecords();
    const form = await openNewEditor(fixture);
    await form.getByLabel("Título breve").fill("Rascunho sintético pausado");
    await fixture.page.locator(".patient-navigation").getByRole("button", { name: "Meus registros", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expireSession(fixture);
    fixture.controls.entriesStatus = 200;
    await loginAgain(fixture);
    await expect(form).toHaveCount(0);
    await fixture.page.getByRole("button", { name: "Continuar escrevendo", exact: true }).click();
    await expect(form.getByLabel("Título breve")).toHaveValue("Rascunho sintético pausado");
    await checkHealthy(fixture, "records-recovery-paused");
  });

  test("recovered edit uses freshly loaded privacy metadata, not the old sharing state", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    await loaded(fixture);
    const card = page.locator("#record-synthetic-record-shared");
    await card.locator(":scope > summary").click();
    await card.getByRole("button", { name: "Editar", exact: true }).click();
    const form = page.locator("#entry-editor");
    await form.getByLabel("Título breve").fill("Edição sintética recuperada");
    await expireSession(fixture);
    controls.entries.find(entry => entry.id === "synthetic-record-shared").revoked_at = timestamp;
    controls.entriesStatus = 200;
    await loginAgain(fixture);
    await expect(form.getByLabel("Título breve")).toHaveValue("Edição sintética recuperada");
    await expect(form).toContainText("Continuará privado.");
    assert.deepEqual(controls.mutations.map(({ path }) => path), ["/login"]);
    await form.getByRole("button", { name: "Salvar alterações agora", exact: true }).click();
    await expect(form).toHaveCount(0);
    assert.equal(controls.mutations.at(-1).path, "/entries/synthetic-record-shared");
    assert.equal(controls.mutations.at(-1).method, "PATCH");
    assert.equal(controls.entries.find(entry => entry.id === "synthetic-record-shared").revoked_at, timestamp);
    await checkHealthy(fixture, "records-recovery-edit-private");
  });

  for (const kind of ["changed", "missing"]) {
    test(`${kind} original record never gets overwritten or recreated from recovery automatically`, async () => {
      const fixture = await openRecords();
      const { page, controls } = fixture;
      await loaded(fixture);
      const card = page.locator("#record-synthetic-record-private");
      await card.locator(":scope > summary").click();
      await card.getByRole("button", { name: "Editar", exact: true }).click();
      const form = page.locator("#entry-editor");
      await form.getByLabel("Título breve").fill("Rascunho sintético sem sobrescrever");
      await expireSession(fixture);
      if (kind === "changed") controls.entries[0].updated_at = "2026-10-09T12:00:00.000Z";
      else controls.entries = controls.entries.filter(entry => entry.id !== "synthetic-record-private");
      controls.entriesStatus = 200;
      await loginAgain(fixture);
      await loaded(fixture);
      await expect(form).toHaveCount(0);
      const recovered = page.locator(".patient-recovered-drafts");
      await expect(recovered).toBeVisible();
      assert.deepEqual(controls.mutations.map(({ path }) => path), ["/login"]);
      await recovered.locator("details > summary").click();
      await expect(recovered).toContainText("Rascunho sintético sem sobrescrever");
      await recovered.getByRole("button", { name: "Usar em um novo registro privado", exact: true }).click();
      await expect(form.getByLabel("Título breve")).toHaveValue("Rascunho sintético sem sobrescrever");
      await expect(form).toContainText("Será salvo como privado.");
      assert.deepEqual(controls.mutations.map(({ path }) => path), ["/login"]);
      await checkHealthy(fixture, `records-recovery-${kind}`);
    });
  }

  test("different patient login and explicit logout discard recovery rather than expose it", async () => {
    for (const mode of ["different-patient", "logout"]) {
      const fixture = await openRecords();
      const { page, controls } = fixture;
      const form = await openNewEditor(fixture);
      await form.getByLabel("Título breve").fill("Rascunho sintético apenas da primeira conta");
      if (mode === "logout") {
        page.once("dialog", dialog => dialog.accept());
        await page.getByRole("button", { name: "Sair", exact: true }).click();
        await expect(page.locator("#auth-title")).toHaveText("Entre na sua conta");
      } else {
        await expireSession(fixture);
        controls.loginUser = { id: "synthetic-records-other-patient", name: "Outro Sintético", role: "patient" };
      }
      controls.entriesStatus = 200;
      await loginAgain(fixture);
      await loaded(fixture);
      await page.getByRole("button", { name: "Novo registro", exact: true }).click();
      await expect(form.getByLabel("Título breve")).toHaveValue("");
      assert.equal((await page.locator("body").innerText()).includes("Rascunho sintético apenas da primeira conta"), false);
      await checkHealthy(fixture, `records-recovery-discard-${mode}`);
    }
  });

  test("thought review recovery retains unsaved fields and its expected revision", async () => {
    const review = { source_thought: "Pensamento sintético original.", supporting_context: "", missing_context: "", alternative_view: "", current_view: "",
      revision: 4, created_at: timestamp, updated_at: timestamp };
    const fixture = await openRecords({ entries: [{ ...syntheticEntries[0], thoughts: "Pensamento sintético.", thought_review: review }] });
    const { page, controls } = fixture;
    await loaded(fixture);
    const card = page.locator("#record-synthetic-record-private");
    await card.locator(":scope > summary").click();
    await card.getByRole("button", { name: "Continuar revisão", exact: true }).click();
    await card.getByLabel("O que faz esse pensamento parecer verdadeiro?", { exact: false }).fill("Resposta sintética que deve continuar guardada.");
    await expireSession(fixture);
    controls.entriesStatus = 200;
    await loginAgain(fixture);
    await loaded(fixture);
    await card.locator(":scope > summary").click();
    await expect(card.getByLabel("O que faz esse pensamento parecer verdadeiro?", { exact: false })).toHaveValue("Resposta sintética que deve continuar guardada.");
    assert.deepEqual(controls.mutations.map(({ path }) => path), ["/login"]);
    await card.getByRole("button", { name: "Salvar por enquanto", exact: true }).click();
    await expect(card.getByText("Revisão salva junto deste registro.", { exact: true })).toBeVisible();
    assert.equal(controls.mutations.at(-1).payload.expected_revision, 4);
    assert.equal(controls.mutations.at(-1).csrf, "synthetic-reauthenticated-csrf");
    await checkHealthy(fixture, "records-recovery-thought-review");
  });

  test("orphan thought recovery stays private, can be copied explicitly and is discarded only after confirmation", async () => {
    const fixture = await openRecords({ entries: [{ ...syntheticEntries[0], thoughts: "Pensamento sintético preservado." }],
      viewport: { width: 320, height: 844 } });
    const { page, controls } = fixture;
    await loaded(fixture);
    const card = page.locator("#record-synthetic-record-private");
    await card.locator(":scope > summary").click();
    await card.getByRole("button", { name: "Rever um pensamento", exact: true }).click();
    await card.getByRole("button", { name: "Usar este texto", exact: true }).click();
    await card.getByLabel("O que faz esse pensamento parecer verdadeiro?", { exact: false }).fill("Observação sintética da revisão indisponível.");
    await expireSession(fixture);
    controls.entries = [];
    controls.entriesStatus = 200;
    await loginAgain(fixture);
    await loaded(fixture);
    const recovered = page.locator(".patient-recovered-drafts");
    await expect(recovered).toContainText("Uma revisão não salva pertence a um registro indisponível");
    await recovered.locator("details > summary").click();
    await expect(recovered).toContainText("Observação sintética da revisão indisponível.");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async text => { window.syntheticCopiedRecovery = text; } } }));
    await recovered.getByRole("button", { name: "Copiar texto das revisões", exact: true }).click();
    await expect(recovered.getByRole("status")).toContainText("Texto copiado");
    assert.match(await page.evaluate(() => window.syntheticCopiedRecovery), /Observação sintética da revisão indisponível\./u);
    assert.deepEqual(controls.mutations.map(({ path }) => path), ["/login"]);
    page.once("dialog", dialog => dialog.dismiss());
    await recovered.getByRole("button", { name: "Descartar essas revisões", exact: true }).click();
    await expect(recovered).toBeVisible();
    await checkHealthy(fixture, "records-recovery-orphan-thought");
    page.once("dialog", dialog => dialog.accept());
    await recovered.getByRole("button", { name: "Descartar essas revisões", exact: true }).click();
    await expect(recovered).toHaveCount(0);
    assert.deepEqual(controls.mutations.map(({ path }) => path), ["/login"]);
  });

  test("recovery waits for a successful history load and never resolves against an error or empty placeholder", async () => {
    const fixture = await openRecords();
    const form = await openNewEditor(fixture);
    await form.getByLabel("Título breve").fill("Rascunho sintético esperando consulta");
    await expireSession(fixture);
    fixture.controls.entriesStatus = 503;
    await loginAgain(fixture);
    await loaded(fixture);
    await expect(form).toHaveCount(0);
    await expect(fixture.page.getByRole("alert")).toContainText("Falha sintética");
    assert.deepEqual(fixture.controls.mutations.map(({ path }) => path), ["/login"]);
    fixture.controls.entriesStatus = 200;
    await fixture.page.locator(".patient-records-heading-actions").getByRole("button", { name: "Atualizar", exact: true }).click();
    await expect(form.getByLabel("Título breve")).toHaveValue("Rascunho sintético esperando consulta");
    await checkHealthy(fixture, "records-recovery-load-retry");
  });

  test("failed early save preserves draft fields and focuses the existing error notice", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    await loaded(fixture);
    await page.getByRole("button", { name: "Novo registro", exact: true }).click();
    const form = page.locator("#entry-editor");
    await form.getByLabel("Título breve").fill("Rascunho sintético preservado");
    await form.getByLabel("O que aconteceu?").fill("Texto sintético e neutro que não deve desaparecer.");
    await form.getByLabel("O que quero levar").fill("Uma observação sintética para o teste.");
    await form.getByLabel("O que percebeu no corpo?").fill(optionalDraft.body);
    await form.getByLabel("Quais pensamentos apareceram?").fill(optionalDraft.thoughts);
    await form.getByLabel("O que teve vontade de fazer?").fill(optionalDraft.urge);
    controls.saveFailure = 503;
    await form.getByRole("button", { name: "Salvar agora como privado", exact: true }).click();
    const alert = form.getByRole("alert");
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText("Falha sintética ao salvar.");
    await expect(alert).toContainText("O que você escreveu continua nesta tela.");
    await expect(alert).toBeFocused();
    assert.deepEqual(await alert.evaluate(node => ({
      afterShortcut: node.previousElementSibling?.matches(".optional-save-shortcut") ?? false,
      beforeEmotion: node.nextElementSibling?.matches(".entry-step-emotion") ?? false,
    })), { afterShortcut: true, beforeEmotion: true }, "An early save error must stay next to the early save action.");
    await expect(form.getByLabel("Título breve")).toHaveValue("Rascunho sintético preservado");
    await expect(form.getByLabel("O que aconteceu?")).toHaveValue("Texto sintético e neutro que não deve desaparecer.");
    await expect(form.getByLabel("O que quero levar")).toHaveValue("Uma observação sintética para o teste.");
    await expect(form.getByLabel("O que percebeu no corpo?")).toHaveValue(optionalDraft.body);
    await expect(form.getByLabel("Quais pensamentos apareceram?")).toHaveValue(optionalDraft.thoughts);
    await expect(form.getByLabel("O que teve vontade de fazer?")).toHaveValue(optionalDraft.urge);
    await expect(form.getByRole("button", { name: "Salvar agora como privado", exact: true })).toBeEnabled();
    assert.equal(controls.mutations.length, 1);
    assert.equal(controls.mutations[0].method, "POST");
    assert.equal(controls.mutations[0].csrf, "synthetic-records-csrf");
    assert.equal(controls.entries.length, 3);
    await checkHealthy(fixture, "records-save-error-preserved");
  });

  test("failed final save keeps one nearby focused error, preserves every answer and supports one explicit retry", async () => {
    const fixture = await openRecords();
    const { page, controls } = fixture;
    const form = await openNewEditor(fixture);
    const draft = { title: "Rascunho sintético no fim do formulário", happened: "Situação sintética preservada após uma falha.",
      ...optionalDraft };
    for (const [label, value] of [
      ["Título breve", draft.title], ["O que aconteceu?", draft.happened],
      ["O que percebeu no corpo?", draft.body], ["Quais pensamentos apareceram?", draft.thoughts],
      ["O que teve vontade de fazer?", draft.urge], ["Emoção principal, se souber", draft.emotion],
      ["O que quero levar", draft.message],
    ]) await form.getByLabel(label).fill(value);
    await form.locator("#entry-intensity").press("ArrowLeft");
    await form.locator("#entry-intensity").press("ArrowLeft");
    await expect(form.locator("#entry-intensity")).toHaveValue(String(draft.intensity));
    controls.saveFailure = 503;
    const save = form.getByRole("button", { name: "Salvar registro privado", exact: true });
    await save.click();
    const alert = form.getByRole("alert");
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText("Falha sintética ao salvar.");
    await expect(alert).toContainText("O que você escreveu continua nesta tela.");
    await expect(alert).toBeFocused();
    assert.deepEqual(await alert.evaluate(node => ({
      afterOptionals: node.previousElementSibling?.matches(".entry-step-optional") ?? false,
      beforeFinish: node.nextElementSibling?.matches(".form-finish") ?? false,
    })), { afterOptionals: true, beforeFinish: true }, "A final save error must stay just before the final save actions.");
    for (const [label, value] of [
      ["Título breve", draft.title], ["O que aconteceu?", draft.happened],
      ["O que percebeu no corpo?", draft.body], ["Quais pensamentos apareceram?", draft.thoughts],
      ["O que teve vontade de fazer?", draft.urge], ["Emoção principal, se souber", draft.emotion],
      ["O que quero levar", draft.message],
    ]) await expect(form.getByLabel(label)).toHaveValue(value);
    await expect(form.locator("#entry-intensity")).toHaveValue(String(draft.intensity));
    await expect(save).toBeEnabled();
    assert.deepEqual(controls.mutations, [{ path: "/entries", method: "POST", payload: draft, csrf: "synthetic-records-csrf" }]);
    assert.equal(controls.entries.length, 3, "A failed save must not create an entry.");
    await checkHealthy(fixture, "records-final-save-error-preserved");

    controls.saveFailure = 0;
    await save.click();
    await expect(form).toHaveCount(0);
    assert.equal(controls.mutations.length, 2, "Only the failed attempt and the explicit successful retry may mutate.");
    assert.deepEqual(controls.mutations[1], { path: "/entries", method: "POST", payload: draft, csrf: "synthetic-records-csrf" });
    assert.equal(controls.entries.length, 4, "The successful retry must create exactly one entry.");
    const saved = controls.entries.at(-1);
    for (const [field, value] of Object.entries(draft)) assert.equal(saved[field], value);
    assert.equal(saved.shared_at, null);
    await expect(page.locator(`#record-${saved.id} > summary`)).toBeFocused();
    await checkHealthy(fixture, "records-final-save-retry-private");
  });
});
