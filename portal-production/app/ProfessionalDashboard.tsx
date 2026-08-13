"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  displayedPatientName,
  type EntryViewFilter,
  filterAndSortPatients,
  filterPatientAccesses,
  invitationStatusLabel,
  latestPatientShareAt,
  type Invitation,
  type PatientAccess,
  type PatientSort,
  type PatientSummary,
  type ProfessionalArea,
  type SharedEntry,
  type SharedPatientMap,
  sharedCountLabel,
  splitInvitations,
} from "./professional-dashboard-data";
import { copyText } from "./copy-text";
import { formatDate, portalRequest, PortalRequestError } from "./portal-client";

type User = { id: string; name: string; role: "therapist" };
type NoticeTone = "info" | "error" | "success";

type ProfessionalDashboardProps = {
  user: User;
  csrf: string;
  accountPanel: ReactNode;
  onSessionLost: () => void;
};

type IssuedRecovery = {
  patientName: string;
  code: string;
  expiresAt: string;
};

type ProfessionalActivity = {
  total_count: number;
  shared_count: number;
  private_count: number;
};

const PATIENT_LIST_PAGE_SIZE = 15;
const LATEST_INVITATION_CODE_VISIBLE_MS = 2 * 60 * 1000;

function Notice({ message, tone = "info" }: { message: string; tone?: NoticeTone }) {
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (tone === "error") noticeRef.current?.focus();
  }, [message, tone]);
  return (
    <p
      ref={noticeRef}
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-atomic="true"
      tabIndex={tone === "error" ? -1 : undefined}
    >
      {message}
    </p>
  );
}

function unreadContentCountLabel(count: number): string {
  if (count === 0) return "Tudo visto";
  return `${count} ${count === 1 ? "conteúdo ainda não visto" : "conteúdos ainda não vistos"}`;
}

