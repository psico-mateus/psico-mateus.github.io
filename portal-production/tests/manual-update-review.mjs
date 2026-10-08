import assert from "node:assert/strict";
import { chromium, webkit } from "../../node_modules/@playwright/test/index.mjs";

const baseUrl = process.env.PORTAL_VISUAL_BASE_URL;
if (!baseUrl || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Use PORTAL_VISUAL_BASE_URL com um servidor local isolado.");
}

async function setup(page, role = null, initialBuild = "1111111111111111", responds = true) {
  await page.addInitScript(({ initialBuild, responds }) => {
    class Worker extends EventTarget {
      state = "installed";
      postMessage(message, ports) {
        if (message.type === "GET_BUILD_ID" && responds) ports?.[0]?.postMessage({ buildId: window.__waitingBuild });
        if (message.type === "SKIP_WAITING") window.__updateRequests += 1;
      }
    }
    const worker = new Worker();
    const registration = Object.assign(new EventTarget(), {
      waiting: worker,
      installing: null,
      update: async () => {},
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: async () => registration,
    });
    window.__waitingBuild = initialBuild;
    window.__updateRequests = 0;
    window.__registration = registration;
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  }, { initialBuild, responds });
  await page.route("**/api/portal/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/portal", "");
    const payload = path === "/config" ? {
      configured: true, pending: false,
      public_site_url: "https://psico-mateus.github.io/",
      guide_url: "https://psico-mateus.github.io/guia-emocoes/",
      privacy_version: "2026-10-08",
    } : path === "/session" ? {
      user: role ? { id: "synthetic-patient", name: "Teste", role } : null,
      csrf: "synthetic-csrf",
    } : path === "/entries" ? { entries: [] }
      : path === "/map-draft" ? { content_version: "mapa-pessoal-refinado-ouro-v1", generation: 1, fields: [] }
        : path === "/map-sharing" ? { shares: [] }
          : path === "/notices" ? { notices: [], unread_count: 0, next_cursor: null }
            : {};
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.goto(baseUrl);
  await page.getByText("Atualizações do aplicativo", { exact: true }).waitFor();
}

for (const [name, engine, width] of [["desktop", chromium, 1280], ["webkit-mobile", webkit, 390], ["webkit-small", webkit, 320]]) {
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page);
  const panel = page.locator(".app-updates-panel");
  await page.getByText("Nova versão disponível", { exact: true }).waitFor();
  assert.equal(await panel.getAttribute("open"), null, `${name}: aviso inicia recolhido`);
  assert.equal(await panel.evaluate((el) => getComputedStyle(el).position), "static", `${name}: sem sobreposição fixa`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: sem overflow`);
  await panel.locator("summary").click();
  await page.getByRole("button", { name: "Depois", exact: true }).click();
  assert.equal(await panel.getAttribute("open"), null);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(100);
  assert.equal(await page.getByText("Nova versão disponível", { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("area-paciente:update-dismissed:v1")), "1111111111111111");
  await page.reload();
  await panel.waitFor();
  await page.waitForTimeout(150);
  assert.equal(await page.getByText("Nova versão disponível", { exact: true }).count(), 0, `${name}: dispensa preservada após recarregar`);
  await panel.locator("summary").click();
  await page.getByRole("button", { name: "Atualizar agora", exact: true }).waitFor();
  await page.evaluate(() => { window.__waitingBuild = "2222222222222222"; window.dispatchEvent(new Event("focus")); });
  await page.getByText("Nova versão disponível", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Depois", exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("area-paciente:update-dismissed:v1")), "2222222222222222");
  assert.deepEqual(errors, [], `${name}: sem erro de execução`);
  await context.close();
  await browser.close();
  console.log(`PASS ${name}: atualização discreta, dispensa por versão e layout`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await setup(page, "patient");
  await page.getByRole("button", { name: "Registrar algo" }).click();
  const field = page.locator("#entry-title");
  await field.fill("Rascunho sintético preservado");
  const panel = page.locator(".app-updates-panel");
  await panel.locator("summary").click();
  let dialogs = 0;
  page.on("dialog", async (dialog) => { dialogs += 1; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Atualizar agora", exact: true }).click();
  assert.equal(dialogs, 1, "atualização pede confirmação para rascunho não salvo");
  assert.equal(await page.evaluate(() => window.__updateRequests), 0);
  assert.equal(await field.inputValue(), "Rascunho sintético preservado");
  await page.close();
  console.log("PASS rascunho: cancelar atualização preserva texto e não ativa worker");

  const legacy = await browser.newPage();
  await setup(legacy, null, "", false);
  await legacy.getByText("Nova versão disponível", { exact: true }).waitFor();
  await legacy.locator(".app-updates-panel summary").click();
  await legacy.getByRole("button", { name: "Depois", exact: true }).click();
  await legacy.evaluate(() => window.dispatchEvent(new Event("focus")));
  await legacy.waitForTimeout(1_100);
  assert.equal(await legacy.getByText("Nova versão disponível", { exact: true }).count(), 0, "worker antigo pode ser dispensado na sessão");
  await legacy.close();
  console.log("PASS compatibilidade: worker anterior sem identificador");

  const activation = await browser.newPage();
  await setup(activation);
  await activation.getByText("Nova versão disponível", { exact: true }).waitFor();
  await activation.locator(".app-updates-panel summary").click();
  await activation.getByRole("button", { name: "Atualizar agora", exact: true }).click();
  assert.equal(await activation.evaluate(() => window.__updateRequests), 1);
  const reloaded = activation.waitForEvent("load");
  await activation.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));
  await reloaded;
  await activation.getByText("Atualizações do aplicativo", { exact: true }).waitFor();
  await activation.close();
  console.log("PASS ativação: recarrega somente após pedido e troca de controller");

  const stalled = await browser.newPage();
  await setup(stalled);
  await stalled.getByText("Nova versão disponível", { exact: true }).waitFor();
  await stalled.locator(".app-updates-panel summary").click();
  await stalled.getByRole("button", { name: "Atualizar agora", exact: true }).click();
  await stalled.getByText("A atualização demorou mais que o esperado.", { exact: false }).waitFor({ timeout: 15_000 });
  assert.equal(await stalled.getByRole("button", { name: "Atualizar agora", exact: true }).isEnabled(), true);
  await stalled.close();
  console.log("PASS falha: worker sem resposta libera nova tentativa sem recarregar");
} finally { await browser.close(); }
