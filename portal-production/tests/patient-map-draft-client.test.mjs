import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(
  new URL("../app/patient-map-draft-client.ts", import.meta.url),
  "utf8",
);
const shell = await readFile(
  new URL("../app/PatientMapShell.tsx", import.meta.url),
  "utf8",
);
const app = await readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8");
const privacy = await readFile(
  new URL("../app/privacidade/page.tsx", import.meta.url),
  "utf8",
);

test("map draft client loads before editing and uses one versioned field per mutation", () => {
  assert.match(client, /portalRequest<PatientMapDraftGetResponse>\("\/map-draft"\)/u);
  assert.match(client, /method: "PATCH"/u);
  assert.match(client, /content_version: PATIENT_MAP_CONTENT_VERSION/u);
  assert.match(client, /base_revision: mutation\.baseRevision/u);
  assert.match(client, /request_id: mutation\.requestId/u);
  assert.match(client, /field: mutation\.field/u);
  assert.match(client, /if \(loadState !== "ready" \|\| clearing\) return/u);
  assert.match(shell, /a edição fica pausada até a conexão voltar/u);
});

test("autosave is serial per field, debounced by input kind and retry-safe", () => {
  assert.match(client, /type PatientMapDraftQueue = \{[\s\S]*?active\?[\s\S]*?pending\?[\s\S]*?next\?/u);
  assert.match(client, /previousValue\?\.note !== nextValue\?\.note \? 900 : 300/u);
  assert.match(client, /type: "synthesis"[\s\S]*?delay: 900/u);
  assert.match(client, /type: "position"[\s\S]*?delay: 180/u);
  assert.match(client, /latest\.pending = \{ \.\.\.mutation, attempted: true \}/u);
  assert.match(client, /window\.addEventListener\("online", handleOnline\)/u);
  assert.match(client, /requestId: requestId\(\)/u);
});

test("map persistence never uses browser storage or activity tracking", () => {
  assert.doesNotMatch(
    client,
    /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon/iu,
  );
  assert.doesNotMatch(client, /access_logs|analytics|telemetry/iu);
});

test("patient sees saving, offline, failure and conflict choices", () => {
  for (const phrase of [
    "Salvando…",
    "Salvo na sua conta",
    "Sem conexão",
    "Não foi possível salvar agora",
    "Manter o que está nesta tela",
    "Usar a versão já salva",
    "Salvar e voltar ao início",
  ]) {
    assert.match(`${client}\n${shell}`, new RegExp(phrase, "u"));
  }
  assert.match(client, /\/map-draft/u);
  assert.match(client, /error\.status === 409/u);
  assert.match(shell, /role="alert" aria-live="assertive"/u);
});

test("unexpected session loss keeps only an in-memory, patient-bound recovery buffer", () => {
  assert.match(client, /patientId: string/u);
  assert.match(client, /PatientMapDraftRecoverySnapshot/u);
  assert.match(app, /current\?\.patientId === nextUser\.id \? current : null/u);
  assert.match(app, /clear\("Sua sessão terminou\. Entre novamente para continuar\.", true\)/u);
  assert.match(app, /clear\("", false\)/u);
});

test("privacy copy states the map is private by default and sharing is controlled", () => {
  assert.match(privacy, /respostas, observações, síntese e posição de leitura/u);
  assert.match(privacy, /Nada do mapa é compartilhado automaticamente/u);
  assert.match(privacy, /parte específica/u);
  assert.match(privacy, /A síntese geral e as demais partes continuam/u);
  assert.match(privacy, /apaga a cópia compartilhada/u);
});
