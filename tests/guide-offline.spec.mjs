import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("guia e PDF permanecem disponíveis sem internet", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Cache offline verificado uma vez.");

  const draft = {
    happened: "Situação fictícia para verificar a preservação do rascunho antigo.",
    body: "Texto fictício do teste.",
    thoughts: "Outro campo fictício.",
    urge: "Nenhum dado de paciente real.",
    emotions: ["Gratidão"],
    intensity: 5,
    message: "Rascunho de teste anterior à atualização.",
  };
  await page.goto("/404.html");
  await page.evaluate(async (draft) => {
    localStorage.setItem("guia-emocoes-rascunho-v1", JSON.stringify(draft));
    const oldGuideCache = await caches.open("guia-emocoes-scoped-v28");
    await oldGuideCache.put("/teste-cache-antigo", new Response("cache de teste"));
    await caches.open("guia-emocoes-scoped-v29");
    await caches.open("guia-emocoes-scoped-v30");
    await caches.open("guia-emocoes-scoped-v31");
    await caches.open("outro-aplicativo-cache-de-teste");
  }, draft);

  await page.goto("/guia-emocoes/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("guia-emocoes-scoped-v28"))).toBe(false);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("guia-emocoes-scoped-v29"))).toBe(false);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("guia-emocoes-scoped-v30"))).toBe(false);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("guia-emocoes-scoped-v31"))).toBe(false);
  expect(await page.evaluate(async () => (await caches.keys()).includes("outro-aplicativo-cache-de-teste"))).toBe(true);
  await expect(page.getByRole("textbox", { name: "O que aconteceu?", exact: true })).toHaveValue(draft.happened);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("guia-emocoes-rascunho-v1")))).toEqual(draft);

  const cacheState = await page.evaluate(async () => {
    const cache = await caches.open("guia-emocoes-scoped-v32");
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
  await expect(page.getByRole("link", { name: "Ver contatos de ajuda imediata" }))
    .toHaveAttribute("href", "/cuidados/");
  await expect(page.getByRole("textbox", { name: "O que aconteceu?", exact: true })).toHaveValue(draft.happened);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("guia-emocoes-rascunho-v1")))).toEqual(draft);
});
