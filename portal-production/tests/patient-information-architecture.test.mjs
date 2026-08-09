import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8");
const resources = await readFile(new URL("../app/PatientResources.tsx", import.meta.url), "utf8");
const map = await readFile(new URL("../app/PatientMapShell.tsx", import.meta.url), "utf8");
const mapCatalog = await readFile(new URL("../content/patient-map-catalog.ts", import.meta.url), "utf8");
const tools = await readFile(new URL("../app/PatientToolsShell.tsx", import.meta.url), "utf8");
const navigationState = await readFile(new URL("../app/patient-navigation.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("patient navigation has four clear destinations in the intended order", () => {
  assert.match(navigationState, /type PatientArea = "home" \| "records" \| "map" \| "resources"/u);
  const navigation = app.match(
    /<nav className="patient-navigation"[\s\S]*?<\/nav>/u,
  )?.[0] ?? "";
  const labels = ["Início", "Meus registros", "Meu mapa", "Recursos"];
  let previousIndex = -1;
  for (const label of labels) {
    const index = navigation.indexOf(label);
    assert.ok(index > previousIndex, `${label} should follow the previous destination`);
    previousIndex = index;
  }
  assert.match(app, /aria-current=\{area === "map" \? "page" : undefined\}/u);
  assert.match(app, /aria-current=\{area === "resources" \? "page" : undefined\}/u);
  assert.match(css, /\.patient-navigation\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/u);
  assert.match(css, /@media\(max-width:560px\)\{[\s\S]*?\.patient-navigation\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/u);
  assert.match(app, /window\.addEventListener\("popstate", restoreRouteFromHistory\)/u);
  assert.match(navigationState, /#recursos\/ferramentas/u);
  assert.match(navigationState, /#recursos\/leituras/u);
});

test("home separates the four patient uses without adding progress pressure", () => {
  for (const phrase of [
    "O que pode ajudar você agora?",
    "Registrar algo",
    "Voltar aos meus registros",
    "Abrir Meu mapa",
    "Ver recursos",
    "Nada é compartilhado automaticamente",
  ]) {
    assert.match(app, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.doesNotMatch(app, /sequência de dias|meta semanal|pontuação do mapa/iu);
  assert.doesNotMatch(app, /patient-start-number/u);
  assert.match(app, /Continuar registro/u);
});

test("resources keep practical tools, readings and the public Guide distinct", () => {
  assert.match(resources, /Ferramentas do dia a dia/u);
  assert.match(resources, /Leitura complementar/u);
  assert.match(resources, /Abrir uma ferramenta não salva atividade/u);
  assert.match(resources, /Nada é compartilhado por abrir uma leitura/u);
  assert.match(resources, /Funciona sem conta e separado da Área do paciente/u);
  assert.match(resources, /target="_blank" rel="noopener noreferrer"/u);
  assert.match(resources, /<PatientEducation[\s\S]*?selectedSlug=\{selectedEducationSlug\}/u);
  assert.match(app, /function changeEducationArticle[\s\S]*?resourceView: "readings"/u);
  assert.match(resources, /onCreateRecord=\{onCreateRecordFromTool\}/u);
});

test("map is private and persistent while tools remain ephemeral and untracked", () => {
  for (const phrase of ["Meu jeito", "Interesses", "Vínculos", "Limites", "Futuro"]) {
    assert.match(mapCatalog, new RegExp(phrase, "u"));
  }
  assert.match(map, /Isto não é um teste e não existe resultado certo/u);
  assert.match(map, /Qual resposta se aproxima mais de você agora/u);
  assert.match(map, /salvas de forma privada na sua conta e não aparecem para Mateus/u);
  assert.match(map, /Nada desta área é compartilhado com Mateus/u);
  assert.match(map, /Não é\s+nota, resultado ou interpretação/u);
  assert.match(tools, /Abrir ou usar uma ferramenta não cria histórico nem informa Mateus/u);
  assert.match(tools, /Filtrar ferramentas por situação/u);

  const untrackedContentShells = `${resources}\n${map}\n${mapCatalog}\n${tools}`;
  for (const forbidden of [
    "portalRequest(",
    "fetch(",
    "localStorage",
    "sessionStorage",
    "document.cookie",
  ]) {
    assert.equal(untrackedContentShells.includes(forbidden), false, forbidden);
  }
});

test("the workbook synthesis is one clearly global patient-map section", () => {
  const synthesisLabel = "Minha síntese do mapa pessoal";
  const synthesisIndex = map.indexOf(synthesisLabel);
  const perMapSummaryIndex = map.indexOf('if (view === "summary")');
  assert.ok(synthesisIndex > -1, "a síntese geral deve estar visível no Meu mapa");
  assert.ok(
    synthesisIndex < perMapSummaryIndex,
    "a síntese geral não deve parecer pertencer ao resumo de um único mapa",
  );
  assert.equal(map.split(synthesisLabel).length - 1, 1);
  assert.match(map, /Esta síntese é geral/u);
});

test("moving through the map alone does not create a false unsaved-content warning", () => {
  const draftCheck = map.match(
    /export function hasPatientMapSessionDraft[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  assert.match(draftCheck, /draft\.answers/u);
  assert.match(draftCheck, /draft\.synthesis/u);
  assert.doesNotMatch(draftCheck, /draft\.positions/u);
});
