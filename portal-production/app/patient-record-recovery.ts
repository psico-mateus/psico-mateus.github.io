import type { ThoughtReviewEditorSnapshot } from "./ThoughtReview";
import type { ThoughtReview } from "./thought-review";

export type PatientEntry = {
  id: string;
  title: string;
  happened: string;
  body: string;
  thoughts: string;
  urge: string;
  emotion: string;
  intensity: number;
  message: string;
  created_at: string;
  updated_at: string;
  shared_at: string | null;
  revoked_at?: string | null;
  viewed_at?: string | null;
  thought_review: ThoughtReview | null;
};

export type PatientEntryDraft = Omit<
  PatientEntry,
  | "id"
  | "created_at"
  | "updated_at"
  | "shared_at"
  | "revoked_at"
  | "viewed_at"
  | "thought_review"
>;

export type PatientEntryReturn =
  | { kind: "reading"; id: string }
  | { kind: "tool"; id: string }
  | null;

export type PatientRecordDraftRecoverySnapshot = {
  patientId: string;
  entryEditor: null | {
    editing: "new" | { entryId: string };
    draft: PatientEntryDraft;
    baseUpdatedAt: string | null;
    editorPaused: boolean;
    entryReturn: PatientEntryReturn;
  };
  thoughtReviewSnapshots: Record<string, ThoughtReviewEditorSnapshot>;
};

export type PatientEntryEditorRecovery = NonNullable<
  PatientRecordDraftRecoverySnapshot["entryEditor"]
>;

type RecoveredEntryDraft = {
  draft: PatientEntryDraft;
  editorPaused: boolean;
  entryReturn: PatientEntryReturn;
};

export type PatientEntryRecoveryResolution =
  | ({ kind: "new" } & RecoveredEntryDraft)
  | ({ kind: "edit"; entry: PatientEntry } & RecoveredEntryDraft)
  | { kind: "changed"; editor: PatientEntryEditorRecovery; entry: PatientEntry }
  | { kind: "missing"; editor: PatientEntryEditorRecovery };

/** Recovery is only visible after authentication as its original patient. */
export function getPatientRecordRecovery(
  snapshot: PatientRecordDraftRecoverySnapshot | null,
  user: { id: string; role: string } | null,
): PatientRecordDraftRecoverySnapshot | null {
  return snapshot && user?.role === "patient" && snapshot.patientId === user.id
    ? snapshot
    : null;
}

/**
 * Resolve against the authenticated patient's fresh entries, never old sharing
 * metadata. Missing or changed entries keep the draft without permitting an
 * automatic edit or recreation.
 */
export function resolvePatientEntryRecovery(
  editor: PatientEntryEditorRecovery,
  freshEntries: readonly PatientEntry[],
): PatientEntryRecoveryResolution {
  const recovered = {
    draft: { ...editor.draft },
    editorPaused: editor.editorPaused,
    entryReturn: editor.entryReturn ? { ...editor.entryReturn } : null,
  };
  if (editor.editing === "new") return { kind: "new", ...recovered };

  const entryId = editor.editing.entryId;
  const entry = freshEntries.find((candidate) => candidate.id === entryId);
  if (!entry) return { kind: "missing", editor };
  if (entry.updated_at !== editor.baseUpdatedAt) {
    return { kind: "changed", editor, entry };
  }
  return { kind: "edit", entry, ...recovered };
}

function copyThoughtReviewSnapshot(
  snapshot: ThoughtReviewEditorSnapshot,
): ThoughtReviewEditorSnapshot {
  return {
    ...snapshot,
    draft: { ...snapshot.draft },
    baselineDraft: { ...snapshot.baselineDraft },
    conflictReview: snapshot.conflictReview
      ? {
          review: snapshot.conflictReview.review
            ? { ...snapshot.conflictReview.review }
            : null,
        }
      : null,
    backupDraft: snapshot.backupDraft ? { ...snapshot.backupDraft } : null,
    feedback: snapshot.feedback ? { ...snapshot.feedback } : null,
  };
}

/** Create an independent, memory-only snapshot of unsaved patient changes. */
export function createPatientRecordRecoverySnapshot({
  patientId,
  editing,
  draft,
  editorDirty,
  editorPaused,
  entryReturn,
  thoughtReviewSnapshots,
}: {
  patientId: string;
  editing: PatientEntry | "new" | null;
  draft: PatientEntryDraft | null;
  editorDirty: boolean;
  editorPaused: boolean;
  entryReturn: PatientEntryReturn;
  thoughtReviewSnapshots: Record<string, ThoughtReviewEditorSnapshot>;
}): PatientRecordDraftRecoverySnapshot | null {
  const entryEditor: PatientEntryEditorRecovery | null =
    editorDirty && editing && draft
      ? {
          editing: editing === "new" ? "new" : { entryId: editing.id },
          draft: { ...draft },
          baseUpdatedAt: editing === "new" ? null : editing.updated_at,
          editorPaused,
          entryReturn: entryReturn ? { ...entryReturn } : null,
        }
      : null;
  const thoughtSnapshots = Object.fromEntries(
    Object.entries(thoughtReviewSnapshots).map(([entryId, snapshot]) => [
      entryId,
      copyThoughtReviewSnapshot(snapshot),
    ]),
  );
  if (!entryEditor && Object.keys(thoughtSnapshots).length === 0) return null;

  return {
    patientId,
    entryEditor,
    thoughtReviewSnapshots: thoughtSnapshots,
  };
}
