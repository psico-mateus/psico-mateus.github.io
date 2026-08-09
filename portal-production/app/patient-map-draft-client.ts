"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PATIENT_MAP_CONTENT_VERSION,
  type PatientMapResponseKey,
} from "../content/patient-map-catalog";
import {
  type PatientMapSessionAnswer,
  type PatientMapSessionDraft,
  type PatientMapSessionPosition,
} from "./PatientMapShell";
import { PortalRequestError, portalRequest } from "./portal-client";

export type PatientMapDraftFieldType = "answer" | "synthesis" | "position";
export type PatientMapDraftFieldValue =
  | PatientMapSessionAnswer
  | PatientMapSessionPosition
  | string
  | null;

export type PatientMapDraftField = {
  type: PatientMapDraftFieldType;
  id: string;
  value: PatientMapDraftFieldValue;
};

type PatientMapDraftServerField = PatientMapDraftField & {
  revision: number;
  updated_at: string;
};

type PatientMapDraftGetResponse = {
  content_version: typeof PATIENT_MAP_CONTENT_VERSION;
  generation: number;
  fields: PatientMapDraftServerField[];
};

type PatientMapDraftPatchResponse = {
  content_version: typeof PATIENT_MAP_CONTENT_VERSION;
  generation: number;
  field: PatientMapDraftServerField;
  idempotent?: boolean;
};

type PatientMapDraftDeleteResponse = {
  content_version: typeof PATIENT_MAP_CONTENT_VERSION;
  generation: number;
  cleared_at: string;
  idempotent?: boolean;
};

type PatientMapDraftMutation = {
  field: PatientMapDraftField;
  baseRevision: number;
  requestId: string;
  attempted: boolean;
  dueAt: number;
};

export type PatientMapDraftConflict = {
  kind: "field" | "generation";
  key: string;
  field: PatientMapDraftField;
  localValue: PatientMapDraftFieldValue;
  remoteValue: PatientMapDraftFieldValue;
  remoteRevision: number;
};

type PatientMapDraftQueue = {
  active?: PatientMapDraftMutation;
  pending?: PatientMapDraftMutation;
  next?: PatientMapDraftMutation;
  timer?: number;
  errorKind?: "offline" | "error";
  conflict?: PatientMapDraftConflict;
};

export type PatientMapDraftRecoverySnapshot = {
  patientId: string;
  contentVersion: typeof PATIENT_MAP_CONTENT_VERSION;
  generation: number;
  draft: PatientMapSessionDraft;
  revisions: Record<string, number>;
  queues: Array<{
    key: string;
    active?: PatientMapDraftMutation;
    pending?: PatientMapDraftMutation;
    next?: PatientMapDraftMutation;
    errorKind?: "offline" | "error";
    conflict?: PatientMapDraftConflict;
  }>;
};

export type PatientMapDraftLoadState = "loading" | "ready" | "error";
export type PatientMapDraftSaveState =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  | "error"
  | "conflict";

export type PatientMapDraftController = {
  draft: PatientMapSessionDraft;
  loadState: PatientMapDraftLoadState;
  loadMessage: string;
  saveState: PatientMapDraftSaveState;
  saveMessage: string;
  conflict: PatientMapDraftConflict | null;
  clearing: boolean;
  hasUnsavedChanges: boolean;
  updateDraft: (draft: PatientMapSessionDraft) => void;
  retryLoad: () => void;
  retryPending: () => void;
  resolveConflict: (choice: "local" | "remote") => void;
  clearDraft: () => Promise<boolean>;
  flushPending: () => Promise<boolean>;
};

type UsePatientMapDraftOptions = {
  patientId: string;
  csrf: string;
  recovery?: PatientMapDraftRecoverySnapshot | null;
  onRecoveryChange: (snapshot: PatientMapDraftRecoverySnapshot | null) => void;
  onSessionLost: () => void;
};

