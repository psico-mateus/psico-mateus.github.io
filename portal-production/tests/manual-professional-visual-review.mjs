import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "../../node_modules/@playwright/test/index.mjs";
import axe from "axe-core";
import {
  PATIENT_MAP_CATALOG,
  PATIENT_MAP_RESPONSES,
} from "../content/patient-map-catalog.ts";

const baseUrl = process.env.PORTAL_VISUAL_BASE_URL;
if (!baseUrl) {
  throw new Error("Defina PORTAL_VISUAL_BASE_URL para um servidor local isolado.");
}

const visualHost = new URL(baseUrl).hostname;
if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(visualHost)) {
  throw new Error("A revisão profissional aceita somente localhost ou 127.0.0.1.");
}

const outputDir = resolve(
  process.env.PORTAL_PROFESSIONAL_VISUAL_OUTPUT ??
    "/tmp/area-paciente-professional-visual-review",
);
const now = new Date("2026-08-11T15:00:00.000Z");
const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const ahead = (days) => new Date(now.getTime() + days * 86_400_000).toISOString();

const mapOnlyPatient = {
  patient_id: "synthetic-map-only",
  patient_name: "Paciente Mapa Apenas",
  shared_count: 0,
  private_count: 3,
  unread_count: 0,
  shared_map_count: 1,
  unread_map_count: 1,
  latest_shared_at: null,
  latest_map_shared_at: ago(0),
};

const completePatient = {
  patient_id: "synthetic-complete",
  patient_name: "Paciente Conteúdos Completos",
  shared_count: 28,
  private_count: 7,
  unread_count: 10,
  shared_map_count: 5,
  unread_map_count: 3,
  latest_shared_at: ago(1),
  latest_map_shared_at: ago(0),
};

const privateOnlyPatient = {
  patient_id: "synthetic-private-only",
  patient_name: "Paciente Somente Privados",
  shared_count: 0,
  private_count: 9,
  unread_count: 0,
  shared_map_count: 0,
  unread_map_count: 0,
  latest_shared_at: null,
  latest_map_shared_at: null,
};

const extraPatients = Array.from({ length: 24 }, (_, index) => ({
  patient_id: `synthetic-patient-${index + 1}`,
  patient_name: `Paciente Sintético ${String(index + 1).padStart(2, "0")}`,
  shared_count: index % 5,
  private_count: (index * 3) % 8,
  unread_count: index % 4,
  shared_map_count: index % 3,
  unread_map_count: index % 2,
  latest_shared_at: ago((index % 14) + 1),
  latest_map_shared_at: index % 3 === 0 ? ago(index % 10) : null,
}));

const patients = [mapOnlyPatient, completePatient, privateOnlyPatient, ...extraPatients];

const entries = Array.from({ length: 28 }, (_, index) => ({
  id: `synthetic-entry-${index + 1}`,
  title:
    index === 0
      ? "Um título deliberadamente longo para verificar a leitura e a quebra de linha no celular"
      : `Registro sintético ${String(index + 1).padStart(2, "0")}`,
  happened:
    index === 0
      ? "Conteúdo sintético e neutro para testar um registro longo no painel profissional. ".repeat(20)
      : "Conteúdo sintético e neutro usado somente na revisão visual local.",
  body: index % 2 === 0 ? "Tensão nos ombros e respiração curta." : "",
  thoughts: "Pensamento sintético criado somente para este ensaio.",
  urge: index % 3 === 0 ? "Fazer uma pausa." : "",
  emotion: ["Ansiedade", "Alívio", "Dúvida"][index % 3],
  intensity: (index % 10) + 1,
  message: index % 2 === 0 ? "Levar este ponto para a sessão." : "",
  created_at: ago(index + 1),
  updated_at: ago(index + 1),
  shared_at: ago(index + 1),
  viewed_at: index % 3 === 0 ? null : ago(index),
  is_unread: index % 3 === 0 ? 1 : 0,
}));

