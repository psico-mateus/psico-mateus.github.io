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
const homeActions = await readFile(new URL("../app/PatientHomeActions.tsx", import.meta.url), "utf8");
const homeCss = await readFile(new URL("../app/patient-home.css", import.meta.url), "utf8");

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
    "O que você quer fazer?",
    "Registrar algo",
    "Ver meus registros",
    "Abrir Meu mapa",
    "Ver recursos",
    "Guardar uma situação, emoção ou dúvida.",
    "Consultar seu histórico e os compartilhamentos.",
    "Observar gostos, limites e possibilidades.",
    "Encontrar ferramentas e leituras complementares.",
  ]) {
    assert.match(homeActions, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.doesNotMatch(app + homeActions, /sequência de dias|meta semanal|pontuação do mapa/iu);
  assert.doesNotMatch(homeActions, /patient-start-number/u);
  assert.match(homeActions, /Continuar registro/u);
  assert.match(app, /Seus registros começam privados/u);
  assert.match(app, /<PatientHomeActions hasDraft=\{Boolean\(editing\)\}/u);
  assert.doesNotMatch(homeActions, /fetch\(|portalRequest|localStorage|sessionStorage|useEffect/u);
  assert.match(homeCss, /transition: none/u);
  assert.match(homeCss, /grid-template-areas: "notices" "actions"/u);
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

test("map is private by default with explicit sharing while tools remain ephemeral", () => {
  for (const phrase of ["Meu jeito", "Interesses", "Vínculos", "Limites", "Futuro"]) {
    assert.match(mapCatalog, new RegExp(phrase, "u"));
  }
  assert.match(map, /type PatientMapView =[\s\S]*?"theme"[\s\S]*?"sharing"[\s\S]*?"synthesis"/u);
  assert.match(map, /Escolha um tema para retomar/u);
  assert.match(map, /Escolha um tema para começar/u);
  assert.match(map, /Qual opção chega mais perto do que você pensa hoje\?/u);
  assert.match(
    map,
    /Pergunta \{itemIndex \+ 1\} de \{activeSection\.items\.length\} neste assunto/u,
  );
  assert.match(map, /scrollPatientMapQuestionIntoView/u);
  assert.match(map, /id="patient-map-question-card"/u);
  assert.match(map, /onResolveConflict=\{onResolveConflict\}[\s\S]*?stable/u);
  assert.doesNotMatch(map, /Pergunta atual/u);
  assert.match(map, /Tudo fica só com você, a menos que escolha compartilhar um tema/u);
  assert.match(map, /O que Mateus pode ver/u);
  assert.match(map, /Todo o\s+restante do mapa continua privado/u);
  assert.match(map, /Enviar novamente/u);
  assert.match(map, /Parar de compartilhar/u);
  assert.match(map, /const shareableMaps = PATIENT_MAP_CATALOG\.maps\.filter/u);
  assert.match(map, /Depois de marcar ou escrever algo em um tema/u);
  assert.match(map, /Não foi possível confirmar o que está compartilhado/u);
  assert.match(map, /Tentar consultar novamente/u);
  assert.match(map, /sharesLoading \? \([\s\S]*?: sharesLoadError \? \(/u);
  assert.match(map, /`Compartilhar \$\{map\.navigationTitle\} com Mateus`/u);
  assert.match(map, /`Compartilhando \$\{map\.navigationTitle\}…`/u);
  assert.match(map, /`Enviar novamente \$\{map\.navigationTitle\}`/u);
  assert.match(map, /`Enviando novamente \$\{map\.navigationTitle\}…`/u);
  assert.match(map, /aria-label=\{`Parar de compartilhar \$\{map\.navigationTitle\}`\}/u);
  assert.match(map, /patient-map-share-action-\$\{map\.id\}/u);
  assert.match(map, /patient-map-clear-confirmation/u);
  assert.match(map, /A exclusão será salva automaticamente/u);
  assert.match(map, /A versão já enviada para Mateus não muda/u);
  assert.match(map, /encerra os\s+compartilhamentos com Mateus/u);
  assert.match(map, /patient-map-sharing-feedback/u);
  assert.match(map, /Manter resposta/u);
  assert.match(map, />\s*Parar de compartilhar\s*</u);
  assert.match(map, /Isso não é\s+acompanhamento em tempo real/u);
  assert.match(map, /Não é\s+nota,\s+resultado ou interpretação/u);
  assert.doesNotMatch(map, /Atualizar cópia|Salvar e voltar ao início|\d+ de 30 com resposta/u);
  assert.match(tools, /Abrir ou usar uma ferramenta não cria histórico nem informa Mateus/u);
  assert.match(tools, /Filtrar ferramentas por situação/u);

  const untrackedContentShells = `${resources}\n${mapCatalog}\n${tools}`;
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

test("map starts directly at the saved item while secondary choices remain reachable", () => {
  const openMap = map.slice(map.indexOf("  function openMap("), map.indexOf("  function openCurrentItem("));
  assert.match(openMap, /draft\.positions\?\.\[mapId\]/u);
  assert.match(openMap, /setSectionIndex\(nextSectionIndex\)/u);
  assert.match(openMap, /setItemIndex\(nextItemIndex\)/u);
  assert.match(openMap, /setView\("item"\)/u);
  assert.doesNotMatch(openMap, /setView\("theme"\)/u);

  const overview = map.slice(map.indexOf('{topLevelView === "overview" ? ('), map.indexOf('{topLevelView === "sharing" ? ('));
  assert.ok(overview.indexOf("patient-map-theme-picker") >= 0);
  assert.ok(overview.indexOf("patient-map-follow-up") > overview.indexOf("patient-map-theme-picker"));
  assert.match(overview, /Depois, se quiser[\s\S]*?\{mapNavigation\}/u);
  assert.match(map, /onClick=\{returnToTheme\}>Trocar de assunto/u);
  assert.match(map, /id="patient-map-theme-continue"/u);
});

test("map keeps optional notes visible and puts navigation before secondary sharing controls", () => {
  const workspace = map.slice(map.indexOf('<section className="patient-module patient-map-workspace"'));
  assert.match(workspace, /<div className="patient-map-note"[\s\S]*?<textarea[\s\S]*?onChange=\{\(event\) => updateNote\(event\.target\.value\)\}/u);
  assert.doesNotMatch(workspace, /<details[\s\S]*?className="patient-map-note"/u);
  assert.doesNotMatch(map, /noteOpenByItem/u);
  assert.match(workspace, /Quer acrescentar algo\?/u);
  assert.match(workspace, /<small>\(opcional\)<\/small>/u);
  assert.ok(workspace.indexOf("patient-map-item-navigation") > workspace.indexOf("patient-map-note"));
  assert.ok(workspace.indexOf("patient-map-item-navigation") < workspace.indexOf("patient-map-item-sharing-state"));
  assert.ok(workspace.indexOf("patient-map-item-navigation") < workspace.indexOf("patient-map-item-options"));
  assert.match(workspace, /Ver minhas respostas neste tema/u);
});

test("map summary displays saved answers and edits the exact item without replacing draft content", () => {
  const summary = map.slice(map.indexOf('if (view === "summary")'), map.indexOf("  if (!activeSection || !activeItem)"));
  assert.match(summary, /Minhas respostas/u);
  assert.match(summary, /patient-map-answer-group/u);
  assert.match(summary, /draft\.answers!\[item\.id\]/u);
  assert.match(summary, /patient-map-saved-response">\{response\.label\}/u);
  assert.match(summary, /patient-map-saved-note">\{answer\.note\}/u);
  assert.match(summary, /aria-label=\{`Editar resposta de \$\{item\.title\}`\}/u);
  assert.match(summary, /openItem\(index, section\.items\.indexOf\(item\)\)/u);
  const openItem = map.slice(map.indexOf("  function openItem("), map.indexOf("  function rememberPosition("));
  assert.match(openItem, /rememberPosition\(nextSectionIndex, nextItemIndex\)/u);
  assert.match(openItem, /setView\("item"\)/u);
  assert.doesNotMatch(openItem, /answers:|synthesis:|onDraftChange/u);
});

test("choosing a map response does not auto-advance or scroll during autosave", () => {
  const updateResponse = map.slice(map.indexOf("  function updateResponse("), map.indexOf("  function updateNote("));
  assert.match(updateResponse, /\.\.\.draft\.answers/u);
  assert.match(updateResponse, /note: currentAnswer\?\.note \?\? ""/u);
  assert.doesNotMatch(updateResponse, /setView|setSectionIndex|setItemIndex|moveToNextItem|scrollPatientMapQuestionIntoView/u);
  assert.match(map, /\}, \[activeMapId, itemIndex, sectionIndex, view\]\);/u);
  assert.doesNotMatch(map, /\}, \[[^\]]*(?:saveState|draft)[^\]]*\]\);\s*\n\s*useEffect\(\(\) => \{\s*if \(view !== "synthesis"/u);
});

test("the workbook synthesis is one clearly global patient-map section", () => {
  const synthesisLabel = "Juntar o que percebi";
  const synthesisIndex = map.indexOf(synthesisLabel);
  const perMapSummaryIndex = map.indexOf('if (view === "summary")');
  assert.ok(synthesisIndex > -1, "a síntese geral deve estar visível no Meu mapa");
  assert.ok(
    synthesisIndex < perMapSummaryIndex,
    "a síntese geral não deve parecer pertencer ao resumo de um único mapa",
  );
  assert.equal(map.split(synthesisLabel).length - 1, 1);
  assert.match(map, /Esta síntese fica privada e não entra no compartilhamento dos temas/u);
  assert.match(map, /Pergunta \{synthesisIndex \+ 1\} de/u);
  assert.match(map, /patient-map-synthesis-question-title/u);
  assert.match(map, /changeSynthesisQuestion/u);
});

test("moving through the map alone does not create a false unsaved-content warning", () => {
  const draftCheck = map.match(
    /export function hasPatientMapSessionDraft[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  assert.match(draftCheck, /draft\.answers/u);
  assert.match(draftCheck, /draft\.synthesis/u);
  assert.doesNotMatch(draftCheck, /draft\.positions/u);
});
