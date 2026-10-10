export type PatientEntrySharingFilter = "all" | "private" | "shared";
export type PatientEntrySort = "newest" | "oldest";
export type PatientEntryViewStatus =
  | { kind: "private" }
  | { kind: "unseen" }
  | { kind: "viewed" }
  | { kind: "updated" }
  | { kind: "reshared" };

type EntrySharingState = {
  shared_at: string | null;
  revoked_at?: string | null;
  updated_at?: string;
  viewed_at?: string | null;
};

type PatientSearchableEntry = EntrySharingState & {
  title?: string;
  happened?: string;
  body?: string;
  thoughts?: string;
  urge?: string;
  emotion?: string;
  message?: string;
  created_at?: string;
};

function normalizePatientEntrySearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function isEntryShared(entry: EntrySharingState): boolean {
  return Boolean(entry.shared_at && !entry.revoked_at);
}

export function filterPatientEntries<T extends EntrySharingState>(
  entries: T[],
  filter: PatientEntrySharingFilter,
): T[] {
  if (filter === "all") return entries;
  return entries.filter((entry) =>
    filter === "shared" ? isEntryShared(entry) : !isEntryShared(entry),
  );
}

export function filterAndSortPatientEntries<T extends PatientSearchableEntry>(
  entries: T[],
  filter: PatientEntrySharingFilter,
  query: string,
  sort: PatientEntrySort,
): T[] {
  const normalizedQuery = normalizePatientEntrySearch(query);
  const matchingEntries = filterPatientEntries(entries, filter).filter((entry) => {
    if (!normalizedQuery) return true;
    return [
      entry.title,
      entry.happened,
      entry.body,
      entry.thoughts,
      entry.urge,
      entry.emotion,
      entry.message,
    ].some((value) =>
      normalizePatientEntrySearch(value ?? "").includes(normalizedQuery),
    );
  });

  return matchingEntries.sort((first, second) => {
    const firstDate = Date.parse(first.created_at ?? "");
    const secondDate = Date.parse(second.created_at ?? "");
    const safeFirstDate = Number.isFinite(firstDate) ? firstDate : 0;
    const safeSecondDate = Number.isFinite(secondDate) ? secondDate : 0;
    return sort === "oldest"
      ? safeFirstDate - safeSecondDate
      : safeSecondDate - safeFirstDate;
  });
}

const patientRecordMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

/** Presentation only: keep the caller's filtered order and original entries. */
export function groupPatientEntriesByMonth<T extends { created_at?: string }>(
  entries: readonly T[],
): Array<{ key: string; label: string; entries: T[] }> {
  const groups = new Map<string, { key: string; label: string; entries: T[] }>();
  for (const entry of entries) {
    const date = new Date(entry.created_at ?? "");
    const valid = Number.isFinite(date.getTime());
    const key = valid
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : "unknown-date";
    let group = groups.get(key);
    if (!group) {
      const month = valid ? patientRecordMonthFormatter.format(date) : "Data indisponível";
      group = { key, label: month.charAt(0).toLocaleUpperCase("pt-BR") + month.slice(1), entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}

export function patientEntryViewStatus(
  entry: EntrySharingState,
): PatientEntryViewStatus {
  if (!isEntryShared(entry)) return { kind: "private" };
  if (!entry.viewed_at) return { kind: "unseen" };

  const viewedAt = Date.parse(entry.viewed_at);
  const sharedAt = Date.parse(entry.shared_at ?? "");
  const updatedAt = Date.parse(entry.updated_at ?? "");
  if (
    Number.isFinite(viewedAt) &&
    Number.isFinite(sharedAt) &&
    viewedAt < sharedAt
  ) {
    return { kind: "reshared" };
  }
  if (
    Number.isFinite(viewedAt) &&
    Number.isFinite(updatedAt) &&
    viewedAt < updatedAt
  ) {
    return { kind: "updated" };
  }
  return { kind: "viewed" };
}

export function patientEntryViewSummary(
  status: PatientEntryViewStatus,
): string | null {
  switch (status.kind) {
    case "private":
      return null;
    case "unseen":
      return "Ainda não visualizado";
    case "viewed":
      return "Visualizado por Mateus";
    case "updated":
      return "Atualizado após visualização";
    case "reshared":
      return "Compartilhado novamente · ainda não visualizado";
  }
}

export function remainingCharactersNearLimit(
  value: string,
  maxLength: number,
): number | null {
  if (!Number.isFinite(maxLength) || maxLength <= 0) return null;
  const remaining = Math.max(0, maxLength - value.length);
  const visibleThreshold = Math.max(20, Math.ceil(maxLength * 0.1));
  return remaining <= visibleThreshold ? remaining : null;
}
