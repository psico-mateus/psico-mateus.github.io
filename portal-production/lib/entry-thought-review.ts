import type { PortalEnv } from "@/db/runtime";
import { identifier } from "@/lib/crypto";
import { PortalError, now } from "@/lib/portal";

const MAXIMUM_FIELD_LENGTH = 1_500;
const MAXIMUM_REVISION = 2_147_483_647;
const thoughtReviewPatchKeys = [
  "source_thought",
  "supporting_context",
  "missing_context",
  "alternative_view",
  "current_view",
  "expected_revision",
] as const;
type ThoughtReviewDatabase = PortalEnv["DB"];

type OwnedEntryThoughtReviewState = {
  entryUpdatedAt: string;
  currentReview: EntryThoughtReview | null;
};

export type EntryThoughtReview = {
  source_thought: string;
  supporting_context: string;
  missing_context: string;
  alternative_view: string;
  current_view: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export class EntryThoughtReviewConflictError extends PortalError {
  currentReview: EntryThoughtReview | null;

  constructor(currentReview: EntryThoughtReview | null) {
    super(
      409,
      "Esta revisão mudou em outro acesso. Confira a versão mais recente antes de tentar novamente.",
    );
    this.name = "EntryThoughtReviewConflictError";
    this.currentReview = currentReview;
  }
}

export type EntryThoughtReviewJoinedColumns = {
  thought_review_source_thought: string | null;
  thought_review_supporting_context: string | null;
  thought_review_missing_context: string | null;
  thought_review_alternative_view: string | null;
  thought_review_current_view: string | null;
  thought_review_revision: number | null;
  thought_review_created_at: string | null;
  thought_review_updated_at: string | null;
};

export const entryThoughtReviewSelectColumns = `
  entry_thought_reviews.source_thought AS thought_review_source_thought,
  entry_thought_reviews.supporting_context AS thought_review_supporting_context,
  entry_thought_reviews.missing_context AS thought_review_missing_context,
  entry_thought_reviews.alternative_view AS thought_review_alternative_view,
  entry_thought_reviews.current_view AS thought_review_current_view,
  entry_thought_reviews.revision AS thought_review_revision,
  entry_thought_reviews.created_at AS thought_review_created_at,
  entry_thought_reviews.updated_at AS thought_review_updated_at
`;

export function attachThoughtReviews<T extends EntryThoughtReviewJoinedColumns>(
  rows: T[],
): Array<
  Omit<T, keyof EntryThoughtReviewJoinedColumns> & {
    thought_review: EntryThoughtReview | null;
  }
> {
  return rows.map((row) => {
    const {
      thought_review_source_thought: sourceThought,
      thought_review_supporting_context: supportingContext,
      thought_review_missing_context: missingContext,
      thought_review_alternative_view: alternativeView,
      thought_review_current_view: currentView,
      thought_review_revision: revision,
      thought_review_created_at: createdAt,
      thought_review_updated_at: updatedAt,
      ...entry
    } = row;
    const thoughtReview: EntryThoughtReview | null =
      revision === null
        ? null
        : {
            source_thought: sourceThought ?? "",
            supporting_context: supportingContext ?? "",
            missing_context: missingContext ?? "",
            alternative_view: alternativeView ?? "",
            current_view: currentView ?? "",
            revision,
            created_at: createdAt ?? "",
            updated_at: updatedAt ?? "",
          };
    return { ...entry, thought_review: thoughtReview };
  });
}

function normalizeField(
  value: unknown,
  label: string,
  required = false,
): string {
  if (typeof value !== "string") {
    throw new PortalError(400, `Preencha o campo “${label}” como texto.`);
  }
  const normalized = value.trim().replace(/\r\n?/gu, "\n");
  if (required && normalized.length === 0) {
    throw new PortalError(400, "Escolha o pensamento que deseja rever.");
  }
  if (normalized.length > MAXIMUM_FIELD_LENGTH) {
    throw new PortalError(
      400,
      `O campo “${label}” pode ter no máximo ${MAXIMUM_FIELD_LENGTH} caracteres.`,
    );
  }
  return normalized;
}

function assertExactKeys(
  input: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new PortalError(400, `${label} contém dados que não eram esperados.`);
  }
}

