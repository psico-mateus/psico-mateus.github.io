export type ProfessionalArea = "records" | "accesses" | "invitations";
export type PatientSort = "unread" | "recent" | "alphabetical";
export type EntryViewFilter = "all" | "unread" | "viewed";
export type InvitationStatus = "active" | "used" | "expired" | "revoked";
export type PatientAccessStatus = "active" | "revoked";

export type PatientSummary = {
  patient_id: string;
  patient_name: string;
  shared_count: number;
  private_count: number;
  unread_count: number;
  shared_map_count: number;
  unread_map_count: number;
  latest_shared_at: string | null;
  latest_map_shared_at: string | null;
};

export type SharedPatientMapAnswer = {
  item_id: string;
  item_title: string;
  section_title: string;
  response_key: string | null;
  response_label: string | null;
  note: string;
};

export type SharedPatientMap = {
  map_id: string;
  map_title: string;
  map_description: string;
  answers: SharedPatientMapAnswer[];
  shared_at: string;
  viewed_at: string | null;
  is_unread: number;
};

export type SharedEntry = {
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
  shared_at: string;
  viewed_at: string | null;
  is_unread: number;
};

export type PatientAccess = {
  patient_id: string;
  patient_name: string;
  access_status: PatientAccessStatus;
  created_at: string;
  revoked_at: string | null;
  last_login_at: string | null;
  shared_count: number;
};

export type Invitation = {
  id: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  revoked_at: string | null;
  status: InvitationStatus;
};

const collator = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  usage: "sort",
});

export function displayedPatientName(name: string): string {
  const normalized = name.trim();
  return normalized || "Paciente";
}

export function normalizePatientSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function filterAndSortPatients(
  patients: PatientSummary[],
  query: string,
  sort: PatientSort,
): PatientSummary[] {
  const normalizedQuery = normalizePatientSearch(query);
  return patients
    .filter((patient) =>
      normalizedQuery
        ? normalizePatientSearch(displayedPatientName(patient.patient_name)).includes(
            normalizedQuery,
          )
        : true,
    )
    .sort((first, second) => {
      if (sort === "alphabetical") {
        const nameComparison = collator.compare(
          displayedPatientName(first.patient_name),
          displayedPatientName(second.patient_name),
        );
        if (nameComparison !== 0) return nameComparison;
      } else {
        if (sort === "unread") {
          const unreadComparison =
            second.unread_count + (second.unread_map_count ?? 0) -
            (first.unread_count + (first.unread_map_count ?? 0));
          if (unreadComparison !== 0) return unreadComparison;
        }
        const firstLatest = [first.latest_shared_at, first.latest_map_shared_at ?? null]
          .filter(Boolean)
          .reduce((latest, value) => Math.max(latest, new Date(value!).getTime()), 0);
        const secondLatest = [second.latest_shared_at, second.latest_map_shared_at ?? null]
          .filter(Boolean)
          .reduce((latest, value) => Math.max(latest, new Date(value!).getTime()), 0);
        const dateComparison =
          secondLatest - firstLatest;
        if (dateComparison !== 0) return dateComparison;
      }
      return first.patient_id.localeCompare(second.patient_id);
    });
}

export function filterPatientAccesses(
  patients: PatientAccess[],
  query: string,
): PatientAccess[] {
  const normalizedQuery = normalizePatientSearch(query);
  return patients
    .filter((patient) =>
      normalizedQuery
        ? normalizePatientSearch(displayedPatientName(patient.patient_name)).includes(
            normalizedQuery,
          )
        : true,
    )
    .sort((first, second) => {
      if (first.access_status !== second.access_status) {
        return first.access_status === "active" ? -1 : 1;
      }
      const nameComparison = collator.compare(
        displayedPatientName(first.patient_name),
        displayedPatientName(second.patient_name),
      );
      if (nameComparison !== 0) return nameComparison;
      return first.patient_id.localeCompare(second.patient_id);
    });
}

export function splitInvitations(invitations: Invitation[]): {
  active: Invitation[];
  history: Invitation[];
} {
  return {
    active: invitations.filter((invitation) => invitation.status === "active"),
    history: invitations.filter((invitation) => invitation.status !== "active"),
  };
}

export function invitationStatusLabel(status: InvitationStatus): string {
  const labels: Record<InvitationStatus, string> = {
    active: "Ativo",
    used: "Usado",
    expired: "Expirado",
    revoked: "Revogado",
  };
  return labels[status];
}

export function sharedCountLabel(count: number): string {
  return `${count} ${count === 1 ? "registro compartilhado" : "registros compartilhados"}`;
}

export function unreadCountLabel(count: number): string {
  if (count === 0) return "Tudo visto";
  return `${count} ${count === 1 ? "registro ainda não visto" : "registros ainda não vistos"}`;
}
