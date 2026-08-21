import {
  PATIENT_MAP_CATALOG,
  PATIENT_MAP_RESPONSES,
  type PatientMapDefinition,
  type PatientMapItem,
  type PatientMapSection,
} from "@/content/patient-map-catalog";
import type { PatientMapDraftPayload } from "@/lib/patient-map-draft";
import type { PatientMapShareCopy } from "@/lib/patient-map-sharing";

export const PATIENT_DATA_EXPORT_FORMAT = "area-do-paciente-export" as const;
export const PATIENT_DATA_EXPORT_VERSION = 2 as const;

export type PatientExportAccountRow = {
  display_name: string;
  role: "patient";
  status: "active" | "disabled";
  privacy_version: string;
  adult_confirmed_at: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type PatientExportCareAccessRow = {
  status: "active" | "closed";
  created_at: string;
  closed_at: string | null;
} | null;

export type PatientExportEntryRow = {
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
  revoked_at: string | null;
  viewed_at: string | null;
};

const responseLabels = new Map(
  PATIENT_MAP_RESPONSES.map((response) => [response.key, response.label]),
);

const mapDetails = new Map<
  string,
  {
    map: PatientMapDefinition;
    section: PatientMapSection;
    item: PatientMapItem;
  }
>(
  PATIENT_MAP_CATALOG.maps.flatMap((map) =>
    map.sections.flatMap((section) =>
      section.items.map((item) => [
        item.id,
        { map, section, item },
      ] as const),
    ),
  ),
);

const mapsById = new Map<string, PatientMapDefinition>(
  PATIENT_MAP_CATALOG.maps.map((map) => [map.id, map]),
);

const synthesisPrompts = new Map<string, string>(
  PATIENT_MAP_CATALOG.summary.prompts.map((prompt) => [prompt.id, prompt.title]),
);

function sharingStatus(
  entry: PatientExportEntryRow,
): "shared" | "revoked" | "private" {
  if (entry.revoked_at) return "revoked";
  return entry.shared_at ? "shared" : "private";
}

function exportEntry(entry: PatientExportEntryRow) {
  const status = sharingStatus(entry);
  return {
    id: entry.id,
    title: entry.title,
    happened: entry.happened,
    body: entry.body,
    thoughts: entry.thoughts,
    urge: entry.urge,
    emotion: entry.emotion,
    intensity: entry.intensity,
    message: entry.message,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    // Campos preservados no mesmo lugar das exportações anteriores.
    shared_at: entry.shared_at,
    revoked_at: entry.revoked_at,
    sharing: {
      status,
      shared_at: entry.shared_at,
      revoked_at: entry.revoked_at,
      viewed_at: entry.viewed_at,
      viewed_at_meaning:
        status === "shared"
          ? "Data em que Mateus marcou este registro compartilhado como visualizado; não significa resposta nem acompanhamento em tempo real."
          : entry.viewed_at
            ? "Histórico da última visualização registrada antes de este conteúdo deixar de estar compartilhado; Mateus não possui acesso atual ao texto."
            : "Não há confirmação de visualização registrada para este conteúdo.",
    },
  };
}

function exportPatientMapDraft(draft: PatientMapDraftPayload) {
  const answers = [];
  const synthesis = [];
  const readingPositions = [];

  for (const field of draft.fields) {
    // `null` é um tombstone de sincronização: o paciente apagou esse conteúdo.
    if (field.value === null) continue;
    if (field.type === "answer") {
      const detail = mapDetails.get(field.id);
      if (
        !detail ||
        typeof field.value !== "object" ||
        !("response" in field.value) ||
        !("note" in field.value)
      ) {
        throw new Error("Patient map export found an invalid answer field.");
      }
      const response = field.value.response;
      answers.push({
        map_id: detail.map.id,
        map_title: detail.map.navigationTitle,
        section_id: detail.section.id,
        section_title: detail.section.title,
        item_id: detail.item.id,
        item_title: detail.item.title,
        response,
        response_label: response ? (responseLabels.get(response) ?? null) : null,
        note: field.value.note,
        updated_at: field.updated_at,
      });
      continue;
    }

    if (field.type === "synthesis") {
      const prompt = synthesisPrompts.get(field.id);
      if (!prompt || typeof field.value !== "string") {
        throw new Error("Patient map export found an invalid synthesis field.");
      }
      synthesis.push({
        prompt_id: field.id,
        prompt,
        answer: field.value,
        updated_at: field.updated_at,
      });
      continue;
    }

    const map = mapsById.get(field.id);
    if (
      !map ||
      typeof field.value !== "object" ||
      !("sectionIndex" in field.value) ||
      !("itemIndex" in field.value)
    ) {
      throw new Error("Patient map export found an invalid reading position.");
    }
    const section = map.sections[field.value.sectionIndex];
    const item = section?.items[field.value.itemIndex];
    if (!section || !item) {
      throw new Error("Patient map export found an unknown reading position.");
    }
    readingPositions.push({
      map_id: map.id,
      map_title: map.navigationTitle,
      section_id: section.id,
      section_title: section.title,
      item_id: item.id,
      item_title: item.title,
      updated_at: field.updated_at,
    });
  }

  return {
    content_version: draft.content_version,
    answers,
    synthesis,
    reading_positions: readingPositions,
  };
}

export function createPatientDataExport({
  exportedAt,
  account,
  careAccess,
  entries,
  patientMapDraft,
  patientMapShares,
}: {
  exportedAt: string;
  account: PatientExportAccountRow;
  careAccess: PatientExportCareAccessRow;
  entries: PatientExportEntryRow[];
  patientMapDraft: PatientMapDraftPayload;
  patientMapShares: PatientMapShareCopy[];
}) {
  return {
    format: PATIENT_DATA_EXPORT_FORMAT,
    format_version: PATIENT_DATA_EXPORT_VERSION,
    exported_at: exportedAt,
    description:
      "Cópia dos dados da Área do paciente solicitada pelo titular.",
    account: {
      display_name: account.display_name,
      account_type: account.role,
      account_status: account.status,
      privacy_notice_version: account.privacy_version,
      adult_confirmed_at: account.adult_confirmed_at,
      account_created_at: account.created_at,
      last_login_at: account.last_login_at,
      care_access: careAccess
        ? {
            status: careAccess.status === "active" ? "active" : "ended",
            started_at: careAccess.created_at,
            ended_at: careAccess.closed_at,
          }
        : { status: "not_linked", started_at: null, ended_at: null },
    },
    // Mantido no nível principal para preservar compatibilidade com as cópias anteriores.
    entries: entries.map(exportEntry),
    patient_map: {
      draft: exportPatientMapDraft(patientMapDraft),
      sharing: {
        active_copies: patientMapShares,
      },
    },
  };
}
