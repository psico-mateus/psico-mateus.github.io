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

type PatientMapView =
  | "overview"
  | "theme"
  | "item"
  | "summary"
  | "sharing"
  | "synthesis";

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
  stable = false,
}: {
  state: PatientMapDraftSaveState;
  message: string;
  conflict: PatientMapDraftConflict | null;
  onRetry: () => void;
  onResolveConflict: (choice: "local" | "remote") => void;
  stable?: boolean;
}) {
  if (!stable && state === "idle" && !message) return null;
  const needsAttention = state === "offline" || state === "error" || state === "conflict";
  const visibleMessage = message || "Salvamento automático";
  return (
    <aside
      className={`patient-map-save-status ${state}${stable ? " is-stable" : ""}`}
      aria-label="Estado de salvamento do Meu mapa"
      role={needsAttention ? undefined : "status"}
      aria-live={needsAttention ? undefined : "polite"}
      aria-atomic={needsAttention ? undefined : "true"}
    >
      <span className="patient-map-save-dot" aria-hidden="true" />
      <div>
        <strong>{visibleMessage}</strong>
        {state === "saving" && !stable ? <small>Você pode continuar enquanto isso.</small> : null}
        {needsAttention ? (
          <span className="sr-status" role="alert" aria-live="assertive">
            {visibleMessage}
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

function sentenceCase(value: string): string {
  const lower = value.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

function scrollPatientMapQuestionIntoView() {
  const card = document.getElementById("patient-map-question-card");
  const title = document.getElementById("patient-map-question-title");
  if (!card) return;

  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";

  const header = document.querySelector<HTMLElement>(".site-header");
  const headerRect = header?.getBoundingClientRect();
  const headerPosition = header ? window.getComputedStyle(header).position : "";
  const headerIsVisibleAndFixed =
    Boolean(headerRect && headerRect.bottom > 0) &&
    (headerPosition === "sticky" || headerPosition === "fixed");
  const visibleTop = headerIsVisibleAndFixed ? headerRect!.bottom + 12 : 16;
  const cardTop = window.scrollY + card.getBoundingClientRect().top - visibleTop;

  window.scrollTo({ top: Math.max(0, cardTop), behavior: "auto" });
  title?.focus({ preventScroll: true });
  root.style.scrollBehavior = previousScrollBehavior;
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
  const [synthesisIndex, setSynthesisIndex] = useState(0);
  const mapTriggerElementIdRef = useRef<string | null>(null);
  const sharesRequestIdRef = useRef(0);
  const sharingActionFocusMapIdRef = useRef<string | null>(null);
  const sharingViewFocusMapIdRef = useRef<string | null>(null);
  const restoreOverviewTriggerRef = useRef(false);
  const focusSynthesisQuestionRef = useRef(false);

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
  const synthesisCount = PATIENT_MAP_CATALOG.summary.prompts.filter((prompt) =>
    Boolean(draft.synthesis?.[prompt.id]?.trim()),
  ).length;

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
      setSharingMessage("Explore ao menos um item deste tema antes de compartilhar.");
      setSharingMessageTone("error");
      return;
    }
    const confirmed = window.confirm(
      shared
        ? `Enviar a versão atual de “${map.navigationTitle}” para Mateus? Somente as respostas e observações deste tema serão enviadas. Mudanças futuras continuarão privadas até um novo envio.`
        : `Parar de compartilhar “${map.navigationTitle}”? Mateus perderá o acesso à versão enviada, mas suas respostas continuarão salvas e privadas para você.`,
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
        ? `A versão atual de “${map.navigationTitle}” foi enviada para Mateus.`
        : `“${map.navigationTitle}” não está mais compartilhado com Mateus.`;
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
        : view === "theme"
          ? "patient-map-theme-title"
          : view === "summary"
            ? "patient-map-summary-title"
            : view === "sharing"
              ? "patient-map-sharing-title"
              : view === "synthesis"
                ? "patient-map-synthesis-title"
                : "patient-map-question-title";
    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
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
      if (view === "item") {
        scrollPatientMapQuestionIntoView();
        return;
      }
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ block: "start", behavior: "auto" });
      target?.focus({ preventScroll: true });
      if (view === "sharing" && sharingViewFocusMapIdRef.current) {
        const mapId = sharingViewFocusMapIdRef.current;
        sharingViewFocusMapIdRef.current = null;
        nestedFrame = window.requestAnimationFrame(() => {
          const row = document.getElementById(`patient-map-sharing-row-${mapId}`);
          row?.scrollIntoView({ block: "center", behavior: "auto" });
          row?.focus({ preventScroll: true });
        });
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (nestedFrame) window.cancelAnimationFrame(nestedFrame);
    };
  }, [activeMapId, itemIndex, sectionIndex, view]);

  useEffect(() => {
    if (view !== "synthesis" || !focusSynthesisQuestionRef.current) return;
    focusSynthesisQuestionRef.current = false;
    window.requestAnimationFrame(() => {
      const target = document.getElementById("patient-map-synthesis-question-title");
      target?.scrollIntoView({ block: "center", behavior: "auto" });
      target?.focus({ preventScroll: true });
    });
  }, [synthesisIndex, view]);

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
    setView("theme");
  }

  function openCurrentItem(map: PatientMapDefinition) {
    const savedPosition = draft.positions?.[map.id];
    const nextSectionIndex = Math.min(
      Math.max(savedPosition?.sectionIndex ?? 0, 0),
      map.sections.length - 1,
    );
    const nextItemIndex = Math.min(
      Math.max(savedPosition?.itemIndex ?? 0, 0),
      map.sections[nextSectionIndex].items.length - 1,
    );
    setSectionIndex(nextSectionIndex);
    setItemIndex(nextItemIndex);
    setAnnouncement("");
    setConfirmingClearItemId(null);
    setView("item");
  }

  function openSection(nextSectionIndex: number) {
    if (!activeMap) return;
    rememberPosition(nextSectionIndex, 0);
    setSectionIndex(nextSectionIndex);
    setItemIndex(0);
    setAnnouncement("");
    setConfirmingClearItemId(null);
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

  function returnToTheme() {
    setAnnouncement("");
    setConfirmingClearItemId(null);
    rememberPosition(sectionIndex, itemIndex);
    setView("theme");
  }

  function openTopLevelView(nextView: "overview" | "sharing" | "synthesis") {
    restoreOverviewTriggerRef.current = false;
    setAnnouncement("");
    setConfirmingClearItemId(null);
    setSharingMessage("");
    setSharingMessageTone("success");
    setActiveMapId(null);
    setView(nextView);
  }

  function openSharingView(mapId?: string) {
    sharingViewFocusMapIdRef.current = mapId ?? null;
    openTopLevelView("sharing");
  }

  function changeSynthesisQuestion(nextIndex: number) {
    const prompts = PATIENT_MAP_CATALOG.summary.prompts;
    const safeIndex = Math.min(Math.max(nextIndex, 0), prompts.length - 1);
    const nextTitle = sentenceCase(
      prompts[safeIndex].title.replace(/^\d{2}\s*•\s*/u, ""),
    );
    focusSynthesisQuestionRef.current = true;
    setSynthesisIndex(safeIndex);
    setAnnouncement(`Pergunta ${safeIndex + 1} de ${prompts.length}: ${nextTitle}`);
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
      scrollPatientMapQuestionIntoView();
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
          <div className="empty-state patient-map-load-error" role="alert" aria-live="assertive">
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

  if (
    view === "overview" ||
    view === "sharing" ||
    view === "synthesis" ||
    !activeMap
  ) {
    const topLevelView = view === "sharing" || view === "synthesis" ? view : "overview";
    const synthesisPrompt = PATIENT_MAP_CATALOG.summary.prompts[synthesisIndex];
    const synthesisTitle = sentenceCase(
      synthesisPrompt.title.replace(/^\d{2}\s*•\s*/u, ""),
    );
    const synthesisValue = draft.synthesis?.[synthesisPrompt.id] ?? "";
    const sharedCount = Object.keys(shares).length;

    return (
      <section className="patient-module patient-map" aria-labelledby="patient-map-title">
        <header className="patient-module-header patient-map-main-header">
          <p className="eyebrow">PARA OBSERVAR COM O TEMPO</p>
          <h1 id="patient-map-title" tabIndex={-1}>Meu mapa</h1>
          <p className="patient-module-lead">
            Um espaço para perceber seus gostos, limites e possibilidades, no
            seu ritmo e sem precisar concluir tudo.
          </p>
          <p className="patient-module-privacy">
            <span aria-hidden="true" />
            Tudo fica só com você, a menos que escolha compartilhar um tema.
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

        <nav className="patient-map-view-switcher" aria-label="Seções do Meu mapa">
          <button
            id="patient-map-view-overview"
            className={topLevelView === "overview" ? "active" : ""}
            type="button"
            aria-current={topLevelView === "overview" ? "page" : undefined}
            onClick={() => openTopLevelView("overview")}
          >
            <strong>Explorar</strong>
            <span>Escolher um tema</span>
          </button>
          <button
            id="patient-map-view-sharing"
            className={topLevelView === "sharing" ? "active" : ""}
            type="button"
            aria-current={topLevelView === "sharing" ? "page" : undefined}
            onClick={() => openTopLevelView("sharing")}
          >
            <strong>Compartilhar</strong>
            <span>
              {sharesLoading
                ? "Consultando…"
                : sharesLoadError
                  ? "Indisponível"
                  : sharedCount === 0
                    ? "Nada enviado"
                    : `${sharedCount} ${sharedCount === 1 ? "tema enviado" : "temas enviados"}`}
            </span>
          </button>
          <button
            id="patient-map-view-synthesis"
            className={topLevelView === "synthesis" ? "active" : ""}
            type="button"
            aria-current={topLevelView === "synthesis" ? "page" : undefined}
            onClick={() => openTopLevelView("synthesis")}
          >
            <strong>O que percebi</strong>
            <span>{synthesisCount > 0 ? `${synthesisCount} ${synthesisCount === 1 ? "anotação" : "anotações"}` : "Opcional"}</span>
          </button>
        </nav>

        {topLevelView === "overview" ? (
          <>
            {totalExplored === 0 ? (
              <section className="patient-map-how-to" aria-labelledby="patient-map-how-to-title">
                <div>
                  <p className="eyebrow">COMO FUNCIONA</p>
                  <h2 id="patient-map-how-to-title">Uma coisa de cada vez</h2>
                </div>
                <ol>
                  <li><span>1</span><strong>Escolha um tema</strong><small>Comece pelo que tiver relação com seu momento.</small></li>
                  <li><span>2</span><strong>Marque o que fizer sentido</strong><small>Você pode pular qualquer item e voltar depois.</small></li>
                  <li><span>3</span><strong>Compartilhe só se quiser</strong><small>Nada é enviado automaticamente.</small></li>
                </ol>
              </section>
            ) : (
              <details className="patient-map-how-to-compact">
                <summary>Relembrar como funciona</summary>
                <ol>
                  <li>Escolha qualquer tema.</li>
                  <li>Marque só o que fizer sentido.</li>
                  <li>Compartilhe somente se quiser.</li>
                </ol>
              </details>
            )}

            <section className="patient-map-theme-picker" aria-labelledby="patient-map-theme-picker-title">
              <div className="patient-map-theme-picker-heading">
                <div>
                  <h2 id="patient-map-theme-picker-title">Por onde você quer começar?</h2>
                  <p>Os temas são independentes. Não existe uma ordem certa.</p>
                </div>
                {totalExplored > 0 ? (
                  <span>{totalExplored} {totalExplored === 1 ? "item marcado" : "itens marcados"}</span>
                ) : null}
              </div>
              <nav className="patient-map-areas" aria-label="Temas do Meu mapa">
                {PATIENT_MAP_CATALOG.maps.map((map) => {
                  const mapExplored = exploredCountForMap(map, draft);
                  const hasSavedPosition = Boolean(draft.positions?.[map.id]);
                  const shortDescription = map.landingCard.split("\n").at(-1) ?? map.description;
                  return (
                    <button
                      id={`patient-map-card-${map.id}`}
                      className="patient-map-area-card"
                      key={map.id}
                      type="button"
                      onClick={() => openMap(map.id)}
                    >
                      <span className="patient-map-area-marker" aria-hidden="true" />
                      <span className="patient-map-area-copy">
                        <strong>{map.navigationTitle}</strong>
                        <small>{shortDescription}</small>
                        <span>
                          {mapExplored > 0
                            ? `${mapExplored} ${mapExplored === 1 ? "item marcado" : "itens marcados"} · Continuar`
                            : hasSavedPosition
                              ? "Retomar de onde parei"
                              : "Ainda não iniciado · Começar"}
                        </span>
                      </span>
                      <span className="patient-map-area-arrow" aria-hidden="true">→</span>
                    </button>
                  );
                })}
              </nav>
            </section>

            {totalExplored > 0 ? (
              <details className="patient-map-settings">
                <summary>
                  <span>
                    <strong>Gerenciar Meu mapa</strong>
                    <small>Opções para apagar todo o conteúdo.</small>
                  </span>
                </summary>
                <div>
                  <p>
                    Apagar o mapa remove todas as respostas, observações e
                    anotações de “O que percebi”. Isso também encerra os
                    compartilhamentos com Mateus.
                  </p>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={clearing || saveState === "saving" || saveState === "offline" || saveState === "conflict"}
                    onClick={async () => {
                      if (!window.confirm("Apagar permanentemente todo o Meu mapa e encerrar todos os compartilhamentos com Mateus?")) return;
                      const cleared = await onClearDraft();
                      if (cleared) {
                        setShares({});
                        setAnnouncement("Todo o conteúdo do Meu mapa foi apagado e os compartilhamentos foram encerrados.");
                        window.requestAnimationFrame(() => {
                          document.getElementById("patient-map-title")?.focus();
                        });
                      }
                    }}
                  >
                    {clearing ? "Apagando…" : "Apagar todo o Meu mapa"}
                  </button>
                </div>
              </details>
            ) : null}

            <div className="patient-map-exit">
              <p>Suas mudanças são salvas automaticamente.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={async () => {
                  if (await onSaveAndExit()) onBackHome();
                }}
              >
                Voltar ao início
              </button>
            </div>
          </>
        ) : topLevelView === "sharing" ? (
          <section className="patient-map-sharing patient-map-sharing-view" aria-labelledby="patient-map-sharing-title">
            <div className="patient-map-sharing-heading">
              <div>
                <p className="eyebrow">VOCÊ DECIDE</p>
                <h2 id="patient-map-sharing-title" tabIndex={-1}>O que Mateus pode ver</h2>
                <p>
                  Somente os temas que você enviar aparecem para Mateus. Todo o
                  restante do mapa continua privado.
                </p>
              </div>
              <span>
                {sharesLoading
                  ? "Consultando…"
                  : sharesLoadError
                    ? "Estado indisponível"
                    : sharedCount === 0
                      ? "Nada compartilhado"
                      : `${sharedCount} ${sharedCount === 1 ? "tema compartilhado" : "temas compartilhados"}`}
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
                Confirmando o que está compartilhado…
              </p>
            ) : sharesLoadError ? (
              <div className="patient-map-sharing-error" role="alert">
                <strong>Não foi possível confirmar o que está compartilhado.</strong>
                <p>
                  {sharesLoadError} Para evitar mudanças por engano, as opções
                  ficam pausadas até essa consulta terminar.
                </p>
                <button className="secondary-button" type="button" onClick={() => void loadMapShares()}>
                  Tentar consultar novamente
                </button>
              </div>
            ) : shareableMaps.length === 0 ? (
              <div className="patient-map-sharing-empty">
                <strong>Ainda não há tema pronto para compartilhar.</strong>
                <p>Depois de marcar ou escrever algo em um tema, ele aparecerá aqui.</p>
                <button className="secondary-button" type="button" onClick={() => openTopLevelView("overview")}>
                  Explorar os temas
                </button>
              </div>
            ) : (
              <ul>
                {shareableMaps.map((map) => {
                  const share = shares[map.id];
                  const viewed = Boolean(share?.viewed_at && share.viewed_at >= share.shared_at);
                  const explored = exploredCountForMap(map, draft);
                  return (
                    <li
                      id={`patient-map-sharing-row-${map.id}`}
                      className={share ? "is-shared" : "is-ready"}
                      key={map.id}
                      tabIndex={-1}
                    >
                      <div>
                        <strong>{map.navigationTitle}</strong>
                        {share ? (
                          <>
                            <span>Versão enviada em {formatViewTimestamp(share.shared_at)}</span>
                            <span>{viewed ? `Marcada como visualizada em ${formatViewTimestamp(share.viewed_at!)}` : "Ainda não marcada como visualizada"}</span>
                            <span>Use o envio novamente somente se você mudou algo desde essa versão.</span>
                          </>
                        ) : (
                          <span>{explored} {explored === 1 ? "item marcado" : "itens marcados"} · só você vê</span>
                        )}
                      </div>
                      <div className="patient-map-sharing-actions">
                        {share ? (
                          <>
                            <button
                              id={`patient-map-share-action-${map.id}`}
                              className="share-button"
                              type="button"
                              disabled={Boolean(sharingMapId) || explored === 0}
                              onClick={() => void changeMapSharing(map, true)}
                            >
                              {sharingMapId === map.id
                                ? `Enviando novamente ${map.navigationTitle}…`
                                : `Enviar novamente ${map.navigationTitle}`}
                            </button>
                            <button
                              className="quiet-button"
                              type="button"
                              disabled={Boolean(sharingMapId)}
                              aria-label={`Parar de compartilhar ${map.navigationTitle}`}
                              onClick={() => void changeMapSharing(map, false)}
                            >
                              Parar de compartilhar
                            </button>
                          </>
                        ) : (
                          <button
                            id={`patient-map-share-action-${map.id}`}
                            className="share-button"
                            type="button"
                            disabled={Boolean(sharingMapId)}
                            onClick={() => void changeMapSharing(map, true)}
                          >
                            {sharingMapId === map.id
                              ? `Compartilhando ${map.navigationTitle}…`
                              : `Compartilhar ${map.navigationTitle} com Mateus`}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="patient-map-sharing-help">
              <summary>Como funciona o compartilhamento?</summary>
              <p>
                Cada envio cria uma versão daquele tema. Mudanças feitas depois
                ficam só no seu mapa até você enviar uma nova versão. Isso não é
                acompanhamento em tempo real.
              </p>
            </details>
            <button className="secondary-button patient-map-top-level-back" type="button" onClick={() => openTopLevelView("overview")}>
              Voltar aos temas
            </button>
          </section>
        ) : (
          <section className="patient-map-synthesis-screen" aria-labelledby="patient-map-synthesis-title">
            <header>
              <div>
                <p className="eyebrow">OPCIONAL E PRIVADO</p>
                <h2 id="patient-map-synthesis-title" tabIndex={-1}>Juntar o que percebi</h2>
                <p>
                  Use estas perguntas somente se elas ajudarem a reunir algo que
                  apareceu em temas diferentes.
                </p>
              </div>
              <span>{synthesisCount > 0 ? `${synthesisCount} ${synthesisCount === 1 ? "anotação guardada" : "anotações guardadas"}` : "Ainda sem anotações"}</span>
            </header>
            <article className="patient-map-synthesis-question">
              <p>
                Pergunta {synthesisIndex + 1} de {PATIENT_MAP_CATALOG.summary.prompts.length} · opcional
              </p>
              <label>
                <span id="patient-map-synthesis-question-title" tabIndex={-1}>
                  {synthesisTitle}
                </span>
                <textarea
                  rows={6}
                  maxLength={1000}
                  value={synthesisValue}
                  placeholder="Escreva somente se fizer sentido."
                  onChange={(event) => updateSynthesis(synthesisPrompt.id, event.target.value)}
                />
                {synthesisValue.length >= 850 ? (
                  <small>{1000 - synthesisValue.length} caracteres disponíveis</small>
                ) : null}
              </label>
            </article>
            <div className="patient-map-synthesis-navigation">
              <button
                className="secondary-button"
                type="button"
                disabled={synthesisIndex === 0}
                onClick={() => changeSynthesisQuestion(synthesisIndex - 1)}
              >
                Anterior
              </button>
              <span>Você pode seguir sem escrever.</span>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  if (synthesisIndex === PATIENT_MAP_CATALOG.summary.prompts.length - 1) {
                    openTopLevelView("overview");
                  } else {
                    changeSynthesisQuestion(synthesisIndex + 1);
                  }
                }}
              >
                {synthesisIndex === PATIENT_MAP_CATALOG.summary.prompts.length - 1 ? "Concluir por agora" : "Próxima pergunta"}
              </button>
            </div>
            <p className="patient-map-session-note">
              Esta síntese fica privada e não entra no compartilhamento dos temas.
            </p>
            <button className="quiet-button patient-map-top-level-back" type="button" onClick={() => openTopLevelView("overview")}>
              Voltar aos temas
            </button>
          </section>
        )}
      </section>
    );
  }

  if (view === "theme") {
    const mapExplored = exploredCountForMap(activeMap, draft);
    const savedPosition = draft.positions?.[activeMap.id];
    const hasStarted = mapExplored > 0 || Boolean(savedPosition);
    const nextSectionIndex = Math.min(
      Math.max(savedPosition?.sectionIndex ?? 0, 0),
      activeMap.sections.length - 1,
    );
    const nextSection = activeMap.sections[nextSectionIndex];
    const activeShare = shares[activeMap.id];

    return (
      <section className="patient-module patient-map-theme" aria-labelledby="patient-map-theme-title">
        <button className="back-button" type="button" onClick={returnToOverview}>
          <span aria-hidden="true">←</span> Voltar aos temas
        </button>
        <header className="patient-module-header patient-map-theme-header">
          <p className="eyebrow">MEU MAPA · {activeMap.navigationTitle.toLocaleUpperCase("pt-BR")}</p>
          <h1 id="patient-map-theme-title" tabIndex={-1}>{activeMap.title}</h1>
          <p className="patient-module-lead">{activeMap.description}</p>
        </header>

        <PatientMapPersistenceStatus
          state={saveState}
          message={saveMessage}
          conflict={conflict}
          onRetry={onRetrySave}
          onResolveConflict={onResolveConflict}
        />

        <section className="patient-map-theme-start" aria-labelledby="patient-map-theme-start-title">
          <div>
            <p className="eyebrow">PRÓXIMO PASSO</p>
            <h2 id="patient-map-theme-start-title">{hasStarted ? "Continue de onde parou" : "Comece por um assunto"}</h2>
            <p>
              {hasStarted
                ? `Sua próxima pergunta está em ${nextSection.title.toLocaleLowerCase("pt-BR")}.`
                : "Você pode escolher qualquer assunto abaixo e responder apenas ao que chamar atenção."}
            </p>
          </div>
          <button id="patient-map-theme-continue" className="primary-button" type="button" onClick={() => openCurrentItem(activeMap)}>
            {hasStarted ? "Continuar de onde parei" : `Começar por ${nextSection.title.toLocaleLowerCase("pt-BR")}`}
          </button>
        </section>

        <aside className={`patient-map-current-sharing ${sharesLoading || sharesLoadError ? "is-unknown" : activeShare ? "is-shared" : "is-private"}`}>
          <div>
            <strong>
              {sharesLoading
                ? "Confirmando o compartilhamento…"
                : sharesLoadError
                  ? "Não foi possível confirmar o compartilhamento"
                  : activeShare
                    ? `Versão enviada em ${formatViewTimestamp(activeShare.shared_at)}`
                    : "Só você vê este tema"}
            </strong>
            <span>
              {sharesLoading
                ? "Aguarde um instante."
                : sharesLoadError
                  ? "Abra a área de compartilhamento para tentar novamente."
                  : activeShare
                    ? "Mudanças feitas agora ficam privadas até você enviar uma nova versão."
                    : "Nada será enviado automaticamente para Mateus."}
            </span>
          </div>
          <button className="quiet-button" type="button" onClick={() => openSharingView(activeMap.id)}>
            Gerenciar o que Mateus vê
          </button>
        </aside>

        <section className="patient-map-subjects" aria-labelledby="patient-map-subjects-title">
          <div className="patient-map-subjects-heading">
            <h2 id="patient-map-subjects-title">
              {hasStarted ? "Ou escolha um assunto" : "Ou escolha outro assunto"}
            </h2>
            <p>Todos são independentes; não é preciso seguir a ordem.</p>
          </div>
          <ul>
            {activeMap.sections.map((section, index) => {
              if (!hasStarted && index === nextSectionIndex) return null;
              const count = section.items.filter((item) => {
                const answer = draft.answers?.[item.id];
                return Boolean(answer?.response || answer?.note.trim());
              }).length;
              return (
                <li key={section.id}>
                  <button type="button" onClick={() => openSection(index)}>
                    <span>
                      <strong>{section.title.toLocaleLowerCase("pt-BR")}</strong>
                      <small>{count > 0 ? `${count} ${count === 1 ? "item marcado" : "itens marcados"}` : "Ainda não iniciado"}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {mapExplored > 0 ? (
          <button className="quiet-button patient-map-theme-summary-link" type="button" onClick={() => setView("summary")}>
            Ver o que marquei neste tema
          </button>
        ) : null}
      </section>
    );
  }

  if (view === "summary") {
    const mapExplored = exploredCountForMap(activeMap, draft);
    const mapResponseCount = responseCountForMap(activeMap, draft);
    const responseCounts = PATIENT_MAP_RESPONSES.map((option) => ({
      ...option,
      count: activeMap.sections.reduce(
        (total, section) =>
          total + section.items.filter(
            (item) => draft.answers?.[item.id]?.response === option.key,
          ).length,
        0,
      ),
    })).filter((option) => option.count > 0);
    const activeShare = shares[activeMap.id];

    return (
      <section className="patient-module patient-map-summary" aria-labelledby="patient-map-summary-title">
        <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
        <button className="back-button" type="button" onClick={() => {
          setAnnouncement("");
          setConfirmingClearItemId(null);
          setView("theme");
        }}>
          <span aria-hidden="true">←</span> Voltar a {activeMap.navigationTitle}
        </button>
        <header className="patient-module-header">
          <p className="eyebrow">MEU MAPA · {activeMap.navigationTitle.toLocaleUpperCase("pt-BR")}</p>
          <h1 id="patient-map-summary-title" tabIndex={-1}>O que marquei em {activeMap.navigationTitle}</h1>
          <p className="patient-module-lead">
            Uma visão simples do que chamou sua atenção neste tema. Não é nota,
            resultado ou interpretação.
          </p>
        </header>

        <PatientMapPersistenceStatus
          state={saveState}
          message={saveMessage}
          conflict={conflict}
          onRetry={onRetrySave}
          onResolveConflict={onResolveConflict}
        />

        <section className="patient-map-summary-panel" aria-labelledby="patient-map-summary-overview-title">
          <div className="patient-map-summary-overview">
            <span aria-hidden="true">✓</span>
            <div>
              <h2 id="patient-map-summary-overview-title">
                {mapExplored === 1 ? "Você explorou 1 item" : `Você explorou ${mapExplored} itens`}
              </h2>
              <p>Você pode continuar, mudar de tema ou parar por agora.</p>
            </div>
          </div>
        </section>

        <section className="patient-map-section-summary" aria-labelledby="patient-map-section-summary-title">
          <h2 id="patient-map-section-summary-title">Por assunto</h2>
          <ul>
            {activeMap.sections.map((section, index) => {
              const count = section.items.filter((item) => {
                const answer = draft.answers?.[item.id];
                return Boolean(answer?.response || answer?.note.trim());
              }).length;
              return (
                <li key={section.id}>
                  <span>{section.title.toLocaleLowerCase("pt-BR")}</span>
                  <strong>{count > 0 ? `${count} ${count === 1 ? "item" : "itens"}` : "Ainda sem itens"}</strong>
                  <button
                    type="button"
                    onClick={() => openSection(index)}
                  >
                    {count > 0
                      ? `Revisar ${section.title.toLocaleLowerCase("pt-BR")}`
                      : `Explorar ${section.title.toLocaleLowerCase("pt-BR")}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {mapResponseCount > 0 ? (
          <details className="patient-map-reading-guide patient-map-response-counts">
            <summary>Ver tipos de resposta que marquei</summary>
            <ul>
              {responseCounts.map((option) => (
                <li key={option.key}><span>{option.label}</span><strong>{option.count}</strong></li>
              ))}
            </ul>
          </details>
        ) : null}

        <details className="patient-map-reading-guide">
          <summary>Como ler estas respostas sem transformar em teste</summary>
          <p>{PATIENT_MAP_CATALOG.summary.readingGuide.replace(/^COMO LER SEM TRANSFORMAR EM TESTE\s*/u, "")}</p>
        </details>

        <aside className={`patient-map-current-sharing ${sharesLoading || sharesLoadError ? "is-unknown" : activeShare ? "is-shared" : "is-private"}`}>
          <div>
            <strong>
              {sharesLoading
                ? "Confirmando o compartilhamento…"
                : sharesLoadError
                  ? "Não foi possível confirmar o compartilhamento"
                  : activeShare
                    ? `Versão enviada em ${formatViewTimestamp(activeShare.shared_at)}`
                    : "Este tema está só com você"}
            </strong>
            <span>
              {sharesLoading
                ? "Aguarde um instante."
                : sharesLoadError
                  ? "Abra a área de compartilhamento para tentar novamente."
                  : activeShare
                    ? "O que você mudar depois fica privado até um novo envio."
                    : "Compartilhar é opcional e nunca acontece automaticamente."}
            </span>
          </div>
          <button className="quiet-button" type="button" onClick={() => openSharingView(activeMap.id)}>
            Gerenciar o que Mateus vê
          </button>
        </aside>

        <div className="patient-map-summary-actions">
          <button className="secondary-button" type="button" onClick={() => setView("theme")}>
            Voltar ao tema
          </button>
          <button className="primary-button" type="button" onClick={() => {
            setAnnouncement("");
            setConfirmingClearItemId(null);
            setView("item");
          }}>
            Continuar respondendo
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
  const activeShare = shares[activeMap.id];
  const isLastItemInSection = itemIndex === activeSection.items.length - 1;
  const nextActionLabel = isLastItem
    ? "Ver o que marquei"
    : isLastItemInSection
      ? `Ir para ${activeMap.sections[sectionIndex + 1].title.toLocaleLowerCase("pt-BR")}`
      : currentAnswer?.response || currentAnswer?.note
        ? "Continuar"
        : "Pular por agora";

  return (
    <section className="patient-module patient-map-workspace" aria-labelledby="patient-map-question-title">
      <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <button className="back-button" type="button" onClick={returnToTheme}>
        <span aria-hidden="true">←</span> Voltar a {activeMap.navigationTitle}
      </button>

      <PatientMapPersistenceStatus
        state={saveState}
        message={saveMessage}
        conflict={conflict}
        onRetry={onRetrySave}
        onResolveConflict={onResolveConflict}
        stable
      />

      <header className="patient-map-item-context">
        <p className="patient-map-breadcrumb">
          Meu mapa <span aria-hidden="true">›</span> {activeMap.navigationTitle} <span aria-hidden="true">›</span> {activeSection.title.toLocaleLowerCase("pt-BR")}
        </p>
        <p>{activeSection.question}</p>
      </header>

      <article id="patient-map-question-card" className="patient-map-question-card">
        <header>
          <div>
            <p className="patient-map-question-position">
              Pergunta {itemIndex + 1} de {activeSection.items.length} neste assunto
            </p>
            <h2 id="patient-map-question-title" tabIndex={-1}>{activeItem.title}</h2>
            <p className="patient-map-question-examples"><strong>Alguns exemplos:</strong> {activeItem.examples}.</p>
          </div>
        </header>

        <fieldset className="patient-map-response-options">
          <legend>Qual opção chega mais perto do que você pensa hoje?</legend>
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
            {(currentAnswer?.note ?? "").length >= 500 ? (
              <small>{600 - (currentAnswer?.note ?? "").length} caracteres disponíveis</small>
            ) : null}
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
                {activeShare ? (
                  <span>
                    A versão já enviada para Mateus não muda. Para alterar o que
                    ele vê, envie uma nova versão ou pare de compartilhar.
                  </span>
                ) : null}
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

      <aside className={`patient-map-item-sharing-state ${sharesLoading || sharesLoadError ? "is-unknown" : activeShare ? "is-shared" : "is-private"}`}>
        <span aria-hidden="true" />
        <div>
          <strong>
            {sharesLoading
              ? "Confirmando quem pode ver…"
              : sharesLoadError
                ? "Não foi possível confirmar quem pode ver"
                : activeShare
                  ? "Uma versão deste tema já foi enviada"
                  : "Só você vê este tema"}
          </strong>
          <span>
            {sharesLoading
              ? "Aguarde um instante."
              : sharesLoadError
                ? "Você pode conferir isso na tela do tema."
                : activeShare
                  ? "O que você mudar agora fica privado até um novo envio."
                  : "Nada será enviado automaticamente para Mateus."}
          </span>
        </div>
      </aside>

      <details className="patient-map-item-options">
        <summary>
          <span>
            <strong>Outras opções neste tema</strong>
            <small>Ver exemplo, trocar de assunto ou abrir o resumo.</small>
          </span>
        </summary>
        <div>
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

          <section className="patient-map-item-subjects" aria-labelledby="patient-map-item-subjects-title">
            <h2 id="patient-map-item-subjects-title">Trocar de assunto</h2>
            <nav className="patient-map-sections" aria-label={`Assuntos de ${activeMap.navigationTitle}`}>
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
                    onClick={() => openSection(index)}
                  >
                    <span>{section.title.toLocaleLowerCase("pt-BR")}</span>
                    {count > 0 ? <small>{count} {count === 1 ? "marcado" : "marcados"}</small> : null}
                  </button>
                );
              })}
            </nav>
          </section>

          {mapExplored > 0 ? (
            <button className="secondary-button patient-map-item-summary-link" type="button" onClick={() => {
              setAnnouncement("");
              setConfirmingClearItemId(null);
              setView("summary");
            }}>
              Ver o que marquei neste tema
            </button>
          ) : null}
        </div>
      </details>

      <div className="patient-map-item-navigation">
        <button className="secondary-button" type="button" disabled={isFirstItem} onClick={moveToPreviousItem}>
          Anterior
        </button>
        <span>Você pode seguir sem responder e voltar quando quiser.</span>
        <button className="primary-button" type="button" onClick={moveToNextItem}>
          {nextActionLabel}
        </button>
      </div>
    </section>
  );
}
