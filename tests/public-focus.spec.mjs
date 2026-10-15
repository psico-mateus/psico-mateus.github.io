import { expect, test } from "@playwright/test";

const draftKey = "guia-emocoes-rascunho-v1";
const tabKey = (testInfo, backwards = false) =>
  `${testInfo.project.name === "mobile-webkit" ? "Alt+" : ""}${backwards ? "Shift+" : ""}Tab`;

test("menu móvel inclui Fechar no ciclo e continua na seção escolhida", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.locator("[data-menu-toggle]");
  const navigation = page.getByRole("navigation", { name: "Navegação principal" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(navigation.getByRole("link").first()).toBeFocused();
  await expect(page.locator(".brand")).toHaveAttribute("inert", "");
  await page.keyboard.press(tabKey(testInfo, true));
  await expect(toggle).toBeFocused();
  await page.keyboard.press(tabKey(testInfo, true));
  await expect(navigation.getByRole("link").last()).toBeFocused();
  await page.keyboard.press(tabKey(testInfo));
  await expect(toggle).toBeFocused();

  const destination = page.locator("#atendimentos");
  await navigation.getByRole("link", { name: "Atendimentos", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#atendimentos$/);
  await expect(destination).toBeFocused();
  await expect(page.locator(".brand")).not.toHaveAttribute("inert", "");
  await page.keyboard.press(tabKey(testInfo));
  await expect(destination.getByRole("link").first()).toBeFocused();
  await expect(destination).not.toHaveAttribute("tabindex");
});

test("menu restaura atributos prévios e foco ao fechar ou voltar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".site-footer").evaluate(element => {
    element.setAttribute("inert", "inert");
    element.setAttribute("aria-hidden", "false");
  });
  const toggle = page.locator("[data-menu-toggle]");
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(page.locator(".site-footer")).toHaveAttribute("inert", "inert");
  await expect(page.locator(".site-footer")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  await page.evaluate(() => history.pushState(null, "", "#guia"));
  await toggle.click();
  await expect(page.locator("[data-menu] a").first()).toBeFocused();
  await page.goBack();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("ampliar a tela não deixa o teclado no botão de menu oculto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.locator("[data-menu-toggle]");
  await toggle.click();
  await expect(page.locator("[data-menu] a").first()).toBeFocused();
  await toggle.focus();
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeHidden();
  await expect(page.locator("[data-menu] a").first()).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
});

test("detalhes do Guia isolam o fundo e devolvem foco sem alterar o rascunho", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/guia-emocoes/");
  await page.getByRole("textbox", { name: "O que aconteceu?", exact: true })
    .fill("Conteúdo inteiramente fictício para validar foco e rascunho.");
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), draftKey)).toContain("inteiramente fictício");
  const draft = await page.evaluate(key => localStorage.getItem(key), draftKey);
  const trigger = page.getByRole("button", { name: "Abrir detalhes de Ansiedade", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Ansiedade", exact: true });
  const close = dialog.getByRole("button", { name: "Fechar detalhes", exact: true });
  await expect(close).toBeFocused();
  await expect(page.locator("#explorar")).toHaveAttribute("inert", "");
  await expect(page.locator("#explorar")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#registrar")).toHaveAttribute("inert", "");
  await expect(page.locator("main > header")).toHaveAttribute("inert", "");
  await expect(page.locator("main > footer")).toHaveAttribute("inert", "");
  await expect(page.locator("main")).not.toHaveAttribute("inert");
  await expect(page.locator(".guide-skip-link")).toHaveAttribute("inert", "");
  await expect(dialog).not.toHaveAttribute("inert", "");
  await page.keyboard.press(tabKey(testInfo, true));
  await expect(dialog.getByRole("button", { name: "Voltar ao guia", exact: true })).toBeFocused();
  await page.keyboard.press(tabKey(testInfo));
  await expect(close).toBeFocused();
  await page.evaluate(() => document.querySelector("#emotion-search").focus());
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("#explorar")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#explorar")).not.toHaveAttribute("aria-hidden");
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey)).toBe(draft);
  expect(errors).toEqual([]);
});

test("instruções de instalação restauram isolamento e controle de origem", async ({ page }) => {
  await page.goto("/guia-emocoes/");
  await page.locator(".guide-skip-link").evaluate(element => element.setAttribute("aria-hidden", "false"));
  await page.locator("#comparar").evaluate(element => element.setAttribute("inert", "inert"));
  const trigger = page.locator(".install-button");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Leve o guia para a tela inicial", exact: true });
  await expect(dialog.getByRole("button", { name: "Fechar instruções", exact: true })).toBeFocused();
  await expect(page.locator("#registrar")).toHaveAttribute("inert", "");
  await expect(page.locator(".guide-skip-link")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("#registrar")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#comparar")).toHaveAttribute("inert", "inert");
  await expect(page.locator(".guide-skip-link")).toHaveAttribute("aria-hidden", "false");
});

test("fallback sem inert nativo restaura tabindex e não prende o teclado", async ({ page }) => {
  await page.addInitScript(() => { delete HTMLElement.prototype.inert; });
  await page.goto("/guia-emocoes/");
  const search = page.getByRole("searchbox", { name: "Buscar no guia", exact: true });
  await search.evaluate(element => element.setAttribute("tabindex", "2"));
  const trigger = page.getByRole("button", { name: "Abrir detalhes de Medo", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Medo", exact: true })).toBeVisible();
  await expect(page.locator("#emotion-search")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(search).toHaveAttribute("tabindex", "2");
  await expect(page.locator(".install-button")).not.toHaveAttribute("tabindex");
  await search.focus();
  await expect(search).toBeFocused();
});
