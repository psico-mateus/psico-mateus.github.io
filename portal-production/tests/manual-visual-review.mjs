import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "../../node_modules/@playwright/test/index.mjs";
import axe from "axe-core";

const baseUrl = process.env.PORTAL_VISUAL_BASE_URL;
if (!baseUrl) {
  throw new Error("Defina PORTAL_VISUAL_BASE_URL para um servidor local isolado.");
}
const visualHost = new URL(baseUrl).hostname;
if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(visualHost)) {
  throw new Error("A revisão visual aceita somente localhost ou 127.0.0.1.");
}
const outputDir = resolve(process.env.PORTAL_VISUAL_OUTPUT ?? "/tmp/area-paciente-visual-review");

const now = "2026-08-01T18:00:00.000Z";
const entries = [
  {
    id: "synthetic-private",
    title: "Uma situação do dia",
    happened: "Uma situação cotidiana criada somente para revisão visual.",
    body: "",
    thoughts: "",
    urge: "",
    emotion: "Insegurança",
    intensity: 5,
    message: "",
    created_at: now,
    updated_at: now,
    shared_at: null,
    revoked_at: null,
    viewed_at: null,
  },
  {
    id: "synthetic-viewed",
    title: "Algo que quis registrar",
    happened: "Conteúdo sintético e neutro para testar a interface.",
    body: "",
    thoughts: "",
    urge: "",
    emotion: "Alívio",
    intensity: 4,
    message: "",
    created_at: "2026-07-30T16:00:00.000Z",
    updated_at: "2026-07-30T16:00:00.000Z",
    shared_at: "2026-07-30T16:05:00.000Z",
    revoked_at: null,
    viewed_at: "2026-07-31T14:00:00.000Z",
  },
  {
    id: "synthetic-unseen",
    title: "Um ponto para lembrar",
    happened: "Outro conteúdo sintético e neutro.",
    body: "",
    thoughts: "",
    urge: "",
    emotion: "Dúvida",
    intensity: 6,
    message: "",
    created_at: "2026-07-29T13:00:00.000Z",
    updated_at: "2026-07-29T13:00:00.000Z",
    shared_at: "2026-07-29T13:10:00.000Z",
    revoked_at: null,
    viewed_at: null,
  },
];

async function assertAccessible(page, label) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target).slice(0, 4),
    }));
  });

  if (violations.length > 0) {
    throw new Error(`${label}: falhas automáticas de acessibilidade ${JSON.stringify(violations)}`);
  }
}

async function assertViewportFits(page, label) {
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.innerWidth) {
    throw new Error(`${label}: overflow horizontal ${dimensions.scrollWidth}px > ${dimensions.innerWidth}px`);
  }
  return dimensions;
}

async function reviewScreen(page, label, screenshotName) {
  await assertAccessible(page, label);
  await assertViewportFits(page, label);
  const captureStyle = await page.addStyleTag({
    content:
      ".site-header{position:relative!important;top:auto!important}" +
      ".skip-link{display:none!important}",
  });
  try {
    await page.screenshot({ path: resolve(outputDir, screenshotName), fullPage: true });
  } finally {
    await captureStyle.evaluate((element) => element.remove());
  }
}

function trackRuntimeErrors(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return () => {
    if (errors.length > 0) {
      throw new Error(`${label}: erros no navegador ${JSON.stringify(errors)}`);
    }
  };
}

async function routePortal(page, sessionRole = "patient") {
  let mapGeneration = 1;
  const mapFields = new Map();
  await page.route("**/api/portal/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/portal/, "");
    if (path === "/config") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          pending: false,
          public_site_url: "https://psico-mateus.github.io/",
          guide_url: "https://psico-mateus.github.io/guia-emocoes/",
          care_url: "https://psico-mateus.github.io/cuidados/",
          privacy_version: "2026-07-29",
        }),
      });
      return;
    }
    if (path === "/session") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          user: sessionRole === "patient"
            ? { id: "patient-synthetic", name: "Paciente", role: "patient" }
            : null,
          csrf: sessionRole === "patient" ? "csrf-synthetic" : undefined,
        }),
      });
      return;
    }
    if (path === "/entries") {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "synthetic-created" }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ entries }),
      });
      return;
    }
    if (path === "/map-draft") {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            content_version: "mapa-pessoal-refinado-ouro-v1",
            generation: mapGeneration,
            fields: Array.from(mapFields.values()),
          }),
        });
        return;
      }
      if (method === "PATCH") {
        const body = route.request().postDataJSON();
        const key = `${body.field.type}:${body.field.id}`;
        const previous = mapFields.get(key);
        const field = {
          ...body.field,
          revision: (previous?.revision ?? 0) + 1,
          updated_at: now,
        };
        mapFields.set(key, field);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            content_version: "mapa-pessoal-refinado-ouro-v1",
            generation: mapGeneration,
            field,
            idempotent: false,
          }),
        });
        return;
      }
      if (method === "DELETE") {
        mapGeneration += 1;
        mapFields.clear();
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            content_version: "mapa-pessoal-refinado-ouro-v1",
            generation: mapGeneration,
            cleared_at: now,
            idempotent: false,
          }),
        });
        return;
      }
    }
    await route.fulfill({ status: 204, body: "" });
  });
}

