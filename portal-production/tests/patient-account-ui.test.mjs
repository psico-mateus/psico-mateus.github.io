import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import axe from "axe-core";

const baseUrl = process.env.PORTAL_ACCOUNT_UI_BASE_URL;
const browserName = process.env.PORTAL_ACCOUNT_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_ACCOUNT_UI_OUTPUT ?? "/tmp/area-paciente-account-ui");
if (!["chromium", "webkit"].includes(browserName)) {
  throw new Error("Use chromium ou webkit para validar a conta do paciente.");
}
if (baseUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)
    || !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)
    || url.username || url.password) {
    throw new Error("Os testes da conta aceitam somente um servidor local isolado.");
  }
}

const patient = { id: "synthetic-account-patient", name: "Paciente Sintético", role: "patient" };
const syntheticPassword = "senha-sintetica-isolada";
const syntheticRecoveryCode = "SYNTHETIC-RECOVERY-ONLY";

// Browser plugin not available. The installed Playwright browsers exercise only
// localhost with all portal API responses simulated and foreign origins blocked.
// Flow: account disclosure -> readable safety information or explicit code
// generation -> session expiry -> secret removed and no secret restored on login.
describe("patient account — isolated mocked API only", { skip: !baseUrl }, () => {
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

  async function openAccount(viewport) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    const controls = {
      entriesStatus: 200, entriesRequests: 0, mutations: [], unexpected: [],
      foreignRequests: [], runtimeErrors: [], expectedHttpFailures: [],
    };
    const fixture = { context, page, controls };
    fixtures.add(fixture);
    page.on("pageerror", error => controls.runtimeErrors.push(error.message));
    page.on("console", message => {
      if (!["error", "warning"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") return;
      if (/Failed to load resource: the server responded with a status of 401\b/u.test(text)) {
        controls.expectedHttpFailures.push(text);
        return;
      }
      controls.runtimeErrors.push(text);
    });
    const origin = new URL(baseUrl).origin;
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        controls.foreignRequests.push(url.origin);
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
      if (url.origin !== origin) {
        controls.foreignRequests.push(url.origin);
        return route.abort();
      }
      if (method !== "GET") controls.mutations.push({
        path, method, payload: request.postData() ? request.postDataJSON() : null,
        csrf: request.headers()["x-csrf-token"],
      });
      if (path === "/config" && method === "GET") return respond({
        configured: true, pending: false, privacy_version: "2026-10-08",
        public_site_url: "https://psico-mateus.github.io/",
        guide_url: "https://psico-mateus.github.io/guia-emocoes/",
        care_url: "https://psico-mateus.github.io/cuidados/",
      });
      if (path === "/session" && method === "GET") return respond({ user: patient, csrf: "synthetic-account-csrf" });
      if (path === "/entries" && method === "GET") {
        controls.entriesRequests += 1;
        return controls.entriesStatus === 200 ? respond({ entries: [] })
          : respond({ error: "Sessão sintética encerrada." }, controls.entriesStatus);
      }
      if (path === "/notices" && method === "GET") return respond({ notices: [], unread_count: 0, next_cursor: null });
      if (path === "/map-sharing" && method === "GET") return respond({ shares: [] });
      if (path === "/map-draft" && method === "GET") return respond({
        content_version: "mapa-pessoal-refinado-ouro-v1", generation: 1, fields: [],
      });
      if (path === "/account/recovery-code" && method === "POST") {
        return respond({ recovery_code: syntheticRecoveryCode });
      }
      if (path === "/login" && method === "POST") {
        return respond({ user: patient, csrf: "synthetic-account-reauthenticated-csrf" });
      }
      controls.unexpected.push(`${method} ${path}`);
      return respond({ error: "Rota não simulada; nenhuma requisição foi encaminhada ao servidor." }, 500);
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Área do paciente/u);
    await expect(page.getByRole("heading", { level: 1, name: "Olá, Paciente Sintético.", exact: true })).toBeVisible();
    await expect(page.locator(".patient-overview .overview-number")).toHaveText(["0", "0"]);
    assert.equal(new URL(page.url()).origin, origin);
    await page.locator(".patient-account-panel > summary").click();
    await expect(page.locator(".patient-account-panel")).toHaveAttribute("open", "");
    return fixture;
  }

  async function checkHealthy(fixture, label) {
    const { page, controls } = fixture;
    assert.deepEqual(controls.unexpected, [], "Every portal API response must be simulated.");
    assert.deepEqual(controls.foreignRequests, [], "No production or foreign-origin request.");
    assert.deepEqual(controls.runtimeErrors, [], "No unexpected browser error or warning.");
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "No horizontal overflow.");
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      });
      return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }));
    });
    assert.deepEqual(violations, [], "Automated accessibility checks.");
    await page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: false });
  }

  for (const [label, viewport, enlarged] of [
    ["320", { width: 320, height: 844 }, false],
    ["390", { width: 390, height: 844 }, false],
    ["desktop", { width: 1366, height: 900 }, false],
    ["text-200", { width: 1402, height: 1000 }, true],
  ]) {
    test(`account ${label}: safety explanations are readable and account controls keep natural sizing`, async () => {
      const fixture = await openAccount(viewport);
      const { page, controls } = fixture;
      if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const account = page.locator(".patient-account-panel");
      const texts = await account.locator(".patient-account-panel > summary small, .field > label > span, .account-sessions p, .patient-account-actions p, .account-data-copy small")
        .evaluateAll(elements => elements.map(element => ({
          text: element.textContent.trim(), fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        })));
      assert.ok(texts.length >= 5, "Safety, export and deletion explanations must remain rendered.");
      for (const item of texts) assert.ok(item.fontSize >= 16, `${item.text}: safety text remains at least 16px.`);
      for (const button of await account.locator("button").all()) {
        const dimensions = await button.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        });
        assert.ok(dimensions.width >= 44 && dimensions.height >= 44, "Account buttons retain a full touch target.");
      }
      const recoveryForm = account.locator(".account-grid > form").filter({
        has: page.getByRole("heading", { name: "Código para recuperar a senha", exact: true }),
      });
      assert.equal(await recoveryForm.evaluate(element => getComputedStyle(element).alignContent), "start",
        "The shorter recovery form must not distribute its empty space between fields and stretch its button.");
      if (!enlarged) {
        const recoveryButton = await recoveryForm.getByRole("button", { name: "Criar novo código", exact: true }).boundingBox();
        assert.ok(recoveryButton && recoveryButton.height <= 64, "The recovery button has a normal one-line height.");
      }
      await account.locator("#account-data-copy-title").scrollIntoViewIfNeeded();
      assert.deepEqual(controls.mutations, [], "Opening and reading account settings never changes account data.");
      await checkHealthy(fixture, `account-readable-${label}`);
    });
  }

  for (const width of [390, 1366]) {
    test(`account ${width}px: session expiry removes an open recovery secret and login never resurrects it`, async () => {
      const fixture = await openAccount({ width, height: 900 });
      const { page, controls } = fixture;
      const form = page.locator(".account-grid > form").filter({
        has: page.getByRole("heading", { name: "Código para recuperar a senha", exact: true }),
      });
      await form.getByLabel("Senha atual", { exact: true }).fill(syntheticPassword);
      assert.deepEqual(controls.mutations, [], "Typing a password must not automatically issue a recovery code.");
      await form.getByRole("button", { name: "Criar novo código", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Seu código de recuperação", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".secret-code")).toHaveText(syntheticRecoveryCode);
      await expect(dialog.getByRole("heading", { name: "Seu código de recuperação", exact: true })).toBeFocused();
      assert.deepEqual(controls.mutations, [{
        path: "/account/recovery-code", method: "POST",
        payload: { current_password: syntheticPassword, totp: null }, csrf: "synthetic-account-csrf",
      }], "Only the explicit synthetic recovery-code request is issued.");
      await checkHealthy(fixture, `account-recovery-open-${width}`);

      const requestsBefore = controls.entriesRequests;
      controls.entriesStatus = 401;
      await page.evaluate(() => {
        const previousNow = Date.now;
        Date.now = () => previousNow() + 61_000;
        window.dispatchEvent(new Event("focus"));
      });
      await expect(page.locator("#auth-title")).toHaveText("Entre na sua conta");
      await expect(page.getByText("Sua sessão terminou.", { exact: false })).toBeVisible();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText(syntheticRecoveryCode, { exact: true })).toHaveCount(0);
      assert.ok(controls.entriesRequests > requestsBefore, "A simulated expired-session response caused the transition.");
      assert.equal(controls.mutations.length, 1, "Session expiry must not rotate or invalidate the recovery code on the server.");
      await checkHealthy(fixture, `account-recovery-cleared-${width}`);

      controls.entriesStatus = 200;
      const auth = page.locator(".auth-card form");
      await auth.getByLabel("E-mail", { exact: true }).fill("synthetic-account@example.invalid");
      await auth.getByLabel("Senha", { exact: true }).fill(syntheticPassword);
      await auth.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.locator(".patient-navigation")).toBeVisible();
      await expect(page.locator(".patient-overview .overview-number")).toHaveText(["0", "0"]);
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText(syntheticRecoveryCode, { exact: true })).toHaveCount(0);
      assert.deepEqual(controls.mutations.map(({ method, path }) => `${method} ${path}`), [
        "POST /account/recovery-code", "POST /login",
      ], "Reauthentication performs only the explicit synthetic login, with no automatic write or code regeneration.");
      await checkHealthy(fixture, `account-recovery-reauthenticated-${width}`);
    });
  }
});
