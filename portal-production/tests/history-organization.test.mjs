import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAndSortPatientEntries,
  groupPatientEntriesByMonth,
} from "../app/patient-dashboard-data.ts";
import {
  orderSharedByReading,
  patientAccountReference,
  splitSharedByReading,
} from "../app/professional-dashboard-data.ts";

const entryId = (entry) => entry.id;

function frozenEntries(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze(entry)));
}

test("patient month groups are empty when there are no records", () => {
  assert.deepEqual(groupPatientEntriesByMonth([]), []);
});

test("patient month groups distinguish years and preserve first-appearance order", () => {
  const entries = frozenEntries([
    { id: "october-older", created_at: "2025-10-02T12:00:00" },
    { id: "september", created_at: "2026-09-08T12:00:00" },
    { id: "october-newer", created_at: "2026-10-03T12:00:00" },
    { id: "september-second", created_at: "2026-09-12T12:00:00" },
  ]);

  const groups = groupPatientEntriesByMonth(entries);

  assert.deepEqual(groups.map((group) => group.key), [
    "2025-10", "2026-09", "2026-10",
  ]);
  assert.deepEqual(groups.map((group) => group.label), [
    "Outubro de 2025", "Setembro de 2026", "Outubro de 2026",
  ]);
  assert.deepEqual(groups[1].entries.map(entryId), [
    "september", "september-second",
  ]);
  assert.equal(groups[0].entries[0], entries[0]);
  assert.equal(groups[1].entries[0], entries[1]);
  assert.equal(groups[1].entries[1], entries[3]);
  assert.deepEqual(entries.map(entryId), [
    "october-older", "september", "october-newer", "september-second",
  ]);
});

test("patient records without usable dates remain visible in one unknown-date group", () => {
  const entries = frozenEntries([
    { id: "missing-date" },
    { id: "known-date", created_at: "2026-07-20T12:00:00" },
    { id: "empty-date", created_at: "" },
    { id: "invalid-date", created_at: "not-a-date" },
  ]);

  const groups = groupPatientEntriesByMonth(entries);

  assert.deepEqual(groups.map((group) => group.key), [
    "unknown-date", "2026-07",
  ]);
  assert.equal(groups[0].label, "Data indisponível");
  assert.deepEqual(groups[0].entries.map(entryId), [
    "missing-date", "empty-date", "invalid-date",
  ]);
  assert.equal(groups.reduce((total, group) => total + group.entries.length, 0), 4);
  assert.equal(groups[0].entries[2], entries[3]);
});

test("patient month groups use the same local calendar as the displayed record date", () => {
  const createdAt = "2026-03-01T00:30:00Z";
  const date = new Date(createdAt);
  const expectedKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const expectedLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric",
  }).format(date);

  const [group] = groupPatientEntriesByMonth([{ id: "boundary", created_at: createdAt }]);

  assert.equal(group.key, expectedKey);
  assert.equal(group.label, expectedLabel.charAt(0).toLocaleUpperCase("pt-BR") + expectedLabel.slice(1));
});

test("patient month groups preserve search, sharing filters and the selected sort direction", () => {
  const entries = [
    { id: "private-match", title: "Rotina", created_at: "2026-10-03T12:00:00", shared_at: null },
    { id: "shared-old", title: "Rotina", created_at: "2026-08-03T12:00:00", shared_at: "2026-08-04T12:00:00" },
    { id: "shared-new", title: "Rotina", created_at: "2026-10-02T12:00:00", shared_at: "2026-10-03T12:00:00" },
    { id: "shared-other", title: "Outro assunto", created_at: "2026-09-03T12:00:00", shared_at: "2026-09-04T12:00:00" },
    { id: "revoked-match", title: "Rotina", created_at: "2026-09-04T12:00:00", shared_at: "2026-09-05T12:00:00", revoked_at: "2026-09-06T12:00:00" },
  ];

  const oldest = groupPatientEntriesByMonth(
    filterAndSortPatientEntries(entries, "shared", "rotina", "oldest"),
  );
  const newest = groupPatientEntriesByMonth(
    filterAndSortPatientEntries(entries, "shared", "rotina", "newest"),
  );

  assert.deepEqual(oldest.map((group) => group.key), ["2026-08", "2026-10"]);
  assert.deepEqual(oldest.flatMap((group) => group.entries.map(entryId)), ["shared-old", "shared-new"]);
  assert.deepEqual(newest.map((group) => group.key), ["2026-10", "2026-08"]);
  assert.deepEqual(newest.flatMap((group) => group.entries.map(entryId)), ["shared-new", "shared-old"]);
  assert.deepEqual(entries.map(entryId), [
    "private-match", "shared-old", "shared-new", "shared-other", "revoked-match",
  ]);
});

