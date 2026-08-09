import {
  PATIENT_MAP_CATALOG,
  PATIENT_MAP_CONTENT_VERSION,
  PATIENT_MAP_RESPONSES,
  type PatientMapDefinition,
  type PatientMapResponseKey,
} from "@/content/patient-map-catalog";
import type { PortalEnv } from "@/db/runtime";
import { PortalError, now } from "@/lib/portal";

type MapDatabase = PortalEnv["DB"];

export type PatientMapDraftFieldType = "answer" | "position" | "synthesis";

export type PatientMapDraftAnswer = {
  response: PatientMapResponseKey | null;
  note: string;
};

export type PatientMapDraftPosition = {
  sectionIndex: number;
  itemIndex: number;
};

export type PatientMapDraftValue =
  | PatientMapDraftAnswer
  | PatientMapDraftPosition
  | string
  | null;

export type PatientMapDraftField = {
  type: PatientMapDraftFieldType;
  id: string;
  value: PatientMapDraftValue;
  revision: number;
  updated_at: string;
};

export type PatientMapDraftPayload = {
  content_version: typeof PATIENT_MAP_CONTENT_VERSION;
  generation: number;
  fields: PatientMapDraftField[];
};

export type PatientMapDraftConflictPayload = {
  error: string;
  code:
    | "map_draft_generation_conflict"
    | "map_draft_field_conflict"
    | "map_draft_request_reused";
  content_version: typeof PATIENT_MAP_CONTENT_VERSION;
  generation: number;
  field?: PatientMapDraftField | null;
};

export type PatientMapDraftPatchResult =
  | {
      ok: true;
      payload: {
        content_version: typeof PATIENT_MAP_CONTENT_VERSION;
        generation: number;
        field: PatientMapDraftField;
        idempotent: boolean;
      };
    }
  | { ok: false; payload: PatientMapDraftConflictPayload };

export type PatientMapDraftResetResult =
  | {
      ok: true;
      payload: {
        content_version: typeof PATIENT_MAP_CONTENT_VERSION;
        generation: number;
        cleared_at: string;
        idempotent: boolean;
      };
    }
  | { ok: false; payload: PatientMapDraftConflictPayload };

type StoredMapRow = {
  field_type: "state" | PatientMapDraftFieldType;
  field_id: string;
  generation: number;
  value: string | null;
  revision: number;
  request_id: string;
  updated_at: string;
};

type NormalizedField = {
  type: PatientMapDraftFieldType;
  id: string;
  value: PatientMapDraftValue;
  storedValue: string | null;
};

const STATE_TYPE = "state";
const STATE_ID = "__state__";
const MAX_COUNTER = 2_147_483_647;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/u;
const RESPONSE_KEYS = new Set<string>(PATIENT_MAP_RESPONSES.map((item) => item.key));
const ACTIVE_MAPS = new Map<string, PatientMapDefinition>(
  PATIENT_MAP_CATALOG.maps.filter((map) => map.active).map((map) => [map.id, map]),
);
const ACTIVE_ITEMS = new Set<string>(
  PATIENT_MAP_CATALOG.maps.flatMap((map) =>
    map.active
      ? map.sections.flatMap((section) =>
          section.active
            ? section.items.filter((item) => item.active).map((item) => item.id)
            : [],
        )
      : [],
  ),
);
const SYNTHESIS_PROMPTS = new Set<string>(
  PATIENT_MAP_CATALOG.summary.prompts.map((prompt) => prompt.id),
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new PortalError(400, `${label} contém dados que não eram esperados.`);
  }
}

function validateCounter(value: unknown, label: string, allowZero: boolean): number {
  const numberValue = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < minimum ||
    numberValue > MAX_COUNTER
  ) {
    throw new PortalError(400, `${label} não é válida.`);
  }
  return numberValue;
}

function validateContentVersion(value: unknown): typeof PATIENT_MAP_CONTENT_VERSION {
  if (value !== PATIENT_MAP_CONTENT_VERSION) {
    throw new PortalError(
      409,
      "Esta versão do Meu mapa mudou. Atualize a página antes de continuar.",
    );
  }
  return PATIENT_MAP_CONTENT_VERSION;
}

function validateRequestId(value: unknown): string {
  const requestId = String(value ?? "");
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new PortalError(400, "Não foi possível identificar esta tentativa de salvamento.");
  }
  return requestId;
}

