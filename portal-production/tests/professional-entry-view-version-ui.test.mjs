import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, afterEach, before, describe, test } from "node:test";

const baseUrl = process.env.PORTAL_PROFESSIONAL_HISTORY_UI_BASE_URL;
const browserName = process.env.PORTAL_PROFESSIONAL_HISTORY_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_ENTRY_VIEW_UI_OUTPUT ?? "/tmp/portal-professional-entry-view-version");
if (!["chromium", "webkit"].includes(browserName)) throw new Error("Use chromium ou webkit.");
if (baseUrl) {
  const url = new URL(baseUrl);
  if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)
    || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Somente servidor local isolado é permitido.");
  }
}
const INITIAL = "2026-10-14T12:00:00.000Z";
const LATER = "2026-10-14T13:00:00.000Z";
const CONFLICT = "Este registro foi atualizado desde que foi aberto. A visualização não foi confirmada. Use Atualizar e leia a versão atual antes de concluir a visualização.";
const patients = ["00000001", "00000002"].map((suffix) => ({ patient_id: `synthetic-version-${suffix}`,
  patient_name: "Mesmo Nome Sintético", shared_count: 1, private_count: 0, unread_count: 1,
  shared_map_count: 0, unread_map_count: 0, latest_shared_at: INITIAL, latest_map_shared_at: null }));
const entry = (id) => ({ id, title: "Registro sintético original", happened: "Conteúdo sintético que estava aberto.",
  body: "", thoughts: "", urge: "", emotion: "Dúvida", intensity: 4, message: "", created_at: INITIAL,
  updated_at: INITIAL, shared_at: INITIAL, viewed_at: null, is_unread: 1, thought_review: null });

