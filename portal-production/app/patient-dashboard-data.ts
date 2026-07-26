export type PatientEntrySharingFilter = "all" | "private" | "shared";
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
