import {
  PATIENT_MAP_CATALOG,
  PATIENT_MAP_CONTENT_VERSION,
  PATIENT_MAP_RESPONSES,
  type PatientMapResponseKey,
} from "@/content/patient-map-catalog";
import type { PortalEnv } from "@/db/runtime";
import { PortalError, now } from "@/lib/portal";
import {
  readPatientMapDraft,
  type PatientMapDraftAnswer,
} from "@/lib/patient-map-draft";

type MapDatabase = PortalEnv["DB"];

export type PatientMapShareStatus = {
  map_id: string;
  shared_at: string;
  viewed_at: string | null;
};

export type SharedPatientMapAnswer = {
  item_id: string;
  item_title: string;
  section_title: string;
  response_key: PatientMapResponseKey | null;
  response_label: string | null;
  note: string;
};

export type SharedPatientMap = PatientMapShareStatus & {
  map_title: string;
  map_description: string;
  answers: SharedPatientMapAnswer[];
  is_unread: number;
};

type StoredShare = PatientMapShareStatus & {
  content_version: string;
  snapshot: string;
};

const mapsById = new Map(
  PATIENT_MAP_CATALOG.maps.filter((map) => map.active).map((map) => [map.id, map]),
);
const responseLabels = new Map(
  PATIENT_MAP_RESPONSES.map((response) => [response.key, response.label]),
);

function mapOrThrow(mapId: string) {
  const map = mapsById.get(mapId);
  if (!map) throw new PortalError(404, "Esta parte do Meu mapa não foi encontrada.");
  return map;
}

export async function listPatientMapShares(
  database: MapDatabase,
  patientId: string,
): Promise<PatientMapShareStatus[]> {
  const result = await database
    .prepare(
      `SELECT map_id, shared_at, viewed_at
       FROM patient_map_shares
       WHERE patient_id = ?
       ORDER BY shared_at DESC`,
    )
    .bind(patientId)
    .all<PatientMapShareStatus>();
  return result.results.filter((share) => mapsById.has(share.map_id));
}

export async function sharePatientMap(
  database: MapDatabase,
  patientId: string,
  mapId: string,
): Promise<PatientMapShareStatus> {
  const map = mapOrThrow(mapId);
  const link = await database
    .prepare(
      `SELECT patient_links.therapist_id
       FROM patient_links
       JOIN users AS therapist ON therapist.id = patient_links.therapist_id
       WHERE patient_links.patient_id = ?
         AND patient_links.status = 'active'
         AND therapist.role = 'therapist'
         AND therapist.status = 'active'
       LIMIT 1`,
    )
    .bind(patientId)
    .first<{ therapist_id: string }>();
  if (!link) {
    throw new PortalError(
      409,
      "Seu acesso profissional não está ativo. O mapa continua privado.",
    );
  }

  const itemDetails = new Map(
    map.sections.flatMap((section) =>
      section.items
        .filter((item) => item.active)
        .map((item) => [item.id, { item, section }] as const),
    ),
  );
  const draft = await readPatientMapDraft(database, patientId);
  const answers: SharedPatientMapAnswer[] = [];
  for (const field of draft.fields) {
    if (field.type !== "answer" || field.value === null) continue;
    const detail = itemDetails.get(field.id);
    if (!detail) continue;
    const value = field.value as PatientMapDraftAnswer;
    if (!value.response && !value.note.trim()) continue;
    answers.push({
      item_id: detail.item.id,
      item_title: detail.item.title,
      section_title: detail.section.title,
      response_key: value.response,
      response_label: value.response
        ? (responseLabels.get(value.response) ?? null)
        : null,
      note: value.note,
    });
  }
  if (answers.length === 0) {
    throw new PortalError(
      400,
      "Explore ao menos um item desta parte antes de compartilhar.",
    );
  }
  answers.sort((first, second) => first.item_id.localeCompare(second.item_id));
  const snapshot = JSON.stringify({
    content_version: PATIENT_MAP_CONTENT_VERSION,
    map_id: map.id,
    map_title: map.navigationTitle,
    map_description: map.description,
    answers,
  });
  if (new TextEncoder().encode(snapshot).byteLength > 65_536) {
    throw new PortalError(400, "Esta parte do mapa ficou grande demais para compartilhar.");
  }
  const sharedAt = now();
  await database
    .prepare(
      `INSERT INTO patient_map_shares
        (patient_id, therapist_id, map_id, content_version, snapshot, shared_at, viewed_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(patient_id, map_id) DO UPDATE SET
         therapist_id = excluded.therapist_id,
         content_version = excluded.content_version,
         snapshot = excluded.snapshot,
         shared_at = excluded.shared_at,
         viewed_at = NULL`,
    )
    .bind(
      patientId,
      link.therapist_id,
      map.id,
      PATIENT_MAP_CONTENT_VERSION,
      snapshot,
      sharedAt,
    )
    .run();
  return { map_id: map.id, shared_at: sharedAt, viewed_at: null };
}

