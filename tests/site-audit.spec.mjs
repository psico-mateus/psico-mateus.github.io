import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const widths = [320, 360, 390, 430, 640, 683, 768, 1024, 1366, 1440, 1920];

test("site principal e guia não criam rolagem horizontal nos tamanhos críticos", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Matriz executada uma vez com viewports explícitos.");

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });

    for (const path of ["/", "/guia-emocoes/"]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${path} em ${width}px`).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
      );
    }
  }
});

test("estrutura pública preserva a remoção intencional de Sobre mim", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação estrutural única.");
  await page.goto("/");

  await expect(page.locator("#sobre")).toHaveCount(0);
  await expect(page.locator('a[href="#sobre"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeVisible();
});

test("Guia se apresenta como recurso público de educação emocional", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação de conteúdo única.");
  await page.goto("/guia-emocoes/");

  await expect(page.locator("#inicio .eyebrow")).toHaveText(
    "RECURSO ABERTO DE EDUCAÇÃO EMOCIONAL",
  );
  await expect(page.locator("#inicio .hero-intro")).toContainText(
    "com ou sem acompanhamento psicológico",
  );
  await expect(page.locator("footer")).toContainText(
    "Recurso aberto de educação emocional",
  );
});

test("fonte do preview social preserva o posicionamento público do Guia", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação estrutural única.");
  const source = await readFile("assets/images/sources/generate_assets.py", "utf8");
  const mainScript = await readFile("assets/js/main.js", "utf8");
  expect(source).toContain("Recurso aberto de educação emocional");
  expect(source).not.toContain("Material de apoio para psicoterapia");
  expect(mainScript).toContain("Recurso aberto para reconhecer emoções");
  expect(mainScript).not.toContain("Material de apoio para reconhecer emoções");
});

test("política de segurança direciona relatos ao canal privado", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação estrutural única.");
  const securityPolicy = await readFile("SECURITY.md", "utf8");

  expect(securityPolicy).toContain(
    "https://github.com/psico-mateus/psico-mateus.github.io/security/advisories/new",
  );
  expect(securityPolicy).toContain(
    "Não publique detalhes de uma possível vulnerabilidade em issue, discussão ou pull request.",
  );
  expect(securityPolicy).toContain(
    "sem incluir detalhes técnicos ou dados pessoais na primeira mensagem",
  );
});

test("site e Guia respeitam a preferência de reduzir movimento", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação estrutural única.");
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const [path, selector] of [
    ["/", ".button"],
    ["/guia-emocoes/", ".button-primary"],
  ]) {
    await page.goto(path);
    const motion = await page.locator(selector).first().evaluate((element) => {
      const toMilliseconds = (duration) =>
        Math.max(
          ...duration.split(",").map((part) => {
            const value = Number.parseFloat(part);
            return part.trim().endsWith("ms") ? value : value * 1_000;
          }),
        );
      const style = getComputedStyle(element);
      return {
        preference: matchMedia("(prefers-reduced-motion: reduce)").matches,
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        transitionMilliseconds: toMilliseconds(style.transitionDuration),
        animationMilliseconds: toMilliseconds(style.animationDuration),
      };
    });

    expect(motion.preference).toBe(true);
    expect(motion.scrollBehavior).toBe("auto");
    expect(motion.transitionMilliseconds).toBeLessThanOrEqual(0.1);
    expect(motion.animationMilliseconds).toBeLessThanOrEqual(0.1);
  }
});

test("ações principais ficam organizadas e fáceis de tocar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Matriz executada uma vez com viewports explícitos.");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const desktopActions = page.locator(".hero-copy .button-row .button");
  await expect(desktopActions).toHaveCount(3);
  const desktopBoxes = await desktopActions.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, height: box.height };
    }),
  );
  expect(Math.max(...desktopBoxes.map(({ top }) => top)) - Math.min(...desktopBoxes.map(({ top }) => top)))
    .toBeLessThanOrEqual(1);
  for (const box of desktopBoxes) expect(box.height).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const mobileActions = page.locator(".hero-copy .button-row .button");
  const mobileBoxes = await mobileActions.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  );
  expect(Math.max(...mobileBoxes) - Math.min(...mobileBoxes)).toBeLessThanOrEqual(1);
});

test("página pública obsoleta encaminha para a Área do paciente sem expor o protótipo", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação estrutural única.");
  const source = await readFile("portal-prototipo/public/index.html", "utf8");

  expect(source).toContain(
    'content="0; url=https://area-do-paciente.psico-mateus.workers.dev/"',
  );
  expect(source).toContain(
    'rel="canonical"\n      href="https://area-do-paciente.psico-mateus.workers.dev/"',
  );
  expect(source).toContain('content="noindex, nofollow, noarchive"');
  expect(source).not.toMatch(/<form|data-demo-|TestePaciente|TesteProfissional/u);
  expect(source).not.toContain('src="/espaco/app.js"');
  expect(source).not.toContain("Ambiente local");
  expect(source).not.toContain("Versão local em validação");
});