function expectedRevision(value: unknown, minimum: 0 | 1): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > MAXIMUM_REVISION
  ) {
    throw new PortalError(
      400,
      minimum === 0
        ? "Informe uma revisão válida para salvar."
        : "Informe a revisão atual para apagar.",
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function returnedThoughtReview(value: unknown): EntryThoughtReview {
  if (
    !isRecord(value) ||
    typeof value.source_thought !== "string" ||
    typeof value.supporting_context !== "string" ||
    typeof value.missing_context !== "string" ||
    typeof value.alternative_view !== "string" ||
    typeof value.current_view !== "string" ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    throw new Error("Thought review mutation returned an invalid row.");
  }
  return {
    source_thought: value.source_thought,
    supporting_context: value.supporting_context,
    missing_context: value.missing_context,
    alternative_view: value.alternative_view,
    current_view: value.current_view,
    revision: value.revision,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function validateThoughtReview(input: Record<string, unknown>) {
  assertExactKeys(input, thoughtReviewPatchKeys, "A revisão do pensamento");
  return {
    sourceThought: normalizeField(
      input.source_thought,
      "Pensamento escolhido",
      true,
    ),
    supportingContext: normalizeField(
      input.supporting_context,
      "O que faz esse pensamento parecer verdadeiro?",
    ),
    missingContext: normalizeField(
      input.missing_context,
      "O que ele pode não estar considerando?",
    ),
    alternativeView: normalizeField(
      input.alternative_view,
      "Existe outra forma possível de compreender?",
    ),
    currentView: normalizeField(
      input.current_view,
      "Como isso fica agora?",
    ),
    expectedRevision: expectedRevision(input.expected_revision, 0),
  };
}

function prepareOwnedEntryState(
  database: ThoughtReviewDatabase,
  patientId: string,
  entryId: string,
) {
  return database
    .prepare(
      `SELECT entries.id AS owned_entry_id,
              entries.updated_at AS entry_updated_at,
              entry_thought_reviews.source_thought,
              entry_thought_reviews.supporting_context,
              entry_thought_reviews.missing_context,
              entry_thought_reviews.alternative_view,
              entry_thought_reviews.current_view,
              entry_thought_reviews.revision,
              entry_thought_reviews.created_at,
              entry_thought_reviews.updated_at
       FROM entries
       LEFT JOIN entry_thought_reviews
         ON entry_thought_reviews.entry_id = entries.id
       WHERE entries.id = ? AND entries.patient_id = ?`,
    )
    .bind(entryId, patientId);
}

function ownedEntryState(value: unknown): OwnedEntryThoughtReviewState | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.owned_entry_id !== "string" ||
    typeof value.entry_updated_at !== "string"
  ) {
    throw new Error("Thought review state returned an invalid entry row.");
  }
  return {
    entryUpdatedAt: value.entry_updated_at,
    currentReview:
      value.revision === null ? null : returnedThoughtReview(value),
  };
}

function throwMutationConflictOrNotFound(
  state: OwnedEntryThoughtReviewState | null,
): never {
  if (!state) throw new PortalError(404, "Registro não encontrado.");
  throw new EntryThoughtReviewConflictError(state.currentReview);
}

function prepareConditionalAudit(
  database: ThoughtReviewDatabase,
  patientId: string,
  action: "create_thought_review" | "update_thought_review" | "delete_thought_review",
  entryId: string,
  timestamp: string,
) {
  return database
    .prepare(
      `INSERT INTO access_logs
         (id, user_id, action, resource_type, resource_id, created_at)
       SELECT ?, ?, ?, 'entry_thought_review', ?, ?
       WHERE changes() = 1`,
    )
    .bind(identifier("log"), patientId, action, entryId, timestamp);
}

export async function patchEntryThoughtReview(
  database: ThoughtReviewDatabase,
  patientId: string,
  entryId: string,
  input: Record<string, unknown>,
): Promise<{
  thoughtReview: EntryThoughtReview;
  created: boolean;
  entryUpdatedAt: string;
}> {
  const values = validateThoughtReview(input);
  const timestamp = now();
  const created = values.expectedRevision === 0;
  const mutation = created
    ? database
        .prepare(
          `INSERT INTO entry_thought_reviews
             (entry_id, source_thought, supporting_context, missing_context,
              alternative_view, current_view, revision, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM entries WHERE id = ? AND patient_id = ?
           )
           ON CONFLICT(entry_id) DO NOTHING
           RETURNING source_thought, supporting_context, missing_context,
                     alternative_view, current_view, revision, created_at,
                     updated_at`,
        )
        .bind(
          entryId,
          values.sourceThought,
          values.supportingContext,
          values.missingContext,
          values.alternativeView,
          values.currentView,
          timestamp,
          timestamp,
          entryId,
          patientId,
        )
    : database
        .prepare(
          `UPDATE entry_thought_reviews
           SET source_thought = ?, supporting_context = ?, missing_context = ?,
               alternative_view = ?, current_view = ?, revision = revision + 1,
               updated_at = ?
           WHERE entry_id = ? AND revision = ?
             AND EXISTS (
               SELECT 1 FROM entries
               WHERE entries.id = entry_thought_reviews.entry_id
                 AND entries.patient_id = ?
             )
           RETURNING source_thought, supporting_context, missing_context,
                     alternative_view, current_view, revision, created_at,
                     updated_at`,
        )
        .bind(
          values.sourceThought,
          values.supportingContext,
          values.missingContext,
          values.alternativeView,
          values.currentView,
          timestamp,
          entryId,
          values.expectedRevision,
          patientId,
        );
  const [result, , stateResult] = await database.batch([
    mutation,
    prepareConditionalAudit(
      database,
      patientId,
      created ? "create_thought_review" : "update_thought_review",
      entryId,
      timestamp,
    ),
    prepareOwnedEntryState(database, patientId, entryId),
  ]);

  const state = ownedEntryState(stateResult.results[0]);
  const returnedRow = result.results[0];
  if (!returnedRow) {
    return throwMutationConflictOrNotFound(state);
  }
  if (!state) throw new Error("Thought review mutation lost its owning entry.");
  const thoughtReview = returnedThoughtReview(returnedRow);
  return {
    thoughtReview,
    created,
    entryUpdatedAt: state.entryUpdatedAt,
  };
}

export async function deleteEntryThoughtReview(
  database: ThoughtReviewDatabase,
  patientId: string,
  entryId: string,
  input: Record<string, unknown>,
): Promise<{ updatedAt: string }> {
  assertExactKeys(
    input,
    ["expected_revision"],
    "A solicitação para apagar a revisão",
  );
  const revision = expectedRevision(input.expected_revision, 1);
  const timestamp = now();
  const mutation = database
    .prepare(
      `DELETE FROM entry_thought_reviews
       WHERE entry_id = ? AND revision = ?
         AND EXISTS (
           SELECT 1 FROM entries
           WHERE entries.id = entry_thought_reviews.entry_id
             AND entries.patient_id = ?
         )
       RETURNING entry_id`,
    )
    .bind(entryId, revision, patientId);
  const [result, , stateResult] = await database.batch([
    mutation,
    prepareConditionalAudit(
      database,
      patientId,
      "delete_thought_review",
      entryId,
      timestamp,
    ),
    prepareOwnedEntryState(database, patientId, entryId),
  ]);
  const state = ownedEntryState(stateResult.results[0]);
  if (!result.results[0]) {
    return throwMutationConflictOrNotFound(state);
  }
  if (!state) throw new Error("Thought review deletion lost its owning entry.");
  return { updatedAt: state.entryUpdatedAt };
}
