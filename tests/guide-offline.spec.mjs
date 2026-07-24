import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("guia e PDF permanecem disponíveis sem internet", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Cache offline verificado uma vez.");

  await page.goto("/guia-emocoes/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const cacheState = await page.evaluate(async () => {
    const cache = await caches.open("guia-emocoes-scoped-v22");
    const [guide, pdf] = await Promise.all([
      cache.match("/guia-emocoes/"),
      cache.match("/assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf"),
    ]);
    return { guide: Boolean(guide), pdf: Boolean(pdf) };
  });
  expect(cacheState).toEqual({ guide: true, pdf: true });

  await context.setOffline(true);
  const pdfSize = await page.evaluate(async () => {
    const response = await fetch(
      "/assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf",
    );
    return response.ok ? (await response.arrayBuffer()).byteLength : 0;
  });
  expect(pdfSize).toBeGreaterThan(100_000);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Guia Prático para Reconhecer Emoções",
  );
});
