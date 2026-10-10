import { test, expect } from "@playwright/test";

const guidePath = "/guia-emocoes/";
const draftKey = "guia-emocoes-rascunho-v1";

async function expectQuestionAtTop(page) {
  await expect.poll(() => page.evaluate(() => {
    const card = document.querySelector(".record-card").getBoundingClientRect();
    const header = document.querySelector(".site-header").getBoundingClientRect();
    const navigation = document.querySelector(".guide-mobile-nav");
    const bottom = navigation.offsetHeight ? navigation.getBoundingClientRect().bottom : header.bottom;
    return card.top >= bottom + 8 && card.top <= bottom + 25;
  })).toBe(true);
}

async function finishExploration(page) {
  await page.getByRole("link", { name: "Ainda não sei o que sinto", exact: true }).click();
  await page.getByRole("textbox", { name: "O que aconteceu?", exact: true }).fill("Rascunho fictício usado apenas no teste.");
  for (let index = 0; index < 6; index++) {
    await page.locator(".record-actions button").last().click();
  }
  await expect(page.locator(".record-summary h3")).toBeFocused();
  await expectQuestionAtTop(page);
}

test("as seis etapas mantêm foco, instruções, posição e todos os campos do rascunho", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__guideScrollRequests = 0;
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...arguments_) {
      window.__guideScrollRequests++;
      return scrollIntoView.apply(this, arguments_);
    };
  });
  await page.goto(guidePath);
  await page.getByRole("link", { name: "Ainda não sei o que sinto", exact: true }).click();
  const keys = ["happened", "body", "thoughts", "urge", null, "message"];
  const expectedDraft = { emotions: ["Gratidão"], intensity: 10 };
  for (let index = 0; index < 6; index++) {
    const heading = page.locator(".question-copy h3");
    if (index > 0) {
      await expect(heading).toBeFocused();
      await expectQuestionAtTop(page);
    }
    await expect(page.getByRole("group", { name: `Etapa ${index + 1} de 6`, exact: true })).toBeVisible();
    if (keys[index]) {
      const field = page.locator(".question-panel textarea");
      await expect(field).toHaveAttribute("aria-describedby", "guide-step-instructions");
      expectedDraft[keys[index]] = `Etapa ${index + 1}: conteúdo fictício para o teste.`;
      await field.fill(expectedDraft[keys[index]]);
      const beforeTyping = await page.evaluate(() => window.__guideScrollRequests);
      await field.pressSequentially(" Texto.");
      expectedDraft[keys[index]] += " Texto.";
      await expect(field).toHaveValue(expectedDraft[keys[index]]);
      expect(await page.evaluate(() => window.__guideScrollRequests)).toBe(beforeTyping);
    } else {
      const emotions = page.getByRole("group", { name: "Escolha uma ou mais emoções", exact: true });
      await emotions.getByRole("button", { name: "Gratidão", exact: true }).click();
      await expect(emotions.getByRole("button", { name: "Gratidão", exact: true })).toHaveAttribute("aria-pressed", "true");
      const intensity = page.getByRole("slider", { name: "Intensidade percebida", exact: true });
      await intensity.focus();
      const beforeIntensity = await page.evaluate(() => window.__guideScrollRequests);
      await intensity.press("End");
      await expect(intensity).toHaveValue("10");
      expect(await page.evaluate(() => window.__guideScrollRequests)).toBe(beforeIntensity);
    }
    await page.locator(".record-actions button").last().click();
  }
  await expect(page.locator(".record-summary h3")).toBeFocused();
  await expectQuestionAtTop(page);
  await expect(page.locator(".record-progress strong")).toHaveText("Resumo da exploração");
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(expectedDraft);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "O que aconteceu?", exact: true })).toHaveValue(expectedDraft.happened);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(expectedDraft);
  expect(errors).toEqual([]);
});

test("selecionar uma emoção leva o teclado à exploração, não ao cartão anterior", async ({ page }, testInfo) => {
  await page.goto(guidePath);
  const trigger = page.getByRole("button", { name: "Abrir detalhes de Ansiedade", exact: true });
  await trigger.click();
  await page.getByRole("button", { name: "Usar na exploração guiada", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Qual emoção mais se aproxima?", exact: true })).toBeFocused();
  await expectQuestionAtTop(page);
  // No WebKit, Option+Tab percorre também botões, independentemente da preferência nativa do Safari.
  await page.keyboard.press(testInfo.project.name === "mobile-webkit" ? "Alt+Tab" : "Tab");
  await expect(page.locator(".emotion-pills").getByRole("button", { name: "Ansiedade", exact: true })).toBeFocused();
  await expect(trigger).not.toBeFocused();
  await page.locator(".record-actions").getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "O que deu vontade de fazer?", exact: true })).toBeFocused();
  await expectQuestionAtTop(page);
});

test("apagar pede confirmação; cancelar preserva o rascunho e confirmar orienta o recomeço", async ({ page }) => {
  await page.goto(guidePath);
  await finishExploration(page);
  const savedDraft = await page.evaluate(key => localStorage.getItem(key), draftKey);
  page.once("dialog", async dialog => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("não pode ser desfeita");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Apagar e começar outro", exact: true }).click();
  await expect(page.locator(".record-summary")).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey)).toBe(savedDraft);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Apagar e começar outro", exact: true }).click();
  await expect(page.locator(".question-copy h3")).toBeFocused();
  await expectQuestionAtTop(page);
  await expect(page.getByRole("textbox", { name: "O que aconteceu?", exact: true })).toHaveValue("");
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).happened, draftKey)).toBe("");
});

test("ações dos detalhes permanecem visíveis sem cobrir o fim da leitura", async ({ page }, testInfo) => {
  const widths = testInfo.project.name === "desktop-chromium" ? [320, 390, 1366] : [390];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(guidePath);
    await page.getByRole("button", { name: "Abrir detalhes de Ansiedade", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Ansiedade", exact: true });
    const actions = dialog.locator(".modal-actions");
    await expect(actions).toBeInViewport();
    const firstBounds = await actions.boundingBox();
    expect(firstBounds.height).toBeLessThanOrEqual(110);
    expect(firstBounds.y + firstBounds.height).toBeLessThanOrEqual(845);
    const lastAlert = dialog.locator(".detail-alerts section").last();
    await lastAlert.scrollIntoViewIfNeeded();
    await expect(actions).toBeInViewport();
    await page.evaluate(() => {
      const modal = document.querySelector(".emotion-modal");
      const backdrop = document.querySelector(".modal-backdrop");
      modal.scrollTop = modal.scrollHeight;
      backdrop.scrollTop = backdrop.scrollHeight;
    });
    const finalBounds = await actions.boundingBox();
    const alertBounds = await lastAlert.boundingBox();
    expect(alertBounds.y + alertBounds.height).toBeLessThanOrEqual(finalBounds.y + 1);
    await dialog.getByRole("button", { name: "Voltar ao guia", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
