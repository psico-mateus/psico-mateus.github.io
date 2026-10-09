import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as catalog from "../content/patient-map-catalog.ts";

const source = await readFile(
  new URL("../lib/patient-map-summary.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const exports = {};
new Function("require", "exports", compiled)((name) => {
  assert.equal(name, "@/content/patient-map-catalog");
  return catalog;
}, exports);
const { createPatientMapSummary } = exports;

const maps = catalog.PATIENT_MAP_CATALOG.maps;
const itemsFor = (map) => map.sections.flatMap((section) => section.items);
const allItems = maps.flatMap(itemsFor);
const firstThemeItems = itemsFor(maps[0]);

test("empty map has six canonical response rows and no invented answers", () => {
  const result = createPatientMapSummary();
  assert.equal(result.mapId, null);
  assert.equal(result.totalItems, 150);
  assert.equal(result.answeredItems, 0);
  assert.equal(result.noteOnlyItems, 0);
  assert.equal(result.untouchedItems, 150);
  assert.equal(result.unansweredItems, 150);
  assert.deepEqual(
    result.rows,
    catalog.PATIENT_MAP_RESPONSES.map((response) => ({ ...response, count: 0 })),
  );
});

test("all six choices are separate, including 'Ainda não sei' as an answer", () => {
  const answers = Object.fromEntries(
    catalog.PATIENT_MAP_RESPONSES.map((response, index) => [
      firstThemeItems[index].id,
      { response: response.key, note: "" },
    ]),
  );
  const result = createPatientMapSummary(answers, maps[0].id);
  assert.equal(result.mapId, maps[0].id);
  assert.equal(result.totalItems, 30);
  assert.equal(result.answeredItems, 6);
  assert.equal(result.noteOnlyItems, 0);
  assert.equal(result.unansweredItems, 24);
  assert.equal(result.untouchedItems, 24);
  assert.deepEqual(result.rows.map((row) => row.count), [1, 1, 1, 1, 1, 1]);
});

test("selected theme never incorporates answers from another theme", () => {
  const answers = {
    [firstThemeItems[0].id]: { response: "fits", note: "" },
    [itemsFor(maps[1])[0].id]: { response: "not_fit", note: "" },
    [itemsFor(maps[4])[0].id]: { response: null, note: "Synthetic note" },
  };
  const selected = createPatientMapSummary(answers, maps[0].id);
  assert.equal(selected.answeredItems, 1);
  assert.equal(selected.noteOnlyItems, 0);
  assert.deepEqual(selected.rows.map((row) => row.count), [1, 0, 0, 0, 0, 0]);
  const combined = createPatientMapSummary(answers);
  assert.equal(combined.answeredItems, 2);
  assert.equal(combined.noteOnlyItems, 1);
  assert.equal(combined.unansweredItems, 148);
  assert.equal(combined.untouchedItems, 147);
});

test("note-only items are not answers, and whitespace is untouched", () => {
  const answers = {
    [firstThemeItems[0].id]: { response: null, note: "Synthetic note" },
    [firstThemeItems[1].id]: { response: "unknown", note: "Another note" },
    [firstThemeItems[2].id]: { response: null, note: " \n\t " },
    [firstThemeItems[3].id]: { note: "  A note without a choice  " },
    [firstThemeItems[4].id]: null,
  };
  const result = createPatientMapSummary(answers, maps[0].id);
  assert.equal(result.answeredItems, 1);
  assert.equal(result.noteOnlyItems, 2);
  assert.equal(result.untouchedItems, 27);
  assert.equal(result.unansweredItems, 29);
  assert.equal(result.rows.find((row) => row.key === "unknown").count, 1);
  assert.doesNotMatch(JSON.stringify(result), /Synthetic note|Another note|A note/);
});

test("unknown IDs, local IDs and section IDs never inflate the graph", () => {
  const answers = {
    [firstThemeItems[0].id]: { response: "fits", note: "" },
    "unknown-theme.01.1": { response: "fits", note: "Synthetic note" },
    "01.1": { response: "fits", note: "Synthetic note" },
    [maps[0].sections[0].id]: { response: "fits", note: "Synthetic note" },
    [maps[0].id]: { response: "fits", note: "Synthetic note" },
    "meu-jeito.01.999": { response: "fits", note: "Synthetic note" },
  };
  const result = createPatientMapSummary(answers);
  assert.equal(result.answeredItems, 1);
  assert.equal(result.noteOnlyItems, 0);
  assert.equal(result.rows.find((row) => row.key === "fits").count, 1);
});

test("unknown theme selects nothing instead of exposing all-theme totals", () => {
  for (const mapId of ["unknown-theme", "", "toString", "__proto__"]) {
    const result = createPatientMapSummary(
      { [firstThemeItems[0].id]: { response: "fits", note: "" } },
      mapId,
    );
    assert.equal(result.mapId, mapId);
    assert.equal(result.totalItems, 0);
    assert.equal(result.answeredItems, 0);
    assert.equal(result.noteOnlyItems, 0);
    assert.equal(result.unansweredItems, 0);
    assert.ok(result.rows.every((row) => row.count === 0));
  }
});

test("invalid responses do not become a score or a canonical category", () => {
  const answers = {
    [firstThemeItems[0].id]: { response: "excellent", note: "" },
    [firstThemeItems[1].id]: { response: "FITS", note: "" },
    [firstThemeItems[2].id]: { response: " fits ", note: "" },
    [firstThemeItems[3].id]: { response: "toString", note: "" },
    [firstThemeItems[4].id]: { response: "invalid", note: "Synthetic note" },
    [firstThemeItems[5].id]: { response: 100, note: "" },
  };
  const result = createPatientMapSummary(answers, maps[0].id);
  assert.equal(result.answeredItems, 0);
  assert.equal(result.noteOnlyItems, 1);
  assert.equal(result.untouchedItems, 29);
  assert.ok(result.rows.every((row) => row.count === 0));
  assert.doesNotMatch(
    JSON.stringify(result),
    /score|weight|diagnosis|excellent|Synthetic note/i,
  );
});

test("inherited answer properties are ignored", () => {
  const answers = Object.create({
    [firstThemeItems[0].id]: { response: "fits", note: "" },
  });
  answers[firstThemeItems[1].id] = { response: "curious", note: "" };
  const result = createPatientMapSummary(answers, maps[0].id);
  assert.equal(result.answeredItems, 1);
  assert.deepEqual(result.rows.map((row) => row.count), [0, 1, 0, 0, 0, 0]);
});

test("counts are exact for all 150 items, never exceeding the catalog", () => {
  const answers = Object.fromEntries(
    allItems.map((item, index) => [
      item.id,
      { response: catalog.PATIENT_MAP_RESPONSES[index % 6].key, note: "" },
    ]),
  );
  const result = createPatientMapSummary(answers);
  assert.equal(result.totalItems, 150);
  assert.equal(result.answeredItems, 150);
  assert.equal(result.noteOnlyItems, 0);
  assert.equal(result.untouchedItems, 0);
  assert.equal(result.unansweredItems, 0);
  assert.deepEqual(result.rows.map((row) => row.count), [25, 25, 25, 25, 25, 25]);
  for (const map of maps) {
    const theme = createPatientMapSummary(answers, map.id);
    assert.deepEqual(theme.rows.map((row) => row.count), [5, 5, 5, 5, 5, 5]);
    assert.equal(theme.answeredItems, 30);
  }
});

test("helper does not mutate answers or catalog and returns fresh rows", () => {
  const answer = Object.freeze({ response: "fits", note: "Synthetic note" });
  const answers = Object.freeze({ [firstThemeItems[0].id]: answer });
  const beforeAnswers = JSON.stringify(answers);
  const beforeCatalog = JSON.stringify(catalog.PATIENT_MAP_CATALOG);
  const first = createPatientMapSummary(answers, maps[0].id);
  first.rows[0].count = 999;
  first.rows[0].label = "Changed locally";
  const second = createPatientMapSummary(answers, maps[0].id);
  assert.equal(second.rows[0].count, 1);
  assert.equal(second.rows[0].label, "Combina comigo");
  assert.equal(JSON.stringify(answers), beforeAnswers);
  assert.equal(JSON.stringify(catalog.PATIENT_MAP_CATALOG), beforeCatalog);
  assert.doesNotMatch(source, /PatientMapShell|window\.|document\.|fetch\(|portalRequest/);
});
