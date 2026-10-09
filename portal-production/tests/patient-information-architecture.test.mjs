import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PATIENT_MAP_CATALOG } from "../content/patient-map-catalog.ts";

const app = await readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8");
const resources = await readFile(new URL("../app/PatientResources.tsx", import.meta.url), "utf8");
const map = await readFile(new URL("../app/PatientMapShell.tsx", import.meta.url), "utf8");
const mapReview = await readFile(new URL("../app/PatientMapReview.tsx", import.meta.url), "utf8");
const mapTheme = await readFile(new URL("../app/PatientMapThemeBrowser.tsx", import.meta.url), "utf8");
const mapSummary = await readFile(new URL("../lib/patient-map-summary.ts", import.meta.url), "utf8");
const mapDraftClient = await readFile(new URL("../app/patient-map-draft-client.ts", import.meta.url), "utf8");
const mapCss = await readFile(new URL("../app/patient-map.css", import.meta.url), "utf8");
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

test("closed patient records keep their keyboard focus inside the clipped card", () => {
  assert.match(css, /\.patient-record-card\{[^}]*overflow:hidden/u);
  assert.match(homeCss, /\.patient-record-card\s*>\s*summary:focus-visible\s*\{\s*outline-offset:\s*-4px;\s*\}/u);
});

