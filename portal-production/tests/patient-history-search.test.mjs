import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortPatientEntries } from "../app/patient-dashboard-data.ts";

const entries = Object.freeze([
  Object.freeze({ id: "synthetic-private", title: "Conversa no trabalho", happened: "Uma reunião fictícia.", emotion: "Ansiedade", thoughts: "Quero organizar uma ideia.", created_at: "2026-10-01T12:00:00.000Z", shared_at: null }),
  Object.freeze({ id: "synthetic-shared", title: "Um encontro", happened: "Outra situação fictícia no trabalho.", emotion: "Alívio", message: "Uma dúvida para a sessão", created_at: "2026-10-02T12:00:00.000Z", shared_at: "2026-10-02T13:00:00.000Z" }),
]);
const find = (query, filter = "all", sort = "newest") =>
  filterAndSortPatientEntries([...entries], filter, query, sort).map(entry => entry.id);

test("history finds remembered words across title, situation and emotion in any order", () => {
  assert.deepEqual(find("trabalho ansiedade"), ["synthetic-private"]);
  assert.deepEqual(find("ANSIEDADE trabalho"), ["synthetic-private"]);
  assert.deepEqual(find("reuniao ideia"), ["synthetic-private"]);
  assert.deepEqual(find("sessão alívio"), ["synthetic-shared"]);
  assert.deepEqual(find("trabalho inexistente"), []);
});

test("history search tolerates pasted spacing, punctuation and accents without rewriting data", () => {
  const before = JSON.stringify(entries);
  assert.deepEqual(find("  trabalho,\n ansiedade!  "), ["synthetic-private"]);
  assert.deepEqual(find("alívio — sessão"), ["synthetic-shared"]);
  assert.deepEqual(find("trabalho trabalho ansiedade"), ["synthetic-private"]);
  assert.deepEqual(find("ans"), ["synthetic-private"]);
  assert.equal(JSON.stringify(entries), before);
});

test("combined history terms still respect sharing filters and date ordering", () => {
  assert.deepEqual(find("trabalho", "all", "newest"), ["synthetic-shared", "synthetic-private"]);
  assert.deepEqual(find("trabalho", "all", "oldest"), ["synthetic-private", "synthetic-shared"]);
  assert.deepEqual(find("trabalho ansiedade", "shared"), []);
  assert.deepEqual(find("trabalho", "private"), ["synthetic-private"]);
  assert.deepEqual(find("trabalho", "shared"), ["synthetic-shared"]);
  assert.deepEqual(find(" \n "), ["synthetic-shared", "synthetic-private"]);
  assert.deepEqual(find("!!!"), []);
});