function fieldKey(field: Pick<PatientMapDraftField, "type" | "id">): string {
  return `${field.type}:${field.id}`;
}

function copyDraft(draft: PatientMapSessionDraft): PatientMapSessionDraft {
  return {
    contentVersion: PATIENT_MAP_CONTENT_VERSION,
    answers: Object.fromEntries(
      Object.entries(draft.answers ?? {}).map(([id, answer]) => [id, { ...answer }]),
    ),
    synthesis: { ...draft.synthesis },
    positions: Object.fromEntries(
      Object.entries(draft.positions ?? {}).map(([id, position]) => [id, { ...position }]),
    ),
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

type PatientMapDraftChange = {
  field: PatientMapDraftField;
  delay: number;
};

function fieldsChanged(
  previous: PatientMapSessionDraft,
  next: PatientMapSessionDraft,
): PatientMapDraftChange[] {
  const changed: PatientMapDraftChange[] = [];
  const answerIds = new Set([
    ...Object.keys(previous.answers ?? {}),
    ...Object.keys(next.answers ?? {}),
  ]);
  for (const id of answerIds) {
    const previousValue = previous.answers?.[id] ?? null;
    const nextValue = next.answers?.[id] ?? null;
    if (!valuesEqual(previousValue, nextValue)) {
      changed.push({
        field: { type: "answer", id, value: nextValue },
        delay: previousValue?.note !== nextValue?.note ? 900 : 300,
      });
    }
  }

  const synthesisIds = new Set([
    ...Object.keys(previous.synthesis ?? {}),
    ...Object.keys(next.synthesis ?? {}),
  ]);
  for (const id of synthesisIds) {
    const previousValue = previous.synthesis?.[id] ?? null;
    const nextValue = next.synthesis?.[id] ?? null;
    if (previousValue !== nextValue) {
      changed.push({
        field: { type: "synthesis", id, value: nextValue },
        delay: 900,
      });
    }
  }

  const positionIds = new Set([
    ...Object.keys(previous.positions ?? {}),
    ...Object.keys(next.positions ?? {}),
  ]);
  for (const id of positionIds) {
    const previousValue = previous.positions?.[id] ?? null;
    const nextValue = next.positions?.[id] ?? null;
    if (!valuesEqual(previousValue, nextValue)) {
      changed.push({
        field: { type: "position", id, value: nextValue },
        delay: 180,
      });
    }
  }
  return changed;
}

function draftFromFields(fields: PatientMapDraftServerField[]): PatientMapSessionDraft {
  const draft: PatientMapSessionDraft = {
    contentVersion: PATIENT_MAP_CONTENT_VERSION,
    answers: {},
    synthesis: {},
    positions: {},
  };
  for (const field of fields) {
    if (field.value === null) continue;
    if (field.type === "answer") {
      draft.answers![field.id] = field.value as PatientMapSessionAnswer;
    } else if (field.type === "synthesis") {
      draft.synthesis![field.id] = field.value as string;
    } else {
      draft.positions![field.id] = field.value as PatientMapSessionPosition;
    }
  }
  return draft;
}

function applyFieldToDraft(
  current: PatientMapSessionDraft,
  field: PatientMapDraftField,
): PatientMapSessionDraft {
  const next = copyDraft(current);
  if (field.type === "answer") {
    if (field.value === null) delete next.answers![field.id];
    else next.answers![field.id] = field.value as PatientMapSessionAnswer;
  } else if (field.type === "synthesis") {
    if (field.value === null) delete next.synthesis![field.id];
    else next.synthesis![field.id] = field.value as string;
  } else if (field.value === null) {
    delete next.positions![field.id];
  } else {
    next.positions![field.id] = field.value as PatientMapSessionPosition;
  }
  return next;
}

function responseFieldFromError(error: PortalRequestError): PatientMapDraftServerField | null {
  const field = error.payload?.field;
  if (!field || typeof field !== "object") return null;
  const candidate = field as Partial<PatientMapDraftServerField>;
  if (
    (candidate.type !== "answer" &&
      candidate.type !== "synthesis" &&
      candidate.type !== "position") ||
    typeof candidate.id !== "string" ||
    typeof candidate.revision !== "number"
  ) {
    return null;
  }
  return candidate as PatientMapDraftServerField;
}

function isNetworkError(error: unknown): boolean {
  return error instanceof PortalRequestError && error.status === 0;
}

export function usePatientMapDraft({
  patientId,
  csrf,
  recovery,
  onRecoveryChange,
  onSessionLost,
}: UsePatientMapDraftOptions): PatientMapDraftController {
  const [draft, setDraft] = useState<PatientMapSessionDraft>({});
  const [loadState, setLoadState] = useState<PatientMapDraftLoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [saveState, setSaveState] = useState<PatientMapDraftSaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [clearing, setClearing] = useState(false);
  const [conflictState, setConflictState] = useState<PatientMapDraftConflict | null>(null);
  const [hasUnsavedChangesState, setHasUnsavedChangesState] = useState(false);
  const draftRef = useRef<PatientMapSessionDraft>({});
  const generationRef = useRef(1);
  const revisionsRef = useRef(new Map<string, number>());
  const queuesRef = useRef(new Map<string, PatientMapDraftQueue>());
  const mountedRef = useRef(true);
  const loadSequenceRef = useRef(0);
  const clearRequestRef = useRef<string | null>(null);
  const lastSavedAtRef = useRef(0);
  const recoveryRef = useRef(
    recovery?.patientId === patientId &&
      recovery.contentVersion === PATIENT_MAP_CONTENT_VERSION
      ? recovery
      : null,
  );

  const makeRecoverySnapshot = useCallback((): PatientMapDraftRecoverySnapshot | null => {
    const queues = Array.from(queuesRef.current.entries())
      .filter(([, queue]) =>
        Boolean(queue.active || queue.pending || queue.next || queue.conflict),
      )
      .map(([key, queue]) => ({
        key,
        active: queue.active,
        pending: queue.pending,
        next: queue.next,
        errorKind: queue.errorKind,
        conflict: queue.conflict,
      }));
    if (queues.length === 0) return null;
    return {
      patientId,
      contentVersion: PATIENT_MAP_CONTENT_VERSION,
      generation: generationRef.current,
      draft: copyDraft(draftRef.current),
      revisions: Object.fromEntries(revisionsRef.current),
      queues,
    };
  }, [patientId]);

  const syncRecovery = useCallback(() => {
    onRecoveryChange(makeRecoverySnapshot());
  }, [makeRecoverySnapshot, onRecoveryChange]);

  const updateOverview = useCallback(() => {
    const queues = Array.from(queuesRef.current.values());
    if (queues.some((queue) => queue.conflict)) {
      setSaveState("conflict");
      setSaveMessage("Há uma alteração diferente salva em outra tela.");
    } else if (queues.some((queue) => queue.errorKind === "offline")) {
      setSaveState("offline");
      setSaveMessage("Sem conexão. Sua alteração continua nesta tela e ainda não foi enviada.");
    } else if (queues.some((queue) => queue.errorKind === "error")) {
      setSaveState("error");
      setSaveMessage("Não foi possível salvar agora. O que você escreveu continua nesta tela.");
    } else if (
      queues.some((queue) => queue.active || queue.pending || queue.next || queue.timer)
    ) {
      setSaveState("saving");
      setSaveMessage("Salvando…");
    } else if (lastSavedAtRef.current > 0) {
      setSaveState("saved");
      setSaveMessage("Salvo na sua conta");
    } else {
      setSaveState("idle");
      setSaveMessage("");
    }
    setConflictState(queues.find((queue) => queue.conflict)?.conflict ?? null);
    setHasUnsavedChangesState(
      queues.some((queue) => queue.active || queue.pending || queue.next || queue.conflict),
    );
    syncRecovery();
  }, [syncRecovery]);

  const sendNextRef = useRef<(key: string) => void>(() => undefined);

  const scheduleQueue = useCallback(
    (key: string, delay: number) => {
      const queue = queuesRef.current.get(key);
      if (!queue || queue.active || queue.conflict || !queue.pending) return;
      if (queue.timer !== undefined) window.clearTimeout(queue.timer);
      queue.timer = window.setTimeout(() => {
        const latest = queuesRef.current.get(key);
        if (latest) delete latest.timer;
        sendNextRef.current(key);
      }, Math.max(0, delay));
      updateOverview();
    },
    [updateOverview],
  );

  const handleSessionLoss = useCallback(() => {
    syncRecovery();
    onSessionLost();
  }, [onSessionLost, syncRecovery]);

  const sendNext = useCallback(
    async (key: string) => {
      const queue = queuesRef.current.get(key);
      if (!queue || queue.active || queue.conflict || !queue.pending) return;
      const mutation = queue.pending;
      delete queue.pending;
      delete queue.errorKind;
      queue.active = { ...mutation, attempted: true };
      updateOverview();
      try {
        const result = await portalRequest<PatientMapDraftPatchResponse>(
          "/map-draft",
          {
            method: "PATCH",
            body: JSON.stringify({
              content_version: PATIENT_MAP_CONTENT_VERSION,
              generation: generationRef.current,
              base_revision: mutation.baseRevision,
              request_id: mutation.requestId,
              field: mutation.field,
            }),
          },
          csrf,
        );
        if (!mountedRef.current) return;
        const latest = queuesRef.current.get(key);
        if (!latest || latest.active?.requestId !== mutation.requestId) return;
        delete latest.active;
        delete latest.errorKind;
        generationRef.current = result.generation;
        revisionsRef.current.set(key, result.field.revision);
        lastSavedAtRef.current = Date.now();
        if (latest.next) {
          latest.pending = {
            ...latest.next,
            baseRevision: result.field.revision,
          };
          delete latest.next;
          scheduleQueue(key, Math.max(0, latest.pending.dueAt - Date.now()));
        }
        updateOverview();
      } catch (error) {
        if (!mountedRef.current) return;
        const latest = queuesRef.current.get(key);
        if (!latest || latest.active?.requestId !== mutation.requestId) return;
        delete latest.active;
        if (error instanceof PortalRequestError && error.status === 401) {
          latest.pending = { ...mutation, attempted: true };
          latest.errorKind = "error";
          updateOverview();
          handleSessionLoss();
          return;
        }
        if (error instanceof PortalRequestError && error.status === 409) {
          const remoteField = responseFieldFromError(error);
          const localValue = latest.next?.field.value ?? mutation.field.value;
          delete latest.next;
          if (remoteField && fieldKey(remoteField) === key) {
            latest.conflict = {
              kind: "field",
              key,
              field: mutation.field,
              localValue,
              remoteValue: remoteField.value,
              remoteRevision: remoteField.revision,
            };
            revisionsRef.current.set(key, remoteField.revision);
          } else {
            const currentGeneration = error.payload.generation;
            if (typeof currentGeneration === "number") {
              generationRef.current = currentGeneration;
            }
            latest.conflict = {
              kind: "generation",
              key,
              field: mutation.field,
              localValue,
              remoteValue: null,
              remoteRevision: 0,
            };
          }
          updateOverview();
          return;
        }
        latest.pending = { ...mutation, attempted: true };
        latest.errorKind = isNetworkError(error) ? "offline" : "error";
        updateOverview();
      }
    },
    [csrf, handleSessionLoss, scheduleQueue, updateOverview],
  );
  useEffect(() => {
    sendNextRef.current = (key) => void sendNext(key);
  }, [sendNext]);

  const restoreRecoveryQueues = useCallback(
    (snapshot: PatientMapDraftRecoverySnapshot) => {
      for (const recovered of snapshot.queues) {
        const queue: PatientMapDraftQueue = {
          pending: recovered.active ?? recovered.pending,
          next: recovered.active ? recovered.pending ?? recovered.next : recovered.next,
          errorKind: recovered.errorKind,
          conflict: recovered.conflict,
        };
        if (queue.pending) queue.pending = { ...queue.pending, attempted: true };
        queuesRef.current.set(recovered.key, queue);
      }
    },
    [],
  );

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    const pendingBeforeLoad = makeRecoverySnapshot();
    setLoadState("loading");
    setLoadMessage("");
    try {
      const result = await portalRequest<PatientMapDraftGetResponse>("/map-draft");
      if (!mountedRef.current || sequence !== loadSequenceRef.current) return;
      generationRef.current = result.generation;
      const serverDraft = draftFromFields(result.fields);
      revisionsRef.current = new Map(
        result.fields.map((field) => [fieldKey(field), field.revision]),
      );
      queuesRef.current.clear();

      const recovered = recoveryRef.current ?? pendingBeforeLoad;
      let nextDraft = serverDraft;
      if (recovered && recovered.patientId === patientId) {
        restoreRecoveryQueues(recovered);
        for (const recoveredQueue of recovered.queues) {
          const localField =
            recoveredQueue.next?.field ??
            recoveredQueue.pending?.field ??
            recoveredQueue.active?.field ??
            recoveredQueue.conflict?.field;
          const localValue =
            recoveredQueue.next?.field.value ??
            recoveredQueue.pending?.field.value ??
            recoveredQueue.active?.field.value ??
            recoveredQueue.conflict?.localValue;
          if (localField && localValue !== undefined) {
            nextDraft = applyFieldToDraft(nextDraft, { ...localField, value: localValue });
          }
        }
      }
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setLoadState("ready");
      setLoadMessage("");
      recoveryRef.current = null;

      for (const [key, queue] of queuesRef.current) {
        if (queue.pending && !queue.conflict) {
          if (!queue.pending.attempted) {
            scheduleQueue(key, Math.max(0, queue.pending.dueAt - Date.now()));
          } else if (navigator.onLine) {
            scheduleQueue(key, 0);
          }
        }
      }
      updateOverview();
    } catch (error) {
      if (!mountedRef.current || sequence !== loadSequenceRef.current) return;
      if (error instanceof PortalRequestError && error.status === 401) {
        handleSessionLoss();
        return;
      }
      setLoadState("error");
      setLoadMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar seu mapa agora.",
      );
    }
  }, [handleSessionLoss, makeRecoverySnapshot, patientId, restoreRecoveryQueues, scheduleQueue, updateOverview]);

  useEffect(() => {
    mountedRef.current = true;
    const queues = queuesRef.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      mountedRef.current = false;
      loadSequenceRef.current += 1;
      for (const queue of queues.values()) {
        if (queue.timer !== undefined) window.clearTimeout(queue.timer);
      }
    };
  }, [load]);

  const retryPending = useCallback(() => {
    for (const [key, currentQueue] of queuesRef.current) {
      const queue = { ...currentQueue };
      if (!queue.pending || queue.active || queue.conflict) continue;
      delete queue.errorKind;
      queuesRef.current.set(key, queue);
      scheduleQueue(key, 0);
    }
    updateOverview();
  }, [scheduleQueue, updateOverview]);

  useEffect(() => {
    const handleOnline = () => retryPending();
    const handleOffline = () => {
      for (const queue of queuesRef.current.values()) {
        if (queue.pending || queue.active || queue.next) queue.errorKind = "offline";
      }
      updateOverview();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [retryPending, updateOverview]);

  const updateDraft = useCallback(
    (nextDraft: PatientMapSessionDraft) => {
      if (loadState !== "ready" || clearing) return;
      const normalized = copyDraft(nextDraft);
      const changed = fieldsChanged(draftRef.current, normalized);
      if (changed.length === 0) return;
      draftRef.current = normalized;
      setDraft(normalized);

      for (const change of changed) {
        const { field, delay } = change;
        const key = fieldKey(field);
        const queue = queuesRef.current.get(key) ?? {};
        if (queue.timer !== undefined) {
          window.clearTimeout(queue.timer);
          delete queue.timer;
        }
        const mutation: PatientMapDraftMutation = {
          field,
          baseRevision: revisionsRef.current.get(key) ?? 0,
          requestId: requestId(),
          attempted: false,
          dueAt: Date.now() + delay,
        };
        if (queue.conflict) {
          queue.conflict = { ...queue.conflict, field, localValue: field.value };
        } else if (queue.active || (queue.pending?.attempted ?? false)) {
          queue.next = mutation;
        } else {
          queue.pending = mutation;
        }
        delete queue.errorKind;
        queuesRef.current.set(key, queue);
        if (!queue.active && !queue.conflict && queue.pending && !queue.pending.attempted) {
          scheduleQueue(key, delay);
        }
      }
      updateOverview();
    },
    [clearing, loadState, scheduleQueue, updateOverview],
  );

  const reloadAfterGenerationConflict = useCallback(
    async (keepLocal: boolean) => {
      const localFields = new Map<string, PatientMapDraftField>();
      if (keepLocal) {
        for (const [key, queue] of queuesRef.current) {
          const conflict = queue.conflict;
          const localField = queue.next?.field ?? queue.pending?.field ?? queue.active?.field ?? conflict?.field;
          const localValue =
            queue.next?.field.value ??
            queue.pending?.field.value ??
            queue.active?.field.value ??
            conflict?.localValue;
          if (localField && localValue !== undefined) {
            localFields.set(key, { ...localField, value: localValue });
          }
        }
      } else {
        queuesRef.current.clear();
        updateOverview();
      }
      setLoadState("loading");
      setLoadMessage("");
      try {
        const result = await portalRequest<PatientMapDraftGetResponse>("/map-draft");
        generationRef.current = result.generation;
        revisionsRef.current = new Map(
          result.fields.map((field) => [fieldKey(field), field.revision]),
        );
        queuesRef.current.clear();
        let nextDraft = draftFromFields(result.fields);
        if (keepLocal) {
          for (const [key, field] of localFields) {
            nextDraft = applyFieldToDraft(nextDraft, field);
            queuesRef.current.set(key, {
              pending: {
                field,
                baseRevision: revisionsRef.current.get(key) ?? 0,
                requestId: requestId(),
                attempted: false,
                dueAt: Date.now(),
              },
            });
          }
        }
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        setLoadState("ready");
        for (const key of localFields.keys()) scheduleQueue(key, 0);
        updateOverview();
      } catch (error) {
        if (error instanceof PortalRequestError && error.status === 401) {
          handleSessionLoss();
          return;
        }
        setLoadState("error");
        setLoadMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível conferir a versão salva do mapa.",
        );
      }
    },
    [handleSessionLoss, scheduleQueue, updateOverview],
  );

  const resolveConflict = useCallback(
    (choice: "local" | "remote") => {
      const conflictEntry = Array.from(queuesRef.current.entries()).find(
        ([, queue]) => queue.conflict,
      );
      if (!conflictEntry) return;
      const [key, queue] = conflictEntry;
      const conflict = queue.conflict!;
      if (conflict.kind === "generation") {
        void reloadAfterGenerationConflict(choice === "local");
        return;
      }
      delete queue.conflict;
      delete queue.errorKind;
      revisionsRef.current.set(key, conflict.remoteRevision);
      if (choice === "remote") {
        draftRef.current = applyFieldToDraft(draftRef.current, {
          ...conflict.field,
          value: conflict.remoteValue,
        });
        setDraft(draftRef.current);
        delete queue.pending;
        delete queue.next;
      } else {
        queue.pending = {
          field: { ...conflict.field, value: conflict.localValue },
          baseRevision: conflict.remoteRevision,
          requestId: requestId(),
          attempted: false,
          dueAt: Date.now(),
        };
        scheduleQueue(key, 0);
      }
      updateOverview();
    },
    [reloadAfterGenerationConflict, scheduleQueue, updateOverview],
  );

  const flushPending = useCallback(async (): Promise<boolean> => {
    for (const [key, currentQueue] of queuesRef.current) {
      const queue = { ...currentQueue };
      if (queue.timer !== undefined) {
        window.clearTimeout(queue.timer);
        delete queue.timer;
      }
      if (queue.pending && !queue.active && !queue.conflict) {
        delete queue.errorKind;
      }
      queuesRef.current.set(key, queue);
      if (queue.pending && !queue.active && !queue.conflict) sendNextRef.current(key);
    }
    updateOverview();

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const queues = Array.from(queuesRef.current.values());
      if (queues.some((queue) => queue.conflict || queue.errorKind)) return false;
      if (!queues.some((queue) => queue.active || queue.pending || queue.next || queue.timer)) {
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }
    setSaveState("error");
    setSaveMessage("O salvamento está demorando. Continue nesta tela e tente novamente.");
    return false;
  }, [updateOverview]);

  const clearDraft = useCallback(async (): Promise<boolean> => {
    if (clearing || loadState !== "ready") return false;
    const hasPending = Array.from(queuesRef.current.values()).some(
      (queue) => queue.active || queue.pending || queue.next || queue.conflict,
    );
    if (hasPending) {
      setSaveState("error");
      setSaveMessage("Espere as alterações terminarem de salvar antes de limpar o mapa.");
      return false;
    }
    setClearing(true);
    const clearRequest = clearRequestRef.current ?? requestId();
    clearRequestRef.current = clearRequest;
    try {
      const result = await portalRequest<PatientMapDraftDeleteResponse>(
        "/map-draft",
        {
          method: "DELETE",
          body: JSON.stringify({
            content_version: PATIENT_MAP_CONTENT_VERSION,
            generation: generationRef.current,
            request_id: clearRequest,
          }),
        },
        csrf,
      );
      generationRef.current = result.generation;
      revisionsRef.current.clear();
      queuesRef.current.clear();
      draftRef.current = {
        contentVersion: PATIENT_MAP_CONTENT_VERSION,
        answers: {},
        synthesis: {},
        positions: {},
      };
      setDraft(draftRef.current);
      clearRequestRef.current = null;
      lastSavedAtRef.current = Date.now();
      onRecoveryChange(null);
      updateOverview();
      return true;
    } catch (error) {
      if (error instanceof PortalRequestError && error.status === 401) {
        handleSessionLoss();
      } else {
        setSaveState(isNetworkError(error) ? "offline" : "error");
        setSaveMessage(
          isNetworkError(error)
            ? "Sem conexão. O mapa não foi apagado."
            : "Não foi possível apagar o mapa agora. Nada foi removido.",
        );
      }
      return false;
    } finally {
      if (mountedRef.current) setClearing(false);
    }
  }, [clearing, csrf, handleSessionLoss, loadState, onRecoveryChange, updateOverview]);

  return {
    draft,
    loadState,
    loadMessage,
    saveState,
    saveMessage,
    conflict: conflictState,
    clearing,
    hasUnsavedChanges: hasUnsavedChangesState,
    updateDraft,
    retryLoad: () => void load(),
    retryPending,
    resolveConflict,
    clearDraft,
    flushPending,
  };
}

export function patientMapResponseLabel(value: PatientMapDraftFieldValue): string {
  if (!value || typeof value !== "object" || !("response" in value)) {
    return "essa resposta";
  }
  const response = (value as PatientMapSessionAnswer).response as PatientMapResponseKey | null;
  return response ? "essa resposta e observação" : "essa observação";
}
