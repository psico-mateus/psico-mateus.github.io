import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const guidePath = "/guia-emocoes/";
const draftKey = "guia-emocoes-rascunho-v1";
const recoveryPrefix = `${draftKey}-recuperacao-`;
const moduleUrl = "https://psico-mateus.github.io/assets/EmotionGuideApp-BiKEL11_.js";

function memoryStorage(initial = [], fail = () => false) {
  const values = new Map(initial);
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (fail(key)) throw new Error("QuotaExceededError");
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    values,
  };
}

async function draftHelpers(storage) {
  const source = await readFile("assets/EmotionGuideApp-BiKEL11_.js", "utf8");
  const runnable = source
    .replace(/^import[^;]+;import[^;]+;/u, "")
    .replace(/export\{h as default\};\s*$/u, "");
  const context = {
    e: value => value, t: () => ({}), n: () => ({}),
    window: { localStorage: storage },
  };
  runInNewContext(runnable, context);
  return context;
}

test("os módulos embutidos do Guia permanecem idênticos aos assets", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação estrutural única.");
  const html = await readFile("guia-emocoes/index.html", "utf8");
  const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/u)[1]).imports;
  expect(Object.keys(imports)).toHaveLength(5);
  for (const [url, encoded] of Object.entries(imports)) {
    const file = `assets/${url.split("/").at(-1)}`;
    expect(Buffer.from(encoded.split(",")[1], "base64").toString("utf8"), file)
      .toBe(await readFile(file, "utf8"));
  }
  expect(imports[moduleUrl]).toBeTruthy();
});

test("normalização preserva textos, emoções antigas e campos extras", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Função pura verificada uma vez.");
  const helpers = await draftHelpers(memoryStorage());
  const input = {
    happened: "  Texto fictício com espaços\n<exemplo>  ", body: "", thoughts: "Texto fictício.",
    urge: "", emotions: ["Gratidão", "Nome antigo preservado"], intensity: 0,
    message: "Conteúdo fictício completo.", legacyExtra: { note: "Campo antigo fictício." },
  };
  const result = helpers.normalizeGuideDraft(input);
  expect(JSON.parse(JSON.stringify(result.draft))).toEqual(input);
  expect(result.repaired).toBe(false);
});

for (const emotions of [null, "Gratidão", { legacy: "Emoção fictícia" }]) {
  test(`esquema antigo seguro: emotions=${JSON.stringify(emotions)}`, async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Função pura verificada uma vez.");
    const raw = JSON.stringify({ happened: "Texto fictício que deve continuar inteiro.", emotions, intensity: "8" });
    const storage = memoryStorage([[draftKey, raw]]);
    const helpers = await draftHelpers(storage);
    const result = helpers.restoreGuideDraft();
    expect(result.protected).toBe(false);
    expect(result.draft.happened).toBe("Texto fictício que deve continuar inteiro.");
    expect(Array.isArray(result.draft.emotions)).toBe(true);
    expect(result.draft.intensity).toBe(8);
    expect([...storage.values].find(([key]) => key.startsWith(recoveryPrefix))?.[1]).toBe(raw);
    expect(storage.getItem(draftKey)).toBe(raw);
  });
}

test("JSON ilegível preserva original e não sobrescreve se a cópia local falhar", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Função pura verificada uma vez.");
  const raw = '{"happened":"Rascunho fictício incompleto';
  const storage = memoryStorage([[draftKey, raw]], key => key.startsWith(recoveryPrefix));
  const helpers = await draftHelpers(storage);
  const result = helpers.restoreGuideDraft();
  expect(result.protected).toBe(true);
  expect(result.state).toBe("unavailable");
  expect(result.notice).toContain("mantido intacto");
  expect(storage.getItem(draftKey)).toBe(raw);
  expect(storage.length).toBe(1);
});

