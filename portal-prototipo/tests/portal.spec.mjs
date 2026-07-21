import { expect, test } from "@playwright/test";

async function loginWithDemo(page, accountName) {
  await page.goto("/espaco/");
  await page.getByRole("button", { name: accountName, exact: true }).click();
  await page.locator("#login-form").getByRole("button", { name: "Entrar", exact: true }).click();
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

test("site profissional e Guia conduzem ao portal funcional", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Integração completa executada uma vez.");

  await page.goto("/");
  const sitePortalLink = page.getByRole("link", { name: "Acessar o Espaço entre sessões", exact: true });
  await expect(sitePortalLink).toBeVisible();
  await sitePortalLink.click();
  await expect(page).toHaveURL(/\/espaco\/$/);
  await expect(page.getByRole("heading", { name: /Seu acesso, com uma escolha clara/ })).toBeVisible();

  await page.goto("/guia-emocoes/");
  const guidePortalLink = page.getByRole("link", { name: "Espaço entre sessões", exact: true }).first();
  await expect(guidePortalLink).toBeVisible();
  await guidePortalLink.click();
  await expect(page).toHaveURL(/\/espaco\/$/);
  await expect(page.getByRole("button", { name: "Criar conta", exact: true })).toBeVisible();
});

test("paciente cria a própria conta, mantém registros privados e consegue entrar novamente", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Fluxo completo executado uma vez.");

  await page.goto("/espaco/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  const registerForm = page.locator("#register-form");
  await registerForm.getByLabel("Nome completo").fill("Carla Teste");
  await registerForm.getByLabel("E-mail", { exact: true }).fill("carla@exemplo.local");
  await registerForm.getByLabel("Crie uma senha").fill("SenhaSegura2026");
  await registerForm.getByLabel("Repita a senha", { exact: true }).fill("SenhaSegura2026");
  await registerForm.getByLabel(/Tenho 18 anos ou mais/).check();
  await registerForm.getByRole("button", { name: "Criar minha conta", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Olá, Carla Teste/ })).toBeVisible();
  await expect(page.getByText("Nenhum registro por enquanto", { exact: true })).toBeVisible();
  await page.getByLabel("Título curto").fill("Registro particular de Carla");
  await page.getByLabel("O que aconteceu?").fill("Conteúdo criado apenas para validar o cadastro.");
  await page.getByRole("button", { name: "Salvar registro privado", exact: true }).click();
  await expect(page.locator(".record-card").filter({ hasText: "Registro particular de Carla" }).getByText("Privado", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  const loginForm = page.locator("#login-form");
  await loginForm.getByLabel("E-mail", { exact: true }).fill("carla@exemplo.local");
  await loginForm.getByLabel("Senha", { exact: true }).fill("SenhaSegura2026");
  await loginForm.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Registro particular de Carla", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Registro particular de Carla", { exact: true })).toHaveCount(0);
  await expect(page.locator(".record-actions")).toHaveCount(0);
});

test("autorização e CSRF são aplicados no servidor", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Verificação de segurança executada uma vez.");

  const anonymous = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  expect((await anonymous.request.get("/espaco/api/entries")).status()).toBe(401);
  expect((await anonymous.request.get("/portal-prototipo/data/portal-test.sqlite")).status()).toBe(404);
  expect((await anonymous.request.get("/.git/config")).status()).toBe(404);

  const publicRegistration = await anonymous.request.post("/espaco/api/register", {
    data: {
      name: "Conta sem privilégio",
      email: "nao-profissional@exemplo.local",
      password: "SenhaPublica2026",
      adult_confirmation: true,
      role: "therapist",
    },
  });
  expect(publicRegistration.status()).toBe(201);
  expect((await publicRegistration.json()).user.role).toBe("patient");
  await anonymous.close();

  const patient = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  const patientLogin = await patient.request.post("/espaco/api/login", {
    data: { email: "bruno@exemplo.local", password: "TestePaciente2!2026" },
  });
  const patientSession = await patientLogin.json();
  expect(patientLogin.ok()).toBe(true);

  const patientEntries = await (await patient.request.get("/espaco/api/entries")).json();
  expect(patientEntries.entries.map((entry) => entry.id)).toEqual(["entry-other-patient"]);
  expect(
    (
      await patient.request.delete("/espaco/api/entries/entry-private-demo", {
        headers: { "X-CSRF-Token": patientSession.csrf },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await patient.request.post("/espaco/api/entries", {
        data: { title: "Sem token", happened: "Não deve salvar", intensity: 5 },
      })
    ).status(),
  ).toBe(403);
  await patient.close();

  const therapist = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  const therapistLogin = await therapist.request.post("/espaco/api/login", {
    data: { email: "psico.mateus@outlook.com", password: "TesteProfissional!2026" },
  });
  const therapistSession = await therapistLogin.json();
  expect(
    (
      await therapist.request.post("/espaco/api/entries", {
        headers: { "X-CSRF-Token": therapistSession.csrf },
        data: { title: "Tentativa", happened: "Não deve salvar", intensity: 5 },
      })
    ).status(),
  ).toBe(403);
  await therapist.close();
});

test("profissional consegue definir uma nova senha própria", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Fluxo completo executado uma vez.");

  await loginWithDemo(page, "Profissional Vê somente o que foi compartilhado.");
  await page.getByText("Conta e segurança", { exact: true }).click();
  await page.getByLabel("Senha atual").fill("TesteProfissional!2026");
  await page.getByLabel("Nova senha", { exact: true }).fill("NovaSenhaLocal2026");
  await page.getByLabel("Repita a nova senha").fill("NovaSenhaLocal2026");
  await page.getByRole("button", { name: "Atualizar minha senha", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Senha atualizada");

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  const loginForm = page.locator("#login-form");
  await loginForm.getByLabel("E-mail", { exact: true }).fill("psico.mateus@outlook.com");
  await loginForm.getByLabel("Senha", { exact: true }).fill("TesteProfissional!2026");
  await loginForm.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("E-mail ou senha inválidos");

  await loginForm.getByLabel("Senha", { exact: true }).fill("NovaSenhaLocal2026");
  await loginForm.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Acesso somente ao que foi/ })).toBeVisible();
});

test("entrada e painel não criam rolagem horizontal no celular", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Verificação exclusiva do celular.");

  await page.goto("/espaco/");
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);

  const patientDemo = page.getByRole("button", {
    name: "Paciente Cria, compartilha, revoga e exclui registros.",
    exact: true,
  });
  expect((await patientDemo.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await patientDemo.click();
  await page.locator("#login-form").getByRole("button", { name: "Entrar", exact: true }).click();
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
});
