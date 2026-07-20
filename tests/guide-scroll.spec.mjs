import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const guidePath = "/guia-emocoes/";

async function pageScrollState(page) {
  return page.evaluate(() => ({
    bodyClass: document.body.className,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    bodyPosition: getComputedStyle(document.body).position,
    bodyStyle: document.body.getAttribute("style"),
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    htmlPosition: getComputedStyle(document.documentElement).position,
    htmlStyle: document.documentElement.getAttribute("style"),
    y: window.scrollY,
  }));
}

function expectUnlocked(state) {
  expect(state.bodyClass).not.toContain("modal-open");
  expect(state.bodyOverflowY).not.toBe("hidden");
  expect(state.htmlOverflowY).not.toBe("hidden");
  expect(state.bodyPosition).not.toBe("fixed");
  expect(state.htmlPosition).not.toBe("fixed");
  expect(state.bodyStyle ?? "").not.toMatch(/overflow\s*:\s*hidden|position\s*:\s*fixed/i);
  expect(state.htmlStyle ?? "").not.toMatch(/overflow\s*:\s*hidden|position\s*:\s*fixed/i);
}

async function expectPageStillScrolls(page) {
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 420));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);

  const afterDown = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, -220));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(afterDown);
}

async function waitForScrollToSettle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let previous = window.scrollY;
        let stableFrames = 0;

        const check = () => {
          const current = window.scrollY;
          stableFrames = Math.abs(current - previous) < 1 ? stableFrames + 1 : 0;
          previous = current;

          if (stableFrames >= 5) {
            resolve();
            return;
          }

          window.requestAnimationFrame(check);
        };

        window.requestAnimationFrame(check);
      }),
  );
}

for (const flow of [
  { label: "Explorar emoções", target: "#explorar" },
  { label: "Ainda não sei o que sinto", target: "#registrar" },
]) {
  test(`${flow.label}: marcador não bloqueia a rolagem`, async ({ page }) => {
    const routeRequests = [];
    page.on("request", (request) => {
      if (request.url().includes(".rsc")) routeRequests.push(request.url());
    });

    await page.goto(guidePath);
    await page.getByRole("link", { name: flow.label, exact: true }).click();

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.locator(flow.target)).toBeVisible();

    const state = await pageScrollState(page);
    expectUnlocked(state);
    expect(routeRequests).toEqual([]);
    await expectPageStillScrolls(page);
  });
}

test("sequência completa mantém âncoras, teclado e navegação liberados", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Fluxo de teclado executado uma vez.");

  const consoleErrors = [];
  const pageErrors = [];
  const routeRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes(".rsc")) routeRequests.push(request.url());
  });

  await page.goto(guidePath);

  for (const flow of [
    { label: "Explorar emoções", target: "#explorar" },
    { label: "Ainda não sei o que sinto", target: "#registrar" },
    { label: "Explorar emoções", target: "#explorar" },
    { label: "Ainda não sei o que sinto", target: "#registrar" },
  ]) {
    await page.getByRole("link", { name: flow.label, exact: true }).click();
    await expect(page.locator(flow.target)).toBeVisible();
    expectUnlocked(await pageScrollState(page));
    await expectPageStillScrolls(page);
  }

  const exploreNavigation = page.getByRole("link", { name: "Explorar", exact: true });
  await exploreNavigation.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#explorar")).toBeVisible();
  expectUnlocked(await pageScrollState(page));

  const beforePageDown = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("PageDown");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforePageDown);
  await waitForScrollToSettle(page);
  const afterPageDown = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("PageUp");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(afterPageDown);

  const registerNavigation = page.getByRole("link", { name: "Registrar", exact: true });
  await registerNavigation.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#registrar")).toBeVisible();
  expectUnlocked(await pageScrollState(page));

  expect(routeRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("atalho de sinais mantém o foco acessível e a página rolável", async ({ page }) => {
  await page.goto(guidePath);
  await page
    .getByRole("button", {
      name: "Corpo Aperto, calor, tremor, peso ou tensão.",
      exact: true,
    })
    .click();

  await expect(page.getByRole("searchbox", { name: "Buscar no guia" })).toBeFocused();
  const state = await pageScrollState(page);
  expectUnlocked(state);
  await expectPageStillScrolls(page);
});

test("fechar detalhes remove o único bloqueio intencional de rolagem", async ({ page }) => {
  await page.goto(guidePath);
  await page.getByRole("button", { name: "Abrir detalhes de Ansiedade" }).click();
  await expect(page.locator("body")).toHaveClass(/modal-open/);

  await page.getByRole("button", { name: "Fechar detalhes" }).click();
  await expect(page.locator("body")).not.toHaveClass(/modal-open/);
  await expectPageStillScrolls(page);
});

test("modal mantém o foco contido e o devolve ao cartão", async ({ page }) => {
  await page.goto(guidePath);
  const trigger = page.getByRole("button", { name: "Abrir detalhes de Ansiedade" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Ansiedade" });
  const closeButton = page.getByRole("button", { name: "Fechar detalhes" });
  await expect(dialog).toBeVisible();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Voltar ao guia" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expectUnlocked(await pageScrollState(page));
});

test("a abertura do guia também identifica o site profissional", async ({ page }) => {
  await page.goto(guidePath);
  const professionalSite = page.getByRole("link", {
    name: "← Site profissional",
    exact: true,
  });

  await expect(professionalSite).toBeVisible();
  await expect(professionalSite).toHaveAttribute("href", "/");
  await expect(professionalSite).toHaveCSS("background-color", "rgb(234, 210, 170)");

  const size = await professionalSite.boundingBox();
  expect(size?.height).toBeGreaterThanOrEqual(44);
});

test("artefatos mantêm a correção de foco, rolagem e atualização do PWA", async () => {
  const [bundle, css, serviceWorker] = await Promise.all([
    readFile("assets/EmotionGuideApp-BiKEL11_.js", "utf8"),
    readFile("assets/index-BBQ5DOp1.css", "utf8"),
    readFile("guia-emocoes/sw.js", "utf8"),
  ]);

  expect(bundle).not.toContain("behavior:`smooth`");
  expect(bundle).toContain("behavior:`auto`");
  expect(bundle).toContain("focus({preventScroll:!0})");
  expect(bundle).toContain("updateViaCache:`none`");
  expect(css).toContain("html{scroll-behavior:auto");
  expect(serviceWorker).toContain('CACHE_NAME = "guia-emocoes-scoped-v10"');
  expect(serviceWorker).toContain('"/assets/js/guide-navigation.js"');
});
