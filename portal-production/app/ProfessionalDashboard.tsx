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
  type Invitation,
  type PatientAccess,
  type PatientSort,
  type PatientSummary,
  type ProfessionalArea,
  type SharedEntry,
  sharedCountLabel,
  splitInvitations,
  unreadCountLabel,
} from "./professional-dashboard-data";
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

function Notice({ message, tone = "info" }: { message: string; tone?: NoticeTone }) {
  return (
    <p
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
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
          <span>Novo código do seu autenticador</span>
          <input
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
          <small>Se acabou de entrar, aguarde o próximo código de 6 dígitos.</small>
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(recovery.code);
    setCopied(true);
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
            <h2 id="issued-recovery-title">
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
            {copied ? "Código copiado" : "Copiar código"}
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            Já entreguei ou guardei
          </button>
        </div>
        <p className="sr-status" role="status" aria-live="polite">
          {copied ? "Código de recuperação copiado." : ""}
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
      label: "Registros compartilhados",
      count: unreadEntryCount,
      countLabel: (count) =>
        `${count} ${count === 1 ? "registro não visto" : "registros não vistos"}`,
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
  const [openedUnread, setOpenedUnread] = useState(false);
  const unread = Boolean(entry.is_unread);
  const details = [
    ["O que aconteceu", entry.happened],
    ["Percepções no corpo", entry.body],
    ["Pensamentos", entry.thoughts],
    ["Vontade de agir", entry.urge],
    ["Para levar à sessão", entry.message],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <details
      className={`professional-record-disclosure${unread ? " is-unread" : ""}`}
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen && unread) setOpenedUnread(true);
        if (!nextOpen && openedUnread && unread && !viewing) {
          setOpenedUnread(false);
          onViewed(entry.id);
        }
      }}
    >
      <summary>
        <span className="record-summary-main">
          <span
            className={`record-view-state ${unread ? "unread" : "viewed"}`}
          >
            {viewing
              ? "Salvando leitura…"
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
          <span className="when-open">Concluir leitura</span>
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
          {unread ? " Ao concluir a leitura, este registro será marcado como visto." : ""}
        </p>
      </div>
    </details>
  );
}

