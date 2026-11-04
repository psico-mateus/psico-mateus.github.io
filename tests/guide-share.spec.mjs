import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const canonicalGuide = "https://psico-mateus.github.io/guia-emocoes/";

async function prepareShare(page, { clipboard = "absent", legacy = "success" } = {}) {
  const errors = [];
  const foreignRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:4173") return route.continue();
    foreignRequests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(({ clipboard, legacy }) => {
    window.__shareCalls = { clipboard: [], legacy: [] };
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard === "absent" ? undefined : {
        writeText: async text => {
          window.__shareCalls.clipboard.push(text);
          if (clipboard === "deferred") {
            await new Promise((resolve, reject) => { window.__rejectShareClipboard = reject; });
          }
          if (clipboard !== "success") throw new DOMException("Synthetic clipboard denial", "NotAllowedError");
        },
      },
    });
    document.execCommand = command => {
      const selected = document.activeElement;
      window.__shareCalls.legacy.push({ command, text: selected?.value });
      if (legacy === "focus-changed") document.querySelector('[data-link="email"]')?.focus();
      if (legacy === "throws") throw new DOMException("Synthetic legacy failure", "NotAllowedError");
      return legacy !== "false";
    };
  }, { clipboard, legacy });
  await page.goto("/");
  await expect(page).toHaveTitle(/Mateus Ribeiro Marcos/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mateus Ribeiro Marcos");
  await expect(page.locator("vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay")).toHaveCount(0);
  return { errors, foreignRequests };
}

for (const clipboard of ["absent", "denied"]) {
  for (const legacy of ["success", "false", "throws"]) {
    test(`compartilhar Guia: Clipboard ${clipboard}, fallback ${legacy} conserva foco e limpa campo temporário`, async ({ page }, testInfo) => {
      const { errors, foreignRequests } = await prepareShare(page, { clipboard, legacy });
      const share = page.getByRole("button", { name: "Compartilhar o guia", exact: true });
      await share.focus();
      await share.press("Enter");
      await expect(page.locator("[data-share-status]")).toHaveText(legacy === "success"
        ? "Link do guia copiado."
        : `Copie este endereço: ${canonicalGuide}`);
      await expect.poll(() => page.evaluate(() => window.__shareCalls.legacy)).toEqual([
        { command: "copy", text: canonicalGuide },
      ]);
      await expect(page.locator("textarea")).toHaveCount(0);
      await expect(share).toBeFocused();
      await expect(page.locator("[data-share-status]")).toHaveAttribute("aria-live", "polite");
      expect(errors).toEqual([]);
      expect(foreignRequests).toEqual([]);
      if (clipboard === "absent" && legacy === "success") {
        const directory = join(tmpdir(), "psico-public-share-20261104");
        await mkdir(directory, { recursive: true });
        await page.screenshot({ path: join(directory, `share-${testInfo.project.name}.png`), fullPage: false });
      }
    });
  }
}

test("cópia moderna funciona sem executar o fallback", async ({ page }) => {
  const { errors, foreignRequests } = await prepareShare(page, { clipboard: "success" });
  const share = page.getByRole("button", { name: "Compartilhar o guia", exact: true });
  await share.focus();
  await share.press("Enter");
  await expect(page.locator("[data-share-status]")).toHaveText("Link do guia copiado.");
  expect(await page.evaluate(() => window.__shareCalls)).toEqual({ clipboard: [canonicalGuide], legacy: [] });
  await expect(share).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(foreignRequests).toEqual([]);
});

test("recusa atrasada do Clipboard devolve foco à escolha mais recente, não ao botão anterior", async ({ page }) => {
  const { errors, foreignRequests } = await prepareShare(page, { clipboard: "deferred" });
  const share = page.getByRole("button", { name: "Compartilhar o guia", exact: true });
  const latest = page.locator('[data-link="email"]').first();
  await share.focus();
  await share.press("Enter");
  await expect.poll(() => page.evaluate(() => typeof window.__rejectShareClipboard)).toBe("function");
  await latest.focus();
  await page.evaluate(() => window.__rejectShareClipboard(new DOMException("Synthetic late denial", "NotAllowedError")));
  await expect(page.locator("[data-share-status]")).toHaveText("Link do guia copiado.");
  await expect(latest).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(foreignRequests).toEqual([]);
});

test("fallback não sobrescreve foco que mudou durante a cópia", async ({ page }) => {
  const { errors, foreignRequests } = await prepareShare(page, { legacy: "focus-changed" });
  const share = page.getByRole("button", { name: "Compartilhar o guia", exact: true });
  const latest = page.locator('[data-link="email"]').first();
  await share.focus();
  await share.press("Enter");
  await expect(page.locator("[data-share-status]")).toHaveText("Link do guia copiado.");
  await expect(latest).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(foreignRequests).toEqual([]);
});
