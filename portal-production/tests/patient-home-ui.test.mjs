import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import axe from "axe-core";

const baseUrl = process.env.PORTAL_HOME_UI_BASE_URL;
const browserName = process.env.PORTAL_HOME_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_HOME_UI_OUTPUT ?? "/tmp/area-paciente-home-ui");
if (!["chromium", "webkit"].includes(browserName)) {
  throw new Error("Use chromium ou webkit para validar o início do paciente.");
}
if (baseUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)
    || !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)
    || url.username || url.password) {
    throw new Error("Os testes do início aceitam somente um servidor local isolado.");
  }
}

const timestamp = "2026-10-08T12:00:00.000Z";
const syntheticEntries = [
  {
    id: "synthetic-home-private",
    title: "Um registro privado de teste",
    happened: "Conteúdo sintético e neutro para verificar a interface local.",
    body: "", thoughts: "", urge: "", message: "", emotion: "Dúvida", intensity: 4,
    created_at: timestamp, updated_at: timestamp,
    shared_at: null, revoked_at: null, viewed_at: null,
  },
  {
    id: "synthetic-home-viewed",
    title: "Um registro visualizado de teste",
    happened: "Conteúdo sintético e neutro para verificar a interface local.",
    body: "", thoughts: "", urge: "", message: "", emotion: "Alívio", intensity: 3,
    created_at: "2026-10-07T12:00:00.000Z", updated_at: "2026-10-07T12:00:00.000Z",
    shared_at: "2026-10-07T12:05:00.000Z", revoked_at: null, viewed_at: timestamp,
  },
  {
    id: "synthetic-home-awaiting",
    title: "Um registro compartilhado de teste",
    happened: "Conteúdo sintético e neutro para verificar a interface local.",
    body: "", thoughts: "", urge: "", message: "", emotion: "Dúvida", intensity: 5,
    created_at: timestamp, updated_at: timestamp,
    shared_at: timestamp, revoked_at: null, viewed_at: null,
  },
];

