import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import axe from "axe-core";
import { findEducationArticle } from "../app/education-content.ts";

const baseUrl = process.env.PORTAL_RESOURCES_UI_BASE_URL;
const browserName = process.env.PORTAL_RESOURCES_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_RESOURCES_UI_OUTPUT ?? "/tmp/area-paciente-resources-ui");
if (!["chromium", "webkit"].includes(browserName)) throw new Error("Use chromium ou webkit para validar os recursos.");
if (baseUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)
    || !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)
    || url.username || url.password) {
    throw new Error("Os testes de recursos aceitam somente um servidor local isolado.");
  }
}

// Browser plugin not available. Existing Playwright browsers exercise localhost
// with every portal API mocked, no persistent browser storage and foreign origins blocked.
// Flow: resources -> local search/filter -> reading/tool -> related reading or
// bottom return -> original filtered card, predictable keyboard focus and no writes.
describe("patient resources — isolated mocked API only", { skip: !baseUrl }, () => {
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
    for (const fixture of fixtures) await fixture.context.close();
    await browser?.close();
  });
  afterEach(async () => {
    for (const fixture of fixtures) await fixture.context.close();
    fixtures.clear();
  });

  async function openResources(viewport, enlarged = false, reducedMotion = "reduce") {
    const context = await browser.newContext({ viewport, reducedMotion, serviceWorkers: "block" });
    const page = await context.newPage();
    const controls = { unexpected: [], foreign: [], errors: [], mutations: [] };
    const fixture = { context, page, controls };
    fixtures.add(fixture);
    page.on("pageerror", error => controls.errors.push(error.message));
    page.on("console", message => {
      if (!["error", "warning"].includes(message.type())) return;
      if (message.text() !== "Service Worker registration blocked by Playwright") controls.errors.push(message.text());
    });
    const origin = new URL(baseUrl).origin;
    await context.route("**/*", async route => {
      if (new URL(route.request().url()).origin !== origin) {
        controls.foreign.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.route("**/api/portal/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/portal/u, "");
      const method = request.method();
      const respond = (payload, status = 200) => route.fulfill({
        status, contentType: "application/json", body: JSON.stringify(payload),
      });
      if (method !== "GET") controls.mutations.push(`${method} ${path}`);
      if (method === "GET" && path === "/config") return respond({
        configured: true, pending: false, privacy_version: "2026-10-08",
        public_site_url: "https://psico-mateus.github.io/",
        guide_url: "https://psico-mateus.github.io/guia-emocoes/",
        care_url: "https://psico-mateus.github.io/cuidados/",
      });
      if (method === "GET" && path === "/session") return respond({
        user: { id: "synthetic-resources-patient", name: "Paciente Sintético", role: "patient" },
        csrf: "synthetic-resources-csrf",
      });
      if (method === "GET" && path === "/entries") return respond({ entries: [] });
      if (method === "GET" && path === "/notices") return respond({ notices: [], unread_count: 0, next_cursor: null });
      if (method === "GET" && path === "/map-sharing") return respond({ shares: [] });
      if (method === "GET" && path === "/map-draft") return respond({
        content_version: "mapa-pessoal-refinado-ouro-v1", generation: 1, fields: [],
      });
      controls.unexpected.push(`${method} ${path}`);
      return respond({ error: "Rota não simulada; não encaminhada ao servidor." }, 500);
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Área do paciente/u);
    await expect(page.getByRole("heading", { level: 1, name: "Olá, Paciente Sintético.", exact: true })).toBeVisible();
    if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.locator(".patient-navigation").getByRole("button", { name: "Recursos", exact: true }).click();
    await expect(page.locator("#patient-resources-title")).toBeVisible();
    await expect(page.locator("#patient-resources-title")).toBeFocused();
    assert.equal(new URL(page.url()).origin, origin);
    await page.screenshot({
      path: resolve(outputDir, `resources-first-${viewport.width}${enlarged ? "-text-200" : ""}-${browserName}.png`),
      fullPage: false,
    });
    return fixture;
  }

  async function checkHealthy(fixture, label) {
    const { page, controls } = fixture;
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    assert.deepEqual(controls.errors, [], "No runtime or console error.");
    assert.deepEqual(controls.unexpected, [], "All API routes are mocked.");
    assert.deepEqual(controls.foreign, [], "No production or other-origin requests.");
    assert.deepEqual(controls.mutations, [], "Reading and navigation do not write anything.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      "No horizontal overflow.");
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      });
      return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }));
    });
    assert.deepEqual(violations, [], "Automated accessibility check.");
    await page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: false });
  }

  const viewports = [
    ["320", { width: 320, height: 844 }, false],
    ["390", { width: 390, height: 844 }, false],
    ["desktop", { width: 1366, height: 900 }, false],
    ["text-200", { width: 1402, height: 1000 }, true],
  ];

  for (const [label, viewport, enlarged] of viewports) {
    test(`readings ${label}: flexible search, related reading, return and empty-state reset`, async () => {
      const fixture = await openResources(viewport, enlarged);
      const { page } = fixture;
      await page.getByRole("button", { name: "Ver leituras", exact: true }).click();
      const search = page.getByRole("searchbox", { name: "Buscar na Leitura complementar" });
      await expect(page.locator("#education-title")).toBeFocused();
      await search.fill("BURNOUT,   estresse");
      const origin = findEducationArticle("estresse-sobrecarga-e-burnout");
      const originButton = page.getByRole("button", { name: `Ler: ${origin.title}`, exact: true });
      await expect(originButton).toBeVisible();
      await expect(page.locator(".education-card")).toHaveCount(1);
      await originButton.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#education-article-title")).toBeFocused();
      const related = findEducationArticle(origin.relatedSlugs[0]);
      await page.locator(".education-related").getByRole("button", { name: related.title, exact: true }).click();
      await expect(page.locator("#education-article-title")).toHaveText(related.title);
      await expect(page.locator("#education-article-title")).toBeFocused();
      await page.locator(".education-article-footer").getByRole("button", { name: "Voltar à Leitura complementar" }).click();
      await expect(search).toHaveValue("BURNOUT,   estresse");
      await expect(originButton).toBeFocused();
      await originButton.click();
      await page.locator(".education-related").getByRole("button", { name: related.title, exact: true }).click();
      await page.goBack();
      await expect(originButton).toBeFocused();
      await expect(search).toHaveValue("BURNOUT,   estresse");
      await page.getByRole("button", { name: "Condições e transtornos", exact: true }).click();
      await search.fill("palavraquenaoexiste");
      await expect(page.getByRole("heading", { name: "Nenhuma leitura encontrada." })).toBeVisible();
      await checkHealthy(fixture, `readings-empty-${label}`);
      await page.getByRole("button", { name: "Limpar busca e filtros", exact: true }).click();
      await expect(search).toHaveValue("");
      await expect(search).toBeFocused();
      await expect(page.getByRole("button", { name: "Todos os temas", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".education-card")).toHaveCount(6);
      await checkHealthy(fixture, `readings-reset-${label}`);
    });

    test(`tools ${label}: keyboard filter, bottom return and original card focus`, async () => {
      const fixture = await openResources(viewport, enlarged);
      const { page } = fixture;
      await page.getByRole("button", { name: "Ver ferramentas", exact: true }).click();
      await expect(page.locator("#patient-tools-title")).toBeFocused();
      const filter = page.locator(".patient-tools-filters button").nth(1);
      await filter.focus();
      await page.keyboard.press("Enter");
      await expect(filter).toHaveAttribute("aria-pressed", "true");
      const opener = page.locator(".patient-tool-card button").first();
      const openerId = await opener.getAttribute("id");
      const count = await page.locator(".patient-tool-card").count();
      await opener.click();
      await expect(page.locator("#patient-tool-detail-title")).toBeFocused();
      await expect(page.locator(".patient-tool-detail button.back-button")).toHaveCount(2);
      for (const text of await page.locator(".patient-tool-meta dd, .patient-tool-stop p, .patient-tool-safety p").all()) {
        assert.ok(await text.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 16);
      }
      await page.locator(".patient-tool-detail-footer").scrollIntoViewIfNeeded();
      await checkHealthy(fixture, `tool-bottom-${label}`);
      await page.locator(".patient-tool-detail-footer button").click();
      await expect(page.locator(`[id="${openerId}"]`)).toBeFocused();
      await expect(filter).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".patient-tool-card")).toHaveCount(count);
      await checkHealthy(fixture, `tools-return-${label}`);
    });

    test(`article ${label}: long reviewed text, references and safety remain legible`, async () => {
      const fixture = await openResources(viewport, enlarged);
      const { page } = fixture;
      await page.getByRole("button", { name: "Ver leituras", exact: true }).click();
      await expect(page.locator("#education-title")).toBeFocused();
      await page.getByRole("searchbox").fill("borderline");
      await expect(page.locator(".education-card")).toHaveCount(1);
      const article = findEducationArticle("transtorno-personalidade-borderline");
      await page.getByRole("button", { name: `Ler: ${article.title}`, exact: true }).click();
      await expect(page.locator("#education-article-title")).toBeFocused();
      await checkHealthy(fixture, `article-heading-${label}`);
      await page.locator(".education-references > summary").click();
      await expect(page.locator(".education-references")).toHaveAttribute("open", "");
      for (const text of await page.locator(".education-reading-time, .education-references li, .education-diagnostic-note").all()) {
        assert.ok(await text.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 16);
      }
      for (const link of await page.locator(".education-reference-link").all()) {
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
      await expect(page.locator(".education-safety").getByRole("link", { name: "Cuidados e ajuda imediata" })).toHaveAttribute("href", "https://psico-mateus.github.io/cuidados/");
      await page.locator(".education-diagnostic-note").scrollIntoViewIfNeeded();
      if (enlarged) {
        const header = await page.locator(".site-header").evaluate(element => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            backdrop: style.backdropFilter || style.webkitBackdropFilter || "none",
            position: style.position,
            top: element.getBoundingClientRect().top,
            scroll: window.scrollY,
          };
        });
        assert.match(header.background, /^rgb\(\d+, \d+, \d+\)$/u,
          "The sticky header must have an opaque background at 200% text size.");
        assert.equal(header.backdrop, "none", "Text below the navigation must not show through a blur layer.");
        assert.equal(header.position, "sticky");
        assert.ok(header.scroll > 0 && Math.abs(header.top) <= 1,
          "The opaque-header evidence must capture the article after scrolling at 200% text size.");
      }
      await checkHealthy(fixture, `article-references-${label}`);
    });
  }

  test("tool return is immediate even when reduced motion is not requested", async () => {
    const fixture = await openResources({ width: 1366, height: 900 }, false, "no-preference");
    const { page } = fixture;
    await page.getByRole("button", { name: "Ver ferramentas", exact: true }).click();
    const opener = page.locator(".patient-tool-card button").last();
    const openerId = await opener.getAttribute("id");
    await opener.click();
    await page.locator(".patient-tool-detail-footer button").click();
    await expect(page.locator(`[id="${openerId}"]`)).toBeFocused();
    const positions = await page.evaluate(async () => {
      const values = [scrollY];
      for (let index = 0; index < 3; index += 1) {
        await new Promise(requestAnimationFrame);
        values.push(scrollY);
      }
      return values;
    });
    assert.ok(Math.max(...positions) - Math.min(...positions) <= 1, "The return must not continue an animated scroll.");
    await checkHealthy(fixture, "tools-return-no-animation");
  });
});
