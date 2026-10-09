import {
  PATIENT_MAP_CATALOG,
  PATIENT_MAP_RESPONSES,
  type PatientMapResponseKey,
} from "@/content/patient-map-catalog";

/** Structural input only: this helper does not depend on UI or persistence. */
export type PatientMapSummaryAnswers = Readonly<
  Record<
    string,
    | { readonly response?: string | null; readonly note?: string }
    | null
    | undefined
  >
>;

export type PatientMapSummaryRow = {
  key: PatientMapResponseKey;
  label: string;
  count: number;
};

export type PatientMapResponseSummary = {
  mapId: string | null;
  totalItems: number;
  answeredItems: number;
  noteOnlyItems: number;
  untouchedItems: number;
  unansweredItems: number;
  rows: PatientMapSummaryRow[];
};

/**
 * A descriptive count of choices, not a score, assessment or clinical result.
 * Omit mapId to include all active themes. An unknown mapId selects no items.
 * Notes are counted separately and their content never enters the result.
 */
export function createPatientMapSummary(
  answers: PatientMapSummaryAnswers = {},
  mapId?: string,
): PatientMapResponseSummary {
  const rows: PatientMapSummaryRow[] = PATIENT_MAP_RESPONSES.map((response) => ({
    key: response.key,
    label: response.label,
    count: 0,
  }));
  const rowByKey = new Map<string, PatientMapSummaryRow>(
    rows.map((row) => [row.key, row]),
  );

  let totalItems = 0;
  let answeredItems = 0;
  let noteOnlyItems = 0;

  for (const map of PATIENT_MAP_CATALOG.maps) {
    if (!map.active || (mapId !== undefined && map.id !== mapId)) continue;

    for (const section of map.sections) {
      if (!section.active) continue;

      for (const item of section.items) {
        if (!item.active) continue;
        totalItems += 1;
        // Iterate the catalog, not the draft, and ignore inherited properties.
        const answer = Object.hasOwn(answers, item.id) ? answers[item.id] : null;
        const row =
          typeof answer?.response === "string"
            ? rowByKey.get(answer.response)
            : undefined;

        if (row) {
          row.count += 1;
          answeredItems += 1;
        } else if (
          typeof answer?.note === "string" &&
          answer.note.trim().length > 0
        ) {
          noteOnlyItems += 1;
        }
      }
    }
  }

  return {
    mapId: mapId ?? null,
    totalItems,
    answeredItems,
    noteOnlyItems,
    untouchedItems: totalItems - answeredItems - noteOnlyItems,
    unansweredItems: totalItems - answeredItems,
    rows,
  };
}