test("apagar remove só rascunho e cópias de recuperação do Guia", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Função pura verificada uma vez.");
  const storage = memoryStorage([
    [draftKey, "{}"], [`${recoveryPrefix}teste`, "original fictício"], ["outro-recurso", "preservar"],
  ]);
  const helpers = await draftHelpers(storage);
  expect(helpers.clearGuideDraftStorage()).toBe(true);
  expect(storage.getItem(draftKey)).toBeNull();
  expect(storage.getItem(`${recoveryPrefix}teste`)).toBeNull();
  expect(storage.getItem("outro-recurso")).toBe("preservar");
});

test("esquema inválido não derruba a tela e conserva o original no aparelho", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/404.html");
  const raw = JSON.stringify({ happened: "Rascunho inteiramente fictício.\nSegunda linha.", emotions: null });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: draftKey, raw });
  await page.goto(guidePath);
  await expect(page.getByRole("textbox", { name: "O que aconteceu?", exact: true }))
    .toHaveValue("Rascunho inteiramente fictício.\nSegunda linha.");
  await expect(page.locator(".guide-storage-notice")).toContainText("original também foi preservado");
  await expect(page.locator(".local-save-note")).toHaveAttribute("data-save-state", "saved");
  expect(await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix))
    .map(key => localStorage.getItem(key)), recoveryPrefix)).toEqual([raw]);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "O que aconteceu?", exact: true }))
    .toHaveValue("Rascunho inteiramente fictício.\nSegunda linha.");
  expect(errors).toEqual([]);
});

test("quota cheia informa que a escrita não foi salva e preserva o rascunho anterior", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/404.html");
  const original = JSON.stringify({ happened: "Rascunho fictício salvo antes do teste.", emotions: [] });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: draftKey, value: original });
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException("Teste fictício", "QuotaExceededError"); };
  });
  await page.goto(guidePath);
  const status = page.locator(".local-save-note");
  await expect(status).toHaveAttribute("data-save-state", "unavailable");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toContainText("Rascunho só nesta página");
  await expect(status).not.toContainText("Rascunho salvo neste aparelho");
  await page.getByRole("textbox", { name: "O que aconteceu?", exact: true }).fill("Alteração fictícia não salva.");
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey)).toBe(original);
  expect(errors).toEqual([]);
});

test("leitura do armazenamento bloqueada não substitui um rascunho que não foi lido", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__guideTestWrites = 0;
    Storage.prototype.getItem = function () { throw new DOMException("Teste fictício", "SecurityError"); };
    Storage.prototype.setItem = function () { window.__guideTestWrites++; };
  });
  await page.goto(guidePath);
  await expect(page.locator(".local-save-note")).toHaveAttribute("data-save-state", "unavailable");
  await page.getByRole("textbox", { name: "O que aconteceu?", exact: true }).fill("Alteração fictícia temporária.");
  expect(await page.evaluate(() => window.__guideTestWrites)).toBe(0);
  expect(errors).toEqual([]);
});

test("confirmar apagar também remove a cópia recuperável sem tocar em outros dados", async ({ page }) => {
  await page.goto("/404.html");
  await page.evaluate(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ happened: "Exemplo fictício para apagar.", emotions: "Gratidão" }));
    localStorage.setItem("outro-recurso-teste", "preservar");
  }, { key: draftKey });
  await page.goto(guidePath);
  await expect(page.locator(".guide-storage-notice")).toBeVisible();
  for (let index = 0; index < 6; index++) await page.locator(".record-actions button").last().click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Apagar e começar outro", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "O que aconteceu?", exact: true })).toHaveValue("");
  await expect.poll(() => page.evaluate(prefix => Object.keys(localStorage)
    .filter(key => key.startsWith(prefix)), recoveryPrefix)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("outro-recurso-teste"))).toBe("preservar");
});

async function openSummary(page) {
  await page.goto(guidePath);
  await page.locator(".guide-filter-label").waitFor();
  await page.getByRole("link", { name: "Ainda não sei o que sinto", exact: true }).click();
  await page.getByRole("textbox", { name: "O que aconteceu?", exact: true }).fill("Conteúdo fictício para testar cópia.");
  for (let index = 0; index < 6; index++) await page.locator(".record-actions button").last().click();
  await expect(page.locator(".record-summary")).toBeVisible();
}

