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
  expect(source).toContain("Recurso aberto de educação emocional");
  expect(source).not.toContain("Material de apoio para psicoterapia");
});
