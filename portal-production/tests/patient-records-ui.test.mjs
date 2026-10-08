import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, describe, test } from "node:test";
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
      await fixture.context.close();
    }
    await browser?.close();
  });

  async function openRecords({ entries = syntheticEntries, pendingEntries = false, pendingSharing = false, entriesStatus = 200,
    viewport = { width: 390, height: 844 } } = {}) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    let releaseEntries;
    const entriesGate = new Promise((release) => { releaseEntries = release; });
    if (!pendingEntries) releaseEntries();
    let releaseSharing;
    const sharingGate = new Promise((release) => { releaseSharing = release; });
    if (!pendingSharing) releaseSharing();
    const controls = {
      entries: structuredClone(entries), entriesStatus, sharingFailure: 0, saveFailure: 0,
      unexpected: [], foreignRequests: [], runtimeErrors: [], expectedHttpFailures: [], mutations: [],
    };
    const fixture = { context, page, controls, releaseEntries, releaseSharing };
    fixtures.add(fixture);
    page.on("pageerror", (error) => controls.runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (!["warning", "error"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") return;
      if (/Failed to load resource: the server responded with a status of 503\b/u.test(text)) {
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
      if (path === "/map-draft" && method === "GET") return respond({
        content_version: "mapa-pessoal-refinado-ouro-v1", generation: 1, fields: [] });
      if (path === "/map-sharing" && method === "GET") return respond({ shares: [] });
      if (path === "/notices" && method === "GET") return respond({ notices: [], unread_count: 0, next_cursor: null });
      if (path === "/entries" && method === "GET") {
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
      const editing = path.match(/^\/entries\/([^/]+)$/u);
      if (editing && method === "PATCH") {
        if (controls.saveFailure) return respond({ error: "Falha sintética ao salvar. Tente novamente." }, controls.saveFailure);
        const entry = controls.entries.find((item) => item.id === editing[1]);
        if (!entry) return respond({ error: "Registro sintético não encontrado." }, 404);
        Object.assign(entry, request.postDataJSON(), { updated_at: timestamp });
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

  async function openNewEditor(fixture) {
    await loaded(fixture);
    await fixture.page.getByRole("button", { name: "Novo registro", exact: true }).click();
    const form = fixture.page.locator("#entry-editor");
    await expect(form).toBeVisible();
    return form;
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
    await expect(fixture.page.getByRole("heading", { name: "Seu histórico começa quando você quiser.", exact: true })).toBeVisible();
    assert.equal(fixture.controls.mutations.length, 0);
    await checkHealthy(fixture, "records-confirmed-empty");
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
      const privacy = form.locator(":scope > p").filter({ hasText: /privad|compartilhad/iu });
      await expect(privacy).toHaveCount(1);
      await expect(privacy).toBeVisible();
      await expect(privacy).toContainText(mode === "shared" ? /compartilhado com Mateus/iu : /privado/iu);
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
    test(`editor ${viewport.width}px: optional questions are visible in a clear reading order`, async () => {
      const fixture = await openRecords({ viewport });
      const form = await openNewEditor(fixture);
      await assertOptionalFieldsVisible(form);
      await expect(form.locator(".entry-step")).toHaveCount(4);
      await expect(form.locator("input[required], textarea[required]")).toHaveCount(2);
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
        payload: { title, happened: original.happened, ...optionalDraft }, csrf: "synthetic-records-csrf" }]);
      const saved = controls.entries.find((entry) => entry.id === id);
      assert.equal(saved.shared_at, original.shared_at);
      assert.equal(saved.revoked_at, original.revoked_at);
      for (const [field, value] of Object.entries(optionalDraft)) assert.equal(saved[field], value);
      await expect(card.locator(mode === "shared" ? ".status.shared" : ".status.private")).toBeVisible();
      await checkHealthy(fixture, `records-edit-${mode}-optionals-preserved`);
    });
  }

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
    await expect(alert).toContainText("Falha sintética ao salvar.");
    await expect(alert).toContainText("O que você escreveu continua nesta tela.");
    await expect(alert).toBeFocused();
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
});
