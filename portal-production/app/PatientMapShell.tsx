"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PATIENT_MAP_CATALOG,
  PATIENT_MAP_CONTENT_VERSION,
  PATIENT_MAP_RESPONSES,
  type PatientMapDefinition,
  type PatientMapResponseKey,
} from "../content/patient-map-catalog";
import type {
  PatientMapDraftConflict,
  PatientMapDraftLoadState,
  PatientMapDraftSaveState,
} from "./patient-map-draft-client";
import { formatViewTimestamp, portalRequest } from "./portal-client";

export type PatientMapSessionAnswer = {
  response: PatientMapResponseKey | null;
  note: string;
};

export type PatientMapSessionPosition = {
  sectionIndex: number;
  itemIndex: number;
};

export type PatientMapSessionDraft = {
  contentVersion?: typeof PATIENT_MAP_CONTENT_VERSION;
  answers?: Record<string, PatientMapSessionAnswer>;
  synthesis?: Record<string, string>;
  positions?: Record<string, PatientMapSessionPosition>;
};

export function hasPatientMapSessionDraft(draft: PatientMapSessionDraft): boolean {
  return (
    Object.keys(draft.answers ?? {}).length > 0 ||
    Object.values(draft.synthesis ?? {}).some((value) => Boolean(value.trim()))
  );
}

type PatientMapView = "overview" | "item" | "summary";

type PatientMapShellProps = {
  csrf: string;
  onBackHome: () => void;
  draft: PatientMapSessionDraft;
  onDraftChange: (draft: PatientMapSessionDraft) => void;
  loadState: PatientMapDraftLoadState;
  loadMessage: string;
  saveState: PatientMapDraftSaveState;
  saveMessage: string;
  conflict: PatientMapDraftConflict | null;
  clearing: boolean;
  onRetryLoad: () => void;
  onRetrySave: () => void;
  onResolveConflict: (choice: "local" | "remote") => void;
  onClearDraft: () => Promise<boolean>;
  onSaveAndExit: () => Promise<boolean>;
};

type PatientMapShareStatus = {
  map_id: string;
  shared_at: string;
  viewed_at: string | null;
};

