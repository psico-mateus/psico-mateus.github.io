import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import axe from "axe-core";

const baseUrl = process.env.PORTAL_PROFESSIONAL_HISTORY_UI_BASE_URL;
const browserName = process.env.PORTAL_PROFESSIONAL_HISTORY_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_PROFESSIONAL_HISTORY_UI_OUTPUT ?? "/tmp/area-paciente-professional-history-ui");
if (!["chromium", "webkit"].includes(browserName)) throw new Error("Use chromium ou webkit para validar o histórico profissional.");
if (baseUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)
    || !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)
    || url.username || url.password) {
    throw new Error("Os testes do histórico profissional aceitam somente um servidor local isolado.");
  }
}

const timestamp = "2026-10-09T12:00:00.000Z";
const referencePatient = { patient_id: "synthetic-history-patient", patient_name: "Paciente Sintético",
  shared_count: 4, private_count: 2, unread_count: 2, shared_map_count: 4, unread_map_count: 2,
  latest_shared_at: timestamp, latest_map_shared_at: timestamp };
function entry(id, unread, day) {
  const date = `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`;
  return { id, title: `Registro sintético ${id}`, happened: `Conteúdo sintético neutro da conta ${id}.`,
    body: "", thoughts: "", urge: "", emotion: "Dúvida", intensity: 4, message: "",
    created_at: date, updated_at: date, shared_at: date, viewed_at: unread ? null : timestamp,
    is_unread: unread ? 1 : 0, thought_review: null };
}
const syntheticEntries = [entry("viewed-new", false, 8), entry("unread-old", true, 1),
  entry("viewed-old", false, 2), entry("unread-new", true, 7)];
const syntheticMaps = syntheticEntries.map((record) => ({ map_id: `map-${record.id}`,
  map_title: `Parte sintética ${record.id}`, map_description: "Descrição sintética para teste local.",
  answers: [{ item_id: "synthetic-map-answer", item_title: "Item sintético", section_title: "Seção sintética",
    response_key: "neutral", response_label: "Resposta sintética", note: "Observação sintética." }],
  shared_at: record.shared_at, viewed_at: record.viewed_at, is_unread: record.is_unread }));