const completeMapShares = PATIENT_MAP_CATALOG.maps.map((map, mapIndex) => ({
  map_id: map.id,
  map_title: map.navigationTitle,
  map_description: map.description,
  answers: map.sections
    .flatMap((section) =>
      section.items.map((item) => ({
        item,
        section,
      })),
    )
    .slice(0, 10)
    .map(({ item, section }, answerIndex) => {
      const response = PATIENT_MAP_RESPONSES[answerIndex % 2];
      return {
        item_id: item.id,
        item_title: item.title,
        section_title: section.title,
        response_key: response.key,
        response_label: response.label,
        note:
          answerIndex % 3 === 0
            ? "Observação sintética um pouco mais longa para verificar legibilidade, espaçamento e quebra de linha."
            : "",
      };
    }),
  shared_at: ago(mapIndex),
  viewed_at: mapIndex % 2 === 0 ? null : ago(mapIndex),
  is_unread: mapIndex % 2 === 0 ? 1 : 0,
}));

const mapOnlyShare = {
  ...completeMapShares[0],
  map_id: "meu-jeito",
  map_title: "Meu jeito",
  shared_at: ago(0),
  viewed_at: null,
  is_unread: 1,
};

const accesses = patients.map((patient, index) => ({
  patient_id: patient.patient_id,
  patient_name: patient.patient_name,
  access_status: index % 6 === 0 ? "revoked" : "active",
  created_at: ago(90 + index),
  revoked_at: index % 6 === 0 ? ago(index + 1) : null,
  last_login_at: index % 5 === 0 ? null : ago(index % 8),
  shared_count: patient.shared_count,
}));

const activeInvitations = Array.from({ length: 8 }, (_, index) => ({
  id: `synthetic-invitation-active-${index + 1}`,
  expires_at: ahead(7 - index / 2),
  created_at: ago(index + 1),
  used_at: null,
  revoked_at: null,
  status: "active",
}));

const invitationHistory = Array.from({ length: 24 }, (_, index) => {
  const status = ["used", "expired", "revoked"][index % 3];
  return {
    id: `synthetic-invitation-history-${index + 1}`,
    expires_at: ago(index + 7),
    created_at: ago(index + 14),
    used_at: status === "used" ? ago(index + 8) : null,
    revoked_at: status === "revoked" ? ago(index + 8) : null,
    status,
  };
});

function jsonResponse(value, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  };
}

