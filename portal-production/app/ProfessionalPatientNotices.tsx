"use client";

import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { type NoticesResult, type PatientNotice } from "./PatientNotices";
import { formatDate, portalRequest, PortalRequestError } from "./portal-client";
import { createClientRequestId } from "./client-request-id";
import "./notices.css";

export type ProfessionalPatientNoticesProps = {
  patientId: string;
  patientName: string;
  csrf: string;
  onSessionLost: () => void;
  onDraftStateChange?: (dirty: boolean) => void;
};

/** Keying also clears drafts and in-flight UI when the patient/session changes. */
export function ProfessionalPatientNotices(props: ProfessionalPatientNoticesProps) {
  return <ProfessionalPatientNoticesContent key={`${props.patientId}:${props.csrf}`} {...props} />;
}

function ProfessionalPatientNoticesContent({ patientId, patientName, csrf, onSessionLost, onDraftStateChange }: ProfessionalPatientNoticesProps) {
  const headingId = useId();
  const helpId = useId();
  const [notices, setNotices] = useState<PatientNotice[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [removalId, setRemovalId] = useState<string | null>(null);
  const active = useRef(false);
  const sessionLost = useRef(onSessionLost);
  const listRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const submission = useRef<{ title: string; body: string; id: string } | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const endpoint = `/professional/patients/${encodeURIComponent(patientId)}/notices`;
  const hasDraft = Boolean(title || body);

  useEffect(() => {
    onDraftStateChange?.(hasDraft);
  }, [hasDraft, onDraftStateChange]);

  useEffect(() => () => onDraftStateChange?.(false), [onDraftStateChange]);

  useEffect(() => {
    if (!hasDraft) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasDraft]);

  useEffect(() => {
    sessionLost.current = onSessionLost;
  }, [onSessionLost]);

  const handleAccessError = useCallback((failure: unknown) => {
    if (!(failure instanceof PortalRequestError)) return false;
    if (failure.status === 401 || failure.status === 403 || failure.status === 404) {
      setAllowed(false);
      setNotices([]);
      setLoaded(false);
      setTitle("");
      setBody("");
      setNextCursor(null);
      setRemovalId(null);
      setConfirmation("");
      submission.current = null;
      if (failure.status === 401) {
        sessionLost.current();
        return true;
      }
    }
    return false;
  }, []);

  const loadNotices = useCallback(async (cursor?: string) => {
    if (mutationRequest.current) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await portalRequest<NoticesResult>(
        `${endpoint}?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { signal: controller.signal },
      );
      if (!active.current || controller.signal.aborted) return;
      setNotices((current) => cursor
        ? [...current, ...result.notices.filter((item) => !current.some((existing) => existing.id === item.id))]
        : result.notices);
      setNextCursor(result.next_cursor ?? null);
      setLoaded(true);
      setAllowed(true);
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      if (!handleAccessError(failure)) {
        setError(failure instanceof Error ? failure.message : "Não foi possível carregar os avisos deste paciente.");
      }
    } finally {
      if (active.current && listRequest.current === controller) {
        listRequest.current = null;
        setLoading(false);
      }
    }
  }, [endpoint, handleAccessError]);

  useEffect(() => {
    active.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotices();
    return () => {
      active.current = false;
      listRequest.current?.abort();
      mutationRequest.current?.abort();
      submission.current = null;
    };
  }, [loadNotices]);

  async function sendNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || listRequest.current || mutationRequest.current) return;
    const cleanTitle = title.trim();
    const cleanBody = body.replace(/\r\n?/gu, "\n").trim();
    if (!cleanTitle || !cleanBody) {
      setActionError("Preencha o título e o texto do aviso.");
      return;
    }
    if (!submission.current || submission.current.title !== cleanTitle || submission.current.body !== cleanBody) {
      try {
        submission.current = { title: cleanTitle, body: cleanBody, id: createClientRequestId() };
      } catch {
        setActionError("Não foi possível preparar o envio neste navegador. Atualize a página e tente novamente; o texto continua aqui.");
        return;
      }
    }
    const controller = new AbortController();
    mutationRequest.current = controller;
    setBusy("send");
    setActionError("");
    setConfirmation("");
    try {
      const result = await portalRequest<{ notice: PatientNotice }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ title: cleanTitle, body: cleanBody, client_request_id: submission.current.id }),
        signal: controller.signal,
      }, csrf);
      if (!active.current || controller.signal.aborted) return;
      setNotices((current) => [result.notice, ...current.filter((item) => item.id !== result.notice.id)]);
      setTitle("");
      setBody("");
      submission.current = null;
      setConfirmation("Aviso enviado. Ele ficará disponível quando o paciente abrir ou atualizar os avisos.");
      heading.current?.focus();
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      if (!handleAccessError(failure)) {
        setActionError(failure instanceof Error ? failure.message : "Não foi possível enviar. Tente novamente.");
      }
    } finally {
      if (mutationRequest.current === controller) mutationRequest.current = null;
      if (active.current && !controller.signal.aborted) setBusy(null);
    }
  }

  async function removeNotice(noticeId: string) {
    if (!allowed || listRequest.current || mutationRequest.current) return;
    const controller = new AbortController();
    mutationRequest.current = controller;
    setBusy(noticeId);
    setActionError("");
    setConfirmation("");
    try {
      await portalRequest<void>(`${endpoint}/${encodeURIComponent(noticeId)}`, {
        method: "DELETE", signal: controller.signal,
      }, csrf);
      if (!active.current || controller.signal.aborted) return;
      setNotices((current) => current.filter((item) => item.id !== noticeId));
      setRemovalId(null);
      setConfirmation("Aviso removido do portal.");
      heading.current?.focus();
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      if (!handleAccessError(failure)) {
        setActionError(failure instanceof Error ? failure.message : "Não foi possível remover. Tente novamente.");
      }
    } finally {
      if (mutationRequest.current === controller) mutationRequest.current = null;
      if (active.current && !controller.signal.aborted) setBusy(null);
    }
  }

  return (
    <section className="professional-patient-notices notice-panel" aria-labelledby={headingId}>
      <div className="notices-professional-heading">
        <div>
          <p className="eyebrow">COMUNICADO INDIVIDUAL</p>
          <h3 id={headingId} ref={heading} tabIndex={-1}>Avisos para {patientName}</h3>
          <p id={helpId}>Somente este paciente recebe o aviso. Este espaço não é um chat e não permite respostas.</p>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={() => void loadNotices()} disabled={loading || busy !== null}>{loading ? "Carregando…" : "Atualizar avisos"}</button>
      </div>
      {error ? <div className="notices-error"><p role="alert">{error}</p><button className="secondary-button" type="button" disabled={loading || busy !== null} onClick={() => void loadNotices()}>Tentar novamente</button></div> : null}
      {loading && !loaded ? <p className="notices-empty" role="status">Carregando os avisos deste paciente…</p> : null}
      {allowed ? (
        <form className="notice-compose" onSubmit={(event) => void sendNotice(event)} aria-describedby={helpId}>
          <label className="field"><span>Título do aviso</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} autoComplete="off" required disabled={busy !== null} placeholder="Ex.: Sobre nossa próxima sessão" /></label>
          <label className="field"><span>Texto do aviso</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={4} autoComplete="off" required disabled={busy !== null} /><small>Até 2.000 caracteres. O envio não gera uma conversa.</small></label>
          <div className="notice-compose-footer"><p>Será exibido na área “Avisos de Mateus”.</p><button className="primary-button" disabled={loading || busy !== null}>{busy === "send" ? "Enviando…" : "Enviar aviso"}</button></div>
        </form>
      ) : null}
      {actionError ? <p className="notice notice-error" role="alert">{actionError}</p> : null}
      {confirmation ? <p className="notices-feedback" role="status">{confirmation}</p> : null}
      {loaded && allowed ? <h4 className="notices-list-heading">Avisos enviados</h4> : null}
      {loaded && allowed && notices.length === 0 ? <p className="notices-empty">Nenhum aviso enviado para este paciente.</p> : null}
      <div className="notices-list">
        {notices.map((notice) => (
          <details className="notice-item" key={notice.id}>
            <summary className="notice-item-summary"><span className="notices-summary-copy"><span className="notice-item-heading">{notice.title}</span><span className="notice-item-meta">{formatDate(notice.created_at)} · {notice.read_at ? "Leitura confirmada" : "Leitura não confirmada"}</span></span><span className="notices-summary-action"><span className="notice-closed-label">Ver aviso</span><span className="notice-open-label">Fechar</span></span></summary>
            <div className="notice-item-content">
              <p className="notice-body">{notice.body}</p>
              {notice.read_at ? <p className="notice-item-meta">Leitura confirmada pelo paciente em {formatDate(notice.read_at)}.</p> : null}
              {removalId === notice.id ? <div className="notice-remove-confirmation"><p>Remover este aviso da área do paciente? Essa ação não pode ser desfeita.</p><div className="button-row"><button className="secondary-button" type="button" disabled={busy !== null} onClick={() => setRemovalId(null)}>Cancelar</button><button className="danger-button" type="button" disabled={loading || busy !== null || !allowed} onClick={() => void removeNotice(notice.id)}>{busy === notice.id ? "Removendo…" : "Confirmar remoção"}</button></div></div> : <button className="danger-link" type="button" disabled={loading || busy !== null || !allowed} onClick={() => setRemovalId(notice.id)}>Remover aviso</button>}
            </div>
          </details>
        ))}
      </div>
      {nextCursor ? <button className="secondary-button notices-more" type="button" disabled={loading || busy !== null} onClick={() => void loadNotices(nextCursor)}>{loading ? "Carregando…" : "Ver avisos anteriores"}</button> : null}
    </section>
  );
}
