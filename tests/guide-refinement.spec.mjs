import { test, expect } from "@playwright/test";

const guidePath = "/guia-emocoes/";

test("todos os modos de explorar ficam visíveis, sem rolagem lateral", async ({ page }, testInfo) => {
  const widths = testInfo.project.name === "desktop-chromium" ? [320, 390, 768, 1366] : [390];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(guidePath);
    await expect(page.locator(".guide-filter-label")).toHaveText("O que você quer ver nos cartões?");
    const filters = page.getByRole("group", { name: "O que destacar nos cartões" });
    const buttons = filters.getByRole("button");
    await expect(buttons).toHaveCount(5);
    const dimensions = await filters.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }));
    expect(dimensions.scrollWidth, `${width}px: todos os filtros cabem`).toBeLessThanOrEqual(dimensions.width + 1);

    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box?.height, `${width}px: alvo de toque`).toBeGreaterThanOrEqual(44);
      expect(box?.x).toBeGreaterThanOrEqual(dimensions.left - 1);
      expect(box?.x + box?.width).toBeLessThanOrEqual(dimensions.right + 1);
      expect(await button.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    }

    await filters.getByRole("button", { name: "Por dentro", exact: true }).click();
    await expect(filters.getByRole("button", { name: "Por dentro", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(filters.getByRole("button", { name: "Visão geral", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".guide-filter-label")).toHaveCount(1);
    await expect(page.locator(".guide-explore-tip")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Abrir detalhes de Ansiedade", exact: true })).toBeVisible();
  }
});

test("ações do Guia continuam acessíveis e ações externas ficam juntas no celular", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Organização móvel verificada em Chromium e WebKit.");
  await page.goto(guidePath);
  const actions = page.locator(".hero-actions");
  const explore = actions.getByRole("link", { name: "Explorar emoções", exact: true });
  const guided = actions.getByRole("link", { name: "Ainda não sei o que sinto", exact: true });
  const portal = actions.locator(".guide-portal-link");
  const professional = actions.getByRole("link", { name: "Site profissional", exact: true });
  await expect(portal).toBeVisible();
  const boxes = await Promise.all([explore, guided, portal, professional].map(link => link.boundingBox()));
  for (const box of boxes) expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(boxes[0].width).toBeCloseTo(boxes[1].width, 0);
  expect(boxes[2].y).toBeCloseTo(boxes[3].y, 0);
  expect(boxes[2].width + boxes[3].width).toBeLessThan(boxes[0].width);
});

test("busca sem resultados não orienta a abrir cartões inexistentes", async ({ page }) => {
  await page.goto(guidePath);
  const search = page.getByRole("searchbox", { name: "Buscar no guia", exact: true });
  await search.fill("zzzzzzzzzzz");
  await expect(page.locator(".emotion-card")).toHaveCount(0);
  await expect(page.locator(".guide-explore-tip")).toBeHidden();
  const clear = page.locator(".search-box").getByRole("button");
  await expect(clear).toBeVisible();
  expect((await clear.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".emotion-card")).toHaveCount(25);
  await expect(page.locator(".guide-explore-tip")).toBeVisible();
  await expect(page.locator(".guide-filter-label")).toHaveCount(1);
});

test("detalhes são legíveis e a exploração local mantém emoção e rascunho", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(guidePath);
  const happened = page.getByRole("textbox", { name: "O que aconteceu?", exact: true });
  await happened.fill("Exemplo fictício usado somente no teste do Guia.");
  await page.getByRole("button", { name: "Abrir detalhes de Ansiedade", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ansiedade", exact: true });
  await expect(dialog).toBeVisible();
  const textSizes = await dialog.locator(".detail-section ul, .detail-section p, .detail-alerts p").evaluateAll(elements =>
    elements.map(element => parseFloat(getComputedStyle(element).fontSize)),
  );
  for (const fontSize of textSizes) expect(fontSize).toBeGreaterThanOrEqual(16);
  expect((await dialog.getByRole("button", { name: "Fechar detalhes", exact: true }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await dialog.getByRole("button", { name: "Usar na exploração guiada", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/modal-open/);
  await expect(page.getByRole("group", { name: "Etapa 5 de 6", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("guia-emocoes-rascunho-v1")))
    .toContain("Exemplo fictício usado somente no teste do Guia.");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("guia-emocoes-rascunho-v1")))
    .toContain("Ansiedade");
  await page.reload();
  await expect(happened).toHaveValue("Exemplo fictício usado somente no teste do Guia.");
  expect(errors).toEqual([]);
});

test("atalhos acompanham a altura do texto ampliado e não cobrem a seção", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Geometria móvel verificada em Chromium e WebKit.");
  await page.goto(guidePath);
  const navigation = page.getByRole("navigation", { name: "Atalhos do Guia" });
  await expect(navigation).toBeVisible();
  await page.addStyleTag({ content: ".guide-mobile-nav a { font-size: 24px !important; line-height: 1.4 !important; }" });
  await expect.poll(async () => page.evaluate(() => {
    const navigation = document.querySelector(".guide-mobile-nav");
    return Number.parseFloat(document.documentElement.style.getPropertyValue("--guide-nav-height")) === navigation.offsetHeight;
  })).toBe(true);
  await navigation.getByRole("link", { name: "Cuidados", exact: true }).click();
  const visibleBounds = await page.evaluate(() => ({
    navBottom: document.querySelector(".guide-mobile-nav").getBoundingClientRect().bottom,
    sectionTop: document.querySelector("#cuidados").getBoundingClientRect().top,
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(visibleBounds.sectionTop).toBeGreaterThanOrEqual(visibleBounds.navBottom + 8);
  expect(visibleBounds.scrollWidth).toBeLessThanOrEqual(visibleBounds.width + 1);
});

test("base teórica abre pelo teclado e a seta acompanha o estado", async ({ page }) => {
  await page.goto(guidePath);
  const disclosure = page.locator(".author-card details");
  const summary = disclosure.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(disclosure.locator("ul")).toBeVisible();
  const openArrow = await summary.evaluate(element => getComputedStyle(element, "::after").transform);
  await page.keyboard.press("Enter");
  await expect(disclosure).not.toHaveAttribute("open", "");
  const closedArrow = await summary.evaluate(element => getComputedStyle(element, "::after").transform);
  expect(openArrow).not.toBe(closedArrow);
  expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