test("resumo não corta palavras longas e preserva as quebras do texto escrito", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openSummary(page);
  await page.reload();
  const text = `Texto fictício com uma referência longa:\nhttps://exemplo.test/${"a".repeat(180)}\nSegunda linha preservada.`;
  await page.getByRole("textbox", { name: "O que aconteceu?", exact: true }).fill(text);
  for (let index = 0; index < 6; index++) await page.locator(".record-actions button").last().click();
  const written = page.locator(".record-summary dd").first();
  await expect(written).toHaveText(text);
  const dimensions = await written.evaluate(element => {
    const summary = element.closest(".record-summary");
    return { width: element.clientWidth, scroll: element.scrollWidth,
      right: element.getBoundingClientRect().right,
      containerRight: summary.getBoundingClientRect().right - parseFloat(getComputedStyle(summary).paddingRight) };
  });
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.containerRight + 1);
});

for (const fallbackWorks of [true, false]) {
  test(`Clipboard recusado: fallback ${fallbackWorks ? "funciona" : "falha com aviso"}`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript((fallbackWorks) => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: async () => { throw new DOMException("Teste fictício", "NotAllowedError"); } },
      });
      document.execCommand = () => {
        window.__guideFallbackCalled = true;
        window.__guideFallbackText = document.querySelector('textarea[aria-label="Resumo da exploração para copiar"]')?.value;
        return fallbackWorks;
      };
    }, fallbackWorks);
    await openSummary(page);
    const copy = page.getByRole("button", { name: "Copiar resumo", exact: true });
    // Safari não foca botões por clique do mouse; verifica o retorno do foco de teclado.
    await copy.focus();
    await copy.press("Enter");
    const status = page.locator(".guide-copy-status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toContainText(fallbackWorks ? "Resumo copiado." : "Não foi possível copiar.");
    expect(await page.evaluate(() => window.__guideFallbackCalled)).toBe(true);
    expect(await page.evaluate(() => window.__guideFallbackText)).toContain("Conteúdo fictício para testar cópia.");
    await expect(page.locator('textarea[aria-label="Resumo da exploração para copiar"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: fallbackWorks ? "Resumo copiado" : "Copiar resumo", exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("sem link ou etiqueta de exploração, o aprimoramento não lança erro", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(guidePath);
  await page.locator(".guide-filter-label").waitFor();
  await page.evaluate(() => {
    document.querySelector('main > header nav a[href="#registrar"]')?.remove();
    document.querySelector(".record-intro .eyebrow")?.remove();
  });
  await page.getByRole("searchbox", { name: "Buscar no guia", exact: true }).fill("Gratidão");
  await expect(page.getByRole("button", { name: "Abrir detalhes de Gratidão", exact: true })).toBeVisible();
  expect(await page.locator(".emotion-card").count()).toBeLessThan(25);
  await expect(page.locator('footer a[href="/privacidade/"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

for (const status of [200, 404, 503]) {
  test(`SW respeita HTTP ${status} e usa cache somente para falha temporária`, async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Worker puro verificado uma vez.");
    const source = await readFile("guia-emocoes/sw.js", "utf8");
    const handlers = {};
    const cached = { status: 200, fromCache: true };
    const network = { status, ok: status === 200, clone() { return this; } };
    const context = {
      URL,
      self: { location: { origin: "https://psico-mateus.github.io" }, addEventListener: (name, fn) => { handlers[name] = fn; } },
      caches: { match: async () => cached, open: async () => ({ put: async () => {} }) },
      fetch: async () => network,
    };
    runInNewContext(source, context);
    let response;
    handlers.fetch({ request: { url: "https://psico-mateus.github.io/guia-emocoes/", method: "GET", mode: "navigate" },
      respondWith(promise) { response = promise; }, waitUntil() {} });
    expect(await response).toBe(status === 503 ? cached : network);
  });
}
