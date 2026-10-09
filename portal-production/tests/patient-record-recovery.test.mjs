import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/patient-record-recovery.ts", import.meta.url),
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
  assert.fail(`Pure recovery helpers must not load a runtime dependency: ${name}`);
}, exports);
const {
  createPatientRecordRecoverySnapshot,
  getPatientRecordRecovery,
  resolvePatientEntryRecovery,
} = exports;

const timestamp = "2026-10-08T12:00:00.000Z";
const laterTimestamp = "2026-10-08T13:00:00.000Z";
const patientId = "synthetic-recovery-patient";
const draft = {
  title: "Synthetic unsaved title",
  happened: "Synthetic situation for a pure local test",
  body: "Synthetic body text",
  thoughts: "Synthetic thought",
  urge: "Synthetic action text",
  emotion: "Synthetic emotion",
  intensity: 4,
  message: "Synthetic session note",
};
const entry = {
  ...draft,
  id: "synthetic-recovery-entry",
  title: "Synthetic saved title",
  created_at: timestamp,
  updated_at: timestamp,
  shared_at: timestamp,
  revoked_at: null,
  viewed_at: timestamp,
  thought_review: null,
};
const reviewDraft = {
  source_thought: "Synthetic source thought",
  supporting_context: "Synthetic supporting context",
  missing_context: "Synthetic missing context",
  alternative_view: "Synthetic alternative view",
  current_view: "Synthetic current view",
};
const thoughtSnapshot = {
  draft: { ...reviewDraft },
  baselineDraft: { ...reviewDraft, supporting_context: "" },
  sourceChosen: true,
  step: 2,
  baseRevision: 3,
  conflictReview: {
    review: {
      ...reviewDraft,
      revision: 4,
      created_at: timestamp,
      updated_at: laterTimestamp,
    },
  },
  backupDraft: { ...reviewDraft, source_thought: "Synthetic backup thought" },
  feedback: { tone: "error", text: "Synthetic conflict feedback" },
};

function createSnapshot(overrides = {}) {
  return createPatientRecordRecoverySnapshot({
    patientId,
    editing: "new",
    draft,
    editorDirty: true,
    editorPaused: false,
    entryReturn: null,
    thoughtReviewSnapshots: {},
    ...overrides,
  });
}

test("recovery is gated by authenticated patient role and exact owner ID", () => {
  const snapshot = createSnapshot();
  assert.equal(getPatientRecordRecovery(snapshot, { id: patientId, role: "patient" }), snapshot);
  for (const user of [
    null,
    { id: "synthetic-other-patient", role: "patient" },
    { id: patientId, role: "therapist" },
    { id: patientId, role: "Patient" },
    { id: patientId, role: "" },
  ]) {
    assert.equal(getPatientRecordRecovery(snapshot, user), null);
  }
  assert.equal(getPatientRecordRecovery(null, { id: patientId, role: "patient" }), null);
});

test("clean, closed or absent editors are not retained", () => {
  assert.equal(createSnapshot({ editorDirty: false }), null);
  assert.equal(createSnapshot({ editing: null }), null);
  assert.equal(createSnapshot({ draft: null }), null);
  assert.equal(createSnapshot({ editing: null, draft: null, editorDirty: false }), null);
});

test("new editor recovery preserves every draft field and paused return context", () => {
  const entryReturn = { kind: "reading", id: "synthetic-reading" };
  const snapshot = createSnapshot({ editorPaused: true, entryReturn });
  assert.equal(snapshot.patientId, patientId);
  assert.deepEqual(snapshot.entryEditor, {
    editing: "new",
    draft,
    baseUpdatedAt: null,
    editorPaused: true,
    entryReturn,
  });
  assert.deepEqual(snapshot.thoughtReviewSnapshots, {});
  assert.deepEqual(resolvePatientEntryRecovery(snapshot.entryEditor, []), {
    kind: "new",
    draft,
    editorPaused: true,
    entryReturn,
  });
});

test("recovery never trims, normalizes or invents draft contents", () => {
  const exactDraft = {
    ...draft,
    title: "  Synthetic title with spaces  ",
    happened: "\nSynthetic text\n\t",
    body: "",
    thoughts: " \n\t ",
    intensity: 0,
  };
  const snapshot = createSnapshot({ draft: exactDraft });
  assert.deepEqual(snapshot.entryEditor.draft, exactDraft);
  assert.deepEqual(resolvePatientEntryRecovery(snapshot.entryEditor, [entry]).draft, exactDraft);
});

test("editing recovery stores only entry identity and its baseline timestamp", () => {
  const snapshot = createSnapshot({ editing: entry, entryReturn: { kind: "tool", id: "synthetic-tool" } });
  assert.deepEqual(snapshot.entryEditor.editing, { entryId: entry.id });
  assert.equal(snapshot.entryEditor.baseUpdatedAt, timestamp);
  assert.deepEqual(snapshot.entryEditor.draft, draft);
  assert.equal(Object.hasOwn(snapshot.entryEditor, "entry"), false);
  assert.equal(Object.hasOwn(snapshot.entryEditor.editing, "shared_at"), false);
});