function validateText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string") {
    throw new PortalError(400, `${label} precisa ser um texto.`);
  }
  const normalized = value.replace(/\r\n?/gu, "\n");
  if (normalized.length > maximum) {
    throw new PortalError(400, `${label} ultrapassa o limite de ${maximum} caracteres.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(normalized)) {
    throw new PortalError(400, `${label} contém caracteres que não podem ser salvos.`);
  }
  return normalized;
}

function normalizeAnswer(id: string, value: unknown): NormalizedField {
  if (!ACTIVE_ITEMS.has(id)) {
    throw new PortalError(400, "A pergunta informada não pertence a esta versão do Meu mapa.");
  }
  if (value === null) return { type: "answer", id, value: null, storedValue: null };
  if (!isPlainObject(value)) {
    throw new PortalError(400, "A resposta do Meu mapa não está no formato esperado.");
  }
  assertExactKeys(value, ["response", "note"], "A resposta do Meu mapa");
  const response = value.response;
  if (response !== null && !RESPONSE_KEYS.has(response as PatientMapResponseKey)) {
    throw new PortalError(400, "Escolha uma das respostas disponíveis no Meu mapa.");
  }
  const note = validateText(value.note ?? "", 600, "A observação");
  if (response === null && !note.trim()) {
    return { type: "answer", id, value: null, storedValue: null };
  }
  const normalizedValue: PatientMapDraftAnswer = {
    response: response as PatientMapResponseKey | null,
    note,
  };
  return {
    type: "answer",
    id,
    value: normalizedValue,
    storedValue: JSON.stringify(normalizedValue),
  };
}

function normalizePosition(id: string, value: unknown): NormalizedField {
  const map = ACTIVE_MAPS.get(id);
  if (!map) {
    throw new PortalError(400, "A área informada não pertence a esta versão do Meu mapa.");
  }
  if (value === null) return { type: "position", id, value: null, storedValue: null };
  if (!isPlainObject(value)) {
    throw new PortalError(400, "A posição do Meu mapa não está no formato esperado.");
  }
  assertExactKeys(value, ["sectionIndex", "itemIndex"], "A posição do Meu mapa");
  const sectionIndex = validateCounter(value.sectionIndex, "A parte do Meu mapa", true);
  const itemIndex = validateCounter(value.itemIndex, "O item do Meu mapa", true);
  const section = map.sections[sectionIndex];
  const item = section?.items[itemIndex];
  if (!section?.active || !item?.active) {
    throw new PortalError(400, "A posição informada não existe nesta versão do Meu mapa.");
  }
  const normalizedValue = { sectionIndex, itemIndex };
  return {
    type: "position",
    id,
    value: normalizedValue,
    storedValue: JSON.stringify(normalizedValue),
  };
}

function normalizeSynthesis(id: string, value: unknown): NormalizedField {
  if (!SYNTHESIS_PROMPTS.has(id)) {
    throw new PortalError(400, "A pergunta de síntese não pertence a esta versão do Meu mapa.");
  }
  if (value === null) return { type: "synthesis", id, value: null, storedValue: null };
  const text = validateText(value, 1_000, "A síntese");
  if (!text.trim()) return { type: "synthesis", id, value: null, storedValue: null };
  return { type: "synthesis", id, value: text, storedValue: JSON.stringify(text) };
}

function normalizeField(value: unknown): NormalizedField {
  if (!isPlainObject(value)) {
    throw new PortalError(400, "Informe o campo do Meu mapa que deve ser salvo.");
  }
  assertExactKeys(value, ["type", "id", "value"], "O campo do Meu mapa");
  const type = String(value.type ?? "");
  const id = String(value.id ?? "");
  if (!/^[a-z0-9.-]{1,80}$/u.test(id)) {
    throw new PortalError(400, "O campo informado não pertence ao Meu mapa.");
  }
  const normalized =
    type === "answer"
      ? normalizeAnswer(id, value.value)
      : type === "position"
        ? normalizePosition(id, value.value)
        : type === "synthesis"
          ? normalizeSynthesis(id, value.value)
          : null;
  if (!normalized) {
    throw new PortalError(400, "O tipo de campo informado não pertence ao Meu mapa.");
  }
  if (
    normalized.storedValue !== null &&
    new TextEncoder().encode(normalized.storedValue).byteLength > 4_096
  ) {
    throw new PortalError(400, "Este campo ultrapassa o limite seguro de salvamento.");
  }
  return normalized;
}

function parseStoredValue(row: StoredMapRow): PatientMapDraftValue {
  if (row.value === null) return null;
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (row.field_type === "answer") {
      return normalizeAnswer(row.field_id, parsed).value;
    }
    if (row.field_type === "position") {
      return normalizePosition(row.field_id, parsed).value;
    }
    if (row.field_type === "synthesis") {
      return normalizeSynthesis(row.field_id, parsed).value;
    }
  } catch (error) {
    throw new Error("Stored patient map draft field is invalid.", { cause: error });
  }
  throw new Error("Stored patient map draft field type is invalid.");
}

function publicField(row: StoredMapRow): PatientMapDraftField | null {
  if (row.field_type === "state") return null;
  const value = parseStoredValue(row);
  return {
    type: row.field_type,
    id: row.field_id,
    value,
    revision: row.revision,
    updated_at: row.updated_at,
  };
}

function generationConflict(generation: number): PatientMapDraftConflictPayload {
  return {
    error: "O Meu mapa foi alterado em outra aba ou aparelho. Recarregue os dados para continuar.",
    code: "map_draft_generation_conflict",
    content_version: PATIENT_MAP_CONTENT_VERSION,
    generation,
  };
}

function fieldConflict(
  generation: number,
  field: PatientMapDraftField | null,
  code: "map_draft_field_conflict" | "map_draft_request_reused" =
    "map_draft_field_conflict",
): PatientMapDraftConflictPayload {
  return {
    error:
      code === "map_draft_request_reused"
        ? "Esta tentativa de salvamento já foi usada para outra alteração."
        : "Este campo foi alterado em outra aba ou aparelho.",
    code,
    content_version: PATIENT_MAP_CONTENT_VERSION,
    generation,
    field,
  };
}

async function stateRow(database: MapDatabase, patientId: string): Promise<StoredMapRow | null> {
  return (
    (await database
      .prepare(
        `SELECT field_type, field_id, generation, value, revision, request_id, updated_at
         FROM patient_map_draft_fields
         WHERE patient_id = ? AND content_version = ?
           AND field_type = ? AND field_id = ?`,
      )
      .bind(patientId, PATIENT_MAP_CONTENT_VERSION, STATE_TYPE, STATE_ID)
      .first<StoredMapRow>()) ?? null
  );
}

async function ensureState(database: MapDatabase, patientId: string): Promise<StoredMapRow> {
  const timestamp = now();
  await database
    .prepare(
      `INSERT OR IGNORE INTO patient_map_draft_fields
        (patient_id, content_version, field_type, field_id, generation, value,
         revision, request_id, updated_at)
       VALUES (?, ?, ?, ?, 1, NULL, 0, '', ?)`,
    )
    .bind(patientId, PATIENT_MAP_CONTENT_VERSION, STATE_TYPE, STATE_ID, timestamp)
    .run();
  const state = await stateRow(database, patientId);
  if (!state) throw new Error("Patient map draft state was not created.");
  return state;
}

async function storedField(
  database: MapDatabase,
  patientId: string,
  type: PatientMapDraftFieldType,
  id: string,
): Promise<StoredMapRow | null> {
  return (
    (await database
      .prepare(
        `SELECT field_type, field_id, generation, value, revision, request_id, updated_at
         FROM patient_map_draft_fields
         WHERE patient_id = ? AND content_version = ?
           AND field_type = ? AND field_id = ?`,
      )
      .bind(patientId, PATIENT_MAP_CONTENT_VERSION, type, id)
      .first<StoredMapRow>()) ?? null
  );
}

async function rowForRequest(
  database: MapDatabase,
  patientId: string,
  generation: number,
  requestId: string,
): Promise<StoredMapRow | null> {
  return (
    (await database
      .prepare(
        `SELECT field_type, field_id, generation, value, revision, request_id, updated_at
         FROM patient_map_draft_fields
         WHERE patient_id = ? AND content_version = ? AND generation = ?
           AND request_id = ?
         LIMIT 1`,
      )
      .bind(patientId, PATIENT_MAP_CONTENT_VERSION, generation, requestId)
      .first<StoredMapRow>()) ?? null
  );
}

export async function readPatientMapDraft(
  database: MapDatabase,
  patientId: string,
): Promise<PatientMapDraftPayload> {
  const state = await stateRow(database, patientId);
  if (!state) {
    return {
      content_version: PATIENT_MAP_CONTENT_VERSION,
      generation: 1,
      fields: [],
    };
  }
  const result = await database
    .prepare(
      `SELECT field_type, field_id, generation, value, revision, request_id, updated_at
       FROM patient_map_draft_fields
       WHERE patient_id = ? AND content_version = ? AND generation = ?
         AND field_type <> ?
       ORDER BY field_type, field_id`,
    )
    .bind(patientId, PATIENT_MAP_CONTENT_VERSION, state.generation, STATE_TYPE)
    .all<StoredMapRow>();
  return {
    content_version: PATIENT_MAP_CONTENT_VERSION,
    generation: state.generation,
    fields: result.results
      .map((row: StoredMapRow) => publicField(row))
      .filter(
        (field: PatientMapDraftField | null): field is PatientMapDraftField =>
          field !== null,
      ),
  };
}

export async function patchPatientMapDraft(
  database: MapDatabase,
  patientId: string,
  input: Record<string, unknown>,
): Promise<PatientMapDraftPatchResult> {
  assertExactKeys(
    input,
    ["content_version", "generation", "base_revision", "request_id", "field"],
    "A solicitação de salvamento",
  );
  validateContentVersion(input.content_version);
  const expectedGeneration = validateCounter(input.generation, "A geração", false);
  const baseRevision = validateCounter(input.base_revision, "A revisão", true);
  const requestId = validateRequestId(input.request_id);
  const field = normalizeField(input.field);
  let state = await ensureState(database, patientId);
  if (state.generation !== expectedGeneration) {
    return { ok: false, payload: generationConflict(state.generation) };
  }

  const previousRequest = await rowForRequest(
    database,
    patientId,
    expectedGeneration,
    requestId,
  );
  if (previousRequest) {
    const sameField =
      previousRequest.field_type === field.type && previousRequest.field_id === field.id;
    const sameValue = previousRequest.value === field.storedValue;
    const visible = publicField(previousRequest);
    if (sameField && sameValue && visible) {
      return {
        ok: true,
        payload: {
          content_version: PATIENT_MAP_CONTENT_VERSION,
          generation: expectedGeneration,
          field: visible,
          idempotent: true,
        },
      };
    }
    return {
      ok: false,
      payload: fieldConflict(expectedGeneration, visible, "map_draft_request_reused"),
    };
  }

  const currentRow = await storedField(database, patientId, field.type, field.id);
  const currentRevision =
    currentRow?.generation === expectedGeneration ? currentRow.revision : 0;
  if (currentRevision !== baseRevision) {
    return {
      ok: false,
      payload: fieldConflict(
        expectedGeneration,
        currentRow?.generation === expectedGeneration ? publicField(currentRow) : null,
      ),
    };
  }

  const timestamp = now();
  let writeChanges = 0;
  try {
    if (currentRevision === 0) {
      const writeResult = await database
        .prepare(
          `INSERT INTO patient_map_draft_fields
            (patient_id, content_version, field_type, field_id, generation, value,
             revision, request_id, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM patient_map_draft_fields
             WHERE patient_id = ? AND content_version = ?
               AND field_type = ? AND field_id = ? AND generation = ?
           )
           ON CONFLICT(patient_id, content_version, field_type, field_id)
           DO UPDATE SET
             generation = excluded.generation,
             value = excluded.value,
             revision = 1,
             request_id = excluded.request_id,
             updated_at = excluded.updated_at
           WHERE patient_map_draft_fields.generation <> excluded.generation`,
        )
        .bind(
          patientId,
          PATIENT_MAP_CONTENT_VERSION,
          field.type,
          field.id,
          expectedGeneration,
          field.storedValue,
          requestId,
          timestamp,
          patientId,
          PATIENT_MAP_CONTENT_VERSION,
          STATE_TYPE,
          STATE_ID,
          expectedGeneration,
        )
        .run();
      writeChanges = writeResult.meta.changes;
    } else {
      const writeResult = await database
        .prepare(
          `UPDATE patient_map_draft_fields
           SET value = ?, revision = revision + 1, request_id = ?, updated_at = ?
           WHERE patient_id = ? AND content_version = ?
             AND field_type = ? AND field_id = ?
             AND generation = ? AND revision = ?
             AND EXISTS (
               SELECT 1 FROM patient_map_draft_fields AS state
               WHERE state.patient_id = ? AND state.content_version = ?
                 AND state.field_type = ? AND state.field_id = ?
                 AND state.generation = ?
             )`,
        )
        .bind(
          field.storedValue,
          requestId,
          timestamp,
          patientId,
          PATIENT_MAP_CONTENT_VERSION,
          field.type,
          field.id,
          expectedGeneration,
          baseRevision,
          patientId,
          PATIENT_MAP_CONTENT_VERSION,
          STATE_TYPE,
          STATE_ID,
          expectedGeneration,
        )
        .run();
      writeChanges = writeResult.meta.changes;
    }
  } catch (error) {
    const racedRequest = await rowForRequest(
      database,
      patientId,
      expectedGeneration,
      requestId,
    );
    if (!racedRequest) throw error;
    const visible = publicField(racedRequest);
    if (
      racedRequest.field_type === field.type &&
      racedRequest.field_id === field.id &&
      racedRequest.value === field.storedValue &&
      visible
    ) {
      return {
        ok: true,
        payload: {
          content_version: PATIENT_MAP_CONTENT_VERSION,
          generation: expectedGeneration,
          field: visible,
          idempotent: true,
        },
      };
    }
    return {
      ok: false,
      payload: fieldConflict(expectedGeneration, visible, "map_draft_request_reused"),
    };
  }

  if (!writeChanges) {
    state = (await stateRow(database, patientId)) ?? state;
    if (state.generation !== expectedGeneration) {
      return { ok: false, payload: generationConflict(state.generation) };
    }
    const racedField = await storedField(database, patientId, field.type, field.id);
    const visibleRacedField = racedField ? publicField(racedField) : null;
    if (
      racedField?.generation === expectedGeneration &&
      racedField.request_id === requestId &&
      racedField.value === field.storedValue &&
      visibleRacedField
    ) {
      return {
        ok: true,
        payload: {
          content_version: PATIENT_MAP_CONTENT_VERSION,
          generation: expectedGeneration,
          field: visibleRacedField,
          idempotent: true,
        },
      };
    }
    return {
      ok: false,
      payload: fieldConflict(
        expectedGeneration,
        racedField?.generation === expectedGeneration ? visibleRacedField : null,
      ),
    };
  }

  const savedRow = await storedField(database, patientId, field.type, field.id);
  const savedField = savedRow ? publicField(savedRow) : null;
  if (!savedField || savedRow?.generation !== expectedGeneration) {
    throw new Error("Patient map draft write could not be confirmed.");
  }
  return {
    ok: true,
    payload: {
      content_version: PATIENT_MAP_CONTENT_VERSION,
      generation: expectedGeneration,
      field: savedField,
      idempotent: false,
    },
  };
}

export async function resetPatientMapDraft(
  database: MapDatabase,
  patientId: string,
  input: Record<string, unknown>,
): Promise<PatientMapDraftResetResult> {
  assertExactKeys(
    input,
    ["content_version", "generation", "request_id"],
    "A solicitação para limpar o Meu mapa",
  );
  validateContentVersion(input.content_version);
  const expectedGeneration = validateCounter(input.generation, "A geração", false);
  const requestId = validateRequestId(input.request_id);
  let state = await ensureState(database, patientId);
  if (
    state.request_id === requestId &&
    state.generation === expectedGeneration + 1
  ) {
    return {
      ok: true,
      payload: {
        content_version: PATIENT_MAP_CONTENT_VERSION,
        generation: state.generation,
        cleared_at: state.updated_at,
        idempotent: true,
      },
    };
  }
  if (state.generation !== expectedGeneration) {
    return { ok: false, payload: generationConflict(state.generation) };
  }
  if (state.generation >= MAX_COUNTER) {
    throw new PortalError(409, "O Meu mapa precisa ser atualizado antes de ser limpo novamente.");
  }
  const timestamp = now();
  let writeChanges = 0;
  try {
    const result = await database
      .prepare(
        `UPDATE patient_map_draft_fields
         SET generation = generation + 1, revision = revision + 1,
             request_id = ?, updated_at = ?
         WHERE patient_id = ? AND content_version = ?
           AND field_type = ? AND field_id = ?
           AND generation = ? AND revision = ?`,
      )
      .bind(
        requestId,
        timestamp,
        patientId,
        PATIENT_MAP_CONTENT_VERSION,
        STATE_TYPE,
        STATE_ID,
        expectedGeneration,
        state.revision,
      )
      .run();
    writeChanges = result.meta.changes;
  } catch (error) {
    state = (await stateRow(database, patientId)) ?? state;
    if (
      state.request_id === requestId &&
      state.generation === expectedGeneration + 1
    ) {
      return {
        ok: true,
        payload: {
          content_version: PATIENT_MAP_CONTENT_VERSION,
          generation: state.generation,
          cleared_at: state.updated_at,
          idempotent: true,
        },
      };
    }
    throw error;
  }
  state = (await stateRow(database, patientId)) ?? state;
  if (!writeChanges) {
    if (
      state.request_id === requestId &&
      state.generation === expectedGeneration + 1
    ) {
      return {
        ok: true,
        payload: {
          content_version: PATIENT_MAP_CONTENT_VERSION,
          generation: state.generation,
          cleared_at: state.updated_at,
          idempotent: true,
        },
      };
    }
    return { ok: false, payload: generationConflict(state.generation) };
  }
  return {
    ok: true,
    payload: {
      content_version: PATIENT_MAP_CONTENT_VERSION,
      generation: state.generation,
      cleared_at: state.updated_at,
      idempotent: false,
    },
  };
}
