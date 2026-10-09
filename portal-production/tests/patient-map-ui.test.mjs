import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import axe from "axe-core";

const baseUrl = process.env.PORTAL_MAP_UI_BASE_URL;
const browserName = process.env.PORTAL_MAP_UI_BROWSER ?? "chromium";
const outputDir = resolve(process.env.PORTAL_MAP_UI_OUTPUT ?? "/tmp/area-paciente-map-ui");
if (!["chromium", "webkit"].includes(browserName)) throw new Error("Use chromium ou webkit para validar Meu mapa.");
if (baseUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)
    || !new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname)
    || url.username || url.password) {
    throw new Error("Os testes do mapa aceitam somente um servidor local isolado.");
  }
}

const version = "mapa-pessoal-refinado-ouro-v1";
const timestamp = "2026-10-09T12:00:00.000Z";
const firstAnswer = { type: "answer", id: "meu-jeito.01.1", value: {
  response: "fits", note: "Observação sintética que deve continuar guardada." }, revision: 1, updated_at: timestamp };
const seedFields = [firstAnswer,
  { type: "answer", id: "meu-jeito.01.2", value: { response: null, note: "Uma nota sintética sem marcar uma opção." }, revision: 1, updated_at: timestamp },
  { type: "answer", id: "interesses.01.1", value: { response: "curious", note: "Outro tema preservado." }, revision: 1, updated_at: timestamp },
  { type: "synthesis", id: "already-fits", value: "Síntese sintética e privada.", revision: 1, updated_at: timestamp },
  { type: "position", id: "meu-jeito", value: { sectionIndex: 0, itemIndex: 1 }, revision: 1, updated_at: timestamp },
];