function RecoveryAuthorizationDialog({
  patient,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  patient: PatientAccess;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (currentPassword: string, totp: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    passwordRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(
      String(form.get("current_password") ?? ""),
      String(form.get("totp") ?? ""),
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="assisted-recovery-dialog"
      aria-labelledby="assisted-recovery-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form className="assisted-recovery-shell" onSubmit={submit}>
        <div className="assisted-recovery-heading">
          <div>
            <p className="eyebrow">RECUPERAÇÃO ASSISTIDA</p>
            <h2 id="assisted-recovery-title">
              Gerar código para {displayedPatientName(patient.patient_name)}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Fechar recuperação"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </div>
        <p>
          Use somente depois de confirmar a identidade do paciente. O código
          anterior deixará de funcionar, as sessões abertas serão encerradas e o
          novo código valerá por 24 horas.
        </p>
        <label className="field">
          <span>Sua senha profissional</span>
          <input
            ref={passwordRef}
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="field">
          <span>Código atual do autenticador</span>
          <input
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={12}
            required
          />
          <small>
            Se acabou de entrar, aguarde o número exibido mudar e use o próximo
            código de 6 dígitos. Você pode colar com espaços ou hífens.
          </small>
        </label>
        {error ? <Notice tone="error" message={error} /> : null}
        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Gerando…" : "Confirmar e gerar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function IssuedRecoveryDialog({
  recovery,
  onClose,
}: {
  recovery: IssuedRecovery;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
  }, []);

  async function copy() {
    try {
      await copyText(recovery.code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="assisted-recovery-dialog"
      aria-labelledby="issued-recovery-title"
      onClose={onClose}
    >
      <div className="assisted-recovery-shell">
        <div className="assisted-recovery-heading">
          <div>
            <p className="eyebrow">CÓDIGO CRIADO</p>
            <h2 id="issued-recovery-title" ref={titleRef} tabIndex={-1}>
              Entregue diretamente ao paciente
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Fechar código de recuperação"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p>
          Código para <strong>{recovery.patientName}</strong>. Ele aparece
          somente agora e é válido até {formatDate(recovery.expiresAt)}.
        </p>
        <code className="secret-code">{recovery.code}</code>
        <p className="assisted-recovery-instructions">
          Oriente o paciente a abrir “Esqueci minha senha”, informar o e-mail da
          conta, este código e uma nova senha.
        </p>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={() => void copy()}>
            {copyStatus === "copied" ? "Código copiado" : "Copiar código"}
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            Já entreguei ou guardei
          </button>
        </div>
        <p
          className={copyStatus === "error" ? "copy-error" : "sr-status"}
          role={copyStatus === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {copyStatus === "copied"
            ? "Código de recuperação copiado."
            : copyStatus === "error"
              ? "O navegador bloqueou a cópia. Toque e segure o código para copiá-lo."
              : ""}
        </p>
      </div>
    </dialog>
  );
}

function ProfessionalNavigation({
  area,
  unreadEntryCount,
  activePatientCount,
  activeInvitationCount,
  onChange,
}: {
  area: ProfessionalArea;
  unreadEntryCount: number;
  activePatientCount: number | null;
  activeInvitationCount: number | null;
  onChange: (area: ProfessionalArea) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const areas: Array<{
    id: ProfessionalArea;
    label: string;
    count: number | null;
    countLabel: (count: number) => string;
  }> = [
    {
      id: "records",
      label: "Conteúdos compartilhados",
      count: unreadEntryCount,
      countLabel: (count) =>
        `${count} ${count === 1 ? "conteúdo não visto" : "conteúdos não vistos"}`,
    },
    {
      id: "accesses",
      label: "Acessos de pacientes",
      count: activePatientCount,
      countLabel: (count) => `${count} no total`,
    },
    {
      id: "invitations",
      label: "Convites",
      count: activeInvitationCount,
      countLabel: (count) => `${count} no total`,
    },
  ];

  function navigateWithArrows(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + areas.length) % areas.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % areas.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = areas.length - 1;
    const nextArea = areas[nextIndex];
    onChange(nextArea.id);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <nav className="professional-navigation" aria-label="Áreas do acesso profissional">
      {areas.map((item, index) => (
        <button
          key={item.id}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          className={area === item.id ? "active" : ""}
          aria-pressed={area === item.id}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => navigateWithArrows(event, index)}
        >
          <span>{item.label}</span>
          <small
            aria-label={
              item.count === null
                ? "Contagem disponível ao abrir esta área"
                : item.countLabel(item.count)
            }
          >
            {item.count ?? "—"}
          </small>
        </button>
      ))}
    </nav>
  );
}

function RecordDisclosure({
  entry,
  viewing,
  onViewed,
}: {
  entry: SharedEntry;
  viewing: boolean;
  onViewed: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = Boolean(entry.is_unread);
  const summaryRef = useRef<HTMLElement>(null);
  const restoreFocusAfterView = useRef(false);
  const details = [
    ["O que aconteceu", entry.happened],
    ["Percepções no corpo", entry.body],
    ["Pensamentos", entry.thoughts],
    ["Vontade de agir", entry.urge],
    ["Para levar à sessão", entry.message],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  useEffect(() => {
    if (!restoreFocusAfterView.current || viewing) return;
    restoreFocusAfterView.current = false;
    if (!unread) summaryRef.current?.focus();
  }, [unread, viewing]);

  return (
    <details
      className={`professional-record-disclosure${unread ? " is-unread" : ""}`}
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
      }}
    >
      <summary ref={summaryRef}>
        <span className="record-summary-main">
          <span
            className={`record-view-state ${unread ? "unread" : "viewed"}`}
          >
            {viewing
              ? "Salvando visualização…"
              : open && unread
                ? "Em leitura"
                : unread
                  ? "Não visto"
                  : "Visto"}
          </span>
          <span className="record-summary-title">{entry.title}</span>
          <span className="record-meta">
            Compartilhado {formatDate(entry.shared_at)}
            {entry.emotion ? ` · ${entry.emotion}` : ""}
            {` · intensidade ${entry.intensity}/10`}
          </span>
        </span>
        <span className="disclosure-action" aria-hidden="true">
          <span className="when-closed">Ver conteúdo</span>
          <span className="when-open">Fechar</span>
        </span>
      </summary>
      <div className="professional-record-content">
        <div className="entry-details">
          {details.map(([label, value]) => (
            <div key={label}>
              <strong>{label}</strong>
              <p>{value}</p>
            </div>
          ))}
        </div>
        <p className="read-only">
          Somente leitura · o texto do paciente não pode ser editado aqui.
        </p>
        {unread ? (
          <div className="view-confirmation">
            <p>
              Quando terminar, confirme conscientemente a visualização. Apenas
              abrir ou fechar o registro não informa nada ao paciente.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={viewing}
              onClick={() => {
                restoreFocusAfterView.current = true;
                onViewed(entry.id);
              }}
            >
              {viewing ? "Salvando visualização…" : "Concluir visualização"}
            </button>
          </div>
        ) : (
          <p className="view-confirmed">Visualização já confirmada para o paciente.</p>
        )}
      </div>
    </details>
  );
}

function MapShareDisclosure({
  share,
  viewing,
  onViewed,
}: {
  share: SharedPatientMap;
  viewing: boolean;
  onViewed: (mapId: string) => void;
}) {
  const unread = Boolean(share.is_unread);
  const [open, setOpen] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  const restoreFocusAfterView = useRef(false);

  useEffect(() => {
    if (!restoreFocusAfterView.current || viewing) return;
    restoreFocusAfterView.current = false;
    if (!unread) summaryRef.current?.focus();
  }, [unread, viewing]);

  return (
    <details
      className={`professional-map-disclosure${unread ? " is-unread" : ""}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary ref={summaryRef}>
        <span className="record-summary-main">
          <span className={`record-view-state ${unread ? "unread" : "viewed"}`}>
            {viewing ? "Salvando visualização…" : unread ? "Não visto" : "Visto"}
          </span>
          <span className="record-summary-title">Meu mapa · {share.map_title}</span>
          <span className="record-meta">
            Compartilhado {formatDate(share.shared_at)} · {share.answers.length}{" "}
            {share.answers.length === 1 ? "item" : "itens"}
          </span>
        </span>
        <span className="disclosure-action" aria-hidden="true">
          <span className="when-closed">Ver conteúdo</span>
          <span className="when-open">Fechar</span>
        </span>
      </summary>
      <div className="professional-map-content">
        <p className="professional-map-description">{share.map_description}</p>
        <div className="professional-map-answer-list">
          {share.answers.map((answer) => (
            <article key={answer.item_id}>
              <span>{answer.section_title.toLocaleLowerCase("pt-BR")}</span>
              <h4>{answer.item_title}</h4>
              {answer.response_label ? <strong>{answer.response_label}</strong> : null}
              {answer.note ? (
                <p><b>Observação do paciente:</b> {answer.note}</p>
              ) : null}
            </article>
          ))}
        </div>
        <p className="read-only">
          Somente leitura · esta é a cópia que o paciente decidiu compartilhar.
        </p>
        {unread ? (
          <div className="view-confirmation">
            <p>
              Confirme somente depois de concluir a leitura. O paciente verá a
              confirmação, sem que isso signifique resposta em tempo real.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={viewing}
              onClick={() => {
                restoreFocusAfterView.current = true;
                onViewed(share.map_id);
              }}
            >
              {viewing ? "Salvando visualização…" : "Concluir visualização"}
            </button>
          </div>
        ) : (
          <p className="view-confirmed">Visualização já confirmada para o paciente.</p>
        )}
      </div>
    </details>
  );
}

function PatientList({
  patients,
  activity,
  loading,
  refreshing,
  error,
  query,
  sort,
  onQueryChange,
  onSortChange,
  onRefresh,
  onOpen,
}: {
  patients: PatientSummary[];
  activity: ProfessionalActivity;
  loading: boolean;
  refreshing: boolean;
  error: string;
  query: string;
  sort: PatientSort;
  onQueryChange: (value: string) => void;
  onSortChange: (value: PatientSort) => void;
  onRefresh: () => void;
  onOpen: (patient: PatientSummary) => void;
}) {
  const [visiblePatientLimit, setVisiblePatientLimit] = useState(
    PATIENT_LIST_PAGE_SIZE,
  );
  const visiblePatients = useMemo(
    () => filterAndSortPatients(patients, query, sort),
    [patients, query, sort],
  );
  const displayedPatients = visiblePatients.slice(0, visiblePatientLimit);
  const hiddenPatientCount = Math.max(
    0,
    visiblePatients.length - displayedPatients.length,
  );

  function changeQuery(value: string) {
    setVisiblePatientLimit(PATIENT_LIST_PAGE_SIZE);
    onQueryChange(value);
  }

  function changeSort(value: PatientSort) {
    setVisiblePatientLimit(PATIENT_LIST_PAGE_SIZE);
    onSortChange(value);
  }

  return (
    <section
      className="professional-section"
      aria-labelledby="professional-patient-list-title"
    >
      <div className="section-heading professional-section-heading">
        <div>
          <p className="eyebrow">USO DO PORTAL</p>
          <h2 id="professional-patient-list-title" tabIndex={-1}>
            Atividade por paciente
          </h2>
          <p className="section-description">
            Veja a adesão de cada paciente e abra somente os registros ou partes
            do mapa que ele decidiu compartilhar. Dos registros privados, nenhum
            conteúdo ou data é exibido.
          </p>
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
        >
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <section className="professional-activity-summary" aria-label="Uso geral do portal">
        <div>
          <span>Registros criados</span>
          <strong>{activity.total_count}</strong>
        </div>
        <div>
          <span>Compartilhados com você</span>
          <strong>{activity.shared_count}</strong>
        </div>
        <div>
          <span>Mantidos privados</span>
          <strong>{activity.private_count}</strong>
        </div>
        <p>
          A soma considera pacientes com acesso ativo e oferece uma visão rápida.
          Abaixo, a contagem é separada por paciente, sem mostrar qualquer conteúdo
          privado.
        </p>
      </section>

      <div className="professional-tools">
        <label className="field search-field">
          <span>Buscar paciente</span>
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            autoComplete="off"
            placeholder="Digite parte do nome"
          />
        </label>
        <label className="field sort-field">
          <span>Ordenar por</span>
          <select
            value={sort}
            onChange={(event) => changeSort(event.target.value as PatientSort)}
          >
            <option value="unread">Com pendências primeiro</option>
            <option value="recent">Mais recentes</option>
            <option value="alphabetical">Em ordem alfabética</option>
          </select>
        </label>
      </div>

      <div className="sr-status" aria-live="polite">
        {refreshing ? "Atualizando a lista de pacientes." : ""}
      </div>

      {error && patients.length > 0 ? (
        <div className="panel error-state retained-data-warning">
          <Notice tone="error" message={error} />
          <p>A lista já carregada continua disponível abaixo.</p>
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar atualizar novamente
          </button>
        </div>
      ) : null}

      {loading && patients.length === 0 ? (
        <div className="panel loading-panel" role="status">
          <div className="loader" />
          <p>Carregando registros compartilhados…</p>
        </div>
      ) : error && patients.length === 0 ? (
        <div className="panel error-state">
          <Notice tone="error" message={error} />
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar novamente
          </button>
        </div>
      ) : patients.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum registro criado agora.</h3>
          <p>As contas continuam disponíveis em “Acessos de pacientes”.</p>
        </div>
      ) : visiblePatients.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum paciente encontrado com esse nome.</h3>
          <p>A busca considera somente o nome exibido.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => changeQuery("")}
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <>
          <p
            className="list-result-count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Exibindo {displayedPatients.length} de {visiblePatients.length}{" "}
            {visiblePatients.length === 1 ? "paciente" : "pacientes"}.
          </p>
          <div className="patient-summary-list" id="professional-patient-list">
          {displayedPatients.map((patient) => {
            const unreadCount = patient.unread_count + (patient.unread_map_count ?? 0);
            const latestSharedAt = latestPatientShareAt(patient);
            const patientName = displayedPatientName(patient.patient_name);
            return (
              <article className="patient-summary-card" key={patient.patient_id}>
                <div className="patient-summary-copy">
                  <h3>{patientName}</h3>
                  <p className="patient-summary-count">
                    {sharedCountLabel(patient.shared_count)} ·{" "}
                    {patient.shared_map_count ?? 0}{" "}
                    {(patient.shared_map_count ?? 0) === 1
                      ? "parte do mapa compartilhada"
                      : "partes do mapa compartilhadas"}{" · "}
                    {patient.private_count}{" "}
                    {patient.private_count === 1
                      ? "registro privado"
                      : "registros privados"}
                  </p>
                  <p
                    className={`patient-summary-view-count${
                      unreadCount > 0 ? " has-unread" : ""
                    }`}
                  >
                    {unreadContentCountLabel(unreadCount)}
                  </p>
                  <p className="record-meta">
                    {latestSharedAt
                      ? `Último compartilhamento: ${formatDate(latestSharedAt)}`
                      : "Nenhum conteúdo compartilhado"}
                  </p>
                </div>
                {patient.shared_count + (patient.shared_map_count ?? 0) > 0 ? (
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`Abrir conteúdos compartilhados por ${patientName}`}
                    onClick={() => onOpen(patient)}
                  >
                    Abrir conteúdos
                  </button>
                ) : (
                  <span className="private-only-note">Sem conteúdo disponível</span>
                )}
              </article>
            );
          })}
          </div>
          {hiddenPatientCount > 0 || visiblePatientLimit > PATIENT_LIST_PAGE_SIZE ? (
            <div className="list-pagination" aria-label="Navegação da lista de atividade">
              {hiddenPatientCount > 0 ? (
                <button
                  className="text-action list-toggle"
                  type="button"
                  aria-controls="professional-patient-list"
                  aria-label={`Mostrar mais pacientes: próximos ${Math.min(PATIENT_LIST_PAGE_SIZE, hiddenPatientCount)} de ${hiddenPatientCount} restantes`}
                  onClick={() =>
                    setVisiblePatientLimit((current) =>
                      Math.min(current + PATIENT_LIST_PAGE_SIZE, visiblePatients.length),
                    )
                  }
                >
                  Mostrar mais ({Math.min(PATIENT_LIST_PAGE_SIZE, hiddenPatientCount)})
                </button>
              ) : null}
              {visiblePatientLimit > PATIENT_LIST_PAGE_SIZE ? (
                <button
                  className="text-action list-toggle"
                  type="button"
                  aria-controls="professional-patient-list"
                  aria-label={`Mostrar somente os primeiros ${PATIENT_LIST_PAGE_SIZE} pacientes`}
                  onClick={() => setVisiblePatientLimit(PATIENT_LIST_PAGE_SIZE)}
                >
                  Mostrar menos
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PatientRecordsView({
  patient,
  entries,
  mapShares,
  loading,
  refreshing,
  error,
  viewingIds,
  viewingMapIds,
  onBack,
  onRefresh,
  onViewed,
  onMapViewed,
}: {
  patient: PatientSummary;
  entries: SharedEntry[];
  mapShares: SharedPatientMap[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  viewingIds: Set<string>;
  viewingMapIds: Set<string>;
  onBack: () => void;
  onRefresh: () => void;
  onViewed: (entryId: string) => void;
  onMapViewed: (mapId: string) => void;
}) {
  const [viewFilter, setViewFilter] = useState<EntryViewFilter>("all");
  const [visibleEntryLimit, setVisibleEntryLimit] = useState(20);
  const sectionRef = useRef<HTMLElement>(null);
  const unreadFilterRef = useRef<HTMLButtonElement>(null);
  const pendingViewedFocus = useRef<string | null>(null);
  const unreadCount = entries.filter((entry) => Boolean(entry.is_unread)).length;
  const unreadMapCount = mapShares.filter((share) => Boolean(share.is_unread)).length;
  const viewedCount = entries.length - unreadCount;
  const filteredEntries = entries.filter((entry) => {
    if (viewFilter === "unread") return Boolean(entry.is_unread);
    if (viewFilter === "viewed") return !entry.is_unread;
    return true;
  });
  const visibleEntries = filteredEntries.slice(0, visibleEntryLimit);
  const hasContent = entries.length > 0 || mapShares.length > 0;

  useEffect(() => {
    const entryId = pendingViewedFocus.current;
    if (!entryId || viewingIds.has(entryId)) return;
    const viewedEntry = entries.find((entry) => entry.id === entryId);
    if (!viewedEntry || viewedEntry.is_unread) return;
    pendingViewedFocus.current = null;
    window.requestAnimationFrame(() => {
      const nextUnreadSummary = sectionRef.current?.querySelector<HTMLElement>(
        ".professional-record-disclosure.is-unread > summary",
      );
      (nextUnreadSummary ?? unreadFilterRef.current)?.focus();
    });
  }, [entries, viewingIds]);

  return (
    <section
      ref={sectionRef}
      className="professional-section"
      aria-labelledby="selected-patient-title"
    >
      <button className="back-button" type="button" onClick={onBack}>
        ← Voltar aos pacientes
      </button>
      <div className="section-heading professional-section-heading patient-detail-heading">
        <div>
          <p className="eyebrow">CONTEÚDOS COMPARTILHADOS</p>
          <h2 id="selected-patient-title" tabIndex={-1}>
            {displayedPatientName(patient.patient_name)}
          </h2>
          <p className="section-description">
            {loading
              ? "Consultando os conteúdos autorizados…"
              : `${sharedCountLabel(entries.length)} · ${mapShares.length} ${mapShares.length === 1 ? "parte do mapa" : "partes do mapa"} · ${unreadContentCountLabel(unreadCount + unreadMapCount)}`}
          </p>
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
        >
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <div className="sr-status" aria-live="polite">
        {refreshing ? "Atualizando os conteúdos compartilhados." : ""}
      </div>

      {error && hasContent ? (
        <div className="panel error-state retained-data-warning">
          <Notice tone="error" message={error} />
          <p>Os conteúdos já carregados continuam disponíveis abaixo.</p>
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar atualizar novamente
          </button>
        </div>
      ) : null}

      {loading && !hasContent ? (
        <div className="panel loading-panel" role="status">
          <div className="loader" />
          <p>Carregando os conteúdos desta pessoa…</p>
        </div>
      ) : error && !hasContent ? (
        <div className="panel error-state">
          <Notice tone="error" message={error} />
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar novamente
          </button>
        </div>
      ) : entries.length === 0 && mapShares.length === 0 ? (
        <div className="empty-state">
          <h3>Este paciente não possui mais conteúdos compartilhados.</h3>
          <p>O compartilhamento pode ter sido retirado ou o conteúdo excluído.</p>
          <button className="secondary-button" type="button" onClick={onBack}>
            Voltar aos pacientes
          </button>
        </div>
      ) : (
        <>
          {mapShares.length > 0 ? (
            <section className="professional-map-shares" aria-labelledby="professional-map-shares-title">
              <div className="subsection-heading">
                <div>
                  <h3 id="professional-map-shares-title">Partes do Meu mapa</h3>
                  <p>{unreadMapCount === 0 ? "Todas visualizadas" : `${unreadMapCount} ${unreadMapCount === 1 ? "ainda não visualizada" : "ainda não visualizadas"}`}</p>
                </div>
                <span className="count">{mapShares.length}</span>
              </div>
              <div className="professional-map-list">
                {mapShares.map((share) => (
                  <MapShareDisclosure
                    key={share.map_id}
                    share={share}
                    viewing={viewingMapIds.has(share.map_id)}
                    onViewed={onMapViewed}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {entries.length > 0 ? (
            <section className="professional-entry-shares" aria-labelledby="professional-entry-shares-title">
              <div className="subsection-heading">
                <div>
                  <h3 id="professional-entry-shares-title">Registros entre sessões</h3>
                  <p>O filtro abaixo se aplica somente a estes registros.</p>
                </div>
                <span className="count">{entries.length}</span>
              </div>
              <div
                className="entry-view-toolbar"
                role="group"
                aria-label="Filtrar somente os registros por leitura"
              >
                {([
                  ["all", "Todos", entries.length],
                  ["unread", "Não vistos", unreadCount],
                  ["viewed", "Vistos", viewedCount],
                ] as Array<[EntryViewFilter, string, number]>).map(
                  ([value, label, count]) => (
                    <button
                      ref={value === "unread" ? unreadFilterRef : undefined}
                      key={value}
                      className={viewFilter === value ? "active" : ""}
                      type="button"
                      aria-pressed={viewFilter === value}
                      onClick={() => {
                        setViewFilter(value);
                        setVisibleEntryLimit(20);
                      }}
                    >
                      <span>{label}</span>
                      <small>{count}</small>
                    </button>
                  ),
                )}
              </div>
              {visibleEntries.length === 0 ? (
        <div className="empty-state compact-empty">
          <h3>
            {viewFilter === "unread"
              ? "Nenhum registro aguardando leitura."
              : "Nenhum registro neste filtro."}
          </h3>
          <p>Você pode voltar a exibir todos os registros.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setViewFilter("all")}
          >
            Mostrar todos
          </button>
        </div>
              ) : (
                <div className="professional-record-list">
                  {visibleEntries.map((entry) => (
                    <RecordDisclosure
                      key={entry.id}
                      entry={entry}
                      viewing={viewingIds.has(entry.id)}
                      onViewed={(entryId) => {
                        if (viewFilter === "unread") {
                          pendingViewedFocus.current = entryId;
                        }
                        onViewed(entryId);
                      }}
                    />
                  ))}
                </div>
              )}
              {filteredEntries.length > 20 ? (
                <button
                  className="text-action list-toggle"
                  type="button"
                  onClick={() =>
                    setVisibleEntryLimit((current) =>
                      current >= filteredEntries.length ? 20 : current + 20,
                    )
                  }
                >
                  {visibleEntryLimit >= filteredEntries.length
                    ? "Mostrar menos registros"
                    : `Mostrar mais registros (${Math.min(20, filteredEntries.length - visibleEntryLimit)})`}
                </button>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function PatientAccessView({
  patients,
  loading,
  error,
  query,
  updatingIds,
  onQueryChange,
  onRefresh,
  onChangeAccess,
  onGenerateRecovery,
}: {
  patients: PatientAccess[];
  loading: boolean;
  error: string;
  query: string;
  updatingIds: Set<string>;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  onChangeAccess: (patient: PatientAccess, active: boolean) => void;
  onGenerateRecovery: (
    patient: PatientAccess,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const [visiblePatientLimit, setVisiblePatientLimit] = useState(
    PATIENT_LIST_PAGE_SIZE,
  );
  const visiblePatients = useMemo(
    () => filterPatientAccesses(patients, query),
    [patients, query],
  );
  const displayedPatients = visiblePatients.slice(0, visiblePatientLimit);
  const hiddenPatientCount = Math.max(
    0,
    visiblePatients.length - displayedPatients.length,
  );
  const activeCount = patients.filter(
    (patient) => patient.access_status === "active",
  ).length;

  function changeQuery(value: string) {
    setVisiblePatientLimit(PATIENT_LIST_PAGE_SIZE);
    onQueryChange(value);
  }

  return (
    <section className="professional-section" aria-labelledby="patient-access-title">
      <div className="section-heading professional-section-heading">
        <div>
          <p className="eyebrow">CONTROLE DE ACESSO</p>
          <h2 id="patient-access-title" tabIndex={-1}>Acessos de pacientes</h2>
          <p className="section-description">
            {activeCount} {activeCount === 1 ? "acesso ativo" : "acessos ativos"}.
            Use a revogação quando o acompanhamento terminar.
          </p>
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <div className="panel access-guidance">
        <strong>O que acontece ao revogar?</strong>
        <p>
          O login é bloqueado e as sessões abertas são encerradas imediatamente.
          Os registros não são apagados e o acesso pode ser restaurado se o
          acompanhamento recomeçar.
        </p>
      </div>

      <label className="field access-search">
        <span>Buscar paciente</span>
        <input
          type="search"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          autoComplete="off"
          placeholder="Digite parte do nome"
        />
      </label>

      {error && patients.length > 0 ? (
        <div className="panel error-state retained-data-warning">
          <Notice tone="error" message={error} />
          <p>A lista já carregada continua disponível abaixo.</p>
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar atualizar novamente
          </button>
        </div>
      ) : null}

      {error && patients.length === 0 ? (
        <div className="panel error-state">
          <Notice tone="error" message={error} />
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar novamente
          </button>
        </div>
      ) : loading && patients.length === 0 ? (
        <div className="panel loading-panel" role="status">
          <div className="loader" />
          <p>Carregando acessos de pacientes…</p>
        </div>
      ) : patients.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhuma conta de paciente cadastrada.</h3>
          <p>As contas aparecerão aqui depois do uso de um convite.</p>
        </div>
      ) : visiblePatients.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum paciente encontrado com esse nome.</h3>
          <button
            className="secondary-button"
            type="button"
            onClick={() => changeQuery("")}
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <>
          <p
            className="list-result-count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Exibindo {displayedPatients.length} de {visiblePatients.length}{" "}
            {visiblePatients.length === 1 ? "acesso" : "acessos"}.
          </p>
          <div className="patient-access-list" id="patient-access-list">
          {displayedPatients.map((patient) => {
            const active = patient.access_status === "active";
            const updating = updatingIds.has(patient.patient_id);
            return (
              <article className="patient-access-card" key={patient.patient_id}>
                <div className="patient-access-copy">
                  <div className="patient-access-title">
                    <h3>{displayedPatientName(patient.patient_name)}</h3>
                    <span
                      className={`status ${active ? "access-active" : "access-revoked"}`}
                    >
                      {active ? "Acesso ativo" : "Acesso revogado"}
                    </span>
                  </div>
                  <p className="record-meta">
                    Conta criada em {formatDate(patient.created_at)}
                    {patient.last_login_at
                      ? ` · último acesso ${formatDate(patient.last_login_at)}`
                      : " · nenhum acesso registrado"}
                  </p>
                  <p className="patient-access-detail">
                    {patient.shared_count}{" "}
                    {patient.shared_count === 1
                      ? "registro compartilhado preservado"
                      : "registros compartilhados preservados"}
                    {!active && patient.revoked_at
                      ? ` · revogado em ${formatDate(patient.revoked_at)}`
                      : ""}
                  </p>
                </div>
                <div className="patient-access-actions">
                  {active ? (
                    <button
                      className="secondary-button"
                      type="button"
                      aria-label={`Gerar recuperação para ${displayedPatientName(patient.patient_name)}`}
                      onClick={(event) =>
                        onGenerateRecovery(patient, event.currentTarget)
                      }
                      disabled={updating || loading}
                    >
                      Gerar recuperação
                    </button>
                  ) : null}
                  <button
                    className={active ? "danger-button" : "secondary-button"}
                    type="button"
                    aria-label={`${active ? "Revogar acesso" : "Restaurar acesso"} de ${displayedPatientName(patient.patient_name)}`}
                    onClick={() => onChangeAccess(patient, !active)}
                    disabled={updating || loading}
                  >
                    {updating
                      ? "Aguarde…"
                      : active
                        ? "Revogar acesso"
                        : "Restaurar acesso"}
                  </button>
                </div>
              </article>
            );
          })}
          </div>
          {hiddenPatientCount > 0 || visiblePatientLimit > PATIENT_LIST_PAGE_SIZE ? (
            <div className="list-pagination" aria-label="Navegação da lista de acessos">
              {hiddenPatientCount > 0 ? (
                <button
                  className="text-action list-toggle"
                  type="button"
                  aria-controls="patient-access-list"
                  aria-label={`Mostrar mais acessos: próximos ${Math.min(PATIENT_LIST_PAGE_SIZE, hiddenPatientCount)} de ${hiddenPatientCount} restantes`}
                  onClick={() =>
                    setVisiblePatientLimit((current) =>
                      Math.min(current + PATIENT_LIST_PAGE_SIZE, visiblePatients.length),
                    )
                  }
                >
                  Mostrar mais ({Math.min(PATIENT_LIST_PAGE_SIZE, hiddenPatientCount)})
                </button>
              ) : null}
              {visiblePatientLimit > PATIENT_LIST_PAGE_SIZE ? (
                <button
                  className="text-action list-toggle"
                  type="button"
                  aria-controls="patient-access-list"
                  aria-label={`Mostrar somente os primeiros ${PATIENT_LIST_PAGE_SIZE} acessos`}
                  onClick={() => setVisiblePatientLimit(PATIENT_LIST_PAGE_SIZE)}
                >
                  Mostrar menos
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function InvitationItem({
  invitation,
  revoking,
  disabled = false,
  onRevoke,
}: {
  invitation: Invitation;
  revoking: boolean;
  disabled?: boolean;
  onRevoke?: (invitation: Invitation, trigger: HTMLButtonElement) => void;
}) {
  const eventLine =
    invitation.status === "used" && invitation.used_at
      ? `Usado em ${formatDate(invitation.used_at)}`
      : invitation.status === "revoked" && invitation.revoked_at
        ? `Revogado em ${formatDate(invitation.revoked_at)}`
        : null;

  return (
    <article className="invitation-item">
      <div className="invitation-status">
        <span className={`status invitation-${invitation.status}`}>
          {invitationStatusLabel(invitation.status)}
        </span>
        <div>
          <small>Criado em {formatDate(invitation.created_at)}</small>
          <small>Válido até {formatDate(invitation.expires_at)}</small>
          {eventLine ? <small>{eventLine}</small> : null}
        </div>
      </div>
      {invitation.status === "active" && onRevoke ? (
        <button
          className="danger-button compact-button"
          type="button"
          aria-label={`${revoking ? "Revogando…" : "Revogar"} convite criado em ${formatDate(invitation.created_at)} e válido até ${formatDate(invitation.expires_at)}`}
          onClick={(event) => onRevoke(invitation, event.currentTarget)}
          disabled={revoking || disabled}
        >
          {revoking ? "Revogando…" : "Revogar"}
        </button>
      ) : null}
    </article>
  );
}

function InvitationsView({
  invitations,
  loading,
  error,
  latestCode,
  creating,
  revokingIds,
  onCreate,
  onCopy,
  onHideCode,
  onRevoke,
  onRefresh,
}: {
  invitations: Invitation[];
  loading: boolean;
  error: string;
  latestCode: string;
  creating: boolean;
  revokingIds: Set<string>;
  onCreate: () => void;
  onCopy: () => Promise<void>;
  onHideCode: () => void;
  onRevoke: (invitation: Invitation, trigger: HTMLButtonElement) => void;
  onRefresh: () => void;
}) {
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState({ code: "", message: "" });
  const { active, history } = useMemo(() => splitInvitations(invitations), [invitations]);
  const visibleActive = showAllActive ? active : active.slice(0, 5);
  const visibleHistory = showAllHistory ? history : history.slice(0, 20);
  const copyMessage = copyFeedback.code === latestCode ? copyFeedback.message : "";

  async function copy() {
    try {
      await onCopy();
      setCopyFeedback({ code: latestCode, message: "Código copiado" });
    } catch {
      setCopyFeedback({
        code: latestCode,
        message:
          "Não foi possível copiar automaticamente. Selecione o código e copie manualmente.",
      });
    }
  }

  return (
    <section className="professional-section" aria-labelledby="invitations-title">
      <div className="section-heading professional-section-heading">
        <div>
          <p className="eyebrow">ACESSO POR CONVITE</p>
          <h2 id="invitations-title">Convites</h2>
          <p className="section-description">
            Cada código vale por 7 dias e pode ser usado uma única vez.
          </p>
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <section className="panel invitation-generator" aria-labelledby="new-invitation-title">
        <div>
          <p className="eyebrow">NOVO ACESSO</p>
          <h3 id="new-invitation-title">Convidar paciente</h3>
          <p>A conta será criada pelo próprio paciente, após receber o código.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={onCreate}
          disabled={creating || loading}
        >
          {creating ? "Gerando…" : "Gerar convite"}
        </button>
        {latestCode ? (
          <div className="generated-code">
            <span>Código recém-criado</span>
            <code>{latestCode}</code>
            <div className="generated-code-actions">
              <button className="secondary-button" type="button" onClick={() => void copy()}>
                Copiar código
              </button>
              <button className="quiet-button" type="button" onClick={onHideCode}>
                Ocultar código
              </button>
            </div>
            {copyMessage ? (
              <p
                className={copyMessage.startsWith("Código") ? "copy-success" : "copy-error"}
                role={copyMessage.startsWith("Código") ? "status" : "alert"}
                aria-live="polite"
              >
                {copyMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {error && invitations.length > 0 ? (
        <div className="panel error-state retained-data-warning">
          <Notice tone="error" message={error} />
          <p>Os convites já carregados continuam disponíveis abaixo.</p>
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar atualizar novamente
          </button>
        </div>
      ) : null}

      {error && invitations.length === 0 ? (
        <div className="panel error-state">
          <Notice tone="error" message={error} />
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar novamente
          </button>
        </div>
      ) : loading && invitations.length === 0 ? (
        <div className="panel loading-panel" role="status">
          <div className="loader" />
          <p>Carregando convites…</p>
        </div>
      ) : (
        <>
          <section className="invitation-section" aria-labelledby="active-invitations-title">
            <div className="subsection-heading">
              <h3 id="active-invitations-title" tabIndex={-1}>Convites ativos</h3>
              <span className="count">{active.length}</span>
            </div>
            {active.length === 0 ? (
              <div className="empty-state compact-empty">
                <h3>Nenhum convite ativo.</h3>
                <p>Gere um convite somente quando precisar cadastrar alguém.</p>
              </div>
            ) : (
              <div className="invitation-list">
                {visibleActive.map((invitation) => (
                  <InvitationItem
                    key={invitation.id}
                    invitation={invitation}
                    revoking={revokingIds.has(invitation.id)}
                    disabled={loading || creating}
                    onRevoke={onRevoke}
                  />
                ))}
              </div>
            )}
            {active.length > 5 ? (
              <button
                className="text-action list-toggle"
                type="button"
                onClick={() => setShowAllActive((current) => !current)}
              >
                {showAllActive ? "Mostrar menos" : `Mostrar todos (${active.length})`}
              </button>
            ) : null}
          </section>

          <details className="invitation-history">
            <summary>
              <span>Histórico de convites</span>
              <span className="count">{history.length}</span>
            </summary>
            {history.length === 0 ? (
              <p className="section-description">Nenhum convite no histórico.</p>
            ) : (
              <div className="invitation-list history-list">
                {visibleHistory.map((invitation) => (
                  <InvitationItem
                    key={invitation.id}
                    invitation={invitation}
                    revoking={false}
                  />
                ))}
                {history.length > 20 ? (
                  <button
                    className="text-action list-toggle"
                    type="button"
                    onClick={() => setShowAllHistory((current) => !current)}
                  >
                    {showAllHistory
                      ? "Mostrar menos convites"
                      : `Mostrar todo o histórico (${history.length})`}
                  </button>
                ) : null}
              </div>
            )}
          </details>
        </>
      )}
    </section>
  );
}

export function ProfessionalDashboard({
  user,
  csrf,
  accountPanel,
  onSessionLost,
}: ProfessionalDashboardProps) {
  const [privacyMode, setPrivacyMode] = useState(false);
  const [area, setArea] = useState<ProfessionalArea>("records");
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [activity, setActivity] = useState<ProfessionalActivity>({
    total_count: 0,
    shared_count: 0,
    private_count: 0,
  });
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsRefreshing, setPatientsRefreshing] = useState(false);
  const [patientsError, setPatientsError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PatientSort>("unread");
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [mapShares, setMapShares] = useState<SharedPatientMap[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesRefreshing, setEntriesRefreshing] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [viewingEntryIds, setViewingEntryIds] = useState<Set<string>>(new Set());
  const [viewingMapIds, setViewingMapIds] = useState<Set<string>>(new Set());
  const [patientAccesses, setPatientAccesses] = useState<PatientAccess[]>([]);
  const [patientAccessesLoaded, setPatientAccessesLoaded] = useState(false);
  const [patientAccessesLoading, setPatientAccessesLoading] = useState(false);
  const [patientAccessesError, setPatientAccessesError] = useState("");
  const [accessQuery, setAccessQuery] = useState("");
  const [updatingAccessIds, setUpdatingAccessIds] = useState<Set<string>>(
    new Set(),
  );
  const [recoveryPatient, setRecoveryPatient] = useState<PatientAccess | null>(null);
  const [issuingRecovery, setIssuingRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [issuedRecovery, setIssuedRecovery] = useState<IssuedRecovery | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsLoaded, setInvitationsLoaded] = useState(false);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState("");
  const [latestCode, setLatestCode] = useState("");
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(
    null,
  );

  const patientRequest = useRef<AbortController | null>(null);
  const patientRequestSequence = useRef(0);
  const viewingEntryLocks = useRef<Set<string>>(new Set());
  const viewingMapLocks = useRef<Set<string>>(new Set());
  const patientAccessRequestLock = useRef(false);
  const patientAccessUpdateLocks = useRef<Set<string>>(new Set());
  const recoveryRequestLock = useRef(false);
  const invitationsRequestLock = useRef(false);
  const createInvitationLock = useRef(false);
  const revokeInvitationLocks = useRef<Set<string>>(new Set());
  const privacyToggleRef = useRef<HTMLButtonElement>(null);
  const recoveryTriggerRef = useRef<HTMLButtonElement | null>(null);

  function restoreRecoveryTriggerFocus() {
    const trigger = recoveryTriggerRef.current;
    recoveryTriggerRef.current = null;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
      document.getElementById("patient-access-title")?.focus();
    });
  }

  const expireSession = useCallback(() => {
    patientRequest.current?.abort();
    setPatients([]);
    setActivity({ total_count: 0, shared_count: 0, private_count: 0 });
    setEntries([]);
    setMapShares([]);
    setViewingEntryIds(new Set());
    setViewingMapIds(new Set());
    setPatientAccesses([]);
    setInvitations([]);
    setLatestCode("");
    setRecoveryPatient(null);
    setIssuedRecovery(null);
    setNotice(null);
    onSessionLost();
  }, [onSessionLost]);

  const isSessionError = useCallback(
    (error: unknown) => {
      if (error instanceof PortalRequestError && error.status === 401) {
        expireSession();
        return true;
      }
      return false;
    },
    [expireSession],
  );

  const loadPatients = useCallback(
    async (refresh = false) => {
      if (refresh) setPatientsRefreshing(true);
      else setPatientsLoading(true);
      setPatientsError("");
      try {
        const result = await portalRequest<{
          patients: PatientSummary[];
          activity: ProfessionalActivity;
        }>("/professional/patients");
        setPatients(result.patients);
        setActivity(result.activity);
        setSelectedPatient((current) => {
          if (!current) return null;
          return (
            result.patients.find((patient) => patient.patient_id === current.patient_id) ??
            current
          );
        });
      } catch (error) {
        if (!isSessionError(error)) {
          setPatientsError(
            error instanceof Error
              ? error.message
              : "Não foi possível atualizar os registros.",
          );
        }
      } finally {
        setPatientsLoading(false);
        setPatientsRefreshing(false);
      }
    },
    [isSessionError],
  );

  const loadPatientEntries = useCallback(
    async (patient: PatientSummary, refresh = false) => {
      patientRequest.current?.abort();
      const controller = new AbortController();
      patientRequest.current = controller;
      const sequence = patientRequestSequence.current + 1;
      patientRequestSequence.current = sequence;
      if (refresh) setEntriesRefreshing(true);
      else {
        setEntries([]);
        setMapShares([]);
        setEntriesLoading(true);
      }
      setEntriesError("");
      try {
        const [entryResult, mapResult] = await Promise.allSettled([
          portalRequest<{ entries: SharedEntry[] }>(
            `/professional/patients/${encodeURIComponent(patient.patient_id)}/entries`,
            { signal: controller.signal },
          ),
          portalRequest<{ shares: SharedPatientMap[] }>(
            `/professional/patients/${encodeURIComponent(patient.patient_id)}/map-shares`,
            { signal: controller.signal },
          ),
        ]);
        if (controller.signal.aborted || sequence !== patientRequestSequence.current) {
          return;
        }

        const rejectedResults = [entryResult, mapResult].filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        const sessionFailure = rejectedResults.find((result) =>
          isSessionError(result.reason),
        );
        if (sessionFailure) return;

        if (entryResult.status === "fulfilled") {
          setEntries(entryResult.value.entries);
        }
        if (mapResult.status === "fulfilled") {
          setMapShares(mapResult.value.shares);
        }

        if (entryResult.status === "rejected" && mapResult.status === "rejected") {
          const firstReason = entryResult.reason;
          setEntriesError(
            firstReason instanceof Error
              ? firstReason.message
              : "Não foi possível carregar os conteúdos desta pessoa.",
          );
        } else if (entryResult.status === "rejected") {
          setEntriesError(
            `Os registros não puderam ser ${refresh ? "atualizados" : "carregados"}. As partes do mapa disponíveis continuam exibidas.`,
          );
        } else if (mapResult.status === "rejected") {
          setEntriesError(
            `As partes do mapa não puderam ser ${refresh ? "atualizadas" : "carregadas"}. Os registros disponíveis continuam exibidos.`,
          );
        }
      } catch (error) {
        if (controller.signal.aborted || sequence !== patientRequestSequence.current) {
          return;
        }
        if (!isSessionError(error)) {
          setEntriesError(
            error instanceof Error
              ? error.message
              : "Não foi possível atualizar os registros.",
          );
        }
      } finally {
        if (sequence === patientRequestSequence.current) {
          setEntriesLoading(false);
          setEntriesRefreshing(false);
        }
      }
    },
    [isSessionError],
  );

  const loadPatientAccesses = useCallback(async () => {
    if (patientAccessRequestLock.current) return;
    patientAccessRequestLock.current = true;
    setPatientAccessesLoading(true);
    setPatientAccessesError("");
    try {
      const result = await portalRequest<{ patients: PatientAccess[] }>(
        "/professional/accesses",
      );
      setPatientAccesses(result.patients);
      setPatientAccessesLoaded(true);
    } catch (error) {
      if (!isSessionError(error)) {
        setPatientAccessesError(
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar os acessos.",
        );
      }
    } finally {
      patientAccessRequestLock.current = false;
      setPatientAccessesLoading(false);
    }
  }, [isSessionError]);

  const loadInvitations = useCallback(async () => {
    if (invitationsRequestLock.current) return;
    invitationsRequestLock.current = true;
    setInvitationsLoading(true);
    setInvitationsError("");
    try {
      const result = await portalRequest<{ invitations: Invitation[] }>("/invitations");
      setInvitations(result.invitations);
      setInvitationsLoaded(true);
    } catch (error) {
      if (!isSessionError(error)) {
        setInvitationsError(
          error instanceof Error ? error.message : "Não foi possível atualizar os convites.",
        );
      }
    } finally {
      invitationsRequestLock.current = false;
      setInvitationsLoading(false);
    }
  }, [isSessionError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPatients();
    return () => patientRequest.current?.abort();
  }, [loadPatients]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (area === "accesses" && !patientAccessesLoaded) void loadPatientAccesses();
  }, [area, loadPatientAccesses, patientAccessesLoaded]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (area === "invitations") void loadInvitations();
  }, [area, loadInvitations]);

  useEffect(() => {
    if (area !== "invitations") return;
    const refreshVisibleInvitations = () => {
      if (document.visibilityState === "visible") void loadInvitations();
    };
    document.addEventListener("visibilitychange", refreshVisibleInvitations);
    return () =>
      document.removeEventListener("visibilitychange", refreshVisibleInvitations);
  }, [area, loadInvitations]);

  useEffect(() => {
    if (!latestCode) return;
    const hideCodeTimer = window.setTimeout(
      () => setLatestCode(""),
      LATEST_INVITATION_CODE_VISIBLE_MS,
    );
    return () => window.clearTimeout(hideCodeTimer);
  }, [latestCode]);

  function openPatient(patient: PatientSummary) {
    setSelectedPatient(patient);
    setNotice(null);
    void loadPatientEntries(patient);
    window.requestAnimationFrame(() =>
      document.getElementById("selected-patient-title")?.focus(),
    );
  }

  function backToPatients() {
    patientRequest.current?.abort();
    patientRequestSequence.current += 1;
    setSelectedPatient(null);
    setEntries([]);
    setMapShares([]);
    setEntriesError("");
    window.requestAnimationFrame(() =>
      document.getElementById("professional-patient-list-title")?.focus(),
    );
  }

  async function refreshSelectedPatient() {
    if (!selectedPatient) return;
    await loadPatientEntries(selectedPatient, true);
    await loadPatients(true);
  }

  async function markEntryViewed(entryId: string) {
    if (viewingEntryLocks.current.has(entryId)) return;
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !entry.is_unread) return;
    viewingEntryLocks.current.add(entryId);
    setViewingEntryIds((current) => new Set(current).add(entryId));
    setNotice(null);
    try {
      const result = await portalRequest<{ viewed_at: string }>(
        `/professional/entries/${encodeURIComponent(entryId)}/viewed`,
        { method: "POST", body: JSON.stringify({}) },
        csrf,
      );
      setEntries((current) =>
        current.map((item) =>
          item.id === entryId
            ? { ...item, is_unread: 0, viewed_at: result.viewed_at }
            : item,
        ),
      );
      if (selectedPatient) {
        const updatePatient = (patient: PatientSummary) =>
          patient.patient_id === selectedPatient.patient_id
            ? {
                ...patient,
                unread_count: Math.max(0, patient.unread_count - 1),
              }
            : patient;
        setPatients((current) => current.map(updatePatient));
        setSelectedPatient((current) =>
          current ? updatePatient(current) : current,
        );
      }
      setNotice({
        tone: "success",
        message:
          "Visualização confirmada. O paciente poderá ver essa confirmação no histórico.",
      });
    } catch (error) {
      if (!isSessionError(error)) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível guardar o estado de leitura.",
        });
      }
    } finally {
      viewingEntryLocks.current.delete(entryId);
      setViewingEntryIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
    }
  }

  async function markMapViewed(mapId: string) {
    if (!selectedPatient || viewingMapLocks.current.has(mapId)) return;
    const share = mapShares.find((item) => item.map_id === mapId);
    if (!share || !share.is_unread) return;
    viewingMapLocks.current.add(mapId);
    setViewingMapIds((current) => new Set(current).add(mapId));
    setNotice(null);
    try {
      const result = await portalRequest<{ viewed_at: string }>(
        `/professional/patients/${encodeURIComponent(selectedPatient.patient_id)}/map-shares/${encodeURIComponent(mapId)}/viewed`,
        { method: "POST", body: JSON.stringify({}) },
        csrf,
      );
      setMapShares((current) =>
        current.map((item) =>
          item.map_id === mapId
            ? { ...item, is_unread: 0, viewed_at: result.viewed_at }
            : item,
        ),
      );
      const updatePatient = (patient: PatientSummary) =>
        patient.patient_id === selectedPatient.patient_id
          ? {
              ...patient,
              unread_map_count: Math.max(0, patient.unread_map_count - 1),
            }
          : patient;
      setPatients((current) => current.map(updatePatient));
      setSelectedPatient((current) => (current ? updatePatient(current) : current));
      setNotice({
        tone: "success",
        message: "Visualização do mapa confirmada para o paciente.",
      });
    } catch (error) {
      if (!isSessionError(error)) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível confirmar a visualização do mapa.",
        });
      }
    } finally {
      viewingMapLocks.current.delete(mapId);
      setViewingMapIds((current) => {
        const next = new Set(current);
        next.delete(mapId);
        return next;
      });
    }
  }

  async function changePatientAccess(patient: PatientAccess, active: boolean) {
    if (patientAccessUpdateLocks.current.has(patient.patient_id)) return;
    const name = displayedPatientName(patient.patient_name);
    const confirmed = window.confirm(
      active
        ? `Restaurar o acesso de ${name}? A pessoa poderá entrar novamente com o mesmo e-mail e senha.`
        : `Revogar o acesso de ${name}? O login será bloqueado imediatamente e qualquer sessão aberta será encerrada. Os registros não serão apagados.`,
    );
    if (!confirmed) return;

    patientAccessUpdateLocks.current.add(patient.patient_id);
    setUpdatingAccessIds((current) => new Set(current).add(patient.patient_id));
    setNotice(null);
    try {
      await portalRequest(
        `/professional/patients/${encodeURIComponent(patient.patient_id)}/access`,
        {
          method: "PATCH",
          body: JSON.stringify({ active }),
        },
        csrf,
      );
      setNotice({
        tone: "success",
        message: active
          ? `Acesso de ${name} restaurado.`
          : `Acesso de ${name} revogado e sessões encerradas.`,
      });
      if (!active && selectedPatient?.patient_id === patient.patient_id) {
        backToPatients();
      }
      await Promise.all([loadPatientAccesses(), loadPatients(true)]);
    } catch (error) {
      if (!isSessionError(error)) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível alterar o acesso.",
        });
      }
    } finally {
      patientAccessUpdateLocks.current.delete(patient.patient_id);
      setUpdatingAccessIds((current) => {
        const next = new Set(current);
        next.delete(patient.patient_id);
        return next;
      });
    }
  }

  async function issuePatientRecovery(currentPassword: string, totp: string) {
    if (!recoveryPatient || recoveryRequestLock.current) return;
    recoveryRequestLock.current = true;
    setIssuingRecovery(true);
    setRecoveryError("");
    try {
      const result = await portalRequest<{
        recovery_code: string;
        expires_at: string;
      }>(
        `/professional/patients/${encodeURIComponent(recoveryPatient.patient_id)}/recovery-code`,
        {
          method: "POST",
          body: JSON.stringify({
            current_password: currentPassword,
            totp,
          }),
        },
        csrf,
      );
      const patientName = displayedPatientName(recoveryPatient.patient_name);
      setRecoveryPatient(null);
      setIssuedRecovery({
        patientName,
        code: result.recovery_code,
        expiresAt: result.expires_at,
      });
      setNotice({
        tone: "success",
        message: `Código temporário criado para ${patientName}. As sessões anteriores foram encerradas.`,
      });
    } catch (error) {
      if (!isSessionError(error)) {
        setRecoveryError(
          error instanceof Error
            ? error.message
            : "Não foi possível gerar o código de recuperação.",
        );
      }
    } finally {
      recoveryRequestLock.current = false;
      setIssuingRecovery(false);
    }
  }

  async function createInvitation() {
    if (createInvitationLock.current) return;
    createInvitationLock.current = true;
    setCreatingInvitation(true);
    setNotice(null);
    try {
      const result = await portalRequest<{ code: string; expires_at: string }>(
        "/invitations",
        { method: "POST", body: JSON.stringify({ valid_days: 7 }) },
        csrf,
      );
      setLatestCode(result.code);
      setNotice({
        tone: "success",
        message: "Convite criado. Envie o código ao paciente por um canal adequado.",
      });
      await loadInvitations();
    } catch (error) {
      if (!isSessionError(error)) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error ? error.message : "Não foi possível gerar o convite.",
        });
      }
    } finally {
      createInvitationLock.current = false;
      setCreatingInvitation(false);
    }
  }

  async function copyLatestCode() {
    if (!latestCode) throw new Error("Não há código para copiar.");
    await copyText(latestCode);
  }

  async function revokeInvitation(
    invitation: Invitation,
    trigger: HTMLButtonElement,
  ) {
    if (revokeInvitationLocks.current.has(invitation.id)) return;
    if (!window.confirm("Revogar este convite?")) return;
    const item = trigger.closest(".invitation-item");
    const adjacentAction =
      item?.nextElementSibling?.querySelector<HTMLButtonElement>("button") ??
      item?.previousElementSibling?.querySelector<HTMLButtonElement>("button") ??
      null;
    revokeInvitationLocks.current.add(invitation.id);
    setRevokingIds((current) => new Set(current).add(invitation.id));
    setNotice(null);
    let shouldRefresh = true;
    let shouldRestoreFocus = false;
    try {
      await portalRequest(`/invitations/${invitation.id}`, { method: "DELETE" }, csrf);
      setNotice({ tone: "success", message: "Convite revogado." });
      shouldRestoreFocus = true;
    } catch (error) {
      if (isSessionError(error)) {
        shouldRefresh = false;
      } else {
        setNotice({
          tone: "error",
          message:
            error instanceof Error ? error.message : "Não foi possível revogar o convite.",
        });
      }
    } finally {
      revokeInvitationLocks.current.delete(invitation.id);
      setRevokingIds((current) => {
        const next = new Set(current);
        next.delete(invitation.id);
        return next;
      });
      if (shouldRefresh) await loadInvitations();
      if (shouldRestoreFocus) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const focusTarget = adjacentAction?.isConnected
              ? adjacentAction
              : document.getElementById("active-invitations-title");
            focusTarget?.focus();
          });
        });
      }
    }
  }

  function showPrivacyMode() {
    patientRequest.current?.abort();
    patientRequestSequence.current += 1;
    setEntriesLoading(false);
    setEntriesRefreshing(false);
    setRecoveryPatient(null);
    setIssuedRecovery(null);
    setLatestCode("");
    setRecoveryError("");
    setNotice(null);
    setPrivacyMode(true);
    window.requestAnimationFrame(() => privacyToggleRef.current?.focus());
  }

  function hidePrivacyMode() {
    setPrivacyMode(false);
    if (selectedPatient) {
      void loadPatientEntries(
        selectedPatient,
        entries.length > 0 || mapShares.length > 0,
      );
    }
    window.requestAnimationFrame(() => privacyToggleRef.current?.focus());
  }

  if (privacyMode) {
    return (
      <main className="dashboard professional-dashboard privacy-mode" id="conteudo" tabIndex={-1}>
        <section className="dashboard-hero professional privacy-mode-hero">
          <div>
            <p className="eyebrow">MODO PRIVACIDADE ATIVO</p>
            <h1>Dados ocultos na tela.</h1>
            <p>
              Nomes, conteúdos, códigos, buscas e contagens individuais foram
              retirados da visualização.
            </p>
          </div>
          <button
            ref={privacyToggleRef}
            className="privacy-mode-toggle active"
            type="button"
            aria-label="Mostrar dados na tela"
            aria-pressed={true}
            onClick={hidePrivacyMode}
          >
            <span aria-hidden="true">◉</span>
            Mostrar dados na tela
          </button>
        </section>
        <section className="panel privacy-mode-placeholder" aria-labelledby="privacy-mode-title">
          <p className="eyebrow">PROTEÇÃO VISUAL</p>
          <h2 id="privacy-mode-title">A estrutura continua aqui, sem informações sensíveis.</h2>
          <p>
            Mostre os dados somente quando estiver em um ambiente adequado. O
            modo privacidade não encerra sua sessão e não altera nenhuma
            informação.
          </p>
          <div aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  const unreadEntryCount = patients.reduce(
    (total, patient) =>
      total + patient.unread_count + (patient.unread_map_count ?? 0),
    0,
  );
  const activePatientCount = patientAccessesLoaded
    ? patientAccesses.filter((patient) => patient.access_status === "active").length
    : null;
  const activeInvitationCount = invitationsLoaded
    ? splitInvitations(invitations).active.length
    : null;

  return (
    <main className="dashboard professional-dashboard" id="conteudo" tabIndex={-1}>
      <section className="dashboard-hero professional">
        <div>
          <p className="eyebrow">ACESSO PROFISSIONAL</p>
          <h1>Olá, {user.name}.</h1>
          <p>Aqui aparecem somente os registros e as partes do mapa que cada paciente decidiu compartilhar.</p>
        </div>
        <div className="professional-privacy-controls">
          <span className="secure-chip">MFA ativo</span>
          <button
            ref={privacyToggleRef}
            className="privacy-mode-toggle"
            type="button"
            aria-label="Ocultar dados na tela"
            aria-pressed={false}
            onClick={showPrivacyMode}
          >
            <span aria-hidden="true">⊘</span>
            Ocultar dados na tela
          </button>
        </div>
      </section>

      <ProfessionalNavigation
        area={area}
        unreadEntryCount={unreadEntryCount}
        activePatientCount={activePatientCount}
        activeInvitationCount={activeInvitationCount}
        onChange={(nextArea) => {
          if (nextArea !== "invitations") setLatestCode("");
          setArea(nextArea);
          setNotice(null);
        }}
      />

      {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}

      {area === "records" ? (
        selectedPatient ? (
          <PatientRecordsView
            key={selectedPatient.patient_id}
            patient={selectedPatient}
            entries={entries}
            mapShares={mapShares}
            loading={entriesLoading}
            refreshing={entriesRefreshing}
            error={entriesError}
            viewingIds={viewingEntryIds}
            viewingMapIds={viewingMapIds}
            onBack={backToPatients}
            onRefresh={() => void refreshSelectedPatient()}
            onViewed={(entryId) => void markEntryViewed(entryId)}
            onMapViewed={(mapId) => void markMapViewed(mapId)}
          />
        ) : (
          <PatientList
            patients={patients}
            activity={activity}
            loading={patientsLoading}
            refreshing={patientsRefreshing}
            error={patientsError}
            query={query}
            sort={sort}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onRefresh={() => void loadPatients(true)}
            onOpen={openPatient}
          />
        )
      ) : area === "accesses" ? (
        <PatientAccessView
          patients={patientAccesses}
          loading={patientAccessesLoading}
          error={patientAccessesError}
          query={accessQuery}
          updatingIds={updatingAccessIds}
          onQueryChange={setAccessQuery}
          onRefresh={() => void loadPatientAccesses()}
          onChangeAccess={(patient, active) =>
            void changePatientAccess(patient, active)
          }
          onGenerateRecovery={(patient, trigger) => {
            recoveryTriggerRef.current = trigger;
            setRecoveryError("");
            setIssuedRecovery(null);
            setRecoveryPatient(patient);
          }}
        />
      ) : (
        <InvitationsView
          invitations={invitations}
          loading={invitationsLoading}
          error={invitationsError}
          latestCode={latestCode}
          creating={creatingInvitation}
          revokingIds={revokingIds}
          onCreate={() => void createInvitation()}
          onCopy={copyLatestCode}
          onHideCode={() => setLatestCode("")}
          onRevoke={(invitation, trigger) =>
            void revokeInvitation(invitation, trigger)
          }
          onRefresh={() => void loadInvitations()}
        />
      )}

      {accountPanel}
      {recoveryPatient ? (
        <RecoveryAuthorizationDialog
          patient={recoveryPatient}
          busy={issuingRecovery}
          error={recoveryError}
          onClose={() => {
            if (issuingRecovery) return;
            setRecoveryPatient(null);
            setRecoveryError("");
            restoreRecoveryTriggerFocus();
          }}
          onSubmit={(currentPassword, totp) =>
            void issuePatientRecovery(currentPassword, totp)
          }
        />
      ) : null}
      {issuedRecovery ? (
        <IssuedRecoveryDialog
          recovery={issuedRecovery}
          onClose={() => {
            setIssuedRecovery(null);
            restoreRecoveryTriggerFocus();
          }}
        />
      ) : null}
    </main>
  );
}