async function routeProfessionalPortal(page) {
  const controls = {
    failNextEntryRequest: false,
    failNextMapRequest: false,
    delayNextMapRequestMs: 0,
  };
  const mapSharesByPatient = new Map([
    [mapOnlyPatient.patient_id, [structuredClone(mapOnlyShare)]],
    [completePatient.patient_id, structuredClone(completeMapShares)],
  ]);

  await page.route("**/api/portal/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/portal/u, "");
    const method = request.method();

    if (path === "/config") {
      await route.fulfill(
        jsonResponse({
          configured: true,
          pending: false,
          public_site_url: "https://psico-mateus.github.io/",
          guide_url: "https://psico-mateus.github.io/guia-emocoes/",
          care_url: "https://psico-mateus.github.io/cuidados/",
          privacy_version: "2026-08-08",
        }),
      );
      return;
    }
    if (path === "/session") {
      await route.fulfill(
        jsonResponse({
          user: {
            id: "synthetic-therapist",
            name: "Mateus",
            role: "therapist",
          },
          csrf: "synthetic-csrf",
        }),
      );
      return;
    }
    if (path === "/professional/patients" && method === "GET") {
      await route.fulfill(
        jsonResponse({
          patients,
          activity: {
            total_count: 173,
            shared_count: 61,
            private_count: 112,
          },
        }),
      );
      return;
    }
    if (path === "/professional/accesses" && method === "GET") {
      await route.fulfill(jsonResponse({ patients: accesses }));
      return;
    }
    if (path === "/invitations" && method === "GET") {
      await route.fulfill(
        jsonResponse({
          invitations: [...activeInvitations, ...invitationHistory],
          status_at: now.toISOString(),
        }),
      );
      return;
    }
    if (path === "/invitations" && method === "POST") {
      await route.fulfill(
        jsonResponse({
          code: "CONVITE-LOCAL-2026",
          expires_at: ahead(7),
        }, 201),
      );
      return;
    }

    const patientEntriesMatch = path.match(
      /^\/professional\/patients\/([^/]+)\/entries$/u,
    );
    if (patientEntriesMatch && method === "GET") {
      if (controls.failNextEntryRequest) {
        controls.failNextEntryRequest = false;
        await route.fulfill(
          jsonResponse({ error: "Não foi possível atualizar os registros." }, 503),
        );
        return;
      }
      const patientId = decodeURIComponent(patientEntriesMatch[1]);
      await route.fulfill(
        jsonResponse({ entries: patientId === completePatient.patient_id ? entries : [] }),
      );
      return;
    }

    const patientMapsMatch = path.match(
      /^\/professional\/patients\/([^/]+)\/map-shares$/u,
    );
    if (patientMapsMatch && method === "GET") {
      if (controls.delayNextMapRequestMs > 0) {
        const delay = controls.delayNextMapRequestMs;
        controls.delayNextMapRequestMs = 0;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      }
      if (controls.failNextMapRequest) {
        controls.failNextMapRequest = false;
        await route.fulfill(
          jsonResponse({ error: "Não foi possível atualizar as partes do mapa." }, 503),
        );
        return;
      }
      const patientId = decodeURIComponent(patientMapsMatch[1]);
      await route.fulfill(
        jsonResponse({ shares: mapSharesByPatient.get(patientId) ?? [] }),
      );
      return;
    }

    const viewedMapMatch = path.match(
      /^\/professional\/patients\/([^/]+)\/map-shares\/([^/]+)\/viewed$/u,
    );
    if (viewedMapMatch && method === "POST") {
      const patientId = decodeURIComponent(viewedMapMatch[1]);
      const mapId = decodeURIComponent(viewedMapMatch[2]);
      const shares = mapSharesByPatient.get(patientId) ?? [];
      const viewedAt = now.toISOString();
      const share = shares.find((item) => item.map_id === mapId);
      if (share) {
        share.viewed_at = viewedAt;
        share.is_unread = 0;
      }
      await route.fulfill(jsonResponse({ viewed_at: viewedAt }));
      return;
    }

    const viewedEntryMatch = path.match(
      /^\/professional\/entries\/([^/]+)\/viewed$/u,
    );
    if (viewedEntryMatch && method === "POST") {
      await route.fulfill(jsonResponse({ viewed_at: now.toISOString() }));
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });
  return controls;
}

async function assertAccessible(page, label) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target).slice(0, 4),
    }));
  });
  if (violations.length > 0) {
    throw new Error(
      `${label}: falhas automáticas de acessibilidade ${JSON.stringify(violations)}`,
    );
  }
}

async function assertViewportFits(page, label) {
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.innerWidth) {
    throw new Error(
      `${label}: overflow horizontal ${dimensions.scrollWidth}px > ${dimensions.innerWidth}px`,
    );
  }
  return dimensions;
}

async function reviewScreen(page, label, screenshotName) {
  await assertAccessible(page, label);
  await assertViewportFits(page, label);
  const captureStyle = await page.addStyleTag({
    content:
      ".site-header{position:relative!important;top:auto!important}" +
      ".skip-link{display:none!important}",
  });
  try {
    await page.screenshot({ path: resolve(outputDir, screenshotName), fullPage: true });
  } finally {
    await captureStyle.evaluate((element) => element.remove());
  }
}

