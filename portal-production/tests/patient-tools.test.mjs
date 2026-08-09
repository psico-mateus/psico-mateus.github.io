import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  filterPatientTools,
  findPatientTool,
  patientToolNeeds,
  patientToolReferences,
  patientTools,
  patientToolsCatalogVersion,
} from "../content/patient-tools-catalog.ts";

test("patient tools catalog has eight complete and stable tools", () => {
  assert.equal(patientToolsCatalogVersion, 1);
  assert.equal(patientTools.length, 8);
  assert.equal(new Set(patientTools.map((tool) => tool.id)).size, 8);

  const validNeeds = new Set(patientToolNeeds.map((need) => need.id));
  const validReferences = new Set(Object.keys(patientToolReferences));

  for (const tool of patientTools) {
    assert.match(tool.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.equal(tool.version, 1);
    assert.ok(tool.title.length >= 8);
    assert.ok(tool.summary.length >= 30);
    assert.ok(tool.mayHelpWhen.length >= 30);
    assert.match(tool.duration, /minuto/iu);
    assert.ok(tool.steps.length >= 4 && tool.steps.length <= 5);
    assert.ok(tool.adaptations.length >= 2);
    assert.ok(tool.stopWhen.length >= 35);
    assert.ok(tool.safetyNote.length >= 35);
    assert.ok(tool.recordPrompt.length >= 25);
    assert.ok(tool.needIds.length >= 1);
    assert.ok(tool.referenceIds.length >= 1);
    tool.needIds.forEach((needId) => assert.ok(validNeeds.has(needId)));
    tool.referenceIds.forEach((referenceId) =>
      assert.ok(validReferences.has(referenceId)),
    );
  }
});

test("patient tools cover every need and filters remain deterministic", () => {
  assert.equal(patientToolNeeds.length, 6);
  assert.deepEqual(filterPatientTools("all"), patientTools);

  for (const need of patientToolNeeds) {
    const matchingTools = filterPatientTools(need.id);
    assert.ok(matchingTools.length >= 1, `${need.label} precisa ter uma ferramenta`);
    assert.ok(matchingTools.every((tool) => tool.needIds.includes(need.id)));
    assert.deepEqual(filterPatientTools(need.id), matchingTools);
  }

  assert.equal(findPatientTool("voltar-ao-presente")?.title, "Voltar ao presente");
  assert.equal(findPatientTool("nao-existe"), null);
  assert.equal(findPatientTool(null), null);
});

test("patient tools avoid scoring, diagnosis claims and higher-risk first-version techniques", () => {
  const copy = JSON.stringify(patientTools);

  assert.doesNotMatch(
    copy,
    /gelo|água muito fria|hiperventila|retenção respiratória|exercício físico intenso|resetar o sistema nervoso/iu,
  );
  assert.doesNotMatch(
    copy,
    /pontua(?:ção|r)|nota final|compatibilidade|sequência de dias|melhor versão|jornada|parabéns|garante|cura/iu,
  );
  assert.match(copy, /não substitui atendimento/iu);
  assert.match(copy, /não confirma diagnóstico/iu);
  assert.match(copy, /risco imediato/iu);
});

test("patient tools component is private, accessible and free of persistence", async () => {
  const source = await readFile(
    new URL("../app/PatientToolsShell.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /role="group" aria-label="Filtrar ferramentas por situação"/u);
  assert.match(source, /aria-pressed=\{filter ===/u);
  assert.match(source, /role="status" aria-live="polite" aria-atomic="true"/u);
  assert.match(source, /aria-label=\{`Abrir ferramenta: \$\{tool\.title\}`\}/u);
  assert.match(source, /Voltar às ferramentas/u);
  assert.match(source, /Abrir ou usar uma ferramenta não cria histórico nem informa Mateus/u);
  assert.match(source, /\{onCreateRecord \? \(/u);
  assert.match(source, /onCreateRecord\(tool\.id\)/u);
  assert.doesNotMatch(
    source,
    /fetch\(|portalRequest|localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon/iu,
  );
});

test("patient tools editorial references are HTTPS and complete", () => {
  for (const reference of Object.values(patientToolReferences)) {
    assert.ok(reference.institution.length > 0);
    assert.ok(reference.title.length > 0);
    assert.match(reference.url, /^https:\/\//u);
  }
});