export async function revokePatientMapShare(
  database: MapDatabase,
  patientId: string,
  mapId: string,
): Promise<void> {
  mapOrThrow(mapId);
  await database
    .prepare("DELETE FROM patient_map_shares WHERE patient_id = ? AND map_id = ?")
    .bind(patientId, mapId)
    .run();
}

function parseStoredShare(row: StoredShare): SharedPatientMap {
  if (row.content_version !== PATIENT_MAP_CONTENT_VERSION) {
    throw new Error("Stored patient map share uses an unsupported content version.");
  }
  const parsed = JSON.parse(row.snapshot) as {
    map_id?: unknown;
    map_title?: unknown;
    map_description?: unknown;
    answers?: unknown;
  };
  const map = mapsById.get(row.map_id);
  if (
    !map ||
    parsed.map_id !== row.map_id ||
    parsed.map_title !== map.navigationTitle ||
    parsed.map_description !== map.description ||
    !Array.isArray(parsed.answers)
  ) {
    throw new Error("Stored patient map share is invalid.");
  }
  const itemDetails = new Map(
    map.sections.flatMap((section) =>
      section.items.map((item) => [item.id, { item, section }] as const),
    ),
  );
  const seenItems = new Set<string>();
  const answers = parsed.answers.filter((answer): answer is SharedPatientMapAnswer => {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
    const value = answer as Record<string, unknown>;
    const itemId = typeof value.item_id === "string" ? value.item_id : "";
    const detail = itemDetails.get(itemId);
    const responseKey = value.response_key;
    const expectedResponseLabel =
      typeof responseKey === "string"
        ? responseLabels.get(responseKey as PatientMapResponseKey)
        : null;
    if (!detail || seenItems.has(itemId)) return false;
    seenItems.add(itemId);
    return (
      value.item_title === detail.item.title &&
      value.section_title === detail.section.title &&
      (responseKey === null || Boolean(expectedResponseLabel)) &&
      value.response_label === expectedResponseLabel &&
      typeof value.note === "string" &&
      value.note.length <= 600 &&
      (responseKey !== null || Boolean(value.note.trim()))
    );
  });
  if (answers.length !== parsed.answers.length || answers.length > 30) {
    throw new Error("Stored patient map share contains invalid answers.");
  }
  return {
    map_id: row.map_id,
    map_title: parsed.map_title,
    map_description: parsed.map_description,
    answers,
    shared_at: row.shared_at,
    viewed_at: row.viewed_at,
    is_unread: !row.viewed_at || row.viewed_at < row.shared_at ? 1 : 0,
  };
}

export async function listSharedPatientMaps(
  database: MapDatabase,
  therapistId: string,
  patientId: string,
): Promise<SharedPatientMap[]> {
  const result = await database
    .prepare(
      `SELECT patient_map_shares.map_id, patient_map_shares.content_version,
              patient_map_shares.snapshot, patient_map_shares.shared_at,
              patient_map_shares.viewed_at
       FROM patient_map_shares
       JOIN patient_links
         ON patient_links.patient_id = patient_map_shares.patient_id
        AND patient_links.therapist_id = patient_map_shares.therapist_id
       JOIN users ON users.id = patient_map_shares.patient_id
       WHERE patient_map_shares.therapist_id = ?
         AND patient_map_shares.patient_id = ?
         AND patient_links.status = 'active'
         AND users.status = 'active'
         AND users.role = 'patient'
       ORDER BY patient_map_shares.shared_at DESC`,
    )
    .bind(therapistId, patientId)
    .all<StoredShare>();
  return result.results.map(parseStoredShare);
}

export async function markPatientMapShareViewed(
  database: MapDatabase,
  therapistId: string,
  patientId: string,
  mapId: string,
): Promise<string> {
  mapOrThrow(mapId);
  const viewedAt = now();
  const result = await database
    .prepare(
      `UPDATE patient_map_shares SET viewed_at = ?
       WHERE therapist_id = ? AND patient_id = ? AND map_id = ?
         AND EXISTS (
           SELECT 1 FROM patient_links
           WHERE patient_links.therapist_id = ?
             AND patient_links.patient_id = ?
             AND patient_links.status = 'active'
         )`,
    )
    .bind(viewedAt, therapistId, patientId, mapId, therapistId, patientId)
    .run();
  if (!result.meta.changes) {
    throw new PortalError(404, "Parte compartilhada do mapa não encontrada.");
  }
  return viewedAt;
}