function trackRuntimeErrors(page, label, expectedConsoleError) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !expectedConsoleError?.test(message.text())
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return () => {
    if (errors.length > 0) {
      throw new Error(`${label}: erros no navegador ${JSON.stringify(errors)}`);
    }
  };
}

async function assertUniqueActionNames(locator, label) {
  const names = await locator.evaluateAll((elements) =>
    elements.map((element) =>
      (element.getAttribute("aria-label") || element.textContent || "").trim(),
    ),
  );
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new Error(`${label}: ações repetidas sem nome acessível único ${JSON.stringify(names)}`);
  }
}

async function reviewProfessional(browserType, label, viewport) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const assertNoRuntimeErrors = trackRuntimeErrors(
    page,
    label,
    /503 \(Service Unavailable\)/u,
  );
  const routeControls = await routeProfessionalPortal(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Olá, Mateus.", exact: true }).waitFor();
  await page.locator(".patient-summary-card").first().waitFor();
  if ((await page.locator(".patient-summary-card").count()) !== 15) {
    throw new Error(`${label}: a atividade não iniciou limitada a 15 pacientes`);
  }
  await page.getByRole("button", { name: /Mostrar mais pacientes:/u }).click();
  if ((await page.locator(".patient-summary-card").count()) !== patients.length) {
    throw new Error(`${label}: Mostrar mais não revelou o lote restante de pacientes`);
  }
  await page.getByLabel("Ordenar por").selectOption("alphabetical");
  if ((await page.locator(".patient-summary-card").count()) !== 15) {
    throw new Error(`${label}: mudar a ordem não reiniciou o limite da atividade`);
  }
  await page.getByLabel("Ordenar por").selectOption("unread");
  await page.getByLabel("Buscar paciente").fill("Mapa Apenas");

  const mapOnlyCard = page
    .locator(".patient-summary-card")
    .filter({ hasText: mapOnlyPatient.patient_name });
  await mapOnlyCard.waitFor();
  const mapOnlyText = await mapOnlyCard.innerText();
  if (mapOnlyText.includes("Nenhum conteúdo compartilhado")) {
    throw new Error(`${label}: paciente com mapa compartilhado apareceu sem conteúdo`);
  }
  const mapOnlyViewClass =
    (await mapOnlyCard.locator(".patient-summary-view-count").getAttribute("class")) ?? "";
  if (!mapOnlyViewClass.includes("has-unread")) {
    throw new Error(`${label}: pendência somente no mapa ficou sem destaque`);
  }
  await page.getByLabel("Buscar paciente").fill("");
  await assertUniqueActionNames(
    page.locator(".patient-summary-card button"),
    `${label}-ações-dos-pacientes`,
  );
  await reviewScreen(page, `${label}-inicio`, `${label}-inicio.png`);

  await page.getByRole("button", { name: "Ocultar dados na tela", exact: true }).click();
  await page.getByRole("heading", { name: "Dados ocultos na tela.", exact: true }).waitFor();
  if (await page.getByText(mapOnlyPatient.patient_name, { exact: true }).count()) {
    throw new Error(`${label}: o modo privacidade manteve nome de paciente no DOM visível`);
  }
  await assertAccessible(page, `${label}-modo-privacidade`);
  await page.getByRole("button", { name: "Mostrar dados na tela", exact: true }).click();
  await page.locator(".patient-summary-card").first().waitFor();

  const completeCard = page
    .locator(".patient-summary-card")
    .filter({ hasText: completePatient.patient_name });
  await completeCard.getByRole("button").click();
  await page
    .getByRole("heading", { name: completePatient.patient_name, exact: true })
    .waitFor();
  await page.locator(".professional-map-disclosure").first().waitFor();
  await page.locator(".professional-record-disclosure").first().waitFor();
  if ((await page.locator(".professional-record-disclosure").count()) !== 20) {
    throw new Error(`${label}: a lista longa não iniciou com 20 registros`);
  }
  await page.getByRole("button", { name: /Mostrar mais registros/u }).click();
  if ((await page.locator(".professional-record-disclosure").count()) !== entries.length) {
    throw new Error(`${label}: Mostrar mais não revelou os registros restantes`);
  }

  routeControls.failNextMapRequest = true;
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  const partialWarning = page.getByText(
    /As partes do mapa não puderam ser atualizadas/u,
  );
  await partialWarning.waitFor();
  if (
    (await page.locator(".professional-map-disclosure").count()) !==
    completeMapShares.length
  ) {
    throw new Error(`${label}: a falha parcial ocultou mapas já carregados`);
  }
  if ((await page.locator(".professional-record-disclosure").count()) !== entries.length) {
    throw new Error(`${label}: a falha parcial ocultou registros disponíveis`);
  }
  await page
    .getByRole("button", { name: "Tentar atualizar novamente", exact: true })
    .click();
  await partialWarning.waitFor({ state: "detached" });

  routeControls.failNextEntryRequest = true;
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  const inversePartialWarning = page.getByText(
    /Os registros não puderam ser atualizados/u,
  );
  await inversePartialWarning.waitFor();
  if (
    (await page.locator(".professional-map-disclosure").count()) !==
    completeMapShares.length
  ) {
    throw new Error(`${label}: a falha dos registros ocultou mapas disponíveis`);
  }
  if ((await page.locator(".professional-record-disclosure").count()) !== entries.length) {
    throw new Error(`${label}: a falha dos registros ocultou dados já carregados`);
  }
  await page
    .getByRole("button", { name: "Tentar atualizar novamente", exact: true })
    .click();
  await inversePartialWarning.waitFor({ state: "detached" });

  routeControls.delayNextMapRequestMs = 350;
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.getByRole("button", { name: "Atualizando…", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ocultar dados na tela", exact: true }).click();
  await page.getByRole("heading", { name: "Dados ocultos na tela.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Mostrar dados na tela", exact: true }).click();
  await page
    .getByRole("heading", { name: completePatient.patient_name, exact: true })
    .waitFor();
  await page.locator(".professional-record-disclosure").first().waitFor();
  await page.getByRole("button", { name: "Atualizar", exact: true }).waitFor();

  const unreadFilter = page
    .locator(".entry-view-toolbar button")
    .filter({ hasText: "Não vistos" });
  await unreadFilter.click();
  const firstUnreadDisclosure = page.locator(".professional-record-disclosure.is-unread").first();
  await firstUnreadDisclosure.locator("summary").click();
  await firstUnreadDisclosure
    .getByRole("button", { name: "Concluir visualização", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.activeElement?.matches(
      ".professional-record-disclosure.is-unread > summary",
    ),
  );
  await page
    .locator(".entry-view-toolbar button")
    .filter({ hasText: "Todos" })
    .click();

  const mapDisclosure = page
    .locator(".professional-map-disclosure")
    .filter({ hasText: "Meu mapa · Meu jeito" });
  const mapSummary = mapDisclosure.locator("summary");
  await mapSummary.click();
  await mapDisclosure
    .getByRole("button", { name: "Concluir visualização", exact: true })
    .click();
  await mapDisclosure
    .getByText("Visualização já confirmada para o paciente.", { exact: true })
    .waitFor();
  await page.waitForFunction(() => {
    const disclosure = [...document.querySelectorAll(".professional-map-disclosure")].find(
      (element) => element.textContent?.includes("Meu mapa · Meu jeito"),
    );
    return disclosure?.querySelector("summary") === document.activeElement;
  });
  await reviewScreen(page, `${label}-detalhe`, `${label}-detalhe.png`);

  await page.getByRole("button", { name: /Acessos de pacientes/u }).click();
  await page.getByRole("heading", { name: "Acessos de pacientes", exact: true }).waitFor();
  await page.locator(".patient-access-card").first().waitFor();
  if ((await page.locator(".patient-access-card").count()) !== 15) {
    throw new Error(`${label}: a lista de acessos não iniciou limitada a 15 pacientes`);
  }
  await page.getByRole("button", { name: /Mostrar mais acessos:/u }).click();
  if ((await page.locator(".patient-access-card").count()) !== accesses.length) {
    throw new Error(`${label}: Mostrar mais não revelou o lote restante de acessos`);
  }
  await page.getByLabel("Buscar paciente").fill("Mapa Apenas");
  if ((await page.locator(".patient-access-card").count()) !== 1) {
    throw new Error(`${label}: a busca de acessos não mostrou o resultado esperado`);
  }
  await page.getByLabel("Buscar paciente").fill("");
  if ((await page.locator(".patient-access-card").count()) !== 15) {
    throw new Error(`${label}: mudar a busca não reiniciou o limite dos acessos`);
  }
  await assertUniqueActionNames(
    page.locator(".patient-access-actions button"),
    `${label}-ações-de-acesso`,
  );
  await reviewScreen(page, `${label}-acessos`, `${label}-acessos.png`);

  const firstInvitationRefresh = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith("/api/portal/invitations"),
  );
  await page.getByRole("button", { name: /Convites/u }).click();
  await firstInvitationRefresh;
  await page.getByRole("heading", { name: "Convites", exact: true }).waitFor();
  await page.getByRole("button", { name: "Gerar convite", exact: true }).click();
  await page.getByText("CONVITE-LOCAL-2026", { exact: true }).waitFor();
  await page.getByRole("button", { name: `Mostrar todos (${activeInvitations.length})` }).click();
  await assertUniqueActionNames(
    page.locator(".invitation-section .invitation-item .danger-button"),
    `${label}-revogação-de-convites`,
  );
  await page.locator(".invitation-history>summary").click();
  if ((await page.locator(".invitation-history .invitation-item").count()) !== 20) {
    throw new Error(`${label}: o histórico longo não iniciou limitado a 20 convites`);
  }
  await page
    .getByRole("button", { name: `Mostrar todo o histórico (${invitationHistory.length})` })
    .click();
  if (
    (await page.locator(".invitation-history .invitation-item").count()) !==
    invitationHistory.length
  ) {
    throw new Error(`${label}: o histórico sintético não cobriu mais de 20 convites`);
  }
  await reviewScreen(page, `${label}-convites`, `${label}-convites.png`);

  await page.getByRole("button", { name: /Conteúdos compartilhados/u }).click();
  const invitationRefreshAfterReturn = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith("/api/portal/invitations"),
  );
  await page.getByRole("button", { name: /Convites/u }).click();
  await invitationRefreshAfterReturn;
  if (await page.getByText("CONVITE-LOCAL-2026", { exact: true }).count()) {
    throw new Error(`${label}: o código recém-gerado reapareceu após sair de Convites`);
  }
  const invitationRefreshAfterVisibility = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith("/api/portal/invitations"),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await invitationRefreshAfterVisibility;

  const dimensions = await assertViewportFits(page, `${label}-final`);
  assertNoRuntimeErrors();
  await browser.close();
  return {
    ...dimensions,
    patients: patients.length,
    entries: entries.length,
    accesses: accesses.length,
    invitationHistory: invitationHistory.length,
  };
}

await mkdir(outputDir, { recursive: true });
const results = [];
results.push(
  await reviewProfessional(webkit, "professional-webkit-320", {
    width: 320,
    height: 700,
  }),
);
results.push(
  await reviewProfessional(webkit, "professional-webkit-390", {
    width: 390,
    height: 844,
  }),
);
results.push(
  await reviewProfessional(chromium, "professional-chromium-desktop", {
    width: 1366,
    height: 900,
  }),
);

console.log(
  JSON.stringify({
    ok: true,
    scope: "professional-local-synthetic-only",
    baseUrl,
    outputDir,
    accessibility: "axe WCAG A/AA sem violações automáticas",
    results,
  }),
);
