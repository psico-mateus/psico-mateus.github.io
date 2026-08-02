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

async function routePortal(page, sessionRole = "patient") {
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
  await routePortal(page, "guest");
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Acompanhe seu processo/ }).waitFor();
  await assertAccessible(page, `${label}-acesso`);
  await page.screenshot({ path: resolve(outputDir, `${label}-acesso.png`), fullPage: true });

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

  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.innerWidth) {
    throw new Error(`${label}: overflow horizontal ${dimensions.scrollWidth}px > ${dimensions.innerWidth}px`);
  }
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
  await routePortal(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Olá, Paciente." }).waitFor();
  await assertAccessible(page, `${label}-inicio`);
  await page.screenshot({ path: resolve(outputDir, `${label}-inicio.png`), fullPage: true });
  await page.getByRole("button", { name: "Meus registros", exact: true }).click();
  await page.getByRole("heading", { name: "Meus registros" }).waitFor();
  await assertAccessible(page, `${label}-historico`);
  await page.screenshot({ path: resolve(outputDir, `${label}-historico.png`), fullPage: true });
  await page.getByRole("button", { name: "Novo registro", exact: true }).click();
  await page.getByRole("heading", { name: "O que você quer guardar?", exact: true }).waitFor();
  await assertAccessible(page, `${label}-novo-registro`);
  await page.screenshot({ path: resolve(outputDir, `${label}-novo-registro.png`), fullPage: true });
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
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.innerWidth) {
    throw new Error(`${label}: overflow horizontal ${dimensions.scrollWidth}px > ${dimensions.innerWidth}px`);
  }
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
