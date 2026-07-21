import { expect, test } from "@playwright/test";

async function loginWithDemo(page, accountName) {
  await page.goto("/");
  await page.getByRole("button", { name: accountName, exact: true }).click();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("paciente controla criação, compartilhamento, revogação e persistência", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Fluxo completo executado uma vez.");

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await loginWithDemo(
    page,
    "Paciente Cria, compartilha, revoga e exclui registros.",
  );
  await expect(page.getByRole("heading", { name: /Você decide o que compartilhar/ })).toBeVisible();
  await expect(page.getByText("Depois de uma conversa difícil", { exact: true })).toBeVisible();

  await page.getByLabel("Título curto").fill("Registro automatizado para validação");
  await page.getByLabel("O que aconteceu?").fill("Uma situação criada exclusivamente pelo teste automatizado.");
  await page.getByLabel("Corpo").fill("Tensão nos ombros.");
  await page.getByLabel("Pensamentos").fill("Quero organizar melhor esta situação.");
  await page.getByLabel("Emoção").fill("Ansiedade");
  await page.getByLabel(/Intensidade percebida/).fill("7");
  await page.getByRole("button", { name: "Salvar registro privado", exact: true }).click();

  const record = page.locator(".record-card").filter({ hasText: "Registro automatizado para validação" });
  await expect(record).toHaveCount(1);
  await expect(record.getByText("Privado", { exact: true })).toBeVisible();

  await record.getByRole("button", { name: "Compartilhar para a sessão", exact: true }).click();
  const shareDialog = page.getByRole("dialog", { name: "Compartilhar este registro?" });
  await expect(shareDialog).toBeVisible();
  await shareDialog.getByRole("button", { name: "Compartilhar", exact: true }).click();
  await expect(record.getByText("Compartilhado", { exact: true })).toBeVisible();

  await page.reload();
  await expect(record).toHaveCount(1);
  await expect(record.getByText("Compartilhado", { exact: true })).toBeVisible();

  await record.getByRole("button", { name: "Revogar compartilhamento", exact: true }).click();
  const revokeDialog = page.getByRole("dialog", { name: "Revogar o compartilhamento?" });
  await revokeDialog.getByRole("button", { name: "Revogar acesso", exact: true }).click();
  await expect(record.getByText("Privado", { exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("profissional vê somente registros compartilhados e não pode editá-los", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Fluxo completo executado uma vez.");

  await loginWithDemo(
    page,
    "Profissional Vê somente o que foi compartilhado.",
  );
  await expect(page.getByRole("heading", { name: /Somente o que o paciente escolheu mostrar/ })).toBeVisible();
  await expect(page.getByText("Antes de uma apresentação", { exact: true })).toBeVisible();
  await expect(page.getByText("Depois de uma conversa difícil", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Registro automatizado para validação", { exact: true })).toHaveCount(0);
  await expect(page.locator(".record-actions")).toHaveCount(0);
});

test("autorização e CSRF são aplicados no servidor", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação de segurança executada uma vez.");

  const anonymous = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  expect((await anonymous.request.get("/api/entries")).status()).toBe(401);
  await anonymous.close();

  const patient = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  const patientLogin = await patient.request.post("/api/login", {
    data: { email: "bruno@exemplo.local", password: "TestePaciente2!2026" },
  });
  const patientSession = await patientLogin.json();
  expect(patientLogin.ok()).toBe(true);

  const patientEntries = await (await patient.request.get("/api/entries")).json();
  expect(patientEntries.entries.map((entry) => entry.id)).toEqual(["entry-other-patient"]);
  expect(
    (
      await patient.request.delete("/api/entries/entry-private-demo", {
        headers: { "X-CSRF-Token": patientSession.csrf },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await patient.request.post("/api/entries", {
        data: { title: "Sem token", happened: "Não deve salvar", intensity: 5 },
      })
    ).status(),
  ).toBe(403);
  await patient.close();

  const therapist = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  const therapistLogin = await therapist.request.post("/api/login", {
    data: { email: "profissional@exemplo.local", password: "TesteProfissional!2026" },
  });
  const therapistSession = await therapistLogin.json();
  expect(
    (
      await therapist.request.post("/api/entries", {
        headers: { "X-CSRF-Token": therapistSession.csrf },
        data: { title: "Tentativa", happened: "Não deve salvar", intensity: 5 },
      })
    ).status(),
  ).toBe(403);
  await therapist.close();
});

test("entrada e painel não criam rolagem horizontal no celular", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Verificação exclusiva do celular.");

  await page.goto("/");
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);

  const patientDemo = page.getByRole("button", {
    name: "Paciente Cria, compartilha, revoga e exclui registros.",
    exact: true,
  });
  expect((await patientDemo.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await patientDemo.click();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
});