test("a professional account reference is unnecessary for a unique patient name", () => {
  const patients = [
    { patient_id: "account-alfa-00000001", patient_name: "Pessoa Alfa" },
    { patient_id: "account-beta-00000002", patient_name: "Pessoa Beta" },
  ];
  assert.equal(patientAccountReference(patients[0], patients), null);
  assert.equal(patientAccountReference(patients[1], patients), null);
});

test("homonymous patients get distinct references derived from account IDs, not their names", () => {
  const patients = frozenEntries([
    { patient_id: "account-one-00000001", patient_name: "Pessoa Teste" },
    { patient_id: "account-two-00000002", patient_name: "Pessoa Teste" },
  ]);

  assert.equal(patientAccountReference(patients[0], patients), "00000001");
  assert.equal(patientAccountReference(patients[1], patients), "00000002");
  assert.equal(patientAccountReference(patients[0], [...patients].reverse()), "00000001");
  assert.equal(patients[0].patient_name, patients[1].patient_name);
  assert.notEqual(patients[0].patient_id, patients[1].patient_id);
});

test("homonym recognition ignores surrounding spaces, case and accents", () => {
  const patients = [
    { patient_id: "account-one-00000001", patient_name: "  Pessoa ÁGUA  " },
    { patient_id: "account-two-00000002", patient_name: "pessoa agua" },
    { patient_id: "account-three-00000003", patient_name: "Pessoa Outra" },
  ];

  assert.equal(patientAccountReference(patients[0], patients), "00000001");
  assert.equal(patientAccountReference(patients[1], patients), "00000002");
  assert.equal(patientAccountReference(patients[2], patients), null);
});

test("colliding short account suffixes expand only enough to distinguish homonymous accounts", () => {
  const patients = [
    { patient_id: "account-one-deadbeef", patient_name: "Pessoa Teste" },
    { patient_id: "account-two-deadbeef", patient_name: "Pessoa Teste" },
  ];
  const firstReference = patientAccountReference(patients[0], patients);
  const secondReference = patientAccountReference(patients[1], patients);

  assert.notEqual(firstReference, secondReference);
  assert.equal(firstReference.length, 10);
  assert.equal(secondReference.length, 10);
  assert.ok(patients[0].patient_id.endsWith(firstReference));
  assert.ok(patients[1].patient_id.endsWith(secondReference));
});

test("duplicate rows for the same account do not create a false homonym", () => {
  const patient = { patient_id: "account-one-00000001", patient_name: "Pessoa Teste" };
  assert.equal(patientAccountReference(patient, [patient, { ...patient }]), null);
});

test("professional reading lists are empty without shared content", () => {
  assert.deepEqual(orderSharedByReading([], entryId), []);
  assert.deepEqual(splitSharedByReading([], entryId), {
    pending: [], viewed: [], concludedInPlace: 0,
  });
});

test("professional reading order puts unread content first and newest dates first within each state", () => {
  const entries = frozenEntries([
    { id: "viewed-new", shared_at: "2026-10-09T12:00:00Z", is_unread: 0 },
    { id: "unread-old", shared_at: "2026-10-06T12:00:00Z", is_unread: 1 },
    { id: "viewed-old", shared_at: "2026-10-01T12:00:00Z", is_unread: 0 },
    { id: "unread-new", shared_at: "2026-10-08T12:00:00Z", is_unread: 1 },
  ]);

  const ordered = orderSharedByReading(entries, entryId);

  assert.deepEqual(ordered.map(entryId), [
    "unread-new", "unread-old", "viewed-new", "viewed-old",
  ]);
  assert.equal(ordered[0], entries[3]);
  assert.equal(ordered[3], entries[2]);
  assert.deepEqual(entries.map(entryId), [
    "viewed-new", "unread-old", "viewed-old", "unread-new",
  ]);
});