async function reviewGuest(browserType, label, viewport) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const assertNoRuntimeErrors = trackRuntimeErrors(page, label);
  await routePortal(page, "guest");
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Acompanhe seu processo/ }).waitFor();
  await reviewScreen(page, `${label}-acesso`, `${label}-acesso.png`);

  if (viewport.width <= 850) {
    const shortcut = page.getByRole("link", { name: /Entrar ou criar conta/ });
    await shortcut.click();
    await page.waitForFunction(() => document.activeElement?.id === "acesso");
    const authBox = await page.locator("#acesso").boundingBox();
    const headerBox = await page.locator(".site-header").boundingBox();
    const visibleTop = headerBox && headerBox.y >= 0 ? headerBox.y + headerBox.height : 0;
    if (!authBox || authBox.y < visibleTop - 1 || authBox.y >= viewport.height) {
      throw new Error(
        `${label}: o atalho não levou o acesso para a área visível ` +
        `(acesso=${authBox?.y ?? "ausente"}, topo útil=${visibleTop}, altura=${viewport.height})`,
      );
    }
  }

  const dimensions = await assertViewportFits(page, `${label}-acesso-final`);
  assertNoRuntimeErrors();
  await browser.close();
  return dimensions;
}

async function review(browserType, label, viewport) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const assertNoRuntimeErrors = trackRuntimeErrors(page, label);
  await routePortal(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Olá, Paciente." }).waitFor();
  await reviewScreen(page, `${label}-inicio`, `${label}-inicio.png`);

  await page.getByRole("button", { name: /Registrar algo/ }).click();
  await page.getByRole("heading", { name: "O que você quer guardar?", exact: true }).waitFor();
  await page.getByLabel("Título breve").fill("Rascunho preservado");
  await page.getByLabel("O que aconteceu?").fill("Texto sintético que deve continuar na tela.");
  await page.getByRole("button", { name: "Recursos", exact: true }).click();
  await page.getByRole("heading", { name: "Recursos", exact: true }).waitFor();
  await page.getByRole("button", { name: "Meus registros", exact: true }).click();
  await page.getByRole("heading", { name: "Seu registro continua guardado.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continuar escrevendo", exact: true }).click();
  if (
    await page.getByLabel("Título breve").inputValue() !== "Rascunho preservado" ||
    await page.getByLabel("O que aconteceu?").inputValue() !== "Texto sintético que deve continuar na tela."
  ) {
    throw new Error(`${label}: o rascunho não foi preservado entre as áreas`);
  }
  await page.getByRole("button", { name: "Meus registros", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await page.getByRole("heading", { name: "Meus registros", exact: true }).waitFor();

  await page.getByRole("button", { name: "Meu mapa", exact: true }).click();
  await page.getByRole("heading", { name: "Meu mapa", exact: true }).waitFor();
  await reviewScreen(page, `${label}-meu-mapa`, `${label}-meu-mapa.png`);
  await page.locator("#patient-map-card-meu-jeito").click();
  await page.getByRole("heading", { name: "Ter tempo sozinho", exact: true }).waitFor();
  await page.getByLabel("Combina comigo", { exact: true }).check();
  await page.getByText(/O que realmente recupera você/).waitFor();
  await reviewScreen(page, `${label}-meu-mapa-item`, `${label}-meu-mapa-item.png`);
  await page.getByRole("button", { name: "Ver resumo deste mapa", exact: true }).click();
  await page.getByRole("heading", { name: "Resumo de Meu jeito", exact: true }).waitFor();
  await reviewScreen(page, `${label}-meu-mapa-resumo`, `${label}-meu-mapa-resumo.png`);
  await page.getByRole("button", { name: "Escolher outro mapa", exact: true }).click();
  await page.getByRole("heading", { name: "Meu mapa", exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "patient-map-card-meu-jeito");
  const returnedMapFocus = await page.evaluate(() => document.activeElement?.id);
  if (returnedMapFocus !== "patient-map-card-meu-jeito") {
    throw new Error(`${label}: o foco não voltou ao cartão do mapa (${returnedMapFocus ?? "sem foco"})`);
  }

  await page.getByRole("button", { name: "Recursos", exact: true }).click();
  await page.getByRole("heading", { name: "Recursos", exact: true }).waitFor();
  await reviewScreen(page, `${label}-recursos`, `${label}-recursos.png`);
  await page.getByRole("button", { name: "Ver ferramentas", exact: true }).click();
  await page.getByRole("heading", { name: "Ferramentas do dia a dia", exact: true }).waitFor();
  await reviewScreen(page, `${label}-ferramentas`, `${label}-ferramentas.png`);
  const firstToolButton = page.locator(".patient-tool-card button").first();
  const firstToolLabel = await firstToolButton.getAttribute("aria-label");
  await firstToolButton.click();
  await page.locator(".patient-tool-detail h1").waitFor();
  await reviewScreen(page, `${label}-ferramenta`, `${label}-ferramenta.png`);
  await page.getByRole("button", { name: "Voltar às ferramentas", exact: true }).click();
  if (firstToolLabel) {
    await page.waitForFunction(
      (expectedLabel) => document.activeElement?.getAttribute("aria-label") === expectedLabel,
      firstToolLabel,
    );
  }
  if (firstToolLabel && (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) !== firstToolLabel) {
    throw new Error(`${label}: o foco não voltou à ferramenta que foi aberta`);
  }
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Recursos", exact: true }).waitFor();
  if (await page.locator(".patient-tool-detail").count()) {
    throw new Error(`${label}: o botão Voltar do navegador reabriu a ferramenta fechada`);
  }
  await page.getByRole("button", { name: "Ver leituras", exact: true }).click();
  await page.getByRole("heading", { name: "Leitura complementar", exact: true }).waitFor();
  await reviewScreen(page, `${label}-leituras`, `${label}-leituras.png`);

  await page.goto(`${baseUrl}#recursos`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Recursos", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ver leituras", exact: true }).click();
  const firstArticleButton = page.locator(".education-card button").first();
  const firstArticleLabel = await firstArticleButton.getAttribute("aria-label");
  await firstArticleButton.click();
  const articleTitle = await page.locator(".education-article h1").textContent();
  const articleHash = await page.evaluate(() => window.location.hash);
  if (!articleTitle || !articleHash.startsWith("#recursos/leituras/")) {
    throw new Error(`${label}: o artigo não criou um endereço restaurável`);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: articleTitle, exact: true }).waitFor();
  if (await page.getByRole("button", { name: "Voltar aos recursos", exact: true }).count()) {
    throw new Error(`${label}: artigo exibiu dois caminhos de retorno ao mesmo tempo`);
  }
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Leitura complementar", exact: true }).waitFor();
  if (
    firstArticleLabel &&
    (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) !== firstArticleLabel
  ) {
    throw new Error(`${label}: o foco não voltou à leitura após usar Voltar no navegador`);
  }
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Recursos", exact: true }).waitFor();

  await page.getByRole("button", { name: "Meus registros", exact: true }).click();
  await page.getByRole("heading", { name: "Meus registros" }).waitFor();
  await reviewScreen(page, `${label}-historico`, `${label}-historico.png`);
  await page.getByRole("button", { name: "Novo registro", exact: true }).click();
  await page.getByRole("heading", { name: "O que você quer guardar?", exact: true }).waitFor();
  await reviewScreen(page, `${label}-novo-registro`, `${label}-novo-registro.png`);
  await page.getByLabel("Título breve").fill("Registro visual sintético");
  await page.getByLabel("O que aconteceu?").fill("Conteúdo neutro usado somente no teste local.");
  const saveRequest = page.waitForRequest((request) =>
    request.method() === "POST" && new URL(request.url()).pathname === "/api/portal/entries"
  );
  await page.getByRole("button", { name: "Salvar agora como privado", exact: true }).click();
  const savePayload = (await saveRequest).postDataJSON();
  if (
    savePayload.title !== "Registro visual sintético" ||
    savePayload.happened !== "Conteúdo neutro usado somente no teste local."
  ) {
    throw new Error(`${label}: o salvamento antecipado não preservou os campos necessários`);
  }
  await page.getByText("Registro salvo de forma privada.", { exact: true }).waitFor();
  const dimensions = await assertViewportFits(page, `${label}-final`);
  assertNoRuntimeErrors();
  await browser.close();
  return dimensions;
}

await mkdir(outputDir, { recursive: true });
const results = [];
results.push(await reviewGuest(webkit, "guest-webkit-320", { width: 320, height: 700 }));
results.push(await reviewGuest(webkit, "guest-webkit-390", { width: 390, height: 844 }));
results.push(await reviewGuest(webkit, "guest-webkit-640", { width: 640, height: 900 }));
results.push(await reviewGuest(chromium, "guest-chromium-desktop", { width: 1366, height: 900 }));
results.push(await review(webkit, "webkit-320", { width: 320, height: 700 }));
results.push(await review(webkit, "webkit-390", { width: 390, height: 844 }));
results.push(await review(chromium, "chromium-desktop", { width: 1366, height: 900 }));
console.log(JSON.stringify({
  ok: true,
  baseUrl,
  outputDir,
  accessibility: "axe WCAG A/AA sem violações automáticas",
  results,
}));