function PatientList({
  patients,
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
  const visiblePatients = useMemo(
    () => filterAndSortPatients(patients, query, sort),
    [patients, query, sort],
  );

  return (
    <section
      className="professional-section"
      aria-labelledby="professional-patient-list-title"
    >
      <div className="section-heading professional-section-heading">
        <div>
          <p className="eyebrow">COMPARTILHADOS COM VOCÊ</p>
          <h2 id="professional-patient-list-title" tabIndex={-1}>
            Pacientes com registros
          </h2>
          <p className="section-description">
            Somente pessoas com algum registro compartilhado neste momento.
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

      <div className="professional-tools">
        <label className="field search-field">
          <span>Buscar paciente</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            autoComplete="off"
            placeholder="Digite parte do nome"
          />
        </label>
        <label className="field sort-field">
          <span>Ordenar por</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as PatientSort)}
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

      {loading ? (
        <div className="panel loading-panel" role="status">
          <div className="loader" />
          <p>Carregando registros compartilhados…</p>
        </div>
      ) : error ? (
        <div className="panel error-state">
          <Notice tone="error" message={error} />
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar novamente
          </button>
        </div>
      ) : patients.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum registro compartilhado agora.</h3>
          <p>Registros privados não aparecem aqui.</p>
        </div>
      ) : visiblePatients.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum paciente encontrado com esse nome.</h3>
          <p>A busca considera somente o nome exibido.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onQueryChange("")}
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <div className="patient-summary-list">
          {visiblePatients.map((patient) => (
            <article className="patient-summary-card" key={patient.patient_id}>
              <div className="patient-summary-copy">
                <h3>{displayedPatientName(patient.patient_name)}</h3>
                <p className="patient-summary-count">
                  {sharedCountLabel(patient.shared_count)}
                </p>
                <p
                  className={`patient-summary-view-count${
                    patient.unread_count > 0 ? " has-unread" : ""
                  }`}
                >
                  {unreadCountLabel(patient.unread_count)}
                </p>
                <p className="record-meta">
                  Último compartilhamento: {formatDate(patient.latest_shared_at)}
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onOpen(patient)}
              >
                {patient.unread_count > 0 ? "Ver pendentes" : "Abrir registros"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PatientRecordsView({
  patient,
  entries,
  loading,
  refreshing,
  error,
  viewingIds,
  onBack,
  onRefresh,
  onViewed,
}: {
  patient: PatientSummary;
  entries: SharedEntry[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  viewingIds: Set<string>;
  onBack: () => void;
  onRefresh: () => void;
  onViewed: (entryId: string) => void;
}) {
  const [viewFilter, setViewFilter] = useState<EntryViewFilter>("all");
  const unreadCount = entries.filter((entry) => Boolean(entry.is_unread)).length;
  const viewedCount = entries.length - unreadCount;
  const visibleEntries = entries.filter((entry) => {
    if (viewFilter === "unread") return Boolean(entry.is_unread);
    if (viewFilter === "viewed") return !entry.is_unread;
    return true;
  });

  return (
    <section className="professional-section" aria-labelledby="selected-patient-title">
      <button className="back-button" type="button" onClick={onBack}>
        ← Voltar aos pacientes
      </button>
      <div className="section-heading professional-section-heading patient-detail-heading">
        <div>
          <p className="eyebrow">REGISTROS COMPARTILHADOS</p>
          <h2 id="selected-patient-title" tabIndex={-1}>
            {displayedPatientName(patient.patient_name)}
          </h2>
          <p className="section-description">
            {loading
              ? "Consultando os registros autorizados…"
              : `${sharedCountLabel(entries.length)} · ${unreadCountLabel(unreadCount)}`}
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
        {refreshing ? "Atualizando os registros compartilhados." : ""}
      </div>

      {!loading && !error && entries.length > 0 ? (
        <div
          className="entry-view-toolbar"
          role="group"
          aria-label="Filtrar registros por leitura"
        >
          {([
            ["all", "Todos", entries.length],
            ["unread", "Não vistos", unreadCount],
            ["viewed", "Vistos", viewedCount],
          ] as Array<[EntryViewFilter, string, number]>).map(
            ([value, label, count]) => (
              <button
                key={value}
                className={viewFilter === value ? "active" : ""}
                type="button"
                aria-pressed={viewFilter === value}
                onClick={() => setViewFilter(value)}
              >
                <span>{label}</span>
                <small>{count}</small>
              </button>
            ),
          )}
        </div>
      ) : null}

      {loading ? (
        <div className="panel loading-panel" role="status">
          <div className="loader" />
          <p>Carregando os registros desta pessoa…</p>
        </div>
      ) : error ? (
        <div className="panel error-state">
          <Notice tone="error" message={error} />
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Tentar novamente
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <h3>Este paciente não possui mais registros compartilhados.</h3>
          <p>O compartilhamento pode ter sido retirado ou o registro excluído.</p>
          <button className="secondary-button" type="button" onClick={onBack}>
            Voltar aos pacientes
          </button>
        </div>
      ) : visibleEntries.length === 0 ? (
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
              onViewed={onViewed}
            />
          ))}
        </div>
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
  onGenerateRecovery: (patient: PatientAccess) => void;
}) {
  const visiblePatients = useMemo(
    () => filterPatientAccesses(patients, query),
    [patients, query],
  );
  const activeCount = patients.filter(
    (patient) => patient.access_status === "active",
  ).length;

  return (
    <section className="professional-section" aria-labelledby="patient-access-title">
      <div className="section-heading professional-section-heading">
        <div>
          <p className="eyebrow">CONTROLE DE ACESSO</p>
          <h2 id="patient-access-title">Acessos de pacientes</h2>
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
          onChange={(event) => onQueryChange(event.target.value)}
          autoComplete="off"
          placeholder="Digite parte do nome"
        />
      </label>

      {error ? (
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
            onClick={() => onQueryChange("")}
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <div className="patient-access-list">
          {visiblePatients.map((patient) => {
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
                      onClick={() => onGenerateRecovery(patient)}
                      disabled={updating || loading}
                    >
                      Gerar recuperação
                    </button>
                  ) : null}
                  <button
                    className={active ? "danger-button" : "secondary-button"}
                    type="button"
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
  onRevoke?: (invitation: Invitation) => void;
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
          onClick={() => onRevoke(invitation)}
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
  onRevoke: (invitation: Invitation) => void;
  onRefresh: () => void;
}) {
  const [showAllActive, setShowAllActive] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState({ code: "", message: "" });
  const { active, history } = useMemo(() => splitInvitations(invitations), [invitations]);
  const visibleActive = showAllActive ? active : active.slice(0, 5);
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

      {error ? (
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
              <h3 id="active-invitations-title">Convites ativos</h3>
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
                {history.map((invitation) => (
                  <InvitationItem
                    key={invitation.id}
                    invitation={invitation}
                    revoking={false}
                  />
                ))}
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
  const [area, setArea] = useState<ProfessionalArea>("records");
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsRefreshing, setPatientsRefreshing] = useState(false);
  const [patientsError, setPatientsError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PatientSort>("unread");
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesRefreshing, setEntriesRefreshing] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [viewingEntryIds, setViewingEntryIds] = useState<Set<string>>(new Set());
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
  const patientAccessRequestLock = useRef(false);
  const patientAccessUpdateLocks = useRef<Set<string>>(new Set());
  const invitationsRequestLock = useRef(false);
  const createInvitationLock = useRef(false);
  const revokeInvitationLocks = useRef<Set<string>>(new Set());

  const expireSession = useCallback(() => {
    patientRequest.current?.abort();
    setPatients([]);
    setEntries([]);
    setViewingEntryIds(new Set());
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
        const result = await portalRequest<{ patients: PatientSummary[] }>(
          "/professional/patients",
        );
        setPatients(result.patients);
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
        setEntriesLoading(true);
      }
      setEntriesError("");
      try {
        const result = await portalRequest<{ entries: SharedEntry[] }>(
          `/professional/patients/${encodeURIComponent(patient.patient_id)}/entries`,
          { signal: controller.signal },
        );
        if (sequence !== patientRequestSequence.current) return;
        setEntries(result.entries);
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
    if (area === "invitations" && !invitationsLoaded) void loadInvitations();
  }, [area, invitationsLoaded, loadInvitations]);

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
    if (!recoveryPatient || issuingRecovery) return;
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
    await navigator.clipboard.writeText(latestCode);
  }

  async function revokeInvitation(invitation: Invitation) {
    if (revokeInvitationLocks.current.has(invitation.id)) return;
    if (!window.confirm("Revogar este convite?")) return;
    revokeInvitationLocks.current.add(invitation.id);
    setRevokingIds((current) => new Set(current).add(invitation.id));
    setNotice(null);
    let shouldRefresh = true;
    try {
      await portalRequest(`/invitations/${invitation.id}`, { method: "DELETE" }, csrf);
      setNotice({ tone: "success", message: "Convite revogado." });
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
    }
  }

  const unreadEntryCount = patients.reduce(
    (total, patient) => total + patient.unread_count,
    0,
  );
  const activePatientCount = patientAccessesLoaded
    ? patientAccesses.filter((patient) => patient.access_status === "active").length
    : null;
  const activeInvitationCount = invitationsLoaded
    ? splitInvitations(invitations).active.length
    : null;

  return (
    <main className="dashboard professional-dashboard" id="conteudo">
      <section className="dashboard-hero professional">
        <div>
          <p className="eyebrow">ACESSO PROFISSIONAL</p>
          <h1>Olá, {user.name}.</h1>
          <p>Aqui aparecem somente os registros que cada paciente decidiu compartilhar.</p>
        </div>
        <span className="secure-chip">MFA ativo</span>
      </section>

      <ProfessionalNavigation
        area={area}
        unreadEntryCount={unreadEntryCount}
        activePatientCount={activePatientCount}
        activeInvitationCount={activeInvitationCount}
        onChange={(nextArea) => {
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
            loading={entriesLoading}
            refreshing={entriesRefreshing}
            error={entriesError}
            viewingIds={viewingEntryIds}
            onBack={backToPatients}
            onRefresh={() => void refreshSelectedPatient()}
            onViewed={(entryId) => void markEntryViewed(entryId)}
          />
        ) : (
          <PatientList
            patients={patients}
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
          onGenerateRecovery={(patient) => {
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
          onRevoke={(invitation) => void revokeInvitation(invitation)}
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
          }}
          onSubmit={(currentPassword, totp) =>
            void issuePatientRecovery(currentPassword, totp)
          }
        />
      ) : null}
      {issuedRecovery ? (
        <IssuedRecoveryDialog
          recovery={issuedRecovery}
          onClose={() => setIssuedRecovery(null)}
        />
      ) : null}
    </main>
  );
}