test("unchanged edit resolves with live sharing metadata, including revocation", () => {
  const snapshot = createSnapshot({ editing: entry });
  const liveEntry = { ...entry, revoked_at: laterTimestamp, viewed_at: null };
  const result = resolvePatientEntryRecovery(snapshot.entryEditor, [
    { ...entry, id: "synthetic-unrelated-entry", updated_at: laterTimestamp },
    liveEntry,
  ]);
  assert.equal(result.kind, "edit");
  assert.equal(result.entry, liveEntry);
  assert.equal(result.entry.revoked_at, laterTimestamp);
  assert.deepEqual(result.draft, draft);
  assert.equal(result.editorPaused, false);
  assert.equal(result.entryReturn, null);
});

test("remote changes block automatic edit and retain the unsaved original", () => {
  const snapshot = createSnapshot({ editing: entry, editorPaused: true });
  const liveEntry = { ...entry, updated_at: laterTimestamp, title: "Synthetic remote title" };
  const result = resolvePatientEntryRecovery(snapshot.entryEditor, [liveEntry]);
  assert.deepEqual(result, { kind: "changed", editor: snapshot.entryEditor, entry: liveEntry });
  assert.deepEqual(result.editor.draft, draft);
  assert.equal(result.editor.baseUpdatedAt, timestamp);
});

test("an edit with no baseline timestamp is never automatically restored", () => {
  const snapshot = createSnapshot({ editing: entry });
  const editor = { ...snapshot.entryEditor, baseUpdatedAt: null };
  assert.deepEqual(resolvePatientEntryRecovery(editor, [entry]), {
    kind: "changed",
    editor,
    entry,
  });
});

test("deleted or absent entries retain their draft without becoming a new entry", () => {
  const snapshot = createSnapshot({ editing: entry });
  for (const entries of [[], [{ ...entry, id: "synthetic-other-entry" }]]) {
    const result = resolvePatientEntryRecovery(snapshot.entryEditor, entries);
    assert.deepEqual(result, { kind: "missing", editor: snapshot.entryEditor });
    assert.equal(Object.hasOwn(result, "entry"), false);
    assert.deepEqual(result.editor.draft, draft);
    assert.deepEqual(result.editor.editing, { entryId: entry.id });
  }
});

test("thought-only recovery preserves baseline, conflict, backup and revision", () => {
  const thoughtReviewSnapshots = { [entry.id]: thoughtSnapshot };
  const snapshot = createSnapshot({ editorDirty: false, thoughtReviewSnapshots });
  assert.equal(snapshot.entryEditor, null);
  assert.equal(snapshot.patientId, patientId);
  assert.deepEqual(snapshot.thoughtReviewSnapshots, thoughtReviewSnapshots);
  assert.equal(snapshot.thoughtReviewSnapshots[entry.id].baseRevision, 3);
  assert.equal(snapshot.thoughtReviewSnapshots[entry.id].conflictReview.review.revision, 4);
});

test("entry and multiple thought review drafts coexist without dropping data", () => {
  const deletedConflict = { ...thoughtSnapshot, conflictReview: { review: null }, backupDraft: null, feedback: null };
  const snapshots = { [entry.id]: thoughtSnapshot, "synthetic-second-entry": deletedConflict };
  const snapshot = createSnapshot({ editing: entry, thoughtReviewSnapshots: snapshots });
  assert.deepEqual(snapshot.entryEditor.draft, draft);
  assert.deepEqual(snapshot.thoughtReviewSnapshots, snapshots);
  assert.deepEqual(Object.keys(snapshot.thoughtReviewSnapshots), Object.keys(snapshots));
});

test("inherited thought drafts do not create a recoverable snapshot", () => {
  const inherited = Object.create({ [entry.id]: thoughtSnapshot });
  assert.equal(createSnapshot({ editorDirty: false, thoughtReviewSnapshots: inherited }), null);
});

test("snapshots are independent copies and helpers do not mutate inputs", () => {
  const options = {
    editing: structuredClone(entry),
    draft: structuredClone(draft),
    entryReturn: { kind: "reading", id: "synthetic-reading" },
    thoughtReviewSnapshots: { [entry.id]: structuredClone(thoughtSnapshot) },
  };
  const before = structuredClone(options);
  const snapshot = createSnapshot(options);
  const freshEntries = [structuredClone(entry)];
  const freshBefore = structuredClone(freshEntries);
  const resolved = resolvePatientEntryRecovery(snapshot.entryEditor, freshEntries);
  resolved.draft.title = "Synthetic resolved mutation";
  resolved.entryReturn.id = "synthetic-resolved-return";
  assert.deepEqual(snapshot.entryEditor.draft, draft);
  assert.equal(snapshot.entryEditor.entryReturn.id, "synthetic-reading");
  snapshot.entryEditor.draft.title = "Synthetic snapshot mutation";
  snapshot.entryEditor.entryReturn.id = "synthetic-snapshot-return";
  const copiedThought = snapshot.thoughtReviewSnapshots[entry.id];
  copiedThought.draft.source_thought = "Synthetic changed source";
  copiedThought.baselineDraft.source_thought = "Synthetic changed baseline";
  copiedThought.conflictReview.review.source_thought = "Synthetic changed conflict";
  copiedThought.backupDraft.source_thought = "Synthetic changed backup";
  copiedThought.feedback.text = "Synthetic changed feedback";
  assert.deepEqual(options, before);
  assert.deepEqual(freshEntries, freshBefore);
});

test("module is pure and never persists or requests clinical data", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.|window\.|fetch\(|portalRequest|\.cookie|caches\./u);
  assert.doesNotMatch(compiled, /require\(/u);
});