test("resources keep practical tools, readings and the public Guide distinct", () => {
  assert.match(resources, /Ferramentas do dia a dia/u);
  assert.match(resources, /Leitura complementar/u);
  assert.match(resources, /Abrir um recurso não cria histórico nem informa Mateus/u);
  assert.equal((resources.match(/não cria histórico nem informa Mateus/gu) ?? []).length, 1,
    "The resources index gives one clear privacy explanation instead of repeating it in every card.");
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
  assert.match(map, /Escolha um tema e depois um item\. Não precisa seguir a ordem\./u);
  assert.match(mapTheme, /Escolha o que quer explorar/u);
  assert.match(map, /O que combina com você hoje\?/u);
  assert.match(
    map,
    /Item \{itemIndex \+ 1\} de \{activeSection\.items\.length\} · você pode pular/u,
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
  assert.match(mapReview, /As barras contam suas escolhas\. Não são uma avaliação\./u);
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

test("map theme entry shows subjects without changing answers or the saved position", () => {
  const openMap = map.slice(map.indexOf("  function openMap("), map.indexOf("  function openCurrentItem("));
  assert.match(openMap, /draft\.positions\?\.\[mapId\]/u);
  assert.match(openMap, /setSectionIndex\(nextSectionIndex\)/u);
  assert.match(openMap, /setItemIndex\(nextItemIndex\)/u);
  assert.match(openMap, /setView\("theme"\)/u);
  assert.doesNotMatch(openMap, /setView\("item"\)|onDraftChange|answers:|synthesis:/u);

  const overview = map.slice(map.indexOf('{topLevelView === "overview" ? ('), map.indexOf(') : topLevelView === "summary" ? ('));
  assert.ok(overview.indexOf("patient-map-theme-picker") >= 0);
  assert.match(overview, /onClick=\{\(\) => openMap\(map\.id\)\}/u);
  assert.match(map, /<PatientMapThemeBrowser[\s\S]*?onContinue=\{\(\) => openCurrentItem\(activeMap\)\}[\s\S]*?onOpenItem=\{openItem\}/u);
  assert.match(map, /onClick=\{returnToTheme\}/u);
  const resume = map.slice(map.indexOf("  function openCurrentItem("), map.indexOf("  function openItem("));
  assert.match(resume, /draft\.positions\?\.\[map\.id\]/u);
  assert.match(resume, /setView\("item"\)/u);
  assert.doesNotMatch(resume, /onDraftChange|answers:|synthesis:/u);
});

test("theme browser exposes six real items per native disclosure and makes resume optional", () => {
  assert.match(mapTheme, /map\.sections\.map\(\(section, sectionIndex\) =>/u);
  assert.match(mapTheme, /<details[\s\S]*?className="patient-map-topic-group"[\s\S]*?<summary>/u);
  assert.match(mapTheme, /section\.items\.map\(\(item, itemIndex\) =>/u);
  assert.match(mapTheme, /id=\{`patient-map-pick-\$\{item\.id\}`\}/u);
  assert.match(mapTheme, /onClick=\{\(\) => onOpenItem\(sectionIndex, itemIndex\)\}/u);
  assert.match(mapTheme, /aria-label=\{`\$\{item\.title\} — \$\{status\}`\}/u);
  assert.match(mapTheme, /const canResume = hasContent \|\| Boolean\(savedPosition\)/u);
  assert.match(mapTheme, /\{canResume \? \([\s\S]*?id="patient-map-theme-continue"[\s\S]*?onClick=\{onContinue\}/u);
  assert.match(mapTheme, /Só observação/u);
  assert.match(mapTheme, /Ver minhas respostas neste tema/u);
  assert.match(mapTheme, /Gerenciar o que Mateus vê/u);
  assert.doesNotMatch(mapTheme, /onDraftChange|portalRequest|fetch\(|localStorage|sessionStorage/u);
  for (const theme of PATIENT_MAP_CATALOG.maps) {
    assert.equal(theme.sections.length, 5);
    for (const section of theme.sections) assert.equal(section.items.length, 6);
  }
  assert.match(mapCss, /\.patient-map-topic-group>summary:focus-visible\{outline-offset:-4px\}/u);
  assert.match(mapCss, /\.patient-map-topic-item\{[^}]*min-height:64px/u);
});

test("map keeps optional notes visible and puts navigation before secondary sharing controls", () => {
  const workspace = map.slice(map.indexOf('<section className="patient-module patient-map-workspace patient-map-rethought"'));
  assert.match(workspace, /<div className="patient-map-note"[\s\S]*?<textarea[\s\S]*?onChange=\{\(event\) => updateNote\(event\.target\.value\)\}/u);
  assert.doesNotMatch(workspace, /<details[\s\S]*?className="patient-map-note"/u);
  assert.doesNotMatch(map, /noteOpenByItem/u);
  assert.match(workspace, /Quer acrescentar algo\?/u);
  assert.match(workspace, /<small>\(opcional\)<\/small>/u);
  assert.ok(workspace.indexOf("patient-map-item-navigation") > workspace.indexOf("patient-map-note"));
  assert.ok(workspace.indexOf("patient-map-item-navigation") < workspace.indexOf("patient-map-item-sharing-state"));
  assert.ok(workspace.indexOf("patient-map-item-navigation") < workspace.indexOf("patient-map-item-options"));
  assert.match(workspace, /aria-label="Ver respostas deste tema" onClick=\{\(\) => openReview\(activeMap\.id\)\}/u);
  assert.match(workspace, /<details className="patient-map-item-management">[\s\S]*?Opções deste item/u);
  assert.ok(workspace.indexOf("patient-map-item-management") > workspace.indexOf("patient-map-item-navigation"));
});

test("global review displays saved choices and notes and edits the exact item without replacing content", () => {
  assert.match(map, /<PatientMapReview draft=\{draft\} mapId=\{reviewMapId\} onMapChange=\{setReviewMapId\}[\s\S]*?onOpenItem=\{openSavedItem\}/u);
  assert.match(mapReview, /Minhas respostas/u);
  assert.match(mapReview, /<option value="all">Todos os temas<\/option>/u);
  assert.match(mapReview, /PATIENT_MAP_CATALOG\.maps\.map\(\(map\) =>/u);
  assert.match(mapReview, /<details className="patient-map-answer-group" open=\{initiallyOpen\}>/u);
  assert.match(mapReview, /draft\.answers\?\.\[item\.id\]/u);
  assert.match(mapReview, /patient-map-saved-response">\{response \? response\.label : "Só observação · sem opção marcada"\}/u);
  assert.match(mapReview, /patient-map-saved-note">\{answer!\.note\}/u);
  assert.match(mapReview, /aria-label=\{`Editar resposta de \$\{item\.title\}`\}/u);
  assert.match(mapReview, /onOpenItem\(map\.id, sectionIndex, itemIndex\)/u);
  const openSavedItem = map.slice(map.indexOf("  function openSavedItem("), map.indexOf("  function changeSynthesisQuestion("));
  assert.match(openSavedItem, /if \(!map\?\.sections\[nextSectionIndex\]\?\.items\[nextItemIndex\]\) return/u);
  assert.match(openSavedItem, /onDraftChange\(\{\s*\.\.\.draft,[\s\S]*?positions: \{ \.\.\.draft\.positions, \[mapId\]: \{ sectionIndex: nextSectionIndex, itemIndex: nextItemIndex \} \}/u);
  assert.match(openSavedItem, /setActiveMapId\(mapId\)/u);
  assert.match(openSavedItem, /setView\("item"\)/u);
  assert.doesNotMatch(openSavedItem, /answers:|synthesis:|onClearDraft/u);
  const openItem = map.slice(map.indexOf("  function openItem("), map.indexOf("  function rememberPosition("));
  assert.match(openItem, /rememberPosition\(nextSectionIndex, nextItemIndex\)/u);
  assert.match(openItem, /setView\("item"\)/u);
  assert.doesNotMatch(openItem, /answers:|synthesis:|onDraftChange/u);
});

test("response chart uses canonical counts, accessible labels and a separate note-only count", () => {
  assert.match(mapReview, /useMemo\(\s*\(\) => createPatientMapSummary\(draft\.answers, mapId === "all" \? undefined : mapId\),\s*\[draft\.answers, mapId\]/u);
  assert.match(mapReview, /<figure className="patient-map-chart" aria-labelledby="patient-map-chart-title" aria-describedby="patient-map-chart-caption">/u);
  assert.match(mapReview, /summary\.rows\.map\(\(row\) =>/u);
  assert.match(mapReview, /patient-map-chart-label">\{row\.label\}/u);
  assert.match(mapReview, /<strong>\{row\.count\}<span className="sr-status">/u);
  assert.match(mapReview, /patient-map-chart-track" aria-hidden="true"/u);
  assert.match(mapReview, /summary\.noteOnlyItems > 0/u);
  assert.match(mapReview, /não entra nas barras/u);
  assert.match(mapReview, /não entram nas barras/u);
  assert.match(mapReview, /Não são uma avaliação/u);
  assert.match(mapSummary, /PATIENT_MAP_RESPONSES\.map\(\(response\) =>/u);
  assert.match(mapSummary, /for \(const item of section\.items\)/u);
  assert.match(mapSummary, /Object\.hasOwn\(answers, item\.id\)/u);
  assert.match(mapSummary, /noteOnlyItems \+= 1/u);
  assert.doesNotMatch(mapReview, /score|weight|diagnos|pontua|classificação clínica/iu);
  assert.match(mapCss, /@media\(forced-colors:active\)[\s\S]*?patient-map-chart-track/u);
  assert.match(mapCss, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?animation:none!important;transition:none!important/u);
});

test("chart and review filters remain local derivations, never persisted or automatically shared", () => {
  assert.match(mapReview, /select id="patient-map-review-theme-filter" value=\{mapId\} onChange=\{\(event\) => onMapChange\(event\.target\.value\)\}/u);
  assert.match(mapReview, /label htmlFor="patient-map-review-theme-filter">Tema/u);
  assert.doesNotMatch(mapReview, /onDraftChange|portalRequest|fetch\(|localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(mapSummary, /portalRequest|fetch\(|localStorage|sessionStorage|document\.cookie|PatientMapShell/u);
  assert.doesNotMatch(mapDraftClient, /createPatientMapSummary|PatientMapSummary|patient-map-chart|noteOnlyItems|answeredItems|summary\.rows/u);
  const openReview = map.slice(map.indexOf("  function openReview("), map.indexOf("  function openSavedItem("));
  assert.match(openReview, /setReviewMapId\(mapId\)/u);
  assert.match(openReview, /setView\("summary"\)/u);
  assert.doesNotMatch(openReview, /onDraftChange|rememberPosition|portalRequest|changeMapSharing/u);
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
  assert.ok(synthesisIndex > -1, "a síntese geral deve estar visível no Meu mapa");
  assert.equal(map.split(synthesisLabel).length - 1, 1);
  assert.match(map, /const topLevelView = view === "sharing" \|\| view === "synthesis" \|\| view === "summary" \? view : "overview"/u);
  assert.match(mapReview, /<button id="patient-map-view-synthesis"[\s\S]*?onClick=\{onSynthesis\}/u);
  assert.match(map, /onSynthesis=\{\(\) => openTopLevelView\("synthesis"\)\}/u);
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

test("all-map deletion stays available for synthesis-only drafts and never counts navigation as content", () => {
  const draftCheck = map.match(/export function hasPatientMapSessionDraft[\s\S]*?\n\}/u)?.[0];
  assert.ok(draftCheck);
  const compiled = ts.transpileModule(draftCheck, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("exports", compiled)(exports);
  const hasDraft = exports.hasPatientMapSessionDraft;
  assert.equal(hasDraft({}), false);
  assert.equal(hasDraft({ positions: { "meu-jeito": { sectionIndex: 2, itemIndex: 4 } } }), false);
  assert.equal(hasDraft({ synthesis: { [PATIENT_MAP_CATALOG.summary.prompts[0].id]: "A synthetic private observation" } }), true);
  assert.equal(hasDraft({ synthesis: { [PATIENT_MAP_CATALOG.summary.prompts[0].id]: " \n\t " } }), false);
  assert.equal(hasDraft({ answers: { "meu-jeito.01.1": { response: null, note: "Synthetic note" } } }), true);
  assert.match(map, /\{hasPatientMapSessionDraft\(draft\) \? \(\s*<details className="patient-map-settings">/u);
  assert.match(map, /Apagar o mapa remove todas as respostas, observações e\s+anotações de “O que percebi”/u);
  assert.match(map, /window\.confirm\("Apagar permanentemente todo o Meu mapa e encerrar todos os compartilhamentos com Mateus\?"\)/u);
  assert.match(map, /const cleared = await onClearDraft\(\)/u);
  assert.match(map, /if \(cleared\) \{\s*setShares\(\{\}\)/u);
});