// Browser plugin not available. Installed Playwright exercises only localhost;
// every API response is simulated and all foreign requests are blocked.
// Flow: professional patient list -> one account's shared history -> explicit
// reading confirmation -> stable disclosure, truthful groups and useful focus.
describe("professional history — isolated mocked API only", { skip: !baseUrl }, () => {
  let browser;
  let expect;
  const fixtures = new Set();
  before(async () => {
    const playwright = await import("../../node_modules/@playwright/test/index.mjs");
    expect = playwright.expect;
    browser = await playwright[browserName].launch({ headless: true });
    await mkdir(outputDir, { recursive: true });
  });
  after(async () => { await browser?.close(); });
  afterEach(async () => {
    for (const fixture of fixtures) {
      fixture.releaseMark();
      await fixture.context.close();
    }
    fixtures.clear();
  });

  async function openProfessional({ viewport = { width: 390, height: 844 }, pendingMark = false,
    markFailure = 0, patients = [referencePatient], entriesByPatient, mapsByPatient,
    entries = syntheticEntries, maps = syntheticMaps, selectPatient = true } = {}) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    let releaseMark;
    const markGate = new Promise((release) => { releaseMark = release; });
    if (!pendingMark) releaseMark();
    const controls = { patients: structuredClone(patients),
      entriesByPatient: structuredClone(entriesByPatient ?? { [referencePatient.patient_id]: entries }),
      mapsByPatient: structuredClone(mapsByPatient ?? { [referencePatient.patient_id]: maps }),
      markFailure, markGates: new Map(), mutations: [], requests: [], unexpected: [], foreignRequests: [], runtimeErrors: [] };
    const fixture = { context, page, controls, releaseMark };
    fixtures.add(fixture);
    page.on("pageerror", (error) => controls.runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (!["warning", "error"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") return;
      if (/Failed to load resource: the server responded with a status of 503\b/u.test(text)) return;
      controls.runtimeErrors.push(text);
    });
    const origin = new URL(baseUrl).origin;
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { controls.foreignRequests.push(url.origin); return route.abort(); }
      return route.continue();
    });
    await page.route("**/api/portal/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) { controls.foreignRequests.push(url.origin); return route.abort(); }
      const path = url.pathname.replace(/^\/api\/portal/u, "");
      const method = request.method();
      controls.requests.push({ method, path });
      if (method !== "GET") controls.mutations.push({ path, method,
        payload: request.postData() ? request.postDataJSON() : null, csrf: request.headers()["x-csrf-token"] });
      const respond = (payload, status = 200) => route.fulfill({ status,
        contentType: "application/json", body: JSON.stringify(payload) });
      if (path === "/config" && method === "GET") return respond({ configured: true, pending: false,
        privacy_version: "2026-10-09", public_site_url: "https://psico-mateus.github.io/",
        guide_url: "https://psico-mateus.github.io/guia-emocoes/", care_url: "https://psico-mateus.github.io/cuidados/" });
      if (path === "/session" && method === "GET") return respond({
        user: { id: "synthetic-history-therapist", name: "Mateus", role: "therapist" }, csrf: "synthetic-history-csrf" });
      if (path === "/account/mfa-recovery-codes" && method === "GET") return respond({
        remaining: 8, total: 8, generated_at: timestamp });
      if (path === "/professional/patients" && method === "GET") return respond({ patients: controls.patients,
        activity: { total_count: 6, shared_count: 4, private_count: 2 } });
      const records = path.match(/^\/professional\/patients\/([^/]+)\/entries$/u);
      if (records && method === "GET") return respond({ entries: controls.entriesByPatient[decodeURIComponent(records[1])] ?? [] });
      const mapShares = path.match(/^\/professional\/patients\/([^/]+)\/map-shares$/u);
      if (mapShares && method === "GET") return respond({ shares: controls.mapsByPatient[decodeURIComponent(mapShares[1])] ?? [] });
      const viewedRecord = path.match(/^\/professional\/entries\/([^/]+)\/viewed$/u);
      const viewedMap = path.match(/^\/professional\/patients\/([^/]+)\/map-shares\/([^/]+)\/viewed$/u);
      if ((viewedRecord || viewedMap) && method === "POST") {
        const markKey = viewedMap ? `${decodeURIComponent(viewedMap[1])}:${decodeURIComponent(viewedMap[2])}`
          : decodeURIComponent(viewedRecord[1]);
        await (controls.markGates.get(markKey) ?? markGate);
        if (controls.markFailure) return respond({ error: "Falha sintética ao confirmar a visualização. Tente novamente." }, controls.markFailure);
        const items = viewedRecord ? Object.values(controls.entriesByPatient).flat()
          : controls.mapsByPatient[decodeURIComponent(viewedMap[1])] ?? [];
        const id = decodeURIComponent(viewedRecord ? viewedRecord[1] : viewedMap[2]);
        const item = items.find((candidate) => (viewedRecord ? candidate.id : candidate.map_id) === id);
        if (!item) return respond({ error: "Conteúdo sintético ausente." }, 404);
        item.is_unread = 0;
        item.viewed_at = timestamp;
        return respond({ viewed_at: timestamp });
      }
      controls.unexpected.push(`${method} ${path}`);
      return respond({ error: "Rota não simulada. Nenhum pedido foi enviado ao servidor." }, 500);
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Área do paciente/u);
    await expect(page.getByRole("heading", { level: 1, name: "Olá, Mateus.", exact: true })).toBeVisible();
    await expect(page.locator(".patient-summary-card")).toHaveCount(patients.length);
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    assert.equal(new URL(page.url()).origin, origin);
    if (selectPatient) {
      await page.locator(".patient-summary-card").first().getByRole("button").click();
      await expect(page.locator("#selected-patient-title")).toBeVisible();
      await expect(page.getByRole("button", { name: "Atualizar", exact: true })).toBeEnabled();
    }
    return fixture;
  }

  const recordSelector = (id) => `.professional-record-disclosure[data-entry-id="${id}"]`;
  const mapSelector = (id) => `.professional-map-disclosure[data-map-id="${id}"]`;
  async function checkHealthy(fixture, label) {
    const { page, controls } = fixture;
    assert.deepEqual(controls.unexpected, [], "Every API route must be mocked.");
    assert.deepEqual(controls.foreignRequests, [], "No foreign requests.");
    assert.deepEqual(controls.runtimeErrors, [], "No unexpected browser warnings or errors.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal overflow.");
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
    });
    assert.deepEqual(violations, [], "Automated accessibility checks.");
    await page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: false });
  }
  async function assertUsefulFocus(page, kind) {
    await expect.poll(() => page.evaluate((type) => {
      const active = document.activeElement;
      const selector = type === "map"
        ? ".professional-map-disclosure > summary, #professional-map-shares-title"
        : ".professional-record-disclosure > summary, .entry-view-toolbar button";
      return active instanceof HTMLElement && active.isConnected && active.matches(selector);
    }, kind)).toBe(true);
  }

  for (const width of [320, 390, 1366]) {
    test(`groups ${width}px: unread records and maps come first, with seen contents separate`, async () => {
      const fixture = await openProfessional({ viewport: { width, height: width > 1000 ? 900 : 844 } });
      const records = fixture.page.locator(".professional-entry-shares");
      const maps = fixture.page.locator(".professional-map-shares");
      for (const [section, selector, attribute, ids] of [
        [records, ".professional-record-disclosure", "data-entry-id", ["unread-new", "unread-old", "viewed-new", "viewed-old"]],
        [maps, ".professional-map-disclosure", "data-map-id", ["map-unread-new", "map-unread-old", "map-viewed-new", "map-viewed-old"]],
      ]) {
        await expect(section.locator('[data-reading-group="pending"]')).toContainText("Ainda não vistos");
        await expect(section.locator('[data-reading-group="viewed"]')).toContainText("Já vistos");
        await expect(section.locator(`[data-reading-group="pending"] ${selector}`)).toHaveCount(2);
        await expect(section.locator(`[data-reading-group="viewed"] ${selector}`)).toHaveCount(2);
        assert.deepEqual(await section.locator(selector).evaluateAll((nodes, name) => nodes.map(node => node.getAttribute(name)), attribute), ids);
      }
      assert.equal(fixture.controls.mutations.length, 0);
      await records.scrollIntoViewIfNeeded();
      await checkHealthy(fixture, `professional-groups-${width}`);
    });
  }

  for (const kind of ["record", "map"]) {
    test(`${kind}: opening never confirms reading; explicit confirmation keeps the same open element until closing`, async () => {
      const fixture = await openProfessional();
      const id = kind === "record" ? "unread-new" : "map-unread-new";
      const selector = kind === "record" ? recordSelector(id) : mapSelector(id);
      const item = fixture.page.locator(selector);
      await item.locator(":scope > summary").click();
      await expect(item).toHaveAttribute("open", "");
      const original = await item.elementHandle();
      assert.equal(fixture.controls.mutations.length, 0, "Opening must not mark seen.");
      await item.getByRole("button", { name: "Concluir visualização", exact: true }).click();
      await expect(item.locator(".record-view-state")).toHaveText("Visto");
      assert.equal(await original.evaluate(node => node.isConnected && node.open), true, "The same open disclosure must remain mounted.");
      await expect(item.locator(".view-confirmed")).toContainText("Ao fechar");
      assert.equal(await item.evaluate(node => node.closest("[data-reading-group]").dataset.readingGroup), "pending");
      await item.locator(":scope > summary").click();
      await expect.poll(() => fixture.page.locator(selector).evaluate(node => node.closest("[data-reading-group]").dataset.readingGroup)).toBe("viewed");
      await expect(fixture.page.locator(selector)).not.toHaveAttribute("open", "");
      assert.equal(fixture.controls.mutations.length, 1);
      assert.equal(fixture.controls.mutations[0].method, "POST");
      assert.equal(fixture.controls.mutations[0].csrf, "synthetic-history-csrf");
      await assertUsefulFocus(fixture.page, kind);
      await checkHealthy(fixture, `professional-held-${kind}`);
    });
  }

  for (const scenario of ["record-all", "record-unread", "map-all"]) {
    test(`${scenario}: closing during a delayed successful confirmation restores useful focus`, async () => {
      const kind = scenario.startsWith("map") ? "map" : "record";
      const fixture = await openProfessional({ pendingMark: true, viewport: { width: scenario === "map-all" ? 320 : 390, height: 844 } });
      const { page } = fixture;
      if (scenario === "record-unread") await page.locator(".entry-view-toolbar button").filter({ hasText: "Não vistos" }).click();
      const selector = kind === "record" ? recordSelector("unread-new") : mapSelector("map-unread-new");
      const item = page.locator(selector);
      await item.locator(":scope > summary").click();
      await item.getByRole("button", { name: "Concluir visualização", exact: true }).click();
      await expect(item.locator(".record-view-state")).toContainText("Salvando visualização");
      await item.locator(":scope > summary").click();
      await expect(item).not.toHaveAttribute("open", "");
      fixture.releaseMark();
      if (scenario === "record-unread") await expect(item).toHaveCount(0);
      else await expect(item.locator(".record-view-state")).toHaveText("Visto");
      await assertUsefulFocus(page, kind);
      assert.equal(fixture.controls.mutations.length, 1);
      await checkHealthy(fixture, `professional-delayed-${scenario}`);
    });
  }

  for (const kind of ["record", "map"]) {
    test(`${kind}: a failed delayed confirmation after closing remains unread, with focus and retry available`, async () => {
      const fixture = await openProfessional({ pendingMark: true, markFailure: 503 });
      const item = fixture.page.locator(kind === "record" ? recordSelector("unread-new") : mapSelector("map-unread-new"));
      await item.locator(":scope > summary").click();
      await item.getByRole("button", { name: "Concluir visualização", exact: true }).click();
      await expect(item.locator(".record-view-state")).toContainText("Salvando visualização");
      await item.locator(":scope > summary").click();
      fixture.releaseMark();
      await expect(fixture.page.getByRole("alert")).toContainText("Falha sintética");
      await expect(item.locator(".record-view-state")).toHaveText("Não visto");
      assert.equal(await item.evaluate(node => node.closest("[data-reading-group]").dataset.readingGroup), "pending");
      await expect(fixture.page.getByRole("alert")).toBeFocused();
      await item.locator(":scope > summary").click();
      await expect(item.getByRole("button", { name: "Concluir visualização", exact: true })).toBeEnabled();
      assert.equal(fixture.controls.mutations.length, 1, "No automatic retry or false seen state.");
      await checkHealthy(fixture, `professional-failed-${kind}`);
    });
  }

  test("same-name patients have distinct accessible actions and only their own account contents", async () => {
    const patients = [1, 2].map(number => ({ ...referencePatient, patient_id: `synthetic-homonym-${String(number).padStart(8, "0")}`,
      patient_name: "Paciente Mesmo Nome", shared_count: 1, unread_count: 1, shared_map_count: 0, unread_map_count: 0 }));
    const fixture = await openProfessional({ patients, selectPatient: false,
      entriesByPatient: Object.fromEntries(patients.map((patient, index) => [patient.patient_id, [entry(`account-${index + 1}`, true, 1)]])),
      mapsByPatient: {} });
    const names = await fixture.page.locator(".patient-summary-card button").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
    assert.equal(new Set(names).size, 2);
    for (const [index, patient] of patients.entries()) {
      const reference = patient.patient_id.slice(-8);
      await fixture.page.getByRole("button", { name: `Abrir conteúdos compartilhados por ${patient.patient_name}, conta ${reference}`, exact: true }).click();
      await expect(fixture.page.locator("#selected-patient-title")).toHaveText(patient.patient_name);
      await expect(fixture.page.locator(".patient-detail-heading .patient-account-reference")).toContainText(reference);
      await expect(fixture.page.locator(".professional-record-disclosure")).toHaveCount(1);
      await expect(fixture.page.locator(".professional-record-disclosure")).toContainText(`Registro sintético account-${index + 1}`);
      await expect(fixture.page.locator(recordSelector(`account-${index === 0 ? 2 : 1}`))).toHaveCount(0);
      await fixture.page.getByRole("button", { name: "Voltar aos pacientes", exact: false }).click();
    }
    const entryRequests = fixture.controls.requests.filter(request => request.path.endsWith("/entries"));
    assert.deepEqual(entryRequests.map(request => request.path), patients.map(patient => `/professional/patients/${patient.patient_id}/entries`));
    assert.equal(fixture.controls.mutations.length, 0);
    await checkHealthy(fixture, "professional-homonyms");
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    test(`delayed map confirmation ${viewport.width}px never marks a newly selected patient's same theme seen`, async () => {
      const patients = ["A", "B"].map(letter => ({ ...referencePatient,
        patient_id: `synthetic-delayed-${letter}`, patient_name: `Paciente Sintético ${letter}`,
        shared_count: 0, private_count: 0, unread_count: 0, shared_map_count: 1, unread_map_count: 1 }));
      const sharedTheme = { ...syntheticMaps[1], map_id: "meu-jeito", map_title: "Meu jeito" };
      const fixture = await openProfessional({ viewport, patients, selectPatient: false,
        entriesByPatient: Object.fromEntries(patients.map(patient => [patient.patient_id, []])),
        mapsByPatient: Object.fromEntries(patients.map(patient => [patient.patient_id, [structuredClone(sharedTheme)]])) });
      const { page, controls } = fixture;
      let release;
      controls.markGates.set(`${patients[0].patient_id}:meu-jeito`, new Promise(resolve => { release = resolve; }));
      try {
        await page.getByRole("button", { name: `Abrir conteúdos compartilhados por ${patients[0].patient_name}`, exact: true }).click();
        const firstTheme = page.locator(mapSelector("meu-jeito"));
        await firstTheme.locator(":scope > summary").click();
        await firstTheme.getByRole("button", { name: "Concluir visualização", exact: true }).click();
        await expect(firstTheme.locator(".record-view-state")).toContainText("Salvando visualização");
        await page.getByRole("button", { name: "Voltar aos pacientes", exact: false }).click();
        await page.getByRole("button", { name: `Abrir conteúdos compartilhados por ${patients[1].patient_name}`, exact: true }).click();
        const secondTheme = page.locator(mapSelector("meu-jeito"));
        await secondTheme.locator(":scope > summary").click();
        await expect(secondTheme.locator(".record-view-state")).toHaveText("Não visto");
        await expect(secondTheme.getByRole("button", { name: "Concluir visualização", exact: true })).toBeEnabled();
        const response = page.waitForResponse(result => result.url().includes(`/patients/${patients[0].patient_id}/map-shares/meu-jeito/viewed`)
          && result.request().method() === "POST");
        release();
        await response;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.locator("#selected-patient-title")).toHaveText(patients[1].patient_name);
        await expect(secondTheme.locator(".record-view-state")).toHaveText("Não visto");
        await expect(page.getByText("Visualização do mapa confirmada para o paciente.", { exact: true })).toHaveCount(0);
        assert.equal(controls.mapsByPatient[patients[0].patient_id][0].is_unread, 0);
        assert.equal(controls.mapsByPatient[patients[1].patient_id][0].is_unread, 1);
        assert.equal(controls.mutations.length, 1);
        await checkHealthy(fixture, `professional-delayed-other-patient-${viewport.width}`);
      } finally { release(); }
    });
  }

  test("same map ID in two patients has independent in-flight confirmation locks", async () => {
    const patients = ["A", "B"].map(letter => ({ ...referencePatient,
      patient_id: `synthetic-independent-${letter}`, patient_name: `Paciente Independente ${letter}`,
      shared_count: 0, private_count: 0, unread_count: 0, shared_map_count: 1, unread_map_count: 1 }));
    const sharedTheme = { ...syntheticMaps[1], map_id: "meu-jeito", map_title: "Meu jeito" };
    const fixture = await openProfessional({ patients, selectPatient: false,
      entriesByPatient: Object.fromEntries(patients.map(patient => [patient.patient_id, []])),
      mapsByPatient: Object.fromEntries(patients.map(patient => [patient.patient_id, [structuredClone(sharedTheme)]])) });
    const { page, controls } = fixture;
    let release;
    controls.markGates.set(`${patients[0].patient_id}:meu-jeito`, new Promise(resolve => { release = resolve; }));
    try {
      await page.getByRole("button", { name: `Abrir conteúdos compartilhados por ${patients[0].patient_name}`, exact: true }).click();
      await page.locator(mapSelector("meu-jeito")).locator(":scope > summary").click();
      await page.locator(mapSelector("meu-jeito")).getByRole("button", { name: "Concluir visualização", exact: true }).click();
      await expect(page.locator(mapSelector("meu-jeito")).locator(".record-view-state")).toContainText("Salvando visualização");
      await page.getByRole("button", { name: "Voltar aos pacientes", exact: false }).click();
      await page.getByRole("button", { name: `Abrir conteúdos compartilhados por ${patients[1].patient_name}`, exact: true }).click();
      const secondTheme = page.locator(mapSelector("meu-jeito"));
      await secondTheme.locator(":scope > summary").click();
      await expect(secondTheme.getByRole("button", { name: "Concluir visualização", exact: true })).toBeEnabled();
      await secondTheme.getByRole("button", { name: "Concluir visualização", exact: true }).click();
      await expect(secondTheme.locator(".record-view-state")).toHaveText("Visto");
      assert.equal(controls.mapsByPatient[patients[0].patient_id][0].is_unread, 1, "First confirmation remains in flight.");
      assert.equal(controls.mapsByPatient[patients[1].patient_id][0].is_unread, 0);
      assert.equal(controls.mutations.length, 2);
      const response = page.waitForResponse(result => result.url().includes(`/patients/${patients[0].patient_id}/map-shares/meu-jeito/viewed`)
        && result.request().method() === "POST");
      release();
      await response;
      await expect(secondTheme.locator(".record-view-state")).toHaveText("Visto");
      await checkHealthy(fixture, "professional-independent-map-locks");
    } finally { release(); }
  });

  test("pagination and reading filters preserve all shared contents and accurate visible counts", async () => {
    const entries = Array.from({ length: 28 }, (_, index) => entry(`many-${String(index + 1).padStart(2, "0")}`, index % 3 === 0, 28 - index));
    const fixture = await openProfessional({ entries, maps: [], patients: [{ ...referencePatient,
      shared_count: entries.length, unread_count: 10, shared_map_count: 0, unread_map_count: 0 }], viewport: { width: 1366, height: 900 } });
    const { page } = fixture;
    await expect(page.locator(".professional-record-disclosure")).toHaveCount(20);
    await expect(page.locator(".professional-history-result-count")).toHaveText("Exibindo 20 de 28 registros neste filtro.");
    await page.getByRole("button", { name: /Mostrar mais registros/u }).click();
    await expect(page.locator(".professional-record-disclosure")).toHaveCount(28);
    await expect(page.locator(".professional-history-result-count")).toHaveText("Exibindo 28 de 28 registros neste filtro.");
    await page.locator(".entry-view-toolbar button").filter({ hasText: "Não vistos" }).click();
    await expect(page.locator(".professional-record-disclosure")).toHaveCount(10);
    await expect(page.locator('.professional-entry-shares [data-reading-group="viewed"]')).toHaveCount(0);
    await page.locator(".entry-view-toolbar button").filter({ hasText: /^Vistos/u }).click();
    await expect(page.locator(".professional-record-disclosure")).toHaveCount(18);
    await expect(page.locator(".professional-record-disclosure.is-unread")).toHaveCount(0);
    await page.locator(".entry-view-toolbar button").filter({ hasText: "Todos" }).click();
    await expect(page.locator(".professional-record-disclosure")).toHaveCount(20);
    assert.equal(fixture.controls.mutations.length, 0);
    await checkHealthy(fixture, "professional-pagination");
  });
});