function PatientMapPersistenceStatus({
  state,
  message,
  conflict,
  onRetry,
  onResolveConflict,
}: {
  state: PatientMapDraftSaveState;
  message: string;
  conflict: PatientMapDraftConflict | null;
  onRetry: () => void;
  onResolveConflict: (choice: "local" | "remote") => void;
}) {
  if (state === "idle" && !message) return null;
  const needsAttention = state === "offline" || state === "error" || state === "conflict";
  return (
    <aside
      className={`patient-map-save-status ${state}`}
      aria-label="Estado de salvamento do Meu mapa"
    >
      <span className="patient-map-save-dot" aria-hidden="true" />
      <div>
        <strong>{message}</strong>
        {state === "saving" ? <small>Você pode continuar enquanto isso.</small> : null}
        {state === "saved" ? <small>Privado por padrão; só aparece para Mateus quando você escolhe compartilhar uma parte.</small> : null}
        {needsAttention ? (
          <span className="sr-status" role="alert" aria-live="assertive">
            {message}
          </span>
        ) : null}
      </div>
      {state === "offline" || state === "error" ? (
        <button className="quiet-button" type="button" onClick={onRetry}>
          Tentar salvar novamente
        </button>
      ) : null}
      {state === "conflict" && conflict ? (
        <div className="patient-map-conflict-actions">
          <button className="secondary-button" type="button" onClick={() => onResolveConflict("local")}>
            Manter o que está nesta tela
          </button>
          <button className="quiet-button" type="button" onClick={() => onResolveConflict("remote")}>
            Usar a versão já salva
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function exploredCountForMap(
  map: PatientMapDefinition,
  draft: PatientMapSessionDraft,
): number {
  return map.sections.reduce(
    (total, section) =>
      total + section.items.filter((item) => {
        const answer = draft.answers?.[item.id];
        return Boolean(answer?.response || answer?.note.trim());
      }).length,
    0,
  );
}

function responseCountForMap(
  map: PatientMapDefinition,
  draft: PatientMapSessionDraft,
): number {
  return map.sections.reduce(
    (total, section) =>
      total + section.items.filter((item) => Boolean(draft.answers?.[item.id]?.response)).length,
    0,
  );
}

export function PatientMapShell({
  csrf,
  onBackHome,
  draft,
  onDraftChange,
  loadState,
  loadMessage,
  saveState,
  saveMessage,
  conflict,
  clearing,
  onRetryLoad,
  onRetrySave,
  onResolveConflict,
  onClearDraft,
  onSaveAndExit,
}: PatientMapShellProps) {
  const [view, setView] = useState<PatientMapView>("overview");
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [shares, setShares] = useState<Record<string, PatientMapShareStatus>>({});
  const [sharesLoading, setSharesLoading] = useState(true);
  const [sharesLoadError, setSharesLoadError] = useState("");
  const [sharingMapId, setSharingMapId] = useState<string | null>(null);
  const [sharingMessage, setSharingMessage] = useState("");
  const [sharingMessageTone, setSharingMessageTone] = useState<"success" | "error">("success");
  const [noteOpenByItem, setNoteOpenByItem] = useState<Record<string, boolean>>({});
  const [confirmingClearItemId, setConfirmingClearItemId] = useState<string | null>(null);
  const mapTriggerElementIdRef = useRef<string | null>(null);
  const sharesRequestIdRef = useRef(0);
  const sharingActionFocusMapIdRef = useRef<string | null>(null);
  const restoreOverviewTriggerRef = useRef(false);

  const activeMap = useMemo(
    () => PATIENT_MAP_CATALOG.maps.find((map) => map.id === activeMapId) ?? null,
    [activeMapId],
  );
  const activeSection = activeMap?.sections[sectionIndex] ?? null;
  const activeItem = activeSection?.items[itemIndex] ?? null;
  const currentAnswer = activeItem ? draft.answers?.[activeItem.id] : undefined;
  const totalExplored = PATIENT_MAP_CATALOG.maps.reduce(
    (total, map) => total + exploredCountForMap(map, draft),
    0,
  );
  const shareableMaps = PATIENT_MAP_CATALOG.maps.filter(
    (map) => Boolean(shares[map.id]) || exploredCountForMap(map, draft) > 0,
  );

  const loadMapShares = useCallback(async () => {
    const requestId = sharesRequestIdRef.current + 1;
    sharesRequestIdRef.current = requestId;
    setSharesLoading(true);
    setSharesLoadError("");
    try {
      const result = await portalRequest<{ shares: PatientMapShareStatus[] }>("/map-sharing");
      if (sharesRequestIdRef.current !== requestId) return;
      setShares(
        Object.fromEntries(result.shares.map((share) => [share.map_id, share])),
      );
      setSharingMessage("");
      setSharingMessageTone("success");
    } catch (error: unknown) {
      if (sharesRequestIdRef.current !== requestId) return;
      setSharesLoadError(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar os compartilhamentos agora.",
      );
    } finally {
      if (sharesRequestIdRef.current === requestId) setSharesLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void loadMapShares(), 0);
    return () => {
      window.clearTimeout(initialRequest);
      sharesRequestIdRef.current += 1;
    };
  }, [loadMapShares]);

  useEffect(() => {
    const mapId = sharingActionFocusMapIdRef.current;
    if (!mapId) return;
    sharingActionFocusMapIdRef.current = null;
    const target = document.getElementById(`patient-map-share-action-${mapId}`);
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
      return;
    }
    const fallback = document.getElementById("patient-map-sharing-feedback");
    fallback?.scrollIntoView({ block: "center", behavior: "auto" });
    fallback?.focus({ preventScroll: true });
  }, [shares]);

  async function changeMapSharing(map: PatientMapDefinition, shared: boolean) {
    if (sharingMapId) return;
    if (shared && exploredCountForMap(map, draft) === 0) {
      setSharingMessage("Explore ao menos um item desta parte antes de compartilhar.");
      setSharingMessageTone("error");
      return;
    }
    const confirmed = window.confirm(
      shared
        ? `Compartilhar “${map.navigationTitle}” com Mateus? Serão enviadas somente as respostas e observações desta parte. A síntese geral e as outras partes continuarão privadas.`
        : `Retirar o compartilhamento de “${map.navigationTitle}”? Mateus deixará de acessar essa cópia imediatamente.`,
    );
    if (!confirmed) return;
    setSharingMapId(map.id);
    setSharingMessage("");
    setSharingMessageTone("success");
    try {
      if (shared && !(await onSaveAndExit())) {
        setSharingMessage("Espere o salvamento terminar antes de compartilhar.");
        setSharingMessageTone("error");
        return;
      }
      const result = await portalRequest<{ share?: PatientMapShareStatus }>(
        `/map-sharing/${encodeURIComponent(map.id)}`,
        { method: "PATCH", body: JSON.stringify({ shared }) },
        csrf,
      );
      sharingActionFocusMapIdRef.current = map.id;
      setShares((current) => {
        const next = { ...current };
        if (shared && result.share) next[map.id] = result.share;
        else delete next[map.id];
        return next;
      });
      const message = shared
        ? `“${map.navigationTitle}” foi compartilhado com Mateus.`
        : `O compartilhamento de “${map.navigationTitle}” foi retirado.`;
      setSharingMessage(message);
      setSharingMessageTone("success");
    } catch (error) {
      setSharingMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o compartilhamento.",
      );
      setSharingMessageTone("error");
    } finally {
      setSharingMapId(null);
    }
  }

  useEffect(() => {
    const targetId =
      view === "overview"
        ? "patient-map-title"
        : view === "summary"
          ? "patient-map-summary-title"
          : "patient-map-question-title";
    window.requestAnimationFrame(() => {
      if (view === "overview" && restoreOverviewTriggerRef.current) {
        restoreOverviewTriggerRef.current = false;
        const triggerId = mapTriggerElementIdRef.current;
        const trigger = triggerId ? document.getElementById(triggerId) : null;
        if (trigger?.isConnected) {
          trigger.scrollIntoView({ block: "center", behavior: "auto" });
          trigger.focus({ preventScroll: true });
          return;
        }
      }
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ block: "start", behavior: "auto" });
      target?.focus({ preventScroll: true });
    });
  }, [activeMapId, itemIndex, sectionIndex, view]);

  function openMap(
    mapId: string,
    triggerElementId = `patient-map-card-${mapId}`,
  ) {
    const map = PATIENT_MAP_CATALOG.maps.find((item) => item.id === mapId);
    if (!map) return;
    const savedPosition = draft.positions?.[mapId];
    const nextSectionIndex = Math.min(
      Math.max(savedPosition?.sectionIndex ?? 0, 0),
      map.sections.length - 1,
    );
    const nextItemIndex = Math.min(
      Math.max(savedPosition?.itemIndex ?? 0, 0),
      map.sections[nextSectionIndex].items.length - 1,
    );
    mapTriggerElementIdRef.current = triggerElementId;
    setAnnouncement("");
    setSharingMessage("");
    setSharingMessageTone("success");
    setConfirmingClearItemId(null);
    setActiveMapId(mapId);
    setSectionIndex(nextSectionIndex);
    setItemIndex(nextItemIndex);
    setView("item");
  }

  function rememberPosition(nextSectionIndex: number, nextItemIndex: number) {
    if (!activeMap) return;
    onDraftChange({
      ...draft,
      contentVersion: PATIENT_MAP_CONTENT_VERSION,
      positions: {
        ...draft.positions,
        [activeMap.id]: { sectionIndex: nextSectionIndex, itemIndex: nextItemIndex },
      },
    });
  }

  function returnToOverview() {
    setAnnouncement("");
    setConfirmingClearItemId(null);
    rememberPosition(sectionIndex, itemIndex);
    restoreOverviewTriggerRef.current = true;
    setView("overview");
    setActiveMapId(null);
  }

  function updateResponse(response: PatientMapResponseKey) {
    if (!activeItem) return;
    onDraftChange({
      ...draft,
      contentVersion: PATIENT_MAP_CONTENT_VERSION,
      answers: {
        ...draft.answers,
        [activeItem.id]: {
          response,
          note: currentAnswer?.note ?? "",
        },
      },
    });
  }

  function updateNote(note: string) {
    if (!activeItem) return;
    if (!note && !currentAnswer?.response) {
      const nextAnswers = { ...draft.answers };
      delete nextAnswers[activeItem.id];
      onDraftChange({
        ...draft,
        contentVersion: PATIENT_MAP_CONTENT_VERSION,
        answers: nextAnswers,
      });
      return;
    }
    onDraftChange({
      ...draft,
      contentVersion: PATIENT_MAP_CONTENT_VERSION,
      answers: {
        ...draft.answers,
        [activeItem.id]: {
          response: currentAnswer?.response ?? null,
          note,
        },
      },
    });
  }

  function updateSynthesis(promptId: string, value: string) {
    const nextSynthesis = { ...draft.synthesis };
    if (value) nextSynthesis[promptId] = value;
    else delete nextSynthesis[promptId];
    onDraftChange({
      ...draft,
      contentVersion: PATIENT_MAP_CONTENT_VERSION,
      synthesis: nextSynthesis,
    });
  }

  function clearCurrentAnswer() {
    if (!activeItem) return;
    const nextAnswers = { ...draft.answers };
    delete nextAnswers[activeItem.id];
    onDraftChange({
      ...draft,
      contentVersion: PATIENT_MAP_CONTENT_VERSION,
      answers: nextAnswers,
    });
    setConfirmingClearItemId(null);
    setAnnouncement("A resposta e a observação deste item foram apagadas.");
    window.requestAnimationFrame(() => {
      const title = document.getElementById("patient-map-question-title");
      title?.scrollIntoView({ block: "center", behavior: "auto" });
      title?.focus({ preventScroll: true });
    });
  }

  function moveToPreviousItem() {
    if (!activeMap) return;
    setAnnouncement("");
    setConfirmingClearItemId(null);
    if (itemIndex > 0) {
      const nextItemIndex = itemIndex - 1;
      rememberPosition(sectionIndex, nextItemIndex);
      setItemIndex(nextItemIndex);
      return;
    }
    if (sectionIndex > 0) {
      const previousSectionIndex = sectionIndex - 1;
      const previousItemIndex = activeMap.sections[previousSectionIndex].items.length - 1;
      rememberPosition(previousSectionIndex, previousItemIndex);
      setSectionIndex(previousSectionIndex);
      setItemIndex(previousItemIndex);
    }
  }

  function moveToNextItem() {
    if (!activeMap || !activeSection) return;
    setAnnouncement("");
    setConfirmingClearItemId(null);
    if (itemIndex < activeSection.items.length - 1) {
      const nextItemIndex = itemIndex + 1;
      rememberPosition(sectionIndex, nextItemIndex);
      setItemIndex(nextItemIndex);
      return;
    }
    if (sectionIndex < activeMap.sections.length - 1) {
      const nextSectionIndex = sectionIndex + 1;
      rememberPosition(nextSectionIndex, 0);
      setSectionIndex(nextSectionIndex);
      setItemIndex(0);
      return;
    }
    setView("summary");
  }

  if (loadState !== "ready") {
    return (
      <section className="patient-module patient-map" aria-labelledby="patient-map-title">
        <header className="patient-module-header">
          <p className="eyebrow">PARA OBSERVAR COM O TEMPO</p>
          <h1 id="patient-map-title" tabIndex={-1}>Meu mapa</h1>
          <p className="patient-module-lead">
            Um espaço privado para perceber como algumas coisas funcionam para você.
          </p>
        </header>
        {loadState === "loading" ? (
          <div className="empty-state patient-map-loading" role="status">
            <div className="loader" />
            <p>Carregando seu mapa…</p>
          </div>
        ) : (
          <div className="empty-state patient-map-load-error">
            <h2>Seu mapa não pôde ser carregado agora.</h2>
            <p>{loadMessage} Para proteger o que já está salvo, a edição fica pausada até a conexão voltar.</p>
            <button className="primary-button" type="button" onClick={onRetryLoad}>
              Tentar novamente
            </button>
          </div>
        )}
      </section>
    );
  }

  if (view === "overview" || !activeMap) {
    return (
      <section className="patient-module patient-map" aria-labelledby="patient-map-title">
        <header className="patient-module-header">
          <p className="eyebrow">PARA OBSERVAR COM O TEMPO</p>
          <h1 id="patient-map-title" tabIndex={-1}>Meu mapa</h1>
          <p className="patient-module-lead">
            Um espaço para perceber como algumas coisas funcionam para você. Não
            precisa responder tudo nem chegar a uma conclusão.
          </p>
          <p className="patient-module-privacy">
            <span aria-hidden="true" />
            Nada desta área será compartilhado automaticamente.
          </p>
        </header>
        <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        <PatientMapPersistenceStatus
          state={saveState}
          message={saveMessage}
          conflict={conflict}
          onRetry={onRetrySave}
          onResolveConflict={onResolveConflict}
        />

        <section className="patient-map-introduction" aria-labelledby="patient-map-introduction-title">
          <div>
            <p className="eyebrow">MAPA PESSOAL</p>
            <h2 id="patient-map-introduction-title">Gostos, limites e possibilidades</h2>
            <p>
              Isto não é um teste e não existe resultado certo. Comece por uma
              parte que tenha relação com o seu momento.
            </p>
          </div>
          <span className="patient-preview-label">Privado por padrão</span>
        </section>

        {totalExplored > 0 ? (
          <div className="patient-map-session-summary" role="status">
            <div>
              <strong>{totalExplored} {totalExplored === 1 ? "item explorado" : "itens explorados"}</strong>
              <span>As alterações são salvas automaticamente na sua conta.</span>
            </div>
            <button
              className="quiet-button"
              type="button"
              disabled={clearing || saveState === "saving" || saveState === "offline" || saveState === "conflict"}
              onClick={async () => {
                if (!window.confirm("Apagar permanentemente todas as respostas e observações do Meu mapa?")) return;
                const cleared = await onClearDraft();
                if (cleared) {
                  setShares({});
                  setAnnouncement("Todas as respostas e observações do Meu mapa foram apagadas.");
                  window.requestAnimationFrame(() => {
                    document.getElementById("patient-map-title")?.focus();
                  });
                }
              }}
            >
              {clearing ? "Limpando…" : "Limpar Meu mapa"}
            </button>
          </div>
        ) : (
          <p className="patient-map-start-note">
            Escolha uma área e explore somente os itens que chamarem atenção.
          </p>
        )}

        <nav className="patient-map-areas" aria-label="Áreas do Meu mapa">
          {PATIENT_MAP_CATALOG.maps.map((map) => {
            const mapExplored = exploredCountForMap(map, draft);
            const savedPosition = draft.positions?.[map.id];
            return (
              <button
                id={`patient-map-card-${map.id}`}
                className="patient-map-area-card"
                key={map.id}
                type="button"
                onClick={() => openMap(map.id)}
              >
                <span className="patient-map-area-number" aria-hidden="true">{map.number}</span>
                <span className="patient-map-area-copy">
                  <strong>{map.navigationTitle}</strong>
                  <small>{map.description}</small>
                  <span>
                    {mapExplored > 0
                      ? `${mapExplored} ${mapExplored === 1 ? "item explorado" : "itens explorados"}`
                      : savedPosition
                        ? "Continuar de onde parei"
                        : "Abrir esta parte"}
                  </span>
                </span>
                <span className="patient-map-area-arrow" aria-hidden="true">→</span>
              </button>
            );
          })}
        </nav>

        <section className="patient-map-sharing" aria-labelledby="patient-map-sharing-title">
          <div className="patient-map-sharing-heading">
            <div>
              <p className="eyebrow">VOCÊ DECIDE</p>
              <h2 id="patient-map-sharing-title">Compartilhar uma parte com Mateus</h2>
              <p>
                Escolha apenas o que deseja levar para a psicoterapia. As outras
                partes e a síntese geral continuam privadas.
              </p>
            </div>
            <span>
              {sharesLoading
                ? "Consultando…"
                : sharesLoadError
                  ? "Estado indisponível"
                  : `${Object.keys(shares).length} de ${PATIENT_MAP_CATALOG.maps.length} compartilhadas`}
            </span>
          </div>
          {sharingMessage ? (
            <p
              id="patient-map-sharing-feedback"
              className={`patient-map-sharing-feedback ${sharingMessageTone}`}
              role={sharingMessageTone === "error" ? "alert" : "status"}
              aria-live="polite"
              tabIndex={-1}
            >
              {sharingMessage}
              {sharingMessageTone === "error" ? " Nenhum compartilhamento foi alterado." : ""}
            </p>
          ) : null}
          {sharesLoading ? (
            <p className="patient-map-sharing-loading" role="status">
              Consultando compartilhamentos…
            </p>
          ) : sharesLoadError ? (
            <div className="patient-map-sharing-error" role="alert">
              <strong>Não foi possível confirmar o que está compartilhado.</strong>
              <p>
                {sharesLoadError} Para evitar mudanças por engano, as opções ficam
                pausadas até essa consulta terminar.
              </p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void loadMapShares()}
              >
                Tentar consultar novamente
              </button>
            </div>
          ) : shareableMaps.length === 0 ? (
            <p className="patient-map-sharing-empty">
              Quando você responder ou escrever uma observação em uma parte, ela
              aparecerá aqui com a opção de compartilhar.
            </p>
          ) : (
            <ul>
              {shareableMaps.map((map) => {
                const share = shares[map.id];
                const viewed = Boolean(
                  share?.viewed_at && share.viewed_at >= share.shared_at,
                );
                const explored = exploredCountForMap(map, draft);
                return (
                  <li
                    className={share ? "is-shared" : explored > 0 ? "is-ready" : undefined}
                    key={map.id}
                  >
                    <div>
                      <strong>{map.navigationTitle}</strong>
                      <span>
                        {share
                          ? viewed
                            ? `Visualizado por Mateus em ${formatViewTimestamp(share.viewed_at!)}`
                            : "Compartilhado · ainda não visualizado"
                          : explored > 0
                            ? `${explored} ${explored === 1 ? "item explorado" : "itens explorados"} · privado`
                            : "Ainda sem itens explorados"}
                      </span>
                    </div>
                    <div className="patient-map-sharing-actions">
                      {share ? (
                        <>
                          <button
                            id={`patient-map-share-action-${map.id}`}
                            className="share-button"
                            type="button"
                            disabled={Boolean(sharingMapId) || explored === 0}
                            aria-label={
                              sharingMapId === map.id
                                ? `Atualizando… cópia de ${map.navigationTitle} compartilhada com Mateus`
                                : `Atualizar cópia de ${map.navigationTitle} compartilhada com Mateus`
                            }
                            onClick={() => void changeMapSharing(map, true)}
                          >
                            {sharingMapId === map.id
                              ? "Atualizando…"
                              : "Atualizar cópia"}
                          </button>
                          <button
                            className="quiet-button"
                            type="button"
                            disabled={Boolean(sharingMapId)}
                            aria-label={`Retirar o compartilhamento de ${map.navigationTitle}`}
                            onClick={() => void changeMapSharing(map, false)}
                          >
                            Retirar
                          </button>
                        </>
                      ) : (
                        explored > 0 ? (
                          <button
                            id={`patient-map-share-action-${map.id}`}
                            className="share-button"
                            type="button"
                            disabled={Boolean(sharingMapId)}
                            aria-label={
                              sharingMapId === map.id
                                ? `Compartilhando… esta parte: ${map.navigationTitle}, com Mateus`
                                : `Compartilhar esta parte: ${map.navigationTitle}, com Mateus`
                            }
                            onClick={() => void changeMapSharing(map, true)}
                          >
                            {sharingMapId === map.id
                              ? "Compartilhando…"
                              : "Compartilhar esta parte"}
                          </button>
                        ) : null
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="patient-map-sharing-note">
            Compartilhar cria uma cópia da parte escolhida. Alterações feitas
            depois só aparecem para Mateus quando você compartilhar novamente.
            Isso não é acompanhamento em tempo real.
          </p>
        </section>

        <details className="patient-map-synthesis">
          <summary>
            <span>
              <strong>Minha síntese do mapa pessoal</strong>
              <small>Seis perguntas opcionais para reunir o que chamou atenção nas diferentes áreas.</small>
            </span>
          </summary>
          <div className="patient-map-synthesis-content">
            <p>{PATIENT_MAP_CATALOG.summary.selectionGuidance}</p>
            {PATIENT_MAP_CATALOG.summary.prompts.map((prompt) => {
              const title = prompt.title.replace(/^\d{2}\s*•\s*/u, "");
              return (
                <label key={prompt.id}>
                  <span>{title.toLocaleLowerCase("pt-BR")}</span>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={draft.synthesis?.[prompt.id] ?? ""}
                    placeholder="Escreva somente se fizer sentido."
                    onChange={(event) => updateSynthesis(prompt.id, event.target.value)}
                  />
                </label>
              );
            })}
            <p>Esta síntese é geral, fica privada na sua conta e não entra no compartilhamento das partes.</p>
          </div>
        </details>

        <aside className="patient-map-local-note" aria-labelledby="patient-map-local-note-title">
          <div>
            <h2 id="patient-map-local-note-title">Privado por padrão</h2>
            <p>
              Suas respostas e observações ficam salvas na sua conta para você continuar
              depois. Somente as partes que você escolher compartilhar aparecem para Mateus.
            </p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={async () => {
              if (await onSaveAndExit()) onBackHome();
            }}
          >
            Salvar e voltar ao início
          </button>
        </aside>
      </section>
    );
  }

  if (view === "summary") {
    const mapExplored = exploredCountForMap(activeMap, draft);
    const mapResponseCount = responseCountForMap(activeMap, draft);
    const mapItemCount = activeMap.sections.reduce(
      (total, section) => total + section.items.length,
      0,
    );
    const responseCounts = PATIENT_MAP_RESPONSES.map((option) => ({
      ...option,
      count: activeMap.sections.reduce(
        (total, section) =>
          total + section.items.filter(
            (item) => draft.answers?.[item.id]?.response === option.key,
          ).length,
        0,
      ),
    }));

    return (
      <section className="patient-module patient-map-summary" aria-labelledby="patient-map-summary-title">
        <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
        <button className="back-button" type="button" onClick={() => {
          setAnnouncement("");
          setConfirmingClearItemId(null);
          setView("item");
        }}>
          <span aria-hidden="true">←</span> Voltar ao último item
        </button>
        <header className="patient-module-header">
          <p className="eyebrow">{activeMap.eyebrow}</p>
          <h1 id="patient-map-summary-title" tabIndex={-1}>Resumo de {activeMap.navigationTitle}</h1>
          <p className="patient-module-lead">
            Esta é apenas uma organização do que você explorou neste mapa. Não é
            nota, resultado ou interpretação.
          </p>
        </header>

        <PatientMapPersistenceStatus
          state={saveState}
          message={saveMessage}
          conflict={conflict}
          onRetry={onRetrySave}
          onResolveConflict={onResolveConflict}
        />

        <section className="patient-map-summary-panel" aria-labelledby="patient-map-response-counts-title">
          <div className="patient-map-summary-heading">
            <h2 id="patient-map-response-counts-title">Respostas marcadas</h2>
            <span>{mapResponseCount} de {mapItemCount} com resposta</span>
          </div>
          {mapResponseCount === 0 ? (
            <p>Nenhuma resposta foi marcada neste mapa.</p>
          ) : (
            <ul className="patient-map-response-bars">
              {responseCounts.map((option) => (
                <li key={option.key}>
                  <div><span>{option.label}</span><strong>{option.count}</strong></div>
                  <span className="patient-map-response-track" aria-hidden="true">
                    <span style={{ width: `${(option.count / mapResponseCount) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="patient-map-section-summary" aria-labelledby="patient-map-section-summary-title">
          <h2 id="patient-map-section-summary-title">Por parte deste mapa</h2>
          <ul>
            {activeMap.sections.map((section, index) => {
              const count = section.items.filter((item) => {
                const answer = draft.answers?.[item.id];
                return Boolean(answer?.response || answer?.note.trim());
              }).length;
              return (
                <li key={section.id}>
                  <span>{section.title.toLocaleLowerCase("pt-BR")}</span>
                  <strong>{count} de {section.items.length}</strong>
                  <button
                    type="button"
                    aria-label={`Abrir ${section.title.toLocaleLowerCase("pt-BR")}`}
                    onClick={() => {
                      rememberPosition(index, 0);
                      setAnnouncement("");
                      setConfirmingClearItemId(null);
                      setSectionIndex(index);
                      setItemIndex(0);
                      setView("item");
                    }}
                  >
                    Abrir
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <details className="patient-map-reading-guide">
          <summary>Como ler estas respostas sem transformar em teste</summary>
          <p>{PATIENT_MAP_CATALOG.summary.readingGuide.replace(/^COMO LER SEM TRANSFORMAR EM TESTE\s*/u, "")}</p>
        </details>

        <p className="patient-map-session-note">
          Para reunir o que apareceu em áreas diferentes, use a síntese geral na tela Meu mapa.
        </p>

        <div className="patient-map-summary-actions">
          <button className="secondary-button" type="button" onClick={returnToOverview}>
            Escolher outro mapa
          </button>
          <button className="primary-button" type="button" onClick={() => {
            setAnnouncement("");
            setConfirmingClearItemId(null);
            setView("item");
          }}>
            Continuar neste mapa ({mapExplored} {mapExplored === 1 ? "item explorado" : "itens explorados"})
          </button>
        </div>
      </section>
    );
  }

  if (!activeSection || !activeItem) return null;

  const isFirstItem = sectionIndex === 0 && itemIndex === 0;
  const isLastItem =
    sectionIndex === activeMap.sections.length - 1 &&
    itemIndex === activeSection.items.length - 1;
  const mapExplored = exploredCountForMap(activeMap, draft);
  const noteOpen = noteOpenByItem[activeItem.id] ?? Boolean(currentAnswer?.note);
  const clearCurrentLabel = currentAnswer?.response && currentAnswer.note
    ? "Apagar resposta e observação deste item"
    : currentAnswer?.note
      ? "Apagar observação deste item"
      : "Apagar resposta deste item";

  return (
    <section className="patient-module patient-map-workspace" aria-labelledby="patient-map-question-title">
      <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <button className="back-button" type="button" onClick={returnToOverview}>
        <span aria-hidden="true">←</span> Voltar ao Meu mapa
      </button>

      <PatientMapPersistenceStatus
        state={saveState}
        message={saveMessage}
        conflict={conflict}
        onRetry={onRetrySave}
        onResolveConflict={onResolveConflict}
      />

      <header className="patient-map-workspace-header">
        <div>
          <p className="eyebrow">{activeMap.eyebrow}</p>
          <h1>{activeMap.title}</h1>
          <p>{activeMap.description}</p>
        </div>
        {mapExplored > 0 ? <span>{mapExplored} {mapExplored === 1 ? "item explorado" : "itens explorados"}</span> : null}
      </header>

      <div className="patient-map-mode-guidance">
        <p>{activeMap.modeGuidance.replace(/MODO RÁPIDO\s*•\s*/u, "").replace(/\s*MODO COMPLETO\s*•\s*/u, " ")}</p>
        <button className="quiet-button" type="button" onClick={() => {
          setAnnouncement("");
          setConfirmingClearItemId(null);
          setView("summary");
        }}>
          Ver resumo deste mapa
        </button>
      </div>

      <details className="patient-map-demonstration">
        <summary>Ver um exemplo preenchido</summary>
        <div>
          <strong>{activeMap.demonstration.title}</strong>
          <p>{activeMap.demonstration.examples}</p>
          <span>
            {PATIENT_MAP_RESPONSES.find(
              (option) => option.key === activeMap.demonstration.responseKey,
            )?.label}
          </span>
          <small>{activeMap.demonstration.note}</small>
        </div>
      </details>

      <nav className="patient-map-sections" aria-label={`Partes de ${activeMap.navigationTitle}`}>
        {activeMap.sections.map((section, index) => {
          const count = section.items.filter((item) => {
            const answer = draft.answers?.[item.id];
            return Boolean(answer?.response || answer?.note.trim());
          }).length;
          return (
            <button
              key={section.id}
              type="button"
              className={sectionIndex === index ? "active" : ""}
              aria-current={sectionIndex === index ? "step" : undefined}
              onClick={() => {
                rememberPosition(index, 0);
                setAnnouncement("");
                setConfirmingClearItemId(null);
                setSectionIndex(index);
                setItemIndex(0);
              }}
            >
              <span>{section.title.toLocaleLowerCase("pt-BR")}</span>
              {count > 0 ? <small>{count}/{section.items.length}</small> : null}
            </button>
          );
        })}
      </nav>

      <p className="patient-map-section-question">{activeSection.question}</p>

      <article className="patient-map-question-card">
        <header>
          <div>
            <p className="patient-map-question-position">
              {activeSection.title.toLocaleLowerCase("pt-BR")} · item {itemIndex + 1} de {activeSection.items.length}
            </p>
            <h2 id="patient-map-question-title" tabIndex={-1}>{activeItem.title}</h2>
            <p className="patient-map-question-examples"><strong>Alguns exemplos:</strong> {activeItem.examples}.</p>
          </div>
          <span aria-hidden="true">{activeItem.localId}</span>
        </header>

        <fieldset className="patient-map-response-options">
          <legend>Qual resposta se aproxima mais de você agora?</legend>
          <div>
            {PATIENT_MAP_RESPONSES.map((option) => (
              <label key={option.key} className={currentAnswer?.response === option.key ? "selected" : ""}>
                <input
                  type="radio"
                  name={`patient-map-response-${activeItem.id}`}
                  value={option.key}
                  checked={currentAnswer?.response === option.key}
                  onChange={() => updateResponse(option.key)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <details
          className="patient-map-note"
          key={activeItem.id}
          open={noteOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setNoteOpenByItem((current) => ({ ...current, [activeItem.id]: open }));
          }}
        >
          <summary>Adicionar uma observação <span>(opcional)</span></summary>
          <label>
            <span>O que muda essa experiência para você?</span>
            <textarea
              value={currentAnswer?.note ?? ""}
              maxLength={600}
              rows={4}
              placeholder="Ex.: depende do lugar, da companhia ou de como foi meu dia."
              onChange={(event) => updateNote(event.target.value)}
            />
            <small>{(currentAnswer?.note ?? "").length} de 600 caracteres</small>
          </label>
        </details>

        {currentAnswer?.response || currentAnswer?.note ? (
          confirmingClearItemId === activeItem.id ? (
            <div className="patient-map-clear-confirmation" role="group" aria-label="Confirmar exclusão deste item">
              <p>
                <strong>{clearCurrentLabel}?</strong>
                <span>
                  A exclusão será salva automaticamente e, depois disso, não
                  poderá ser desfeita.
                </span>
              </p>
              <div>
                <button
                  id="patient-map-confirm-clear-answer"
                  className="danger-button"
                  type="button"
                  onClick={clearCurrentAnswer}
                >
                  Apagar agora
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setConfirmingClearItemId(null);
                    setAnnouncement("Exclusão cancelada. Sua resposta continua salva.");
                    window.requestAnimationFrame(() => {
                      window.requestAnimationFrame(() => {
                        document.getElementById("patient-map-clear-answer")?.focus({ preventScroll: true });
                      });
                    });
                  }}
                >
                  Manter resposta
                </button>
              </div>
            </div>
          ) : (
            <button
              id="patient-map-clear-answer"
              className="danger-link patient-map-clear-answer"
              type="button"
              onClick={() => {
                setConfirmingClearItemId(activeItem.id);
                setAnnouncement(`Confirme se deseja ${clearCurrentLabel.toLocaleLowerCase("pt-BR")}.`);
                window.requestAnimationFrame(() => {
                  window.requestAnimationFrame(() => {
                    document.getElementById("patient-map-confirm-clear-answer")?.focus({ preventScroll: true });
                  });
                });
              }}
            >
              {clearCurrentLabel}
            </button>
          )
        ) : null}
      </article>

      <div className="patient-map-item-navigation">
        <button className="secondary-button" type="button" disabled={isFirstItem} onClick={moveToPreviousItem}>
          Anterior
        </button>
        <span>Você pode seguir sem responder e voltar quando quiser.</span>
        <button className="primary-button" type="button" onClick={moveToNextItem}>
          {isLastItem ? "Ver resumo deste mapa" : "Próximo"}
        </button>
      </div>

      <p className="patient-map-session-note">
        Respostas e observações são salvas de forma privada na sua conta e não aparecem para Mateus.
      </p>
    </section>
  );
}