// The flow under test is: synthetic patient home -> loaded/pending/error states
// and keyboard navigation -> truthful summaries, readable controls and useful focus.
// Browser plugin not available; use the installed Playwright browsers without
// sending any portal API request to the local backend or to production.
describe("patient home — isolated mocked API only", { skip: !baseUrl }, () => {
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
      await fixture.context.close();
    }
    await browser?.close();
  });

  async function openHome({
    entries = syntheticEntries,
    entriesStatus = 200,
    pendingEntries = false,
    name = "Paciente Sintético",
    viewport = { width: 1366, height: 900 },
  } = {}) {
    const context = await browser.newContext({
      viewport,
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    let releaseEntries;
    const entriesGate = new Promise((resolveGate) => { releaseEntries = resolveGate; });
    if (!pendingEntries) releaseEntries();
    const controls = {
      entriesRequests: 0,
      unexpected: [],
      foreignRequests: [],
      mutations: [],
      runtimeErrors: [],
      expectedHttpFailures: [],
    };
    const fixture = { context, page, controls, releaseEntries };
    fixtures.add(fixture);

    page.on("pageerror", (error) => controls.runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") return;
      if (entriesStatus >= 400 && /Failed to load resource: the server responded with a status of 503\b/u.test(text)) {
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
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.route("**/api/portal/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/portal/u, "");
      const respond = (payload, status = 200) => route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
      if (url.origin !== origin) {
        controls.foreignRequests.push(url.origin);
        return route.abort();
      }
      if (request.method() !== "GET") {
        controls.mutations.push(`${request.method()} ${path}`);
        return respond({ error: "Este teste não permite gravações." }, 405);
      }
      if (path === "/config") return respond({
        configured: true, pending: false, privacy_version: "2026-10-08",
        public_site_url: "https://psico-mateus.github.io/",
        guide_url: "https://psico-mateus.github.io/guia-emocoes/",
        care_url: "https://psico-mateus.github.io/cuidados/",
      });
      if (path === "/session") return respond({
        user: { id: "synthetic-home-patient", name, role: "patient" },
        csrf: "synthetic-home-csrf",
      });
      if (path === "/entries") {
        controls.entriesRequests += 1;
        await entriesGate;
        return entriesStatus === 200
          ? respond({ entries: structuredClone(entries) })
          : respond({ error: "Não foi possível consultar os registros neste teste." }, entriesStatus);
      }
      if (path === "/notices") return respond({ notices: [], unread_count: 0, next_cursor: null });
      if (path === "/map-sharing") return respond({ shares: [] });
      if (path === "/map-draft") return respond({ content_version: "mapa-pessoal-refinado-ouro-v1", generation: 1, fields: [] });
      controls.unexpected.push(`${request.method()} ${path}`);
      return respond({ error: "Rota não simulada; nenhuma requisição foi encaminhada ao servidor." }, 500);
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Área do paciente/u);
    await expect(page.getByRole("heading", { level: 1, name: `Olá, ${name}.`, exact: true })).toBeVisible();
    await expect(page.locator(".patient-start-card")).toHaveCount(4);
    await assertResponsiveRecordAction(page, viewport.width);
    assert.equal(new URL(page.url()).origin, origin);
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    return fixture;
  }

  async function assertResponsiveRecordAction(page, width) {
    const variants = page.locator(".patient-mobile-record, .patient-start-card.primary");
    await expect(variants).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^Registrar algo/u })).toHaveCount(1);
    const visible = variants.filter({ visible: true });
    await expect(visible).toHaveCount(1);
    if (width <= 900) {
      await expect(visible).toHaveClass(/patient-mobile-record/u);
      await expect(page.locator("#patient-start-title")).toHaveAccessibleName("Outras opções");
      const notices = page.locator(".patient-notices");
      await expect(notices).toBeVisible();
      const recordBounds = await visible.boundingBox();
      const noticesBounds = await notices.boundingBox();
      assert.ok(recordBounds && noticesBounds, "Record action and notices must have rendered bounds.");
      assert.ok(recordBounds.y + recordBounds.height <= noticesBounds.y,
        `At ${width}px, the primary record action must appear above notices.`);
      assert.equal(await visible.evaluate((button) => {
        const noticesPanel = document.querySelector(".patient-notices");
        return Boolean(noticesPanel && (button.compareDocumentPosition(noticesPanel) & Node.DOCUMENT_POSITION_FOLLOWING));
      }), true, "Mobile record action must precede notices in reading and keyboard order.");
    } else {
      await expect(visible).toHaveClass(/patient-start-card/u);
      await expect(page.locator(".patient-mobile-record")).not.toBeVisible();
      await expect(page.locator("#patient-start-title")).toHaveAccessibleName("O que você quer fazer?");
    }
  }

  async function assertHomeReadability(page) {
    if (await page.locator(".patient-home").count() === 0) return;
    const texts = await page.locator([
      ".patient-hero-copy > p", ".patient-home-privacy", ".patient-action-copy > strong",
      ".patient-action-copy > span", ".patient-overview-metrics strong",
      ".patient-overview-metrics small", ".patient-sharing-states li", ".overview-number",
    ].join(", ")).evaluateAll((elements) => elements.filter((element) =>
      element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== "hidden",
    ).map((element) => ({ text: element.textContent.trim(), fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize) })));
    assert.ok(texts.length > 0, "Main home text remains rendered.");
    for (const item of texts) assert.ok(item.fontSize >= 16, `${item.text}: main home text must remain at least 16px.`);
    for (const number of await page.locator(".patient-overview .overview-number").all()) {
      await expect(number).toBeVisible();
    }
    for (const state of await page.locator(".patient-overview-metrics small, .patient-sharing-states li").all()) {
      await expect(state).toBeVisible();
    }
  }

  async function checkHealthy(fixture, label) {
    const { page, controls } = fixture;
    assert.deepEqual(controls.unexpected, [], "Every API call must use a synthetic response.");
    assert.deepEqual(controls.foreignRequests, [], "No production or other foreign network request.");
    assert.deepEqual(controls.mutations, [], "Home browsing and keyboard navigation must be read-only.");
    assert.deepEqual(controls.runtimeErrors, [], "No unexpected browser error or warning.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No horizontal overflow.");
    await assertHomeReadability(page);
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      });
      return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
    });
    assert.deepEqual(violations, [], "Automated accessibility checks.");
    await page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: false });
  }

  test("pending entries never masquerade as zero records or zero private records", async () => {
    const fixture = await openHome({ pendingEntries: true });
    const overview = fixture.page.locator(".patient-overview");
    await expect(overview.locator(".overview-number")).toHaveText(["…", "…"]);
    await expect(overview).toContainText("Consultando seus registros…");
    await expect(overview).toContainText("Consultando visualizações…");
    await expect(overview).not.toContainText(/Nenhum registro|0 registros|0 registro privado/u);
    await expect(overview.getByRole("button", { name: "Atualizar", exact: true })).toBeDisabled();
    await checkHealthy(fixture, "home-pending-desktop");
    fixture.releaseEntries();
    await expect(overview.locator(".overview-number")).toHaveText(["3", "2"]);
  });

  test("failed initial entries are unavailable, not an empty history", async () => {
    const fixture = await openHome({ entriesStatus: 503 });
    const overview = fixture.page.locator(".patient-overview");
    await expect(overview.locator(".overview-number")).toHaveText(["—", "—"]);
    await expect(overview).toContainText("Resumo indisponível. Tente carregar novamente.");
    await expect(overview).toContainText("Não foi possível consultar os compartilhamentos.");
    await expect(overview).not.toContainText(/Nenhum registro|0 registros/u);
    await expect(fixture.page.getByRole("button", { name: "Tentar carregar os registros novamente" })).toBeVisible();
    await checkHealthy(fixture, "home-unavailable-desktop");
  });

  test("a confirmed empty dataset shows accurate zero counts", async () => {
    const fixture = await openHome({ entries: [] });
    const overview = fixture.page.locator(".patient-overview");
    await expect(overview.locator(".overview-number")).toHaveText(["0", "0"]);
    await expect(overview).toContainText("Nenhum registro está privado.");
    await expect(overview).toContainText("Nenhum registro está visível para Mateus.");
    await expect(overview).not.toContainText("Resumo indisponível");
    await expect(fixture.page.getByRole("heading", { name: "O que você quer fazer?", exact: true })).toBeVisible();
    await checkHealthy(fixture, "home-empty-desktop");
  });

  test("loaded summary separates three records, two shared and one viewed", async () => {
    const fixture = await openHome();
    const overview = fixture.page.locator(".patient-overview");
    await expect(overview.locator(".overview-number")).toHaveText(["3", "2"]);
    await expect(overview).toContainText("1 registro continua privado · só você vê.");
    await expect(overview).toContainText("Mateus visualizou 1 registro.");
    await expect(overview).toContainText("1 registro aguarda visualização.");
    await expect(overview).toContainText("Nada é compartilhado automaticamente.");
    await checkHealthy(fixture, "home-loaded-desktop");
  });

  for (const width of [320, 390, 640]) {
    test(`long names reflow and controls remain readable and touchable at ${width}px`, async () => {
      const fixture = await openHome({
        name: "Paciente Sintético Com Um Nome Muito Longo Para Conferir A Quebra De Linha Sem Cortes",
        viewport: { width, height: width === 640 ? 450 : 844 },
      });
      await expect(fixture.page.locator(".patient-overview .overview-number")).toHaveText(["3", "2"]);
      const controls = await fixture.page.locator(".patient-navigation button, .patient-home button").evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length > 0).map((button) => {
        const styles = window.getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        return { label: button.textContent.trim(), fontSize: Number.parseFloat(styles.fontSize), width: bounds.width, height: bounds.height };
      }));
      assert.ok(controls.length >= 10, "Expected the navigation and all home actions.");
      for (const control of controls) {
        assert.ok(control.fontSize >= 16, `${control.label}: font must be at least 16px, got ${control.fontSize}px`);
        assert.ok(control.width >= 44 && control.height >= 44, `${control.label}: touch target must be at least 44 × 44px`);
      }
      const headingFits = await fixture.page.locator("#patient-home-title").evaluate((heading) => heading.scrollWidth <= heading.clientWidth + 1);
      assert.equal(headingFits, true, "Long names must wrap rather than clip.");
      const motion = await fixture.page.locator(".patient-start-card").evaluateAll((cards) => cards.map((card) => {
        const styles = window.getComputedStyle(card);
        return { transition: styles.transitionProperty, duration: styles.transitionDuration, transform: styles.transform };
      }));
      assert.ok(motion.every((card) => card.transition === "none" && card.transform === "none"), "Home cards have no moving hover transition.");
      await checkHealthy(fixture, `home-reflow-${width}`);
    });
  }

  test("200% text size stacks notices above actions without horizontal overflow", async () => {
    const fixture = await openHome({ viewport: { width: 1402, height: 1000 } });
    const { page } = fixture;
    await expect(page.locator(".patient-overview .overview-number")).toHaveText(["3", "2"]);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(page.locator("#patient-start-title")).toHaveAccessibleName("Outras opções");
    await expect.poll(() => page.locator(".patient-home-workspace").evaluate((workspace) =>
      window.getComputedStyle(workspace).gridTemplateColumns.trim().split(/\s+/u).length,
    )).toBe(1);
    const noticesBounds = await page.locator(".patient-notices").boundingBox();
    const actionsBounds = await page.locator(".patient-start").boundingBox();
    assert.ok(noticesBounds && actionsBounds, "Notices and actions must have rendered bounds.");
    assert.ok(noticesBounds.y + noticesBounds.height <= actionsBounds.y,
      "At 200% text size, notices must be above the action section.");
    assert.ok(Math.abs(noticesBounds.x - actionsBounds.x) <= 1,
      "At 200% text size, notices and actions must share one column.");
    await checkHealthy(fixture, "home-text-200-percent");
  });

  test("keyboard navigation announces the destination and returns useful focus", async () => {
    const fixture = await openHome();
    const { page } = fixture;
    await expect(page.locator(".patient-overview .overview-number")).toHaveText(["3", "2"]);
    const navigation = page.getByRole("navigation", { name: "Navegação da Área do paciente" });
    await navigation.getByRole("button", { name: "Início", exact: true }).focus();
    // macOS WebKit follows Safari's default text-field-only Tab preference;
    // Option-Tab includes native buttons without changing the app's tabindex.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(navigation.getByRole("button", { name: "Meus registros", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Meus registros", exact: true })).toBeFocused();
    await expect(navigation.getByRole("button", { name: "Meus registros", exact: true })).toHaveAttribute("aria-current", "page");
    assert.equal(new URL(page.url()).hash, "#registros");
    await navigation.getByRole("button", { name: "Início", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#patient-home-title")).toBeFocused();
    await page.getByRole("button", { name: /^Ver recursos/u }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("heading", { level: 1, name: "Recursos", exact: true })).toBeFocused();
    assert.equal(new URL(page.url()).hash, "#recursos");
    await checkHealthy(fixture, "home-keyboard-to-resources");
  });

  for (const [label, viewport, enlarged] of [
    ["320", { width: 320, height: 844 }, false],
    ["390", { width: 390, height: 844 }, false],
    ["desktop", { width: 1366, height: 900 }, false],
    ["text-200", { width: 1402, height: 1000 }, true],
  ]) {
    test(`resources ${label}: tools and readings retain readable choices and a stable keyboard return`, async () => {
      const fixture = await openHome({ viewport });
      const { page } = fixture;
      if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.getByRole("navigation", { name: "Navegação da Área do paciente" })
        .getByRole("button", { name: "Recursos", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Recursos", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Ver leituras", exact: true }).click();
      await expect(page.locator("#education-title")).toBeFocused();
      const readingFonts = await page.locator(".education-privacy-note, .education-card > p, .education-card-meta, .education-card-meta small")
        .evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize)));
      assert.ok(readingFonts.length > 0 && readingFonts.every(size => size >= 16), "Reading summaries and metadata remain readable.");
      const search = page.getByLabel("Buscar na Leitura complementar");
      await search.fill("sono");
      const articleButton = page.locator(".education-card button").first();
      const articleId = await articleButton.getAttribute("id");
      await articleButton.focus();
      await expect(articleButton).toBeFocused();
      const motion = await page.locator(".education-card").first().evaluate(node => {
        const style = getComputedStyle(node);
        return { transform: style.transform, transition: style.transitionProperty };
      });
      assert.deepEqual(motion, { transform: "none", transition: "none" }, "Cards must not jump on focus even without reduced motion.");
      await checkHealthy(fixture, `resources-readings-${label}`);
      await page.keyboard.press("Enter");
      await expect(page.locator("#education-article-title")).toBeFocused();
      await page.locator(".education-article > .back-button").click();
      await expect(page.locator(`#${articleId}`)).toBeFocused();
      await expect(search).toHaveValue("sono");
      await page.getByRole("button", { name: "Voltar aos recursos", exact: true }).click();
      await page.getByRole("button", { name: "Ver ferramentas", exact: true }).click();
      await expect(page.locator("#patient-tools-title")).toBeFocused();
      const targets = await page.locator(".patient-tools-filters button").evaluateAll(nodes => nodes.map(node => {
        const bounds = node.getBoundingClientRect();
        return { fontSize: Number.parseFloat(getComputedStyle(node).fontSize), width: bounds.width, height: bounds.height };
      }));
      assert.ok(targets.length > 1 && targets.every(target => target.fontSize >= 16 && target.width >= 44 && target.height >= 44),
        "Every practical-tool choice must retain readable text and a full touch area.");
      await page.getByRole("group", { name: "Filtrar ferramentas por situação" })
        .getByRole("button", { name: "Estou travado", exact: true }).click();
      const toolButton = page.locator(".patient-tool-card button").first();
      const toolId = await toolButton.getAttribute("id");
      await toolButton.click();
      await expect(page.locator("#patient-tool-detail-title")).toBeFocused();
      await page.getByRole("button", { name: "Voltar às ferramentas", exact: true }).click();
      await expect(page.locator(`#${toolId}`)).toBeFocused();
      await expect(page.getByRole("button", { name: "Estou travado", exact: true })).toHaveAttribute("aria-pressed", "true");
      await checkHealthy(fixture, `resources-tools-${label}`);
    });
  }
});
