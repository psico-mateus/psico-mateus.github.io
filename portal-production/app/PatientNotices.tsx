"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate, portalRequest, PortalRequestError } from "./portal-client";
import "./notices.css";

export type PatientNotice = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type NoticesResult = {
  notices: PatientNotice[];
  unread_count: number;
  next_cursor: string | null;
};

export type PatientNoticesProps = {
  patientId: string;
  csrf: string;
  onSessionLost: () => void;
};

/** A new identity/session gets a fresh subtree; notice text is never persisted. */
export function PatientNotices(props: PatientNoticesProps) {
  return <PatientNoticesContent key={`${props.patientId}:${props.csrf}`} {...props} />;
}

function PatientNoticesContent({ csrf, onSessionLost }: PatientNoticesProps) {
  const [notices, setNotices] = useState<PatientNotice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readingIds, setReadingIds] = useState<Set<string>>(new Set());
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState("");
  const active = useRef(false);
  const sessionLost = useRef(onSessionLost);
  const listRequest = useRef<AbortController | null>(null);
  const readRequests = useRef(new Map<string, AbortController>());
  const panelSummary = useRef<HTMLElement | null>(null);
  const noticeSummaries = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    sessionLost.current = onSessionLost;
  }, [onSessionLost]);

  const handleSessionError = useCallback((failure: unknown) => {
    if (failure instanceof PortalRequestError && failure.status === 401) {
      setNotices([]);
      setUnreadCount(0);
      setNextCursor(null);
      sessionLost.current();
      return true;
    }
    return false;
  }, []);

  const loadNotices = useCallback(async (cursor?: string) => {
    if (readRequests.current.size > 0) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await portalRequest<NoticesResult>(
        `/notices?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { signal: controller.signal },
      );
      if (!active.current || controller.signal.aborted) return;
      setNotices((current) => cursor
        ? [...current, ...result.notices.filter((item) => !current.some((existing) => existing.id === item.id))]
        : result.notices);
      setUnreadCount(result.unread_count);
      setNextCursor(result.next_cursor ?? null);
      setLoaded(true);
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      if (!handleSessionError(failure)) {
        if (failure instanceof PortalRequestError && failure.status === 403) {
          setNotices([]);
          setUnreadCount(0);
          setNextCursor(null);
          setLoaded(false);
        }
        setError(failure instanceof Error ? failure.message : "Não foi possível carregar os avisos.");
      }
    } finally {
      if (active.current && listRequest.current === controller) {
        listRequest.current = null;
        setLoading(false);
      }
    }
  }, [handleSessionError]);

  useEffect(() => {
    active.current = true;
    void loadNotices();
    const requests = readRequests.current;
    return () => {
      active.current = false;
      listRequest.current?.abort();
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    };
  }, [loadNotices]);

  async function markRead(notice: PatientNotice) {
    if (notice.read_at || listRequest.current || readRequests.current.has(notice.id)) return;
    const controller = new AbortController();
    readRequests.current.set(notice.id, controller);
    setReadingIds(new Set(readRequests.current.keys()));
    setReadErrors((current) => ({ ...current, [notice.id]: "" }));
    setConfirmation("");
    try {
      const result = await portalRequest<{ notice: PatientNotice }>(
        `/notices/${encodeURIComponent(notice.id)}/read`,
        { method: "POST", body: "{}", signal: controller.signal },
        csrf,
      );
      if (!active.current || controller.signal.aborted) return;
      setNotices((current) => current.map((item) => item.id === notice.id ? result.notice : item));
      setUnreadCount((current) => Math.max(0, current - 1));
      setConfirmation("Aviso marcado como lido.");
      noticeSummaries.current.get(notice.id)?.focus();
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      if (!handleSessionError(failure)) {
        if (failure instanceof PortalRequestError && (failure.status === 403 || failure.status === 404)) {
          // Removed notices or revoked access must not leave stale text visible.
          setNotices((current) => failure.status === 403 ? [] : current.filter((item) => item.id !== notice.id));
          setUnreadCount((current) => failure.status === 403 ? 0 : Math.max(0, current - 1));
          if (failure.status === 403) setNextCursor(null);
          setError("Este aviso não está mais disponível. Atualize a lista para consultar seus avisos.");
          panelSummary.current?.focus();
          return;
        }
        setReadErrors((current) => ({
          ...current,
          [notice.id]: failure instanceof Error ? failure.message : "Não foi possível confirmar a leitura. Tente novamente.",
        }));
      }
    } finally {
      readRequests.current.delete(notice.id);
      if (active.current && !controller.signal.aborted) {
        setReadingIds(new Set(readRequests.current.keys()));
      }
    }
  }

  return (
    <details className="patient-notices notice-panel">
      <summary ref={panelSummary} className="notices-main-summary">
        <span className="notices-summary-copy">
          <span className="notices-title">Avisos de Mateus</span>
          <span className="notices-subtitle">Comunicados individuais para você</span>
        </span>
        {loaded && unreadCount > 0 ? (
          <span className="notices-count">{unreadCount} {unreadCount === 1 ? "não lido" : "não lidos"}</span>
        ) : <span className="notices-summary-action">Ver avisos</span>}
      </summary>
      <div className="notices-panel-content">
        <div className="notices-toolbar">
          <p>Este espaço é só para leitura de avisos, sem respostas pelo portal.</p>
          <button className="secondary-button compact-button" type="button" onClick={() => void loadNotices()} disabled={loading || readingIds.size > 0}>
            {loading ? "Carregando…" : "Atualizar avisos"}
          </button>
        </div>
        {error ? (
          <div className="notices-error">
            <p role="alert">{error}</p>
            <button className="secondary-button" type="button" disabled={loading || readingIds.size > 0} onClick={() => void loadNotices()}>Tentar novamente</button>
          </div>
        ) : null}
        {loading && !loaded ? <p className="notices-empty" role="status">Carregando seus avisos…</p> : null}
        {loaded && notices.length === 0 ? <p className="notices-empty">Nenhum aviso por aqui no momento.</p> : null}
        <div className="notices-list">
          {notices.map((notice) => (
            <details className={`notice-item${notice.read_at ? "" : " is-unread"}`} key={notice.id}>
              <summary
                className="notice-item-summary"
                ref={(element) => {
                  if (element) noticeSummaries.current.set(notice.id, element);
                  else noticeSummaries.current.delete(notice.id);
                }}
              >
                <span className="notices-summary-copy">
                  <span className="notice-item-heading">{notice.title}</span>
                  <span className="notice-item-meta">{formatDate(notice.created_at)} · {notice.read_at ? "Lido" : "Não lido"}</span>
                </span>
                <span className="notices-summary-action"><span className="notice-closed-label">Ler aviso</span><span className="notice-open-label">Fechar</span></span>
              </summary>
              <div className="notice-item-content">
                <p className="notice-body">{notice.body}</p>
                {notice.read_at ? <p className="notice-item-meta">Leitura confirmada em {formatDate(notice.read_at)}.</p> : (
                  <div className="notice-read-action">
                    <span>Marque depois de ler.</span>
                    <button className="secondary-button" type="button" disabled={loading || readingIds.has(notice.id)} onClick={() => void markRead(notice)}>
                      {readingIds.has(notice.id) ? "Confirmando…" : "Marcar como lido"}
                    </button>
                  </div>
                )}
                {readErrors[notice.id] ? <p className="notice notice-error" role="alert">{readErrors[notice.id]}</p> : null}
              </div>
            </details>
          ))}
        </div>
        {nextCursor ? <button className="secondary-button notices-more" type="button" disabled={loading || readingIds.size > 0} onClick={() => void loadNotices(nextCursor)}>{loading ? "Carregando…" : "Ver avisos anteriores"}</button> : null}
        <p className="sr-status" role="status" aria-live="polite">{confirmation}</p>
      </div>
    </details>
  );
}
