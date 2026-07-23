export type PatientEntrySharingFilter = "all" | "private" | "shared";

type EntrySharingState = {
  shared_at: string | null;
  revoked_at?: string | null;
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