// Browser plugin not available. Installed Playwright browsers exercise only a
// localhost page. All API responses are simulated; foreign requests are blocked.
// Flow: theme -> item -> saved answer/note -> resume/summary/share, preserving
// the existing catalogue IDs, private defaults and explicit versioned sharing.
describe("Meu mapa — isolated mocked API only", { skip: !baseUrl }, () => {
  let browser;
  let expect;
  const fixtures = new Set();
  before(async () => {
    const playwright = await import("../../node_modules/@playwright/test/index.mjs");
    expect = playwright.expect;
    browser = await playwright[browserName].launch({ headless: true });
    await mkdir(outputDir, { recursive: true });
  });
  after(async () => {
    for (const fixture of fixtures) await fixture.context.close();
    await browser?.close();
  });
  afterEach(async () => {
    for (const fixture of fixtures) await fixture.context.close();
    fixtures.clear();
  });

  async function openMap({ fields = [], shares = [], loadFailure = 0, sharingLoadFailure = 0,
    viewport = { width: 390, height: 844 } } = {}) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    const controls = { fields: new Map(structuredClone(fields).map(field => [`${field.type}:${field.id}`, field])),
      shares: new Map(structuredClone(shares).map(share => [share.map_id, share])), generation: 1,
      loadFailure, sharingLoadFailure, saveFailure: 0, saveConflict: null, sharingFailure: 0,
      unexpected: [], foreignRequests: [], runtimeErrors: [], mutations: [], sharedSnapshots: new Map() };
    const fixture = { context, page, controls };
    fixtures.add(fixture);
    page.on("pageerror", error => controls.runtimeErrors.push(error.message));
    page.on("console", message => {
      if (!["error", "warning"].includes(message.type())) return;
      const text = message.text();
      if (text === "Service Worker registration blocked by Playwright") return;
      if (/Failed to load resource: the server responded with a status of (?:409|503)\b/u.test(text)) return;
      controls.runtimeErrors.push(text);
    });
    const origin = new URL(baseUrl).origin;
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      controls.foreignRequests.push(url.origin);
      return route.abort();
    });
    await page.route("**/api/portal/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/portal/u, "");
      const method = request.method();
      const respond = (payload, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      if (url.origin !== origin) { controls.foreignRequests.push(url.origin); return route.abort(); }
      if (method !== "GET") controls.mutations.push({ path, method,
        payload: request.postData() ? request.postDataJSON() : null, csrf: request.headers()["x-csrf-token"] });
      if (path === "/config" && method === "GET") return respond({ configured: true, pending: false,
        privacy_version: "2026-10-09", public_site_url: "https://psico-mateus.github.io/",
        guide_url: "https://psico-mateus.github.io/guia-emocoes/", care_url: "https://psico-mateus.github.io/cuidados/" });
      if (path === "/session" && method === "GET") return respond({
        user: { id: "synthetic-map-patient", name: "Paciente Sintético", role: "patient" }, csrf: "synthetic-map-csrf" });
      if (path === "/entries" && method === "GET") return respond({ entries: [] });
      if (path === "/notices" && method === "GET") return respond({ notices: [], unread_count: 0, next_cursor: null });
      if (path === "/map-draft") {
        if (method === "GET") return controls.loadFailure
          ? respond({ error: "Falha sintética ao carregar o mapa." }, controls.loadFailure)
          : respond({ content_version: version, generation: controls.generation, fields: [...controls.fields.values()] });
        if (method === "PATCH") {
          const body = request.postDataJSON();
          if (controls.saveConflict) {
            const field = structuredClone(controls.saveConflict);
            controls.saveConflict = null;
            controls.fields.set(`${field.type}:${field.id}`, field);
            return respond({ error: "Este campo foi alterado em outra aba ou aparelho.",
              code: "map_draft_field_conflict", content_version: version, generation: controls.generation, field }, 409);
          }
          if (controls.saveFailure) return respond({ error: "Falha sintética ao salvar o mapa." }, controls.saveFailure);
          const key = `${body.field.type}:${body.field.id}`;
          const field = { ...body.field, revision: (controls.fields.get(key)?.revision ?? 0) + 1, updated_at: timestamp };
          controls.fields.set(key, field);
          await new Promise(resolveDelay => setTimeout(resolveDelay, 80));
          return respond({ content_version: version, generation: controls.generation, field, idempotent: false });
        }
        if (method === "DELETE") {
          controls.generation += 1;
          controls.fields.clear();
          controls.shares.clear();
          return respond({ content_version: version, generation: controls.generation, cleared_at: timestamp, idempotent: false });
        }
      }
      if (path === "/map-sharing" && method === "GET") return controls.sharingLoadFailure
        ? respond({ error: "Falha sintética ao confirmar compartilhamento." }, controls.sharingLoadFailure)
        : respond({ shares: [...controls.shares.values()] });
      const sharing = path.match(/^\/map-sharing\/([a-z0-9-]+)$/u);
      if (sharing && method === "PATCH") {
        if (controls.sharingFailure) return respond({ error: "Falha sintética ao compartilhar." }, controls.sharingFailure);
        const { shared } = request.postDataJSON();
        if (shared) {
          const share = { map_id: sharing[1], shared_at: timestamp, viewed_at: null };
          controls.shares.set(sharing[1], share);
          controls.sharedSnapshots.set(sharing[1], structuredClone([...controls.fields.values()].filter(field =>
            field.type === "answer" && field.id.startsWith(`${sharing[1]}.`))));
          return respond({ ok: true, share });
        }
        controls.shares.delete(sharing[1]);
        controls.sharedSnapshots.delete(sharing[1]);
        return respond({ ok: true });
      }
      controls.unexpected.push(`${method} ${path}`);
      return respond({ error: "Rota não simulada; nenhuma requisição foi encaminhada ao servidor." }, 500);
    });
    const url = new URL(baseUrl);
    url.hash = "meu-mapa";
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Área do paciente/u);
    await expect(page.getByRole("heading", { level: 1, name: "Meu mapa", exact: true })).toBeVisible();
    await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
    assert.equal(new URL(page.url()).origin, origin);
    return fixture;
  }

  async function question(fixture, title = "Ter tempo sozinho") {
    await fixture.page.locator("#patient-map-card-meu-jeito").click();
    await expect(fixture.page.locator("#patient-map-theme-title")).toHaveText("Meu jeito");
    const resume = fixture.page.locator("#patient-map-theme-continue");
    if (await resume.count()) await resume.click();
    else await fixture.page.locator('[id="patient-map-pick-meu-jeito.01.1"]').click();
    await expect(fixture.page.locator("#patient-map-question-title")).toHaveText(title);
    await expect(fixture.page.locator("#patient-map-question-title")).toBeFocused();
  }
  async function saved(fixture) { await expect(fixture.page.getByText("Salvo na sua conta", { exact: true })).toBeVisible(); }
  async function keyboardFocus(page, target) {
    await target.focus();
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await page.keyboard.press(browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab");
    await expect(target).toBeFocused();
    await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  }
  async function healthy(fixture, label) {
    const { page, controls } = fixture;
    assert.deepEqual(controls.unexpected, [], "All API routes are simulated.");
    assert.deepEqual(controls.foreignRequests, [], "Foreign URLs are blocked.");
    assert.deepEqual(controls.runtimeErrors, [], "No unexpected browser errors or warnings.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "No horizontal overflow.");
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map(({ id, nodes }) =>
      ({ id, targets: nodes.map(node => node.target) })));
    assert.deepEqual(violations, [], "Automated accessibility checks.");
    await page.screenshot({ path: resolve(outputDir, `${label}-${browserName}.png`), fullPage: false });
  }
  const note = page => page.getByLabel("Quer acrescentar algo?", { exact: false });
  const mapMutations = controls => controls.mutations.filter(mutation => mutation.path === "/map-draft");
  const shareMutations = controls => controls.mutations.filter(mutation => mutation.path.startsWith("/map-sharing/"));
  async function openSummary(page) {
    const summary = page.getByRole("button", { name: "Ver respostas deste tema", exact: true });
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.getByRole("heading", { name: "Minhas respostas", exact: true })).toBeVisible();
  }

  test("empty overview separates exploration and review and picks a real item without inventing answers", async () => {
    const fixture = await openMap();
    await expect(fixture.page.locator('[id^="patient-map-card-"]')).toHaveCount(5);
    const order = await fixture.page.evaluate(() => {
      const theme = document.getElementById("patient-map-card-meu-jeito");
      const sharing = document.getElementById("patient-map-view-sharing");
      return Boolean(theme.compareDocumentPosition(sharing) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(order, false, "The three clear task destinations precede theme exploration.");
    await question(fixture);
    await expect(note(fixture.page)).toBeVisible();
    assert.equal(await note(fixture.page).evaluate(node => Boolean(node.closest("details"))), false);
    assert.equal([...fixture.controls.fields.values()].filter(field => field.type !== "position").length, 0, "Selecting an item only remembers its position, never creates an answer.");
    assert.equal(shareMutations(fixture.controls).length, 0);
    await healthy(fixture, "map-direct-empty");
  });

  test("saved position resumes directly and all unrelated answers, notes and synthesis survive", async () => {
    const fixture = await openMap({ fields: seedFields });
    const before = structuredClone([...fixture.controls.fields.values()]);
    await question(fixture, "Estar com alguém para recuperar energia");
    await expect(note(fixture.page)).toHaveValue(seedFields[1].value.note);
    await expect(fixture.page.getByLabel("Combina comigo", { exact: true })).not.toBeChecked();
    assert.deepEqual([...fixture.controls.fields.values()], before);
    await healthy(fixture, "map-resume");
  });

  test("the single optional example and subject hub remain discoverable without losing answers", async () => {
    const fixture = await openMap({ fields: seedFields });
    await question(fixture, "Estar com alguém para recuperar energia");
    const demonstration = fixture.page.locator(".patient-map-item-options.patient-map-demonstration");
    await expect(demonstration.locator("details")).toHaveCount(0);
    await demonstration.getByText("Ver um exemplo preenchido", { exact: true }).click();
    await expect(demonstration).toContainText("Viajar ou sair da rotina");
    await expect(demonstration).toContainText("Depende do contexto");
    await expect(demonstration).toContainText("gosto quando planejo, vou com poucas pessoas e fico poucos dias");
    await keyboardFocus(fixture.page, demonstration.locator(":scope > summary"));
    const exampleFocus = await demonstration.locator(":scope > summary").evaluate(node => {
      const style = getComputedStyle(node);
      return { width: Number.parseFloat(style.outlineWidth), offset: Number.parseFloat(style.outlineOffset), visible: node.matches(":focus-visible") };
    });
    assert.ok(exampleFocus.visible && exampleFocus.width >= 2 && exampleFocus.offset < 0,
      `Disclosure keyboard focus must stay inside its clipped container: ${JSON.stringify(exampleFocus)}`);
    await fixture.page.getByRole("button", { name: "Voltar ao tema", exact: true }).click();
    await expect(fixture.page.getByRole("heading", { name: "Meu jeito", exact: true })).toBeVisible();
    await expect(fixture.page.locator(".patient-map-topic-group")).toHaveCount(5);
    const subject = fixture.page.locator(".patient-map-topic-group").filter({ hasText: "Ritmo e organização" });
    await expect(subject.locator(":scope > summary")).toContainText("Abrir assunto");
    await subject.locator(":scope > summary").click();
    await expect(subject.locator(":scope > summary")).toContainText("Recolher assunto");
    await fixture.page.locator('[id="patient-map-pick-meu-jeito.02.1"]').click();
    await expect(fixture.page.locator("#patient-map-question-title")).toHaveText("Ter horários previsíveis");
    await expect(note(fixture.page)).toHaveValue("");
    assert.deepEqual(fixture.controls.fields.get("answer:meu-jeito.01.1"), firstAnswer);
    assert.deepEqual(fixture.controls.fields.get("answer:meu-jeito.01.2"), seedFields[1]);
    assert.deepEqual(fixture.controls.fields.get("synthesis:already-fits"), seedFields[3]);
    assert.equal(shareMutations(fixture.controls).length, 0);
    await healthy(fixture, "map-example-subject-hub");
  });

  test("response and visible note autosave together, allow skipping and preserve content when returning", async () => {
    const fixture = await openMap();
    await question(fixture);
    await fixture.page.getByLabel("Combina comigo", { exact: true }).check();
    await note(fixture.page).fill(firstAnswer.value.note);
    await saved(fixture);
    assert.deepEqual(fixture.controls.fields.get("answer:meu-jeito.01.1").value, firstAnswer.value);
    await fixture.page.getByRole("button", { name: "Próximo item", exact: true }).click();
    await expect(fixture.page.locator("#patient-map-question-title")).toHaveText("Estar com alguém para recuperar energia");
    await fixture.page.getByRole("button", { name: "Próximo item", exact: true }).click();
    assert.equal(fixture.controls.fields.has("answer:meu-jeito.01.2"), false, "Skip creates no answer.");
    await fixture.page.getByRole("button", { name: "Anterior", exact: true }).click();
    await fixture.page.getByRole("button", { name: "Anterior", exact: true }).click();
    await expect(note(fixture.page)).toHaveValue(firstAnswer.value.note);
    await expect(fixture.page.getByLabel("Combina comigo", { exact: true })).toBeChecked();
    for (const mutation of mapMutations(fixture.controls)) {
      assert.equal(mutation.payload.content_version, version);
      assert.equal(mutation.csrf, "synthetic-map-csrf");
      assert.ok(mutation.payload.request_id);
    }
    assert.equal(shareMutations(fixture.controls).length, 0);
    await healthy(fixture, "map-answer-note-retained");
  });

  test("notes retain a 600-character limit and keyboard-visible focus without a disclosure", async () => {
    const fixture = await openMap();
    await question(fixture);
    await expect(note(fixture.page)).toHaveAttribute("maxlength", "600");
    await expect(note(fixture.page)).toHaveAttribute("aria-describedby", "patient-map-note-character-limit");
    await note(fixture.page).fill("x".repeat(599));
    await expect(fixture.page.locator("#patient-map-note-character-limit")).toContainText(/\b1\b/u);
    await saved(fixture);
    await note(fixture.page).focus();
    assert.ok(await note(fixture.page).evaluate(node => Number.parseFloat(getComputedStyle(node).outlineWidth)) >= 2);
    await healthy(fixture, "map-note-limit-keyboard");
  });

  test("summary shows saved response and note, including note-only items, with an exact editing path", async () => {
    const fixture = await openMap({ fields: seedFields });
    await question(fixture, "Estar com alguém para recuperar energia");
    await openSummary(fixture.page);
    const section = fixture.page.locator(".patient-map-section-summary");
    const group = section.locator("details").filter({ hasText: /Energia e descanso/u }).first();
    if (!(await group.evaluate(node => node.open))) await group.locator(":scope > summary").click();
    await expect(group).toContainText("Ter tempo sozinho");
    await expect(group).toContainText("Combina comigo");
    await expect(group).toContainText(firstAnswer.value.note);
    await expect(group).toContainText(seedFields[1].value.note);
    await keyboardFocus(fixture.page, group.locator(":scope > summary"));
    const summaryFocus = await group.locator(":scope > summary").evaluate(node => {
      const style = getComputedStyle(node);
      return { width: Number.parseFloat(style.outlineWidth), offset: Number.parseFloat(style.outlineOffset), visible: node.matches(":focus-visible") };
    });
    assert.ok(summaryFocus.visible && summaryFocus.width >= 2 && summaryFocus.offset < 0,
      `Disclosure keyboard focus must not be clipped outside the saved-answer group: ${JSON.stringify(summaryFocus)}`);
    const edit = group.getByRole("button", { name: "Editar resposta de Ter tempo sozinho", exact: true });
    assert.ok((await edit.getAttribute("aria-label")).startsWith((await edit.innerText()).trim()),
      "Accessible names must begin with their visible label for voice control.");
    await edit.click();
    await expect(fixture.page.locator("#patient-map-question-title")).toHaveText("Ter tempo sozinho");
    await expect(note(fixture.page)).toHaveValue(firstAnswer.value.note);
    await healthy(fixture, "map-summary-edit");
  });

  test("clearing one answer requires confirmation and never clears another item or synthesis", async () => {
    const fixture = await openMap({ fields: seedFields.map(field => field.type === "position"
      ? { ...field, value: { sectionIndex: 0, itemIndex: 0 } } : field) });
    await question(fixture);
    await fixture.page.locator(".patient-map-item-management > summary").click();
    await fixture.page.locator("#patient-map-clear-answer").click();
    await expect(fixture.page.locator("#patient-map-confirm-clear-answer")).toBeFocused();
    await fixture.page.getByRole("button", { name: "Manter resposta", exact: true }).click();
    await expect(fixture.page.locator("#patient-map-clear-answer")).toBeFocused();
    await expect(note(fixture.page)).toHaveValue(firstAnswer.value.note);
    await fixture.page.locator("#patient-map-clear-answer").click();
    await fixture.page.getByRole("button", { name: "Apagar agora", exact: true }).click();
    await saved(fixture);
    await expect(note(fixture.page)).toHaveValue("");
    await expect(fixture.page.locator("#patient-map-question-title")).toBeFocused();
    assert.equal(fixture.controls.fields.get("answer:meu-jeito.01.1").value, null);
    assert.deepEqual(fixture.controls.fields.get("answer:meu-jeito.01.2"), seedFields[1]);
    assert.deepEqual(fixture.controls.fields.get("synthesis:already-fits"), seedFields[3]);
    await healthy(fixture, "map-clear-one");
  });

  test("sharing is optional, confirmed, versioned and revocable without deleting private responses", async () => {
    const fixture = await openMap({ fields: seedFields });
    await fixture.page.locator("#patient-map-view-sharing").click();
    const share = fixture.page.getByRole("button", { name: "Compartilhar Meu jeito com Mateus", exact: true });
    await expect(share).toBeVisible();
    fixture.page.once("dialog", dialog => dialog.dismiss());
    await share.click();
    assert.equal(shareMutations(fixture.controls).length, 0, "Cancel never sends.");
    fixture.page.once("dialog", dialog => dialog.accept());
    await share.click();
    await expect(fixture.page.getByRole("button", { name: "Enviar novamente Meu jeito", exact: true })).toBeVisible();
    assert.deepEqual(shareMutations(fixture.controls).map(({ payload }) => payload), [{ shared: true }]);
    assert.equal(fixture.controls.sharedSnapshots.get("meu-jeito").length, 2);
    assert.equal(fixture.controls.sharedSnapshots.get("meu-jeito").some(field => field.type === "synthesis"), false);
    fixture.page.once("dialog", dialog => dialog.accept());
    await fixture.page.getByRole("button", { name: "Parar de compartilhar Meu jeito", exact: true }).click();
    await expect(share).toBeVisible();
    assert.deepEqual(shareMutations(fixture.controls).map(({ payload }) => payload), [{ shared: true }, { shared: false }]);
    assert.deepEqual(fixture.controls.fields.get("answer:meu-jeito.01.1"), firstAnswer);
    await healthy(fixture, "map-sharing-revoked");
  });

  test("synthesis remains optional, private and separate from theme sharing", async () => {
    const fixture = await openMap({ fields: seedFields });
    await fixture.page.locator("#patient-map-view-synthesis").click();
    await expect(fixture.page.getByRole("heading", { name: "Juntar o que percebi", exact: true })).toBeVisible();
    await expect(fixture.page.locator("#patient-map-synthesis-title")).toBeFocused();
    const synthesis = fixture.page.locator(".patient-map-synthesis-question textarea");
    await expect(synthesis).toHaveValue(seedFields[3].value);
    await synthesis.fill("Outra síntese sintética privada.");
    await expect(synthesis).toHaveValue("Outra síntese sintética privada.");
    await saved(fixture);
    assert.equal(fixture.controls.fields.get("synthesis:already-fits").value, "Outra síntese sintética privada.");
    assert.equal(shareMutations(fixture.controls).length, 0);
    await fixture.page.getByRole("button", { name: "Próxima pergunta", exact: true }).click();
    await expect(fixture.page.locator("#patient-map-synthesis-question-title")).toBeFocused();
    await healthy(fixture, "map-synthesis-private");
  });

  test("editing after sharing keeps the previous snapshot unchanged until an explicit resend", async () => {
    const fields = seedFields.map(field => field.type === "position"
      ? { ...field, value: { sectionIndex: 0, itemIndex: 0 } } : field);
    const fixture = await openMap({ fields });
    await fixture.page.locator("#patient-map-view-sharing").click();
    fixture.page.once("dialog", dialog => dialog.accept());
    await fixture.page.getByRole("button", { name: "Compartilhar Meu jeito com Mateus", exact: true }).click();
    await expect(fixture.page.getByRole("button", { name: "Enviar novamente Meu jeito", exact: true })).toBeVisible();
    const snapshot = structuredClone(fixture.controls.sharedSnapshots.get("meu-jeito"));
    await fixture.page.locator("#patient-map-view-overview").click();
    await question(fixture);
    await expect(fixture.page.locator(".patient-map-item-sharing-state")).toContainText("O que você mudar agora fica privado até um novo envio.");
    await note(fixture.page).fill("Nova observação sintética que ainda é privada.");
    await saved(fixture);
    assert.deepEqual(fixture.controls.sharedSnapshots.get("meu-jeito"), snapshot);
    assert.equal(shareMutations(fixture.controls).length, 1);
    await fixture.page.getByRole("button", { name: "Voltar ao tema", exact: true }).click();
    await fixture.page.getByRole("button", { name: "Voltar aos temas", exact: true }).click();
    await fixture.page.locator("#patient-map-view-sharing").click();
    fixture.page.once("dialog", dialog => dialog.accept());
    await fixture.page.getByRole("button", { name: "Enviar novamente Meu jeito", exact: true }).click();
    await expect(fixture.page.getByText("A versão atual de “Meu jeito” foi enviada para Mateus.", { exact: true })).toBeVisible();
    assert.equal(fixture.controls.sharedSnapshots.get("meu-jeito")[0].value.note, "Nova observação sintética que ainda é privada.");
    await healthy(fixture, "map-snapshot-explicit-resend");
  });

  test("an unsaved answer cannot be shared while its save continues to fail", async () => {
    const fixture = await openMap();
    await question(fixture);
    fixture.controls.saveFailure = 503;
    await note(fixture.page).fill("Observação sintética ainda não salva.");
    await expect(fixture.page.getByRole("button", { name: "Tentar salvar novamente", exact: true })).toBeVisible();
    await fixture.page.getByRole("button", { name: "Voltar ao tema", exact: true }).click();
    await fixture.page.getByRole("button", { name: "Voltar aos temas", exact: true }).click();
    await fixture.page.locator("#patient-map-view-sharing").click();
    fixture.page.once("dialog", dialog => dialog.accept());
    await fixture.page.getByRole("button", { name: "Compartilhar Meu jeito com Mateus", exact: true }).click();
    await expect(fixture.page.locator("#patient-map-sharing-feedback")).toHaveText("Espere o salvamento terminar antes de compartilhar. Nenhum compartilhamento foi alterado.");
    assert.equal(shareMutations(fixture.controls).length, 0);
    assert.equal(fixture.controls.shares.size, 0);
    await healthy(fixture, "map-unsaved-cannot-share");
  });

  test("failed initial load blocks editing and can recover without displaying an invented empty draft", async () => {
    const fixture = await openMap({ fields: seedFields, loadFailure: 503 });
    await expect(fixture.page.getByRole("alert")).toContainText("Seu mapa não pôde ser carregado agora.");
    await expect(fixture.page.locator('[id^="patient-map-card-"]')).toHaveCount(0);
    assert.equal(mapMutations(fixture.controls).length, 0);
    fixture.controls.loadFailure = 0;
    await fixture.page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await question(fixture, "Estar com alguém para recuperar energia");
    await expect(note(fixture.page)).toHaveValue(seedFields[1].value.note);
    await healthy(fixture, "map-load-recovered");
  });

  test("failed sharing lookup offers retry and never exposes unconfirmed sharing actions", async () => {
    const fixture = await openMap({ fields: seedFields, sharingLoadFailure: 503 });
    await fixture.page.locator("#patient-map-view-sharing").click();
    await expect(fixture.page.getByRole("alert")).toContainText("Não foi possível confirmar o que está compartilhado.");
    await expect(fixture.page.locator('[id^="patient-map-share-action-"]')).toHaveCount(0);
    fixture.controls.sharingLoadFailure = 0;
    await fixture.page.getByRole("button", { name: "Tentar consultar novamente", exact: true }).click();
    await expect(fixture.page.getByRole("button", { name: "Compartilhar Meu jeito com Mateus", exact: true })).toBeVisible();
    assert.equal(shareMutations(fixture.controls).length, 0);
    await healthy(fixture, "map-sharing-load-recovered");
  });

  test("autosave failure keeps local note editable and retry persists the same answer", async () => {
    const fixture = await openMap();
    await question(fixture);
    fixture.controls.saveFailure = 503;
    await note(fixture.page).fill(firstAnswer.value.note);
    await expect(fixture.page.getByRole("button", { name: "Tentar salvar novamente", exact: true })).toBeVisible();
    await expect(note(fixture.page)).toHaveValue(firstAnswer.value.note);
    fixture.controls.saveFailure = 0;
    await fixture.page.getByRole("button", { name: "Tentar salvar novamente", exact: true }).click();
    await saved(fixture);
    assert.deepEqual(fixture.controls.fields.get("answer:meu-jeito.01.1").value, { response: null, note: firstAnswer.value.note });
    await healthy(fixture, "map-save-retry");
  });

  for (const choice of ["local", "remote"]) {
    test(`conflict remains explicit and ${choice} choice applies only the conflicted field`, async () => {
      const fixture = await openMap({ fields: seedFields.map(field => field.type === "position"
        ? { ...field, value: { sectionIndex: 0, itemIndex: 0 } } : field) });
      await question(fixture);
      const remote = { ...firstAnswer, value: { response: "contextual", note: "Nota sintética salva em outra aba." }, revision: 2 };
      fixture.controls.saveConflict = remote;
      await note(fixture.page).fill("Nota sintética desta tela.");
      await expect(fixture.page.getByRole("button", { name: "Manter o que está nesta tela", exact: true })).toBeVisible();
      await expect(note(fixture.page)).toHaveValue("Nota sintética desta tela.");
      await fixture.page.getByRole("button", { name: choice === "local" ? "Manter o que está nesta tela" : "Usar a versão já salva", exact: true }).click();
      if (choice === "local") await saved(fixture);
      await expect(note(fixture.page)).toHaveValue(choice === "local" ? "Nota sintética desta tela." : remote.value.note);
      assert.deepEqual(fixture.controls.fields.get("answer:meu-jeito.01.2"), seedFields[1]);
      assert.deepEqual(fixture.controls.fields.get("synthesis:already-fits"), seedFields[3]);
      await healthy(fixture, `map-conflict-${choice}`);
    });
  }

  test("answer, note and autosave do not jump the screen; next question receives useful top focus", async () => {
    const fixture = await openMap();
    await question(fixture);
    const initial = await fixture.page.evaluate(() => ({ y: scrollY, top: document.getElementById("patient-map-question-card").getBoundingClientRect().top }));
    await fixture.page.getByLabel("Combina comigo", { exact: true }).check();
    await saved(fixture);
    const after = await fixture.page.evaluate(() => ({ y: scrollY, top: document.getElementById("patient-map-question-card").getBoundingClientRect().top }));
    assert.ok(Math.abs(initial.y - after.y) <= 2 && Math.abs(initial.top - after.top) <= 2, "Autosave must not trigger scroll.");
    await note(fixture.page).scrollIntoViewIfNeeded();
    await note(fixture.page).focus();
    await expect(note(fixture.page)).toBeFocused();
    await expect.poll(() => note(fixture.page).evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight;
    })).toBe(true);
    const beforeTyping = await fixture.page.evaluate(() => ({ y: scrollY, top: document.getElementById("patient-map-question-card").getBoundingClientRect().top }));
    await note(fixture.page).fill("Nota sintética para conferir estabilidade ao escrever.");
    await saved(fixture);
    const afterTyping = await fixture.page.evaluate(() => ({ y: scrollY, top: document.getElementById("patient-map-question-card").getBoundingClientRect().top }));
    assert.ok(Math.abs(beforeTyping.y - afterTyping.y) <= 2 && Math.abs(beforeTyping.top - afterTyping.top) <= 2,
      `Typing and autosave must not re-scroll an already focused note: ${JSON.stringify({ beforeTyping, afterTyping })}`);
    await fixture.page.getByRole("button", { name: "Próximo item", exact: true }).click();
    await expect(fixture.page.locator("#patient-map-question-title")).toBeFocused();
    const focusGeometry = await fixture.page.evaluate(() => {
      const card = document.getElementById("patient-map-question-card");
      const header = document.querySelector(".site-header");
      const headerRect = header.getBoundingClientRect();
      const fixedVisible = ["sticky", "fixed"].includes(getComputedStyle(header).position) && headerRect.bottom > 0;
      return { actual: card.getBoundingClientRect().top, expected: fixedVisible ? headerRect.bottom + 12 : 16 };
    });
    assert.ok(Math.abs(focusGeometry.actual - focusGeometry.expected) <= 3, "New question sits below any fixed header.");
    await healthy(fixture, "map-stable-scroll-next");
  });

  for (const width of [320, 390, 640, 1366]) {
    test(`layout ${width}px keeps writing and primary navigation accessible`, async () => {
      const fixture = await openMap({ viewport: { width, height: 900 } });
      await question(fixture);
      await saved(fixture);
      await expect(note(fixture.page)).toBeVisible();
      const order = await fixture.page.evaluate(() => {
        const card = document.getElementById("patient-map-question-card");
        const nav = document.querySelector(".patient-map-item-navigation");
        const privacy = document.querySelector(".patient-map-item-sharing-state");
        return Boolean(card.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING)
          && Boolean(nav.compareDocumentPosition(privacy) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.equal(order, true, "Primary navigation precedes ancillary sharing/options.");
      const options = await fixture.page.locator(".patient-map-response-options label").evaluateAll(nodes => nodes.map(node => {
        const bounds = node.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, font: Number.parseFloat(getComputedStyle(node).fontSize) };
      }));
      assert.equal(options.length, 6);
      for (const option of options) assert.ok(option.width >= 44 && option.height >= 44 && option.font >= 16);
      const radioSizes = await fixture.page.locator('.patient-map-response-options input[type="radio"]').evaluateAll(nodes => nodes.map(node => {
        const bounds = node.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }));
      for (const radio of radioSizes) assert.ok(radio.width <= 24 && radio.height <= 24,
        "Global text-input minimum heights must not inflate native radio controls.");
      assert.ok(await note(fixture.page).evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize)) >= 16);
      await healthy(fixture, `map-layout-${width}`);
    });
  }

  test("global chart counts current categories across themes, excludes note-only, filters and never sends content", async () => {
    const fields = [
      ["meu-jeito.01.1", "fits"], ["meu-jeito.01.3", "unknown"], ["interesses.01.1", "curious"],
      ["vinculos.01.1", "contextual"], ["limites.01.1", "tolerate"], ["futuro.01.1", "not_fit"],
      ["meu-jeito.01.4", "fits"], ["interesses.01.3", "fits"],
      ["interesses.01.2", "curious"], ["vinculos.01.2", "contextual"],
    ].map(([id, response]) => ({ type: "answer", id, value: { response, note: "" }, revision: 1, updated_at: timestamp }));
    fields.push(seedFields[1]);
    const fixture = await openMap({ fields, viewport: { width: 1464, height: 1074 } });
    await fixture.page.locator("#patient-map-view-review").click();
    await expect(fixture.page.locator("#patient-map-summary-title")).toBeFocused();
    await expect(fixture.page.getByLabel("Tema", { exact: true })).toHaveValue("all");
    const rows = fixture.page.locator(".patient-map-chart-rows li");
    await expect(rows).toHaveCount(6);
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => [node.dataset.response, Number(node.dataset.count)])),
      [["fits",3],["curious",2],["contextual",2],["tolerate",1],["not_fit",1],["unknown",1]]);
    const barWidths = await fixture.page.locator(".patient-map-chart-track > span").evaluateAll(nodes =>
      nodes.map(node => Number.parseFloat(node.style.width)));
    for (const [index, count] of [3,2,2,1,1,1].entries()) {
      assert.ok(Math.abs(barWidths[index] - count / 3 * 100) < .01,
        "Bar length must represent the exact count on the stated scale, not a score.");
    }
    await expect(fixture.page.locator(".patient-map-chart-note-only")).toContainText("1 item tem só uma observação");
    await fixture.page.getByLabel("Tema", { exact: true }).selectOption("meu-jeito");
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => Number(node.dataset.count))), [2,0,0,0,0,1]);
    await expect(fixture.page.locator(".patient-map-review-theme")).toHaveCount(1);
    await expect(fixture.page.locator(".patient-map-review-answers")).toContainText(seedFields[1].value.note);
    assert.equal(mapMutations(fixture.controls).length, 0, "Chart viewing and filtering only change local UI.");
    assert.equal(shareMutations(fixture.controls).length, 0);
    await fixture.page.getByLabel("Tema", { exact: true }).selectOption("all");
    await fixture.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await healthy(fixture, "map-global-graph-desktop");
    await fixture.page.screenshot({ path: resolve(outputDir, `map-review-full-desktop-${browserName}.png`), fullPage: true });
    await fixture.page.setViewportSize({ width: 390, height: 844 });
    await fixture.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await healthy(fixture, "map-review-mobile");
    await fixture.page.screenshot({ path: resolve(outputDir, `map-review-full-mobile-${browserName}.png`), fullPage: true });
  });

  for (const width of [320,390]) {
    test(`mobile global chart ${width}px retains exact labels and numbers with 200% text`, async () => {
      const fixture = await openMap({ fields: seedFields, viewport: { width, height: 900 } });
      await fixture.page.locator("#patient-map-view-review").click();
      await expect(fixture.page.locator(".patient-map-chart-rows li")).toHaveCount(6);
      await expect(fixture.page.locator(".patient-map-chart-note-only")).toContainText("1 item");
      await healthy(fixture, `map-global-graph-mobile-${width}`);
      await fixture.page.addStyleTag({ content: "html{font-size:200%!important}" });
      await healthy(fixture, `map-global-graph-mobile-${width}-text-200`);
      assert.equal(mapMutations(fixture.controls).length, 0);
    });
  }

  test("empty and note-only graphs never invent a result or turn an absent response into Ainda não sei", async () => {
    const empty = await openMap();
    await empty.page.locator("#patient-map-view-review").click();
    await expect(empty.page.locator(".patient-map-chart-rows li")).toHaveCount(0);
    await expect(empty.page.locator(".patient-map-review-empty")).toContainText("Ainda não há respostas");
    await healthy(empty, "map-chart-empty");
    const fixture = await openMap({ fields: [seedFields[1]] });
    await fixture.page.locator("#patient-map-view-review").click();
    await expect(fixture.page.locator(".patient-map-chart-empty")).toContainText("Você guardou observações");
    await expect(fixture.page.locator(".patient-map-chart-rows li")).toHaveCount(0);
    await expect(fixture.page.locator(".patient-map-review-answers")).toContainText("Só observação · sem opção marcada");
    await fixture.page.getByLabel("Tema", { exact: true }).selectOption("futuro");
    await expect(fixture.page.locator(".patient-map-review-empty")).toContainText("neste tema");
    assert.equal(mapMutations(fixture.controls).length,0);
    await healthy(fixture,"map-chart-notes-empty-filter");
  });

  test("synthesis-only content retains clear-all with cancellation and confirmed deletion", async () => {
    const fixture = await openMap({ fields: [seedFields[3]] });
    await fixture.page.locator(".patient-map-settings > summary").click();
    const clear = fixture.page.getByRole("button", { name: "Apagar todo o Meu mapa", exact: true });
    fixture.page.once("dialog", dialog => dialog.dismiss());
    await clear.click();
    assert.deepEqual(fixture.controls.fields.get("synthesis:already-fits"), seedFields[3]);
    assert.equal(mapMutations(fixture.controls).length,0);
    fixture.page.once("dialog", dialog => dialog.accept());
    await clear.click();
    await expect.poll(() => fixture.controls.fields.size).toBe(0);
    await expect(fixture.page.locator("#patient-map-title")).toBeFocused();
    await healthy(fixture,"map-clear-synthesis-only");
  });

  test("200% text and reduced motion preserve readable controls without horizontal scrolling", async () => {
    const fixture = await openMap({ viewport: { width: 1366, height: 900 } });
    await question(fixture);
    await fixture.page.addStyleTag({ content: "html{font-size:200%!important}" });
    assert.equal(await fixture.page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await expect(note(fixture.page)).toBeVisible();
    const bounds = await note(fixture.page).boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1366);
    await healthy(fixture, "map-text-200-percent");
  });
});