// Browser plugin not available. Existing Playwright only; localhost UI and a
// completely mocked API. Flow: open shared version -> explicit confirmation ->
// conflict/current-version success, without erasing content or crossing owners.
describe("professional version-bound read receipt — isolated UI", { skip: !baseUrl }, () => {
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
    for (const f of fixtures) { f.release(); await f.context.close(); }
    fixtures.clear();
  });
  async function open({ width = 390, delayed = false } = {}) {
    const origin = new URL(baseUrl).origin;
    const context = await browser.newContext({ viewport: { width, height: width > 1000 ? 900 : 844 },
      serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    let release;
    const gate = new Promise((done) => { release = done; });
    if (!delayed) release();
    const controls = { entries: Object.fromEntries(patients.map((patient, i) => [patient.patient_id, [entry(`synthetic-entry-${i}`)]])),
      mutations: [], unexpected: [], foreign: [], errors: [] };
    const f = { context, page, controls, release };
    fixtures.add(f);
    page.on("pageerror", (error) => controls.errors.push(error.message));
    page.on("console", (message) => {
      if (!["warning", "error"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright"
        || /Failed to load resource: the server responded with a status of 409\b/u.test(text)) return;
      controls.errors.push(text);
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { controls.foreign.push(url.origin); return route.abort(); }
      return route.continue();
    });
    await page.route("**/api/portal/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/^\/api\/portal/u, "");
      const respond = (payload, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      if (path === "/config") return respond({ configured: true, pending: false, privacy_version: "test",
        public_site_url: "https://psico-mateus.github.io/", guide_url: "https://psico-mateus.github.io/guia-emocoes/", care_url: "https://psico-mateus.github.io/cuidados/" });
      if (path === "/session") return respond({ user: { id: "synthetic-version-therapist", name: "Mateus", role: "therapist" }, csrf: "synthetic-version-csrf" });
      if (path === "/account/mfa-recovery-codes") return respond({ remaining: 8, total: 8, generated_at: INITIAL });
      if (path === "/professional/patients") return respond({ patients, activity: { total_count: 2, shared_count: 2, private_count: 0 } });
      const records = path.match(/^\/professional\/patients\/([^/]+)\/entries$/u);
      if (records) return respond({ entries: controls.entries[decodeURIComponent(records[1])] ?? [] });
      if (/\/map-shares$/u.test(path)) return respond({ shares: [] });
      const viewed = path.match(/^\/professional\/entries\/([^/]+)\/viewed$/u);
      if (viewed && request.method() === "POST") {
        const payload = request.postDataJSON();
        controls.mutations.push({ path, payload, csrf: request.headers()["x-csrf-token"] });
        const record = Object.values(controls.entries).flat().find((candidate) => candidate.id === viewed[1]);
        if (!record) return respond({ error: "Registro compartilhado não encontrado." }, 404);
        if (payload.expected_updated_at !== record.updated_at) return respond({ error: CONFLICT }, 409);
        record.is_unread = 0; record.viewed_at = LATER;
        await gate;
        return respond({ viewed_at: LATER });
      }
      controls.unexpected.push(`${request.method()} ${path}`);
      return respond({ error: "Rota não simulada; nenhum dado foi enviado." }, 500);
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Área do paciente/u);
    await expect(page.getByRole("heading", { level: 1, name: "Olá, Mateus.", exact: true })).toBeVisible();
    await expect(page.locator(".patient-summary-card")).toHaveCount(2);
    await page.locator(".patient-summary-card").first().getByRole("button").click();
    await expect(page.getByRole("button", { name: "Atualizar", exact: true })).toBeEnabled();
    return f;
  }
  const disclosure = (page, id = "synthetic-entry-0") => page.locator(`.professional-record-disclosure[data-entry-id="${id}"]`);
  async function healthy(f, label) {
    assert.equal(new URL(f.page.url()).origin, new URL(baseUrl).origin);
    assert.deepEqual(f.controls.unexpected, []);
    assert.deepEqual(f.controls.foreign, []);
    assert.deepEqual(f.controls.errors, []);
    await expect(f.page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await f.page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: false });
  }

  for (const width of [320, 1366]) test(`conflict ${width}px preserves original content and selection; explicit refresh/read can confirm the new version`, async () => {
    const f = await open({ width }); const { page, controls } = f;
    const item = disclosure(page);
    await item.locator(":scope > summary").click();
    controls.entries[patients[0].patient_id][0] = { ...entry("synthetic-entry-0"), updated_at: LATER,
      title: "Versão sintética atualizada", happened: "Conteúdo sintético novo para reler." };
    await item.getByRole("button", { name: "Concluir visualização", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(CONFLICT);
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(item).toHaveAttribute("open", "");
    await expect(item).toContainText("Conteúdo sintético que estava aberto.");
    await expect(item.locator(".record-view-state")).toHaveText("Em leitura");
    await expect(item.locator(".record-view-state")).toHaveClass(/unread/u);
    await expect(item.getByRole("button", { name: "Concluir visualização", exact: true })).toBeEnabled();
    await expect(page.locator("#selected-patient-title")).toHaveText(patients[0].patient_name);
    assert.deepEqual(controls.mutations[0].payload, { expected_updated_at: INITIAL });
    assert.equal(controls.mutations[0].csrf, "synthetic-version-csrf");
    await healthy(f, `conflict-${width}`);
    await page.getByRole("button", { name: "Atualizar", exact: true }).click();
    await expect(item).toContainText("Versão sintética atualizada");
    if (!(await item.evaluate((node) => node.open))) await item.locator(":scope > summary").click();
    await expect(item).toContainText("Conteúdo sintético novo para reler.");
    await item.getByRole("button", { name: "Concluir visualização", exact: true }).click();
    await expect(item.locator(".record-view-state")).toHaveText("Visto");
    assert.deepEqual(controls.mutations.map((mutation) => mutation.payload.expected_updated_at), [INITIAL, LATER]);
    await healthy(f, `confirmed-new-version-${width}`);
  });

  test("a successful delayed receipt cannot mark the newer version loaded by refresh", async () => {
    const f = await open({ delayed: true }); const { page, controls } = f;
    const item = disclosure(page);
    await item.locator(":scope > summary").click();
    await item.getByRole("button", { name: "Concluir visualização", exact: true }).click();
    await expect(item.locator(".record-view-state")).toContainText("Salvando visualização");
    controls.entries[patients[0].patient_id][0] = { ...entry("synthetic-entry-0"), updated_at: LATER,
      title: "Versão sintética depois da leitura" };
    await page.getByRole("button", { name: "Atualizar", exact: true }).click();
    await expect(item).toContainText("Versão sintética depois da leitura");
    const response = page.waitForResponse((result) => result.url().endsWith("/synthetic-entry-0/viewed"));
    f.release(); await response;
    await expect(item.locator(".record-view-state")).toHaveText("Em leitura");
    await expect(item.locator(".record-view-state")).toHaveClass(/unread/u);
    await expect(page.getByText("Visualização confirmada. O paciente poderá ver essa confirmação no histórico.", { exact: true })).toHaveCount(0);
    assert.equal(controls.mutations.length, 1);
    assert.equal(controls.entries[patients[0].patient_id][0].is_unread, 1);
    await healthy(f, "delayed-refreshed-version");
  });

  test("delayed receipt never affects another same-name patient's reading pane", async () => {
    const f = await open({ delayed: true }); const { page, controls } = f;
    const first = disclosure(page);
    await first.locator(":scope > summary").click();
    await first.getByRole("button", { name: "Concluir visualização", exact: true }).click();
    await expect(first.locator(".record-view-state")).toContainText("Salvando visualização");
    await page.getByRole("button", { name: "Voltar aos pacientes", exact: false }).click();
    await page.locator(".patient-summary-card").nth(1).getByRole("button").click();
    const second = disclosure(page, "synthetic-entry-1");
    await second.locator(":scope > summary").click();
    const response = page.waitForResponse((result) => result.url().endsWith("/synthetic-entry-0/viewed"));
    f.release(); await response;
    await expect(second.locator(".record-view-state")).toHaveText("Em leitura");
    await expect(second.locator(".record-view-state")).toHaveClass(/unread/u);
    await expect(page.getByText("Visualização confirmada. O paciente poderá ver essa confirmação no histórico.", { exact: true })).toHaveCount(0);
    await expect(page.locator(".patient-detail-heading .patient-account-reference")).toContainText("00000002");
    assert.equal(controls.entries[patients[1].patient_id][0].is_unread, 1);
    assert.equal(controls.mutations.length, 1);
    await healthy(f, "delayed-other-same-name-patient");
  });
});
