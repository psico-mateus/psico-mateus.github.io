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
      entriesStatus: 200, entriesRequests: 0, exportRequests: 0, mutations: [], unexpected: [],
      exportWait: null, exportStatus: 200, loginUser: patient,
      accountResponses: {},
      foreignRequests: [], runtimeErrors: [], expectedHttpFailures: [],
    };
    const fixture = { context, page, controls };
    fixtures.add(fixture);
    page.on("pageerror", error => controls.runtimeErrors.push(error.message));
    page.on("console", message => {
      if (!["error", "warning"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") return;
      if (/Failed to load resource: the server responded with a status of (?:400|401|503)\b/u.test(text)) {
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
      if (path === "/export" && method === "GET") {
        controls.exportRequests += 1;
        if (controls.exportWait) await controls.exportWait;
        if (controls.exportStatus !== 200) return respond({ error: "Falha sintética ao preparar a cópia." }, controls.exportStatus);
        return respond({ patient, entries: [], map_draft: { generation: 1, fields: [] }, notices: [] });
      }
      if (method !== "GET" && controls.accountResponses[path]) {
        const response = controls.accountResponses[path];
        if (response.wait) await response.wait;
        return respond(response.payload, response.status);
      }
      if (path === "/account/recovery-code" && method === "POST") {
        return respond({ recovery_code: syntheticRecoveryCode });
      }
      if (path === "/login" && method === "POST") {
        return respond({ user: controls.loginUser, csrf: "synthetic-account-reauthenticated-csrf" });
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

  function accountAction(page, title) {
    return page.locator(".patient-account-action").filter({
      has: page.getByText(title, { exact: true }),
    });
  }

  async function openAction(page, title) {
    const action = accountAction(page, title);
    await action.locator("summary").click();
    await expect(action).toHaveAttribute("open", "");
    return action;
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
      await expect(account.locator(".patient-account-group > h3")).toHaveText([
        "Acesso e recuperação", "Seus dados", "Ações da conta",
      ]);
      await expect(account.locator("input:visible")).toHaveCount(0);
      for (const action of await account.locator(".patient-account-action").all()) {
        const touchTarget = await action.locator("summary").boundingBox();
        assert.ok(touchTarget && touchTarget.width >= 44 && touchTarget.height >= 44,
          "The complete choice row is a full touch target.");
        await action.locator("summary").click();
      }
      const texts = await account.locator(".patient-account-panel > summary small, .patient-account-action-copy small, .field > label > span, .account-sessions p, .patient-account-actions p, .account-data-copy small")
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
      const recoveryForm = accountAction(page, "Código para recuperar a senha").locator("form");
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
    test(`account ${width}px: a chosen action opens by keyboard and preserves typed input when closed`, async () => {
      const fixture = await openAccount({ width, height: 900 });
      const { page, controls } = fixture;
      const action = accountAction(page, "Alterar senha");
      const summary = action.locator("summary");
      await expect(action.locator("form")).not.toBeVisible();
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(action.locator("form")).toBeVisible();
      await expect(summary).toBeFocused();
      await expect(summary).toHaveCSS("outline-style", "solid");
      await expect(summary.locator("svg")).toHaveCSS("transform", "matrix(-1, 0, 0, -1, 0, 0)");
      await action.getByLabel("Senha atual", { exact: true }).fill(syntheticPassword);
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(action.locator("form")).not.toBeVisible();
      await page.keyboard.press("Enter");
      await expect(action.getByLabel("Senha atual", { exact: true })).toHaveValue(syntheticPassword);
      await expect(action.getByRole("button", { name: "Mostrar senha atual", exact: true })).toBeVisible();
      assert.deepEqual(controls.mutations, [], "Choosing an action never performs an account mutation.");
      await checkHealthy(fixture, `account-action-keyboard-${width}`);
    });
  }

  test("account actions retain cancellation before closing sessions or deleting data", async () => {
    const fixture = await openAccount({ width: 390, height: 844 });
    const { page, controls } = fixture;
    for (const [title, buttonName, explanation] of [
      ["Sessões e dispositivos", "Encerrar em todos os dispositivos", "não serão apagados"],
      ["Excluir conta", "Excluir conta e registros", "não pode ser desfeita"],
    ]) {
      const action = await openAction(page, title);
      await action.getByLabel("Senha atual para confirmar", { exact: true }).fill(syntheticPassword);
      let confirmedPrompt = false;
      page.once("dialog", async dialog => {
        assert.equal(dialog.type(), "confirm");
        assert.ok(dialog.message().includes(explanation));
        confirmedPrompt = true;
        await dialog.dismiss();
      });
      await action.getByRole("button", { name: buttonName, exact: true }).click();
      assert.equal(confirmedPrompt, true);
      assert.deepEqual(controls.mutations, [], "Cancellation never sends an account mutation.");
      await expect(page.getByRole("heading", { level: 1, name: "Olá, Paciente Sintético.", exact: true })).toBeVisible();
      await action.locator("summary").click();
    }
    await checkHealthy(fixture, "account-critical-cancellation");
  });

  test("account data copy starts only on explicit action and keeps feedback in its section", async () => {
    const fixture = await openAccount({ width: 1366, height: 900 });
    const { page, controls } = fixture;
    const action = await openAction(page, "Baixar uma cópia");
    assert.equal(controls.exportRequests, 0);
    const downloadEvent = page.waitForEvent("download");
    await action.getByRole("button", { name: "Baixar cópia dos meus dados", exact: true }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), "meus-dados-area-do-paciente.json");
    await expect(action.getByText("Download iniciado. Procure o arquivo em Downloads.", { exact: true })).toBeVisible();
    assert.equal(controls.exportRequests, 1);
    assert.deepEqual(controls.mutations, []);
    await checkHealthy(fixture, "account-export-feedback");
  });

  async function observeExportCompletion(page, holdBody = false) {
    await page.evaluate((holdBody) => {
      const originalFetch = window.fetch.bind(window);
      const originalClick = HTMLAnchorElement.prototype.click;
      window.__accountExport = { completed: 0, bodyReady: false, clicks: 0, releaseBody: null };
      const bodyGate = holdBody ? new Promise((resolve) => { window.__accountExport.releaseBody = resolve; }) : Promise.resolve();
      HTMLAnchorElement.prototype.click = function () {
        if (this.download === "meus-dados-area-do-paciente.json") window.__accountExport.clicks += 1;
        return originalClick.call(this);
      };
      window.fetch = async (...args) => {
        if (args[0] !== "/api/portal/export") return originalFetch(...args);
        try {
          const response = await originalFetch(...args);
          const originalBlob = response.blob.bind(response);
          response.blob = async () => {
            const blob = await originalBlob();
            window.__accountExport.bodyReady = true;
            await bodyGate;
            window.__accountExport.completed += 1;
            return blob;
          };
          return response;
        } catch (error) {
          window.__accountExport.completed += 1;
          throw error;
        }
      };
    }, holdBody);
  }

  test("an intentional pending export stays single and completes if only its disclosure is closed", async () => {
    const fixture = await openAccount({ width: 390, height: 844 });
    const { page, controls } = fixture;
    let releaseExport;
    controls.exportWait = new Promise((resolve) => { releaseExport = resolve; });
    try {
      const action = await openAction(page, "Baixar uma cópia");
      const trigger = action.getByRole("button", { name: "Baixar cópia dos meus dados", exact: true });
      await trigger.click();
      await expect.poll(() => controls.exportRequests).toBe(1);
      await expect(action.getByRole("button", { name: "Preparando cópia…", exact: true })).toBeDisabled();
      await action.locator("button.account-export-link").evaluate((button) => { button.click(); button.click(); });
      assert.equal(controls.exportRequests, 1, "Repeated activation cannot duplicate the pending export.");
      await action.locator(":scope > summary").click();
      await expect(action).not.toHaveAttribute("open", "");
      const downloadEvent = page.waitForEvent("download");
      releaseExport();
      assert.equal((await downloadEvent).suggestedFilename(), "meus-dados-area-do-paciente.json");
      await expect(action.locator(".notice-success")).toHaveText("Download iniciado. Procure o arquivo em Downloads.");
      await expect(action.locator(".notice-success")).not.toBeVisible();
      await expect(action).not.toHaveAttribute("open", "");
      assert.equal(controls.exportRequests, 1);
      assert.deepEqual(controls.mutations, []);
      await action.locator(":scope > summary").click();
      await checkHealthy(fixture, "account-export-closed-disclosure");
    } finally { releaseExport(); }
  });

  test("a failed export keeps the explicit retry available without creating a private file", async () => {
    const fixture = await openAccount({ width: 1366, height: 900 });
    const { page, controls } = fixture;
    controls.exportStatus = 503;
    await observeExportCompletion(page);
    const action = await openAction(page, "Baixar uma cópia");
    const trigger = action.getByRole("button", { name: "Baixar cópia dos meus dados", exact: true });
    await trigger.click();
    await expect(action.getByRole("alert")).toHaveText("Falha sintética ao preparar a cópia.");
    await expect(action.getByRole("alert")).toBeFocused();
    await expect(trigger).toBeEnabled();
    assert.equal(await page.evaluate(() => window.__accountExport.clicks), 0);
    assert.equal(controls.exportRequests, 1);
    controls.exportStatus = 200;
    const downloadEvent = page.waitForEvent("download");
    await trigger.click();
    assert.equal((await downloadEvent).suggestedFilename(), "meus-dados-area-do-paciente.json");
    await expect(action.locator(".notice-success")).toHaveText("Download iniciado. Procure o arquivo em Downloads.");
    assert.equal(controls.exportRequests, 2, "Only the patient's explicit retry starts a second export.");
    assert.equal(await page.evaluate(() => window.__accountExport.clicks), 1);
    assert.deepEqual(controls.mutations, []);
    await checkHealthy(fixture, "account-export-error-retry");
  });

  async function expireAccountSession(fixture) {
    const { page, controls } = fixture;
    controls.entriesStatus = 401;
    await page.evaluate(() => {
      const originalNow = Date.now;
      Date.now = () => originalNow() + 61_000;
      window.dispatchEvent(new Event("focus"));
    });
    await expect(page.locator("#auth-title")).toHaveText("Entre na sua conta");
    await expect(page.locator(".patient-account-panel")).toHaveCount(0);
  }

  async function loginOtherAccount(fixture) {
    const { page, controls } = fixture;
    controls.entriesStatus = 200;
    controls.loginUser = { id: "synthetic-account-second", name: "Outra Pessoa Sintética", role: "patient" };
    const auth = page.locator(".auth-card form");
    await auth.getByLabel("E-mail", { exact: true }).fill("synthetic-account-second@example.invalid");
    await auth.getByLabel("Senha", { exact: true }).fill(syntheticPassword);
    await auth.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Olá, Outra Pessoa Sintética.", exact: true })).toBeVisible();
  }

  async function observeRecoveryCompletion(page, holdBody = false) {
    await page.evaluate((holdBody) => {
      const originalFetch = window.fetch.bind(window);
      window.__accountRecovery = { completed: 0, bodyReady: false, releaseBody: null };
      const bodyGate = holdBody ? new Promise((resolve) => { window.__accountRecovery.releaseBody = resolve; }) : Promise.resolve();
      window.fetch = async (...args) => {
        if (args[0] !== "/api/portal/account/recovery-code") return originalFetch(...args);
        try {
          const response = await originalFetch(...args);
          const originalJson = response.json.bind(response);
          response.json = async () => {
            const payload = await originalJson();
            window.__accountRecovery.bodyReady = true;
            await bodyGate;
            window.__accountRecovery.completed += 1;
            return payload;
          };
          return response;
        } catch (error) {
          window.__accountRecovery.completed += 1;
          throw error;
        }
      };
    }, holdBody);
  }

  for (const [label, status, otherLogin, holdBody] of [
    ["success-after-expiry", 200, false, false],
    ["success-after-other-login", 200, true, false],
    ["expired-error-after-other-login", 401, true, false],
    ["body-after-other-login", 200, true, true],
  ]) {
    test(`late recovery-code ${label} cannot reveal a previous account secret or end the new session`, async () => {
      const fixture = await openAccount({ width: 390, height: 844 });
      const { page, controls } = fixture;
      await observeRecoveryCompletion(page, holdBody);
      let releaseRecovery;
      controls.accountResponses["/account/recovery-code"] = {
        status,
        payload: status === 200 ? { recovery_code: syntheticRecoveryCode } : { error: "Sessão sintética anterior encerrada." },
        wait: holdBody ? null : new Promise((resolve) => { releaseRecovery = resolve; }),
      };
      try {
        const action = await openAction(page, "Código para recuperar a senha");
        await action.getByLabel("Senha atual", { exact: true }).fill(syntheticPassword);
        await action.getByRole("button", { name: "Criar novo código", exact: true }).click();
        await expect.poll(() => controls.mutations.filter(({ path }) => path === "/account/recovery-code").length).toBe(1);
        if (holdBody) await expect.poll(() => page.evaluate(() => window.__accountRecovery.bodyReady)).toBe(true);
        await expireAccountSession(fixture);
        if (otherLogin) await loginOtherAccount(fixture);
        if (holdBody) await page.evaluate(() => window.__accountRecovery.releaseBody());
        else releaseRecovery();
        await expect.poll(() => page.evaluate(() => window.__accountRecovery.completed)).toBe(1);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.getByRole("dialog", { name: "Seu código de recuperação", exact: true })).toHaveCount(0);
        await expect(page.getByText(syntheticRecoveryCode, { exact: true })).toHaveCount(0);
        if (otherLogin) await expect(page.getByRole("heading", { level: 1, name: "Olá, Outra Pessoa Sintética.", exact: true })).toBeVisible();
        else await expect(page.locator("#auth-title")).toHaveText("Entre na sua conta");
        assert.equal(controls.mutations.filter(({ path }) => path === "/account/recovery-code").length, 1,
          "An obsolete result never automatically creates another recovery code.");
        await checkHealthy(fixture, `account-recovery-late-${label}`);
      } finally {
        releaseRecovery?.();
        await page.evaluate(() => window.__accountRecovery?.releaseBody?.());
      }
    });
  }

  for (const holdBody of [false, true]) {
    test(`late export ${holdBody ? "body" : "response"} cannot download private data after session expiry${holdBody ? " and another account login" : ""}`, async () => {
      const fixture = await openAccount({ width: 390, height: 844 });
      const { page, controls } = fixture;
      await observeExportCompletion(page, holdBody);
      let releaseExport;
      controls.exportWait = holdBody ? null : new Promise((resolve) => { releaseExport = resolve; });
      try {
        const action = await openAction(page, "Baixar uma cópia");
        await action.getByRole("button", { name: "Baixar cópia dos meus dados", exact: true }).click();
        await expect.poll(() => controls.exportRequests).toBe(1);
        if (holdBody) await expect.poll(() => page.evaluate(() => window.__accountExport.bodyReady)).toBe(true);
        await expireAccountSession(fixture);
        if (holdBody) {
          await loginOtherAccount(fixture);
          await page.evaluate(() => window.__accountExport.releaseBody());
        } else releaseExport();
        await expect.poll(() => page.evaluate(() => window.__accountExport.completed)).toBe(1);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => window.__accountExport.clicks), 0,
          "An expired account must never start a private export, even when its response arrives after another login.");
        await expect(page.getByText("Download iniciado. Procure o arquivo em Downloads.", { exact: true })).toHaveCount(0);
        assert.equal(controls.exportRequests, 1, "No automatic export retry after session expiry.");
        await checkHealthy(fixture, `account-export-expired-${holdBody ? "body-other-login" : "response"}`);
      } finally {
        releaseExport?.();
        await page.evaluate(() => window.__accountExport?.releaseBody?.());
      }
    });
  }

  test("a recovery body released during session clearing cannot restore a secret to the guest screen", async () => {
    const fixture = await openAccount({ width: 390, height: 844 });
    const { page } = fixture;
    await observeRecoveryCompletion(page, true);
    const action = await openAction(page, "Código para recuperar a senha");
    await action.getByLabel("Senha atual", { exact: true }).fill(syntheticPassword);
    await action.getByRole("button", { name: "Criar novo código", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__accountRecovery.bodyReady)).toBe(true);
    await page.evaluate(() => {
      const originalScroll = window.scrollTo.bind(window);
      let released = false;
      window.scrollTo = (...args) => {
        originalScroll(...args);
        if (!released) {
          released = true;
          window.__accountRecovery.releaseBody();
        }
      };
    });
    await expireAccountSession(fixture);
    await expect.poll(() => page.evaluate(() => window.__accountRecovery.completed)).toBe(1);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByRole("dialog", { name: "Seu código de recuperação", exact: true })).toHaveCount(0);
    await expect(page.getByText(syntheticRecoveryCode, { exact: true })).toHaveCount(0);
    await checkHealthy(fixture, "account-recovery-session-clearing-microtask");
  });

  test("an export body released during session clearing cannot start a private download", async () => {
    const fixture = await openAccount({ width: 390, height: 844 });
    const { page } = fixture;
    await observeExportCompletion(page, true);
    const action = await openAction(page, "Baixar uma cópia");
    await action.getByRole("button", { name: "Baixar cópia dos meus dados", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__accountExport.bodyReady)).toBe(true);
    await page.evaluate(() => {
      const originalScroll = window.scrollTo.bind(window);
      let released = false;
      window.scrollTo = (...args) => {
        originalScroll(...args);
        if (!released) {
          released = true;
          window.__accountExport.releaseBody();
        }
      };
    });
    await expireAccountSession(fixture);
    await expect.poll(() => page.evaluate(() => window.__accountExport.completed)).toBe(1);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.__accountExport.clicks), 0,
      "Session invalidation must stop the old response before React commits the guest screen.");
    await checkHealthy(fixture, "account-export-session-clearing-microtask");
  });

  test("an export body released by the session-transition DOM commit cannot start a private download", async () => {
    const fixture = await openAccount({ width: 390, height: 844 });
    const { page, controls } = fixture;
    await observeExportCompletion(page, true);
    const action = await openAction(page, "Baixar uma cópia");
    await action.getByRole("button", { name: "Baixar cópia dos meus dados", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__accountExport.bodyReady)).toBe(true);
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector("#auth-title")) return;
        observer.disconnect();
        window.__accountExport.releaseBody();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await expireAccountSession(fixture);
    await expect.poll(() => page.evaluate(() => window.__accountExport.completed)).toBe(1);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.__accountExport.clicks), 0,
      "The account is already gone when the guest DOM is committed, before any later response continuation.");
    assert.equal(controls.exportRequests, 1);
    await checkHealthy(fixture, "account-export-session-transition-commit");
  });

  for (const [label, viewport, enlarged] of [
    ["390", { width: 390, height: 844 }, false],
    ["desktop", { width: 1366, height: 900 }, false],
    ["text-200", { width: 1402, height: 1000 }, true],
  ]) {
    test(`account ${label}: password feedback stays beside the form and keeps the field error linked`, async () => {
      const fixture = await openAccount(viewport);
      const { page, controls } = fixture;
      if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const action = await openAction(page, "Alterar senha");
      await action.getByLabel("Senha atual", { exact: true }).fill(syntheticPassword);
      await action.getByLabel("Nova senha ou frase-senha", { exact: true }).fill("nova-frase-sintetica-1");
      const confirmation = action.getByLabel("Repita a nova senha", { exact: true });
      await confirmation.fill("outra-frase-sintetica-2");
      const submit = action.getByRole("button", { name: "Alterar senha", exact: true });
      await submit.click();
      const message = action.locator("#account-password-message");
      await expect(message).toHaveText("As novas senhas não coincidem.");
      await expect(confirmation).toBeFocused();
      await expect(confirmation).toHaveAttribute("aria-invalid", "true");
      await expect(confirmation).toHaveAccessibleDescription("As novas senhas não coincidem.");
      assert.equal(await message.evaluate(element => element.closest("form")?.contains(element)), true);
      assert.deepEqual(controls.mutations, [], "A mismatch is rejected locally without changing account data.");
      await confirmation.fill("nova-frase-sintetica-1");
      await expect(message).toHaveCount(0);
      await expect(confirmation).not.toHaveAttribute("aria-invalid");

      controls.accountResponses["/account/password"] = { status: 400, payload: { error: "Não foi possível confirmar a senha sintética." } };
      await submit.click();
      await expect(message).toHaveText("Não foi possível confirmar a senha sintética.");
      await expect(message).toBeFocused();
      await expect(action.getByLabel("Senha atual", { exact: true })).toHaveValue(syntheticPassword);
      await checkHealthy(fixture, `account-password-feedback-${label}`);

      controls.accountResponses["/account/password"] = { status: 200, payload: {} };
      await submit.click();
      await expect(action.getByRole("status").filter({ hasText: "Senha alterada." })).toBeVisible();
      await expect(action.locator(".notice-error")).toHaveCount(0);
      await expect(action.getByLabel("Senha atual", { exact: true })).toHaveValue("");
      assert.deepEqual(controls.mutations.map(({ method, path }) => `${method} ${path}`), ["PATCH /account/password", "PATCH /account/password"]);
    });
  }

  test("account errors remain attached to their own action when requests finish in another order", async () => {
    const fixture = await openAccount({ width: 390, height: 844 });
    const { page, controls } = fixture;
    let finishRecovery;
    const recoveryWait = new Promise(resolve => { finishRecovery = resolve; });
    controls.accountResponses["/account/recovery-code"] = {
      status: 400, payload: { error: "Não foi possível criar o código sintético." }, wait: recoveryWait,
    };
    controls.accountResponses["/account/sessions"] = {
      status: 400, payload: { error: "Não foi possível encerrar as sessões sintéticas." },
    };
    controls.accountResponses["/account"] = {
      status: 400, payload: { error: "Não foi possível excluir a conta sintética." },
    };
    const recovery = await openAction(page, "Código para recuperar a senha");
    await recovery.getByLabel("Senha atual", { exact: true }).fill(syntheticPassword);
    await recovery.getByRole("button", { name: "Criar novo código", exact: true }).focus();
    await page.keyboard.press("Enter");
    const pendingButton = recovery.getByRole("button", { name: "Gerando código…", exact: true });
    await expect(pendingButton).toBeDisabled();
    await expect(pendingButton).toBeFocused();
    await page.keyboard.press("Enter");
    assert.equal(controls.mutations.length, 1, "The busy form retains keyboard focus without creating another recovery code.");
    const sessions = await openAction(page, "Sessões e dispositivos");
    await sessions.getByLabel("Senha atual para confirmar", { exact: true }).fill(syntheticPassword);
    page.once("dialog", async dialog => { await dialog.accept(); });
    await sessions.getByRole("button", { name: "Encerrar em todos os dispositivos", exact: true }).click();
    await expect(sessions.getByRole("alert")).toHaveText("Não foi possível encerrar as sessões sintéticas.");
    await expect(sessions.getByRole("alert")).toBeFocused();
    finishRecovery();
    await expect(recovery.getByRole("alert")).toHaveText("Não foi possível criar o código sintético.");
    await expect(sessions.getByRole("alert")).toHaveText("Não foi possível encerrar as sessões sintéticas.");
    await expect(sessions.getByRole("alert")).toBeFocused();
    await expect(page.locator(".patient-account-panel > .notice")).toHaveCount(0);

    const deletion = await openAction(page, "Excluir conta");
    await deletion.getByLabel("Senha atual para confirmar", { exact: true }).fill(syntheticPassword);
    page.once("dialog", async dialog => { await dialog.accept(); });
    await deletion.getByRole("button", { name: "Excluir conta e registros", exact: true }).click();
    await expect(deletion.getByRole("alert")).toHaveText("Não foi possível excluir a conta sintética.");
    await expect(deletion.getByRole("alert")).toBeFocused();
    await expect(recovery.getByRole("alert")).toHaveText("Não foi possível criar o código sintético.");
    await expect(sessions.getByRole("alert")).toHaveText("Não foi possível encerrar as sessões sintéticas.");
    assert.deepEqual(controls.mutations.map(({ method, path }) => `${method} ${path}`), [
      "POST /account/recovery-code", "DELETE /account/sessions", "DELETE /account",
    ]);
    await checkHealthy(fixture, "account-independent-errors");
  });

  test("a late account error stays inside a closed action without taking focus from navigation", async () => {
    const fixture = await openAccount({ width: 390, height: 844 });
    const { page, controls } = fixture;
    let finishRecovery;
    const wait = new Promise(resolve => { finishRecovery = resolve; });
    controls.accountResponses["/account/recovery-code"] = {
      status: 400, payload: { error: "Falha sintética depois de fechar a ação." }, wait,
    };
    try {
      const action = await openAction(page, "Código para recuperar a senha");
      await action.getByLabel("Senha atual", { exact: true }).fill(syntheticPassword);
      await action.getByRole("button", { name: "Criar novo código", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(action.getByRole("button", { name: "Gerando código…", exact: true })).toBeFocused();
      await action.locator(":scope > summary").click();
      await expect(action).not.toHaveAttribute("open", "");
      const navigation = page.locator(".patient-navigation").getByRole("button", { name: "Início", exact: true });
      await navigation.focus();
      finishRecovery();
      await expect(action.locator(".notice-error")).toHaveText("Falha sintética depois de fechar a ação.");
      await expect(action.locator(".notice-error")).not.toBeVisible();
      await expect(navigation).toBeFocused();
      await expect(action).not.toHaveAttribute("open", "");
      assert.equal(controls.mutations.length, 1);
      await checkHealthy(fixture, "account-late-error-closed-action");
    } finally {
      finishRecovery();
    }
  });

  for (const width of [390, 1366]) {
    test(`account ${width}px: session expiry removes an open recovery secret and login never resurrects it`, async () => {
      const fixture = await openAccount({ width, height: 900 });
      const { page, controls } = fixture;
      const action = await openAction(page, "Código para recuperar a senha");
      const form = action.locator("form");
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