test("professional reading order uses account content IDs to break equal-date ties deterministically", () => {
  const entries = frozenEntries([
    { id: "b", shared_at: "2026-10-09T12:00:00Z", is_unread: 1 },
    { id: "a", shared_at: "2026-10-09T12:00:00Z", is_unread: 1 },
    { id: "d", shared_at: "2026-10-09T12:00:00Z", is_unread: 0 },
    { id: "c", shared_at: "2026-10-09T12:00:00Z", is_unread: 0 },
  ]);
  assert.deepEqual(orderSharedByReading(entries, entryId).map(entryId), ["a", "b", "c", "d"]);
});

test("split professional reading groups retain their supplied order and original content", () => {
  const entries = frozenEntries([
    { id: "unread-one", shared_at: "2026-10-09T12:00:00Z", is_unread: 1, body: "Conteúdo sintético A" },
    { id: "viewed-one", shared_at: "2026-10-08T12:00:00Z", is_unread: 0, body: "Conteúdo sintético B" },
    { id: "unread-two", shared_at: "2026-10-07T12:00:00Z", is_unread: 1, body: "Conteúdo sintético C" },
    { id: "viewed-two", shared_at: "2026-10-06T12:00:00Z", is_unread: 0, body: "Conteúdo sintético D" },
  ]);

  const groups = splitSharedByReading(entries, entryId);

  assert.deepEqual(groups.pending.map(entryId), ["unread-one", "unread-two"]);
  assert.deepEqual(groups.viewed.map(entryId), ["viewed-one", "viewed-two"]);
  assert.equal(groups.concludedInPlace, 0);
  assert.equal(groups.pending[0], entries[0]);
  assert.equal(groups.viewed[1], entries[3]);
  assert.equal(groups.pending[1].body, "Conteúdo sintético C");
});

test("a just-viewed open record stays in the current reading group without being counted unread", () => {
  const entries = frozenEntries([
    { id: "older-viewed", shared_at: "2026-10-06T12:00:00Z", is_unread: 0 },
    { id: "open-just-viewed", shared_at: "2026-10-09T12:00:00Z", is_unread: 0 },
    { id: "still-unread", shared_at: "2026-10-08T12:00:00Z", is_unread: 1 },
  ]);
  const readingIds = new Set(["open-just-viewed"]);
  const ordered = orderSharedByReading(entries, entryId, readingIds);
  const groups = splitSharedByReading(ordered, entryId, readingIds);

  assert.deepEqual(groups.pending.map(entryId), ["open-just-viewed", "still-unread"]);
  assert.deepEqual(groups.viewed.map(entryId), ["older-viewed"]);
  assert.equal(groups.concludedInPlace, 1);
  assert.equal(groups.pending.filter((entry) => entry.is_unread).length, 1);
  assert.equal(groups.pending.length - groups.concludedInPlace, 1);
  assert.equal(groups.pending[0].is_unread, 0);
  assert.deepEqual([...readingIds], ["open-just-viewed"]);

  const afterClosing = splitSharedByReading(orderSharedByReading(entries, entryId), entryId);
  assert.deepEqual(afterClosing.pending.map(entryId), ["still-unread"]);
  assert.deepEqual(afterClosing.viewed.map(entryId), ["open-just-viewed", "older-viewed"]);
  assert.equal(afterClosing.concludedInPlace, 0);
});

test("reading hold also works for shared map IDs and ignores stale unrelated holds", () => {
  const maps = frozenEntries([
    { map_id: "map-seen-open", shared_at: "2026-10-09T12:00:00Z", is_unread: 0 },
    { map_id: "map-pending", shared_at: "2026-10-08T12:00:00Z", is_unread: 1 },
    { map_id: "map-seen-closed", shared_at: "2026-10-07T12:00:00Z", is_unread: 0 },
  ]);
  const mapId = (map) => map.map_id;
  const readingIds = new Set(["map-seen-open", "map-pending", "missing-map"]);
  const groups = splitSharedByReading(orderSharedByReading(maps, mapId, readingIds), mapId, readingIds);

  assert.deepEqual(groups.pending.map(mapId), ["map-seen-open", "map-pending"]);
  assert.deepEqual(groups.viewed.map(mapId), ["map-seen-closed"]);
  assert.equal(groups.concludedInPlace, 1);
  assert.deepEqual([...readingIds], ["map-seen-open", "map-pending", "missing-map"]);
});
