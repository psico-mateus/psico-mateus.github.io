import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as catalog from "../content/patient-map-catalog.ts";

const source = await readFile(new URL("../lib/patient-data-export.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const exports = {};
new Function("require", "exports", compiled)((name) => {
  assert.equal(name, "@/content/patient-map-catalog");
  return catalog;
}, exports);

test("exportação inclui avisos disponíveis por allowlist sem metadados de acesso", () => {
  const notice = {
    id: "notice_synthetic", title: "Orientação sintética", body: "Texto neutro.",
    created_at: "2026-10-08T10:00:00.000Z", read_at: null,
    patient_id: "patient_synthetic", therapist_id: "therapist_synthetic",
    client_request_id: "technical-request-id", token: "must-not-export",
    deleted_at: null,
  };
  const result = exports.createPatientDataExport({
    exportedAt: "2026-10-08T11:00:00.000Z",
    account: { display_name: "Teste", role: "patient", status: "active", privacy_version: "2026-10-08",
      adult_confirmed_at: null, created_at: "2026-01-01T00:00:00.000Z", last_login_at: null,
      password_hash: "must-not-export" },
    careAccess: null, entries: [], patientMapDraft: { content_version: "synthetic", fields: [] },
    patientMapShares: [], notices: [notice],
  });
  assert.equal(result.format_version, 4);
  assert.deepEqual(result.notices, [{ id: notice.id, title: notice.title, body: notice.body,
    created_at: notice.created_at, read_at: null }]);
  assert.doesNotMatch(JSON.stringify(result), /must-not-export|patient_id|therapist_id|client_request_id|deleted_at/u);
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.patient_map.sharing.active_copies, []);
});
