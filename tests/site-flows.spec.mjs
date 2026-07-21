import { expect, test } from "@playwright/test";
import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = process.cwd();

const localPathToFile = (pathname) => {
  if (pathname === "/") return "index.html";
  if (pathname.endsWith("/")) return join(pathname.slice(1), "index.html");
  return pathname.slice(1);
};

test("site principal mantém textos, contatos e marcadores consistentes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Fluxo completo executado uma vez.");

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/Mateus Ribeiro Marcos/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Mateus Ribeiro Marcos/);
  await expect(page.getByText(/Você não precisa chegar com tudo organizado/)).toBeVisible();
  await expect(page.getByText("Recursos para pacientes", { exact: true })).toBeVisible();
  await expect(page.getByText("Guia de emoções · gratuito", { exact: true })).toBeVisible();
  await expect(
    page.locator(".hero-actions, .hero-copy .button-row").getByRole("link", {
      name: "Registros entre sessões",
      exact: true,
    }),
  ).toBeVisible();

  const portrait = page.getByRole("img", { name: "Retrato profissional de Mateus Ribeiro Marcos" });
  await expect.poll(() => portrait.evaluate((image) => image.naturalWidth)).toBeGreaterThanOrEqual(1600);
  await expect.poll(() => portrait.evaluate((image) => image.naturalHeight)).toBeGreaterThanOrEqual(1600);

  const guideCover = page.getByRole("img", {
    name: "Capa do Guia Prático para Reconhecer Emoções",
  });
  expect(await guideCover.evaluate((image) => image.getBoundingClientRect().width)).toBeLessThanOrEqual(
    390,
  );

  const availability = page.getByRole("link", {
    name: "Consultar disponibilidade",
    exact: true,
  });
  await expect(availability).toHaveCount(2);
  for (const link of await availability.all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/5541998548905\?text=/);
  }

  const onlineHref = await page
    .getByRole("link", { name: /Consultar atendimento on-line/ })
    .getAttribute("href");
  const inPersonHref = await page
    .getByRole("link", { name: /Consultar atendimento presencial/ })
    .getAttribute("href");
  expect(decodeURIComponent(onlineHref)).toContain("on-line particular");
  expect(decodeURIComponent(inPersonHref)).toContain("presencial pela Unimed");
  expect(onlineHref).not.toBe(inPersonHref);

  for (const navigation of [
    { name: "Psicoterapia", hash: "#psicoterapia" },
    { name: "Abordagem", hash: "#abordagem" },
    { name: "Atendimentos", hash: "#atendimentos" },
    { name: "Guia de Emoções", hash: "#guia" },
    { name: "Registros entre sessões", hash: "#espaco" },
    { name: "Dúvidas", hash: "#duvidas" },
    { name: "Contato", hash: "#contato" },
  ]) {
    await page.getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: navigation.name, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${navigation.hash}$`));
    await expect(page.locator(navigation.hash)).toBeVisible();
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 180));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  }

  await expect(page.getByRole("link", { name: /Instagram profissional/ })).toHaveAttribute(
    "href",
    "https://www.instagram.com/psico.mateus/",
  );
  await expect(page.getByRole("link", { name: /LinkedIn de Mateus/ })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/mateus-ribeiro-marcos-2439411b9/",
  );
  await expect(page.getByRole("link", { name: /Enviar e-mail/ })).toHaveAttribute(
    "href",
    "mailto:psico.mateus@outlook.com",
  );

  await page.getByRole("button", { name: "Compartilhar o guia" }).click();
  await expect(page.getByRole("status")).toContainText(/Link do guia copiado|Copie este endereço/);

  await expect(page.getByRole("link", { name: "Acessar meus registros", exact: true }).first())
    .toHaveAttribute("href", "/espaco/");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("menu móvel libera a página após clique e Escape", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Comportamento exclusivo do menu móvel.");
  await page.goto("/");

  const toggle = page.locator("[data-menu-toggle]");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAttribute("aria-label", "Fechar menu");
  await expect(page.locator("body")).toHaveClass(/menu-open/);
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link").first(),
  ).toBeFocused();

  await page.getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Atendimentos", exact: true })
    .click();
  await expect(page).toHaveURL(/#atendimentos$/);
  await expect(page.locator("body")).not.toHaveClass(/menu-open/);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 180));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);

  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await expect(page.locator("body")).not.toHaveClass(/menu-open/);
});

test("Guia preserva busca, rascunho local e PDF", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Fluxo de dados locais executado uma vez.");
  await page.goto("/guia-emocoes/");

  const search = page.getByRole("searchbox", { name: "Buscar no guia" });
  await search.fill("Gratidão");
  await expect(page.getByRole("button", { name: "Abrir detalhes de Gratidão" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Abrir detalhes de Ansiedade/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Ainda não sei o que sinto", exact: true }).click();
  const happened = page.getByRole("textbox", { name: "O que aconteceu?" });
  await happened.fill("Situação totalmente fictícia usada no teste automatizado.");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("guia-emocoes-rascunho-v1")))
    .toContain("Situação totalmente fictícia");
  await page.reload();
  await expect(happened).toHaveValue(/Situação totalmente fictícia/);

  const pdf = await page.request.get(
    "/assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf",
  );
  expect(pdf.ok()).toBe(true);
  expect((await pdf.body()).byteLength).toBeGreaterThan(100_000);
});

test("páginas auxiliares, metadados e PWA permanecem íntegros", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação estrutural única.");

  await page.goto("/privacidade/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Política de privacidade");
  await expect(page.getByText(/não é necessário relatar detalhes\s+clínicos/i)).toBeVisible();

  await page.goto("/cuidados/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cuidados e emergências");
  await expect(page.getByText(/não funcionam como atendimento de crise/)).toBeVisible();

  await page.goto("/404.html");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Página não encontrada");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  const manifestResponse = await page.request.get("/guia-emocoes/manifest.webmanifest");
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/guia-emocoes/");
  expect(manifest.scope).toBe("/guia-emocoes/");
  expect(manifest.display).toBe("standalone");

  const guideWorker = await readFile("guia-emocoes/sw.js", "utf8");
  expect(guideWorker).toContain('CACHE_NAME = "guia-emocoes-scoped-v15"');
  expect(guideWorker).toContain('const GUIDE_PATH = "/guia-emocoes/"');
  expect(guideWorker).toContain(
    '"/assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf"',
  );
  expect(guideWorker).not.toContain('scope: "/"');
});

test("todos os links locais declarados apontam para arquivos existentes", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação de arquivos única.");
  const htmlFiles = [
    "index.html",
    "privacidade/index.html",
    "cuidados/index.html",
    "guia-emocoes/index.html",
    "guia/index.html",
    "404.html",
  ];
  const missing = [];

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, "utf8");
    const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);

    for (const rawLink of links) {
      if (/^(?:https?:|mailto:|tel:|data:|#)/.test(rawLink)) continue;
      const url = new URL(rawLink, "https://psico-mateus.github.io/");
      if (url.origin !== "https://psico-mateus.github.io") continue;
      if (url.pathname === "/espaco/") continue; // Rota dinâmica servida pelo backend do portal.
      const file = localPathToFile(decodeURIComponent(url.pathname));
      if (!file || extname(file) === ".rsc") continue;
      try {
        await access(join(root, file));
      } catch {
        missing.push(`${htmlFile}: ${rawLink}`);
      }
    }
  }

  expect(missing).toEqual([]);
});
