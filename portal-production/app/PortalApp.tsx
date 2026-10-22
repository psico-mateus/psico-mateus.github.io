"use client";

import {
  FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppUpdateManager } from "./AppUpdateManager";
import { PatientNotices } from "./PatientNotices";
import { PatientHomeActions, PatientQuickRecordAction } from "./PatientHomeActions";
import "./patient-home.css";
import "./patient-record-editor.css";
import "./patient-account.css";
import { copyText } from "./copy-text";
import { InstallAppButton } from "./InstallAppButton";
import {
  PatientMapShell,
} from "./PatientMapShell";
import {
  type PatientMapDraftRecoverySnapshot,
  usePatientMapDraft,
} from "./patient-map-draft-client";
import { PatientResources } from "./PatientResources";
import { findPatientTool } from "../content/patient-tools-catalog";
import {
  patientHashForRoute,
  patientRouteFromHash,
  type PatientArea,
  type PatientResourceView,
  type PatientRoute,
} from "./patient-navigation";
import { ProfessionalDashboard } from "./ProfessionalDashboard";
import {
  ThoughtReviewEditor,
  type ThoughtReviewEditorSnapshot,
} from "./ThoughtReview";
import { type ThoughtReview } from "./thought-review";
import {
  createPatientRecordRecoverySnapshot,
  getPatientRecordRecovery,
  resolvePatientEntryRecovery,
  type PatientEntry as Entry,
  type PatientEntryDraft as EntryDraft,
  type PatientEntryReturn as EntryReturn,
  type PatientEntryEditorRecovery,
  type PatientRecordDraftRecoverySnapshot,
} from "./patient-record-recovery";
import { PatientRecoveredDrafts } from "./PatientRecoveredDrafts";
import {
  filterAndSortPatientEntries,
  groupPatientEntriesByMonth,
  patientEntryViewStatus,
  patientEntryViewSummary,
  isEntryShared,
  remainingCharactersNearLimit,
  type PatientEntrySharingFilter,
  type PatientEntrySort,
} from "./patient-dashboard-data";
import {
  PortalRequestError,
  formatDate,
  formatViewTimestamp,
  portalRequest,
  subscribeToSlowPortalMutations,
} from "./portal-client";

type Role = "patient" | "therapist";
type User = { id: string; name: string; role: Role };
type Config = {
  configured: boolean;
  pending: boolean;
  public_site_url: string;
  guide_url: string;
  care_url: string;
  privacy_version: string;
};

function isSessionExpiredError(error: unknown): boolean {
  return error instanceof PortalRequestError && error.status === 401;
}

function entrySaveErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Não foi possível salvar agora.";
  if (isSessionExpiredError(error)) {
    return `${message} O que você escreveu continua nesta tela por enquanto. Copie o texto antes de recarregar e entre novamente.`;
  }
  if (error instanceof PortalRequestError && error.status === 409) {
    return `${message} O que você escreveu continua nesta tela.`;
  }
  return `${message} O que você escreveu continua nesta tela. Tente salvar novamente quando puder.`;
}
type PatientNavigationMode = "push" | "replace" | "return";
type PatientHistoryState = {
  patientNavigation: true;
  from: string;
};

const blankEntry: EntryDraft = {
  title: "",
  happened: "",
  body: "",
  thoughts: "",
  urge: "",
  emotion: "",
  intensity: 5,
  message: "",
};

const PATIENT_ENTRIES_AUTO_REFRESH_INTERVAL_MS = 60_000;

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = false,
  hint,
  passwordRequirements = false,
  inputMode,
  autoCapitalize,
  spellCheck,
  maxLength,
  invalid = false,
  errorId,
  onValueChange,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  passwordRequirements?: boolean;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  autoCapitalize?: string;
  spellCheck?: boolean;
  maxLength?: number;
  invalid?: boolean;
  errorId?: string;
  onValueChange?: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const requirementsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isPassword = type === "password";
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const describedBy = [
    hint ? hintId : "",
    passwordRequirements ? requirementsId : "",
    invalid ? errorId : "",
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  const requirements = passwordRequirements
    ? [
        { label: "12 caracteres; espaços também contam", met: typedValue.length >= 12 },
        { label: "pelo menos uma letra", met: /[A-Za-zÀ-ÿ]/u.test(typedValue) },
        { label: "pelo menos um número", met: /\d/u.test(typedValue) },
      ]
    : [];
  const metRequirementCount = requirements.filter((requirement) => requirement.met).length;

  useEffect(() => {
    if (!passwordRequirements) return;
    const form = inputRef.current?.form;
    if (!form) return;
    const clearRequirements = () => {
      setTypedValue("");
      setPasswordVisible(false);
    };
    form.addEventListener("reset", clearRequirements);
    return () => form.removeEventListener("reset", clearRequirements);
  }, [passwordRequirements]);

  return (
    <div className="field">
      <label htmlFor={inputId}><span>{label}</span></label>
      <div className={isPassword ? "password-input-control" : undefined}>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type={isPassword && passwordVisible ? "text" : type}
          autoComplete={autoComplete}
          required={required}
          minLength={passwordRequirements ? 12 : undefined}
          maxLength={isPassword ? 128 : maxLength}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          inputMode={inputMode}
          autoCapitalize={isPassword ? "none" : autoCapitalize}
          spellCheck={isPassword ? false : spellCheck}
          onChange={(event) => {
            if (passwordRequirements) setTypedValue(event.target.value);
            onValueChange?.();
          }}
        />
        {isPassword ? (
          <button
            className="password-visibility-button"
            type="button"
            aria-controls={inputId}
            aria-pressed={passwordVisible}
            aria-label={`${passwordVisible ? "Ocultar" : "Mostrar"} ${label.toLocaleLowerCase("pt-BR")}`}
            onClick={() => setPasswordVisible((current) => !current)}
          >
            {passwordVisible ? "Ocultar" : "Mostrar"}
          </button>
        ) : null}
      </div>
      {hint ? <small id={hintId}>{hint}</small> : null}
      {passwordRequirements ? (
        <>
          <ul className="password-requirements" id={requirementsId}>
            {requirements.map((requirement) => (
              <li className={requirement.met ? "met" : ""} key={requirement.label}>
                <span aria-hidden="true">{requirement.met ? "✓" : "○"}</span>
                {requirement.label}
                <span className="sr-status">
                  {requirement.met ? " — requisito atendido" : " — ainda falta atender"}
                </span>
              </li>
            ))}
          </ul>
          <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
            {typedValue
              ? `${metRequirementCount} de ${requirements.length} requisitos da senha atendidos.`
              : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}

function Notice({
  id,
  message,
  tone = "info",
  focusOnMount = tone === "error",
}: {
  id?: string;
  message: string;
  tone?: "info" | "error" | "success";
  focusOnMount?: boolean;
}) {
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (focusOnMount) noticeRef.current?.focus();
  }, [focusOnMount, message]);
  return (
    <p
      id={id}
      ref={noticeRef}
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-atomic="true"
      tabIndex={focusOnMount ? -1 : undefined}
    >
      {message}
    </p>
  );
}

function SlowMutationStatus() {
  const [pending, setPending] = useState(false);
  useEffect(() => subscribeToSlowPortalMutations(setPending), []);
  if (!pending) return null;
  return (
    <div className="slow-mutation-status">
      <Notice
        tone="info"
        focusOnMount={false}
        message="A ação está demorando mais que o normal. Mantenha esta tela aberta e não toque novamente no botão. Ela pode ainda estar sendo concluída."
      />
    </div>
  );
}

function Header({
  config,
  user,
  onLogout,
  logoutBusy = false,
}: {
  config: Config;
  user?: User | null;
  onLogout?: () => void;
  logoutBusy?: boolean;
}) {
  return (
    <header className="site-header">
      {/* A navegação completa mantém o aviso nativo de alterações não salvas. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="brand" href="/" aria-label="Início da Área do paciente">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width="48" height="48" />
        <span><strong>Área do paciente</strong><small>Mateus Ribeiro Marcos · Psicólogo</small></span>
      </a>
      <nav className="top-links" aria-label="Links principais">
        <a href={config.public_site_url} target="_blank" rel="noopener noreferrer">
          Site profissional<span className="sr-status"> (abre em nova aba)</span>
        </a>
        <a href={config.guide_url} target="_blank" rel="noopener noreferrer">
          Guia de Emoções<span className="sr-status"> (abre em nova aba)</span>
        </a>
        {user?.role !== "therapist" ? <InstallAppButton /> : null}
        {user && onLogout ? (
          <button
            type="button"
            className="link-button logout-link"
            onClick={onLogout}
            disabled={logoutBusy}
          >
            {logoutBusy ? "Saindo…" : "Sair"}
          </button>
        ) : null}
      </nav>
    </header>
  );
}

function RecoveryCard({ code, onClose }: { code: string; onClose: () => void }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else {
        document.getElementById("conteudo")?.focus();
      }
    };
  }, []);
  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  async function copy() {
    try {
      await copyText(code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-description"
        onKeyDown={keepFocusInside}
      >
        <p className="eyebrow">GUARDE AGORA</p>
        <h2 id="recovery-title" ref={titleRef} tabIndex={-1}>Seu código de recuperação</h2>
        <p id="recovery-description">Com ele, você pode redefinir sua senha por conta própria. Guarde em um local seguro. Se perdê-lo, peça a Mateus uma recuperação assistida. O código anterior deixa de funcionar.</p>
        <code className="secret-code">{code}</code>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={() => void copy()}>{copyStatus === "copied" ? "Copiado" : "Copiar código"}</button>
          <button className="primary-button" type="button" onClick={onClose}>Já guardei</button>
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
      </section>
    </div>
  );
}

type MfaTransferDetails = {
  secret: string;
  ticket: string;
  expiresAt: string;
};

type MfaRecoveryCodeStatus = {
  remaining: number;
  total: number;
  generatedAt: string | null;
};

type ProfessionalMfaRecoveryDetails = {
  secret: string;
  ticket: string;
  expiresAt: string;
};

function downloadPrivateTextFile(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function RecoveryCodesCard({
  codes,
  onClose,
}: {
  codes: string[];
  onClose: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const text = codes.join("\n");

  const requestClose = useCallback(() => {
    const confirmed = window.confirm(
      "Depois de fechar, estes códigos não serão mostrados novamente. Confirma que já guardou uma cópia segura?",
    );
    if (confirmed) onClose();
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    }
    function restoreDialogFocus(event: FocusEvent) {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) {
        // WebKit can focus the background ancestor on pointerdown. Keep the
        // scroll position so the matching pointerup still hits the button.
        titleRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("focusin", restoreDialogFocus);
    document.body.classList.add("recovery-codes-open");
    titleRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("focusin", restoreDialogFocus);
      document.body.classList.remove("recovery-codes-open");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [requestClose]);

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href]",
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === titleRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function copyAll() {
    try {
      await copyText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  function download() {
    const confirmed = window.confirm(
      "O arquivo dará acesso de emergência à sua conta. Baixe somente em um dispositivo particular e guarde-o separado da sua senha. Continuar?",
    );
    if (!confirmed) return;
    downloadPrivateTextFile(
      "codigos-emergenciais-area-do-paciente.txt",
      `Códigos emergenciais do autenticador — Área do paciente\n\n${text}\n\nCada código funciona uma única vez. Guarde separado da sua senha.\n`,
    );
  }

  function print() {
    const confirmed = window.confirm(
      "Imprima somente em uma impressora particular. Não salve como PDF compartilhado e guarde a folha separada da sua senha. Continuar?",
    );
    if (confirmed) window.print();
  }

  return (
    <div className="modal-backdrop recovery-codes-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="modal recovery-codes-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-codes-title"
        aria-describedby="recovery-codes-description"
        onKeyDown={keepFocusInside}
      >
        <header className="recovery-codes-heading">
          <div>
            <p className="eyebrow">GUARDE AGORA</p>
            <h2 id="recovery-codes-title" ref={titleRef} tabIndex={-1}>
              Seus códigos emergenciais
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={requestClose}
            aria-label="Fechar códigos emergenciais"
          >
            ×
          </button>
        </header>
        <p id="recovery-codes-description" className="recovery-codes-intro">
          Use um deles se perder o celular ou ficar sem o aplicativo autenticador.
          Cada código funciona uma única vez e esta lista só aparece agora.
        </p>
        <Notice
          tone="info"
          message="Guarde os códigos em um lugar privado e separado da sua senha. Quem tiver a senha e um destes códigos poderá entrar no painel profissional."
        />
        <ol className="recovery-codes-list" aria-label="Oito códigos emergenciais">
          {codes.map((code, index) => (
            <li key={`${index}-${code}`}>
              <span aria-hidden="true">{index + 1}</span>
              <code>{code}</code>
            </li>
          ))}
        </ol>
        <div className="button-row recovery-codes-actions">
          <button className="secondary-button" type="button" onClick={() => void copyAll()}>
            {copyStatus === "copied" ? "Códigos copiados" : "Copiar todos"}
          </button>
          <button className="secondary-button" type="button" onClick={download}>
            Baixar arquivo TXT
          </button>
          <button className="quiet-button" type="button" onClick={print}>
            Imprimir cópia privada
          </button>
        </div>
        <p
          className={copyStatus === "error" ? "copy-error" : "sr-status"}
          role={copyStatus === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {copyStatus === "copied"
            ? "Todos os códigos emergenciais foram copiados."
            : copyStatus === "error"
              ? "O navegador bloqueou a cópia. Selecione os códigos e copie manualmente."
              : ""}
        </p>
        <button className="primary-button recovery-codes-done" type="button" onClick={onClose}>
          Já guardei em segurança
        </button>
        <p className="recovery-codes-print-note">
          Cópia privada de emergência. Cada código funciona uma única vez. Mantenha esta lista separada da senha.
        </p>
      </section>
    </div>
  );
}

function ProfessionalMfaRecovery({
  onClose,
  onRecovered,
}: {
  onClose: () => void;
  onRecovered: (user: User, csrf: string, recoveryCodes: string[]) => void;
}) {
  const [details, setDetails] = useState<ProfessionalMfaRecoveryDetails | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestInFlight = useRef(false);

  const requestClose = useCallback(() => {
    if (!details) {
      onClose();
      return;
    }
    const confirmed = window.confirm(
      "Se fechar agora, a nova chave deixará de aparecer. Sua conta atual não será alterada. Deseja sair desta recuperação?",
    );
    if (confirmed) onClose();
  }, [details, onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    }
    function restoreDialogFocus(event: FocusEvent) {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) {
        titleRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("focusin", restoreDialogFocus);
    document.body.classList.add("professional-mfa-recovery-open");
    titleRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("focusin", restoreDialogFocus);
      document.body.classList.remove("professional-mfa-recovery-open");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [requestClose]);

  useEffect(() => {
    if (!details) return;
    const remaining = Date.parse(details.expiresAt) - Date.now();
    const timeout = window.setTimeout(() => {
      setDetails(null);
      setCopyStatus("idle");
      setMessageTone("info");
      setMessage(
        "O tempo desta tentativa terminou. Nada foi alterado. Use um novo código emergencial para começar de novo.",
      );
      window.requestAnimationFrame(() => titleRef.current?.focus());
    }, Math.max(0, remaining));
    return () => window.clearTimeout(timeout);
  }, [details]);

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === titleRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    requestInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await portalRequest<{
        ticket: string;
        totp_secret: string;
        expires_at: string;
      }>("/recover/mfa/start", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          recovery_code: form.get("recovery_code"),
        }),
      });
      formElement.reset();
      setCopyStatus("idle");
      setDetails({
        secret: result.totp_secret,
        ticket: result.ticket,
        expiresAt: result.expires_at,
      });
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } catch (error) {
      setMessageTone("error");
      setMessage((error as Error).message);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details || requestInFlight.current) return;
    const form = new FormData(event.currentTarget);
    requestInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await portalRequest<{
        user: User;
        csrf: string;
        recovery_codes: string[];
      }>("/recover/mfa/confirm", {
        method: "POST",
        body: JSON.stringify({ ticket: details.ticket, totp: form.get("totp") }),
      });
      setDetails(null);
      onRecovered(result.user, result.csrf, result.recovery_codes);
    } catch (error) {
      setMessageTone("error");
      setMessage((error as Error).message);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!details) return;
    try {
      await copyText(details.secret);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="modal-backdrop professional-mfa-recovery-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="modal professional-mfa-recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="professional-mfa-recovery-title"
        aria-describedby="professional-mfa-recovery-description"
        onKeyDown={keepFocusInside}
      >
        <header className="professional-mfa-recovery-heading">
          <div>
            <p className="eyebrow">ACESSO PROFISSIONAL</p>
            <h2 id="professional-mfa-recovery-title" ref={titleRef} tabIndex={-1}>
              {details ? "Configure um novo autenticador" : "Recupere seu autenticador"}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={requestClose} aria-label="Fechar recuperação do autenticador">×</button>
        </header>
        <p id="professional-mfa-recovery-description" className="professional-mfa-recovery-intro">
          {details
            ? "A confirmação abaixo é obrigatória. Você ainda não entrou e o autenticador anterior ainda não foi substituído."
            : "Esta opção é exclusiva de Mateus. Use um código emergencial guardado anteriormente para recuperar o acesso sem depender do celular antigo, do Mac ou de atendimento externo."}
        </p>

        {!details ? (
          <form className="stack professional-mfa-recovery-form" onSubmit={start} aria-busy={busy}>
            <Notice
              tone="info"
              focusOnMount={false}
              message="O código emergencial funciona uma única vez. Sua senha continua obrigatória."
            />
            <Field label="E-mail profissional" name="email" type="email" autoComplete="username" required />
            <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
            <Field
              label="Código emergencial"
              name="recovery_code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={64}
              hint="Digite ou cole um dos códigos emergenciais que você guardou. Espaços e hífens são ignorados."
              required
            />
            {message ? <Notice tone={messageTone} message={message} focusOnMount={messageTone === "error"} /> : null}
            <div className="button-row">
              <button className="quiet-button" type="button" onClick={requestClose}>Voltar ao login</button>
              <button className="primary-button" disabled={busy}>{busy ? "Verificando…" : "Continuar"}</button>
            </div>
          </form>
        ) : (
          <>
            <Notice
              tone="info"
              focusOnMount={false}
              message="A nova chave fica somente nesta tela e expira em até 15 minutos. Não a envie nem guarde junto da sua senha."
            />
            <div className="mfa-transfer-secret professional-mfa-recovery-secret">
              <span>Chave para o novo autenticador</span>
              <code className="secret-code">{details.secret}</code>
              <button className="secondary-button" type="button" onClick={() => void copySecret()}>
                {copyStatus === "copied" ? "Chave copiada" : "Copiar chave"}
              </button>
              <p
                className={copyStatus === "error" ? "copy-error" : "sr-status"}
                role={copyStatus === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {copyStatus === "copied"
                  ? "Chave copiada."
                  : copyStatus === "error"
                    ? "O navegador bloqueou a cópia. Selecione a chave e copie manualmente."
                    : ""}
              </p>
            </div>
            <ol className="mfa-transfer-steps professional-mfa-recovery-steps">
              <li><span>1</span><div><strong>Abra o autenticador que preferir.</strong><p>Escolha adicionar uma conta manualmente ou usar uma chave de configuração.</p></div></li>
              <li><span>2</span><div><strong>Cole a chave mostrada acima.</strong><p>Dê um nome fácil de reconhecer, como “Área do paciente”.</p></div></li>
              <li><span>3</span><div><strong>Confirme um código novo.</strong><p>Digite abaixo os 6 números gerados pelo novo autenticador.</p></div></li>
            </ol>
            <form className="stack professional-mfa-recovery-form" onSubmit={confirm} aria-busy={busy}>
              <Field
                label="Código de 6 dígitos do novo autenticador"
                name="totp"
                autoComplete="one-time-code"
                inputMode="numeric"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={12}
                hint="Espere o número mudar se ele estiver perto de expirar. Espaços e hífens são ignorados."
                required
              />
              {message ? <Notice tone={messageTone} message={message} focusOnMount={messageTone === "error"} /> : null}
              <div className="button-row">
                <button className="quiet-button" type="button" onClick={requestClose}>Cancelar recuperação</button>
                <button className="primary-button" disabled={busy}>{busy ? "Confirmando…" : "Confirmar e entrar"}</button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function MfaTransferCard({
  details,
  csrf,
  onClose,
  onExpired,
  onConfirmed,
  onSessionEnded,
}: {
  details: MfaTransferDetails;
  csrf: string;
  onClose: () => void;
  onExpired: () => void;
  onConfirmed: () => void;
  onSessionEnded: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestInFlight = useRef(false);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    function restoreDialogFocus(event: FocusEvent) {
      if (
        event.target instanceof Node &&
        !dialogRef.current?.contains(event.target)
      ) {
        titleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("focusin", restoreDialogFocus);
    document.body.classList.add("mfa-transfer-open");
    titleRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("focusin", restoreDialogFocus);
      document.body.classList.remove("mfa-transfer-open");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  useEffect(() => {
    const remaining = Date.parse(details.expiresAt) - Date.now();
    const timeout = window.setTimeout(onExpired, Math.max(0, remaining));
    return () => window.clearTimeout(timeout);
  }, [details.expiresAt, onExpired]);

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled])",
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === titleRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function copySecret() {
    try {
      await copyText(details.secret);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  function printEmergencyCopy() {
    const confirmed = window.confirm(
      "Esta folha permitirá gerar os códigos do seu acesso profissional. Imprima somente em uma impressora particular, não salve como PDF compartilhado e guarde a folha separada da sua senha. Continuar?",
    );
    if (confirmed) window.print();
  }

  async function confirmMacCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    const form = new FormData(event.currentTarget);
    requestInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await portalRequest(
        "/account/mfa-transfer/confirm",
        {
          method: "POST",
          body: JSON.stringify({ ticket: details.ticket, totp: form.get("totp") }),
        },
        csrf,
      );
      onConfirmed();
    } catch (error) {
      if (isSessionExpiredError(error)) {
        onClose();
        onSessionEnded();
        return;
      }
      setMessage((error as Error).message);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop mfa-transfer-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="modal mfa-transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-transfer-title"
        aria-describedby="mfa-transfer-description"
        onKeyDown={keepFocusInside}
      >
        <header className="mfa-transfer-heading">
          <div>
            <p className="eyebrow">OPÇÃO PREVENTIVA</p>
            <h2 id="mfa-transfer-title" ref={titleRef} tabIndex={-1}>
              Prepare um segundo autenticador
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar preparação">
            ×
          </button>
        </header>
        <p id="mfa-transfer-description" className="mfa-transfer-intro">
          Cadastre esta chave em outro autenticador confiável e confirme abaixo que
          ele já gera os códigos. Pode ser outro celular, tablet, computador ou uma
          cópia física privada — o Mac é apenas uma das opções.
        </p>
        <Notice
          tone="info"
          message="Esta chave protege seu acesso profissional. Ela ficará visível por até 15 minutos. Não envie, não fotografe e não guarde junto da sua senha."
        />
        <div className="mfa-transfer-secret">
          <span>Chave de configuração</span>
          <code className="secret-code">{details.secret}</code>
          <div className="button-row mfa-transfer-copy-actions">
            <button className="secondary-button" type="button" onClick={() => void copySecret()}>
              {copyStatus === "copied" ? "Chave copiada" : "Copiar chave"}
            </button>
            <button className="quiet-button" type="button" onClick={printEmergencyCopy}>
              Criar cópia de emergência em papel
            </button>
          </div>
          <p
            className={copyStatus === "error" ? "copy-error" : "sr-status"}
            role={copyStatus === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {copyStatus === "copied"
              ? "Chave copiada."
              : copyStatus === "error"
                ? "O navegador bloqueou a cópia. Selecione a chave e copie manualmente."
                : ""}
          </p>
        </div>
        <ol className="mfa-transfer-steps">
          <li><span>1</span><div><strong>Abra outro autenticador confiável.</strong><p>Pode estar em outro celular, tablet ou computador que só você controla.</p></div></li>
          <li><span>2</span><div><strong>Adicione uma conta pela chave.</strong><p>Escolha “Chave de configuração” ou a opção equivalente e cole a chave acima.</p></div></li>
          <li><span>3</span><div><strong>Teste o segundo acesso.</strong><p>Espere aparecer um código novo nesse autenticador e digite-o abaixo.</p></div></li>
        </ol>
        <div className="mfa-transfer-new-phone">
          <strong>Se perder todos os autenticadores</strong>
          <p>
            Use um dos códigos emergenciais guardados em Segurança e conta. Eles são
            independentes do Mac e permitem configurar um novo autenticador com sua
            senha. Cada código funciona uma única vez.
          </p>
        </div>
        <form className="stack mfa-transfer-confirm" onSubmit={confirmMacCode} aria-busy={busy}>
          <Field
            label="Código de 6 dígitos do segundo autenticador"
            name="totp"
            autoComplete="one-time-code"
            inputMode="numeric"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={12}
            hint="Se for igual ao código usado para abrir esta tela, espere o número mudar."
            required
          />
          {message ? <Notice tone="error" message={message} focusOnMount /> : null}
          <div className="button-row">
            <button className="quiet-button" type="button" onClick={onClose}>Fazer depois</button>
            <button className="primary-button" disabled={busy}>
              {busy ? "Confirmando…" : "Confirmar segundo autenticador"}
            </button>
          </div>
        </form>
        <p className="mfa-transfer-print-note">
          Esta é uma prevenção adicional. A recuperação por código emergencial continua disponível sem depender deste segundo autenticador.
        </p>
      </section>
    </div>
  );
}

function SetupPanel({ onAuthenticated }: { onAuthenticated: (user: User, csrf: string, recovery?: string) => void }) {
  const [step, setStep] = useState<"start" | "confirm">("start");
  const [setupSecret, setSetupSecret] = useState("");
  const [email, setEmail] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [recovery, setRecovery] = useState("");
  const [message, setMessage] = useState("");
  const [invalidField, setInvalidField] = useState<"confirmation" | null>(null);
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setInvalidField(null);
    if (form.get("password") !== form.get("confirmation")) {
      setInvalidField("confirmation");
      setMessage("As senhas não coincidem.");
      window.requestAnimationFrame(() => {
        const confirmation = formElement.elements.namedItem("confirmation");
        if (confirmation instanceof HTMLInputElement) confirmation.focus();
      });
      return;
    }
    requestInFlight.current = true;
    setBusy(true); setMessage("");
    try {
      const result = await portalRequest<{ recovery_code: string; totp_secret: string }>("/setup", {
        method: "POST",
        body: JSON.stringify({
          setup_secret: form.get("setup_secret"), name: form.get("name"), email: form.get("email"), password: form.get("password"),
        }),
      });
      setSetupSecret(String(form.get("setup_secret")));
      setEmail(String(form.get("email")));
      setTotpSecret(result.totp_secret);
      setRecovery(result.recovery_code);
      setStep("confirm");
    } catch (error) { setMessage((error as Error).message); } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    const form = new FormData(event.currentTarget);
    requestInFlight.current = true;
    setBusy(true); setMessage("");
    try {
      const result = await portalRequest<{ user: User; csrf: string }>("/setup/confirm", {
        method: "POST",
        body: JSON.stringify({ setup_secret: setupSecret, email, totp: form.get("totp") }),
      });
      onAuthenticated(result.user, result.csrf, recovery);
    } catch (error) { setMessage((error as Error).message); } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  if (step === "confirm") return (
    <form className="stack" onSubmit={confirm} aria-busy={busy}>
      <h3>Proteja o acesso profissional</h3>
      <p>Adicione uma conta manualmente no seu aplicativo autenticador usando esta chave:</p>
      <code className="secret-code">{totpSecret}</code>
      <Notice tone="info" message={`Antes de continuar, guarde também o código de recuperação: ${recovery}`} />
      <Field
        label="Código de 6 dígitos do autenticador"
        name="totp"
        autoComplete="one-time-code"
        inputMode="numeric"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={12}
        hint="Digite ou cole os 6 números. Espaços e hífens são ignorados."
        required
      />
      {message ? <Notice tone="error" message={message} /> : null}
      <button className="primary-button" disabled={busy}>{busy ? "Confirmando…" : "Confirmar e entrar"}</button>
    </form>
  );

  return (
    <form className="stack" onSubmit={start} aria-busy={busy}>
      <h3>Configuração inicial do profissional</h3>
      <p>Esta etapa só é feita uma vez por Mateus.</p>
      <Field label="Código de configuração" name="setup_secret" type="password" autoComplete="off" required />
      <Field label="Nome profissional" name="name" autoComplete="name" required />
      <Field label="E-mail de acesso" name="email" type="email" autoComplete="username" required />
      <Field label="Crie uma senha ou frase-senha" name="password" type="password" autoComplete="new-password" required passwordRequirements hint="Não são 12 dígitos: pode ser uma frase curta com espaços. Use palavras fáceis para você e inclua pelo menos um número." />
      <Field
        label="Repita a senha"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        invalid={invalidField === "confirmation"}
        errorId={invalidField === "confirmation" ? "setup-form-message" : undefined}
        onValueChange={() => {
          if (invalidField !== "confirmation") return;
          setInvalidField(null);
          setMessage("");
        }}
      />
      {message ? (
        <Notice
          id="setup-form-message"
          tone="error"
          message={message}
          focusOnMount={!invalidField}
        />
      ) : null}
      <button className="primary-button" disabled={busy}>{busy ? "Preparando…" : "Continuar"}</button>
    </form>
  );
}

function Guest({
  config,
  sessionMessage,
  onAuthenticated,
  onRecoveryCode,
  onProfessionalMfaRecovered,
}: {
  config: Config;
  sessionMessage: string;
  onAuthenticated: (user: User, csrf: string, recovery?: string) => void;
  onRecoveryCode: (code: string) => void;
  onProfessionalMfaRecovered: (
    user: User,
    csrf: string,
    recoveryCodes: string[],
  ) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [professionalMfaRecoveryOpen, setProfessionalMfaRecoveryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [invalidField, setInvalidField] = useState<"confirmation" | null>(null);
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setInvalidField(null);
    if ((mode === "register" || mode === "recover") && form.get("password") !== form.get("confirmation")) {
      setInvalidField("confirmation");
      setMessage("As senhas não coincidem.");
      window.requestAnimationFrame(() => {
        const confirmation = formElement.elements.namedItem("confirmation");
        if (confirmation instanceof HTMLInputElement) confirmation.focus();
      });
      return;
    }
    requestInFlight.current = true;
    setBusy(true); setMessage("");
    try {
      if (mode === "login") {
        const result = await portalRequest<{ user: User; csrf: string }>("/login", {
          method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password"), totp: form.get("totp") }),
        });
        onAuthenticated(result.user, result.csrf);
      } else if (mode === "register") {
        const result = await portalRequest<{ user: User; csrf: string; recovery_code: string }>("/register", {
          method: "POST",
          body: JSON.stringify({
            invitation_code: form.get("invitation_code"), name: form.get("name"), email: form.get("email"), password: form.get("password"),
            adult_confirmation: form.get("adult_confirmation") === "on", privacy_confirmation: form.get("privacy_confirmation") === "on",
          }),
        });
        onAuthenticated(result.user, result.csrf, result.recovery_code);
      } else {
        const result = await portalRequest<{ recovery_code: string }>("/recover", {
          method: "POST", body: JSON.stringify({ email: form.get("email"), recovery_code: form.get("recovery_code"), new_password: form.get("password") }),
        });
        setMode("login");
        setMessage("Senha alterada. Guarde o novo código de recuperação antes de entrar.");
        onRecoveryCode(result.recovery_code);
      }
    } catch (error) { setMessage((error as Error).message); } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Header config={config} />
      <main className="guest-layout" id="conteudo" tabIndex={-1}>
        <section className="guest-intro">
          <p className="eyebrow">ÁREA DO PACIENTE</p>
          <h1>Acompanhe seu processo. <em>Use este espaço no seu tempo.</em></h1>
          <p className="lead">Aqui você pode anotar situações, pensamentos e emoções, consultar materiais e levar para a sessão o que fizer sentido.</p>
          <p className="portal-audience-note"><strong>Para pacientes atuais.</strong> Esta área é para quem está em acompanhamento com Mateus. Para criar a conta, use o convite enviado por ele.</p>
          <a
            className="guest-access-shortcut"
            href="#acesso"
            onClick={() => {
              window.requestAnimationFrame(() => {
                document.getElementById("acesso")?.focus({ preventScroll: true });
              });
            }}
          >
            Entrar ou criar conta <span aria-hidden="true">↓</span>
          </a>
          <div className="principles">
            <article><span>1</span><div><strong>Você escreve com privacidade</strong><p>Cada registro fica só para você até que decida compartilhá-lo.</p></div></article>
            <article><span>2</span><div><strong>Você escolhe o que compartilhar</strong><p>Compartilhe apenas o que fizer sentido e retire o acesso quando quiser.</p></div></article>
            <article><span>3</span><div><strong>Não há acompanhamento em tempo real</strong><p>Mateus não recebe alertas quando você escreve ou compartilha um registro.</p></div></article>
          </div>
          <p className="education-public-note">
            Os materiais da área “Leitura complementar” são informativos. Abrir ou
            pesquisar um conteúdo não confirma diagnóstico e não é informado a
            Mateus.
          </p>
          <a className="guide-callout" href={config.guide_url} target="_blank" rel="noopener noreferrer"><span>Aberto a qualquer pessoa, sem conta</span><strong>Usar o Guia de Emoções → <span className="sr-status">(abre em nova aba)</span></strong></a>
        </section>

        <section className="auth-card" id="acesso" tabIndex={-1} aria-labelledby="auth-title">
          <p className="eyebrow">ACESSO PROTEGIDO</p>
          <h2 id="auth-title">{mode === "login" ? "Entre na sua conta" : mode === "register" ? "Crie sua conta" : "Recupere seu acesso"}</h2>
          {mode === "login" && sessionMessage ? (
            <Notice tone="info" message={sessionMessage} />
          ) : null}
          {mode !== "recover" ? (
            <p className="auth-audience-note">Para criar a conta, use o convite enviado por Mateus.</p>
          ) : null}
          {mode === "recover" ? (
            <p className="recovery-help">
              Use o código que você guardou ao criar a conta. Se também perdeu
              esse código, peça a Mateus um novo código de recuperação.
            </p>
          ) : null}
          <div className="tab-list" role="group" aria-label="Forma de acesso">
            <button type="button" className={mode === "login" ? "active" : ""} aria-pressed={mode === "login"} disabled={busy} onClick={() => { setMode("login"); setMessage(""); setInvalidField(null); }}>Entrar</button>
            <button type="button" className={mode === "register" ? "active" : ""} aria-pressed={mode === "register"} disabled={busy} onClick={() => { setMode("register"); setMessage(""); setInvalidField(null); }}>Criar conta</button>
          </div>
          <form className="stack" key={mode} onSubmit={submit} aria-busy={busy}>
            {mode === "register" ? (
              <>
                <Field
                  label="Código de convite entregue por Mateus"
                  name="invitation_code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={32}
                  hint="Você pode colar o código com ou sem espaços e hífens."
                  required
                />
                <Field label="Como prefere ser chamado(a)" name="name" autoComplete="name" required />
              </>
            ) : null}
            <Field label="E-mail" name="email" type="email" autoComplete="username" required />
            {mode === "recover" ? (
              <Field
                label="Código de recuperação"
                name="recovery_code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                hint="Você pode colar o código com ou sem espaços e hífens."
                required
              />
            ) : null}
            <Field label={mode === "recover" ? "Nova senha ou frase-senha" : mode === "register" ? "Crie uma senha ou frase-senha" : "Senha"} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required passwordRequirements={mode !== "login"} hint={mode !== "login" ? "Não são 12 dígitos: pode ser uma frase curta com espaços. Use palavras fáceis para você e inclua pelo menos um número." : undefined} />
            {mode !== "login" ? (
              <Field
                label="Repita a senha"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                invalid={invalidField === "confirmation"}
                errorId={invalidField === "confirmation" ? "access-form-message" : undefined}
                onValueChange={() => {
                  if (invalidField !== "confirmation") return;
                  setInvalidField(null);
                  setMessage("");
                }}
              />
            ) : null}
            {mode === "login" ? (
              <details className="professional-login-details">
                <summary>
                  <span>
                    <strong>Acesso profissional</strong>
                    <small>uso exclusivo de Mateus</small>
                  </span>
                </summary>
                <div>
                  <p>
                    Este código é usado somente por Mateus para abrir o painel
                    profissional. Pacientes podem ignorar esta opção.
                  </p>
                  <Field
                    label="Código do aplicativo autenticador"
                    name="totp"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={12}
                    hint="Digite ou cole os 6 números. Espaços e hífens são ignorados."
                  />
                  <button
                    className="text-action professional-mfa-recovery-trigger"
                    type="button"
                    onClick={() => setProfessionalMfaRecoveryOpen(true)}
                  >
                    Não tenho mais acesso ao autenticador
                  </button>
                </div>
              </details>
            ) : null}
            {mode === "register" ? (
              <div className="checks">
                <label className="check-row">
                  <input type="checkbox" name="adult_confirmation" required />
                  <span>Confirmo que tenho 18 anos ou mais.</span>
                </label>
                <label className="check-row">
                  <input type="checkbox" name="privacy_confirmation" required />
                  <span>Li e aceito o <a href="/privacidade/" target="_blank" rel="noreferrer">aviso de privacidade <span aria-hidden="true">↗</span><span className="sr-status"> (abre em nova aba)</span></a>.</span>
                </label>
              </div>
            ) : null}
            {message ? (
              <Notice
                id="access-form-message"
                tone={message.startsWith("Senha alterada") ? "success" : "error"}
                message={message}
                focusOnMount={!message.startsWith("Senha alterada") && !invalidField}
              />
            ) : null}
            <button className="primary-button" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Alterar senha"}</button>
          </form>
          {mode === "login" ? <button className="text-action" type="button" disabled={busy} onClick={() => { setMode("recover"); setMessage(""); setInvalidField(null); }}>Esqueci minha senha</button> : <button className="text-action" type="button" disabled={busy} onClick={() => { setMode("login"); setMessage(""); setInvalidField(null); }}>Voltar para o login</button>}
          {!config.configured ? <details className="setup-details"><summary>Primeiro acesso profissional</summary><SetupPanel onAuthenticated={onAuthenticated} /></details> : null}
        </section>
      </main>
      <EmergencyFooter config={config} />
      {professionalMfaRecoveryOpen ? (
        <ProfessionalMfaRecovery
          onClose={() => setProfessionalMfaRecoveryOpen(false)}
          onRecovered={onProfessionalMfaRecovered}
        />
      ) : null}
    </>
  );
}

function entryDraftFrom(initial?: Entry): EntryDraft {
  return initial
    ? {
        title: initial.title,
        happened: initial.happened,
        body: initial.body,
        thoughts: initial.thoughts,
        urge: initial.urge,
        emotion: initial.emotion,
        intensity: initial.intensity,
        message: initial.message,
      }
    : { ...blankEntry };
}

function CharacterLimit({
  id,
  value,
  maxLength,
}: {
  id: string;
  value: string;
  maxLength: number;
}) {
  const remaining = remainingCharactersNearLimit(value, maxLength);

  return (
    <small
      id={id}
      className={`character-limit${remaining === 0 ? " limit-reached" : ""}`}
      hidden={remaining === null}
    >
      {remaining === null
        ? ""
        : remaining === 0
        ? "Limite de caracteres atingido."
        : `${remaining} ${remaining === 1 ? "caractere restante" : "caracteres restantes"}`}
    </small>
  );
}

function EntryForm({
  initial,
  draft,
  guidance,
  guideUrl,
  onSave,
  onCancel,
  onDraftChange,
  onDirtyChange,
}: {
  initial?: Entry;
  draft: EntryDraft;
  guidance?: string;
  guideUrl: string;
  onSave: (entry: EntryDraft) => Promise<void>;
  onCancel: () => void;
  onDraftChange: (draft: EntryDraft) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [originalDraft] = useState<EntryDraft>(() => entryDraftFrom(initial));
  const [message, setMessage] = useState("");
  const [saveErrorLocation, setSaveErrorLocation] = useState<"early" | "final">("final");
  const [validationError, setValidationError] = useState<{ field: "title" | "happened"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submissionInFlight = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const happenedRef = useRef<HTMLTextAreaElement>(null);
  const dirty = (Object.keys(originalDraft) as Array<keyof EntryDraft>).some(
    (key) => draft[key] !== originalDraft[key],
  );
  const remainsShared = Boolean(initial && isEntryShared(initial));
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!validationError) return;
    const field = validationError.field === "title" ? titleRef.current : happenedRef.current;
    field?.focus();
  }, [validationError]);
  function update(name: keyof EntryDraft, value: string | number) {
    if (validationError?.field === name) setValidationError(null);
    onDraftChange({ ...draft, [name]: value });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submissionInFlight.current) return;
    setMessage("");
    // Test presence only: never trim or rewrite the patient's draft.
    if (!draft.title.trim()) {
      setValidationError({ field: "title", message: "Escreva um título breve para identificar este registro." });
      return;
    }
    if (!draft.happened.trim()) {
      setValidationError({ field: "happened", message: "Conte o que aconteceu. Pode ser uma frase curta." });
      return;
    }
    setValidationError(null);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    setSaveErrorLocation(submitter instanceof HTMLElement && submitter.closest(".optional-save-shortcut") ? "early" : "final");
    submissionInFlight.current = true;
    setBusy(true);
    try { await onSave(draft); } catch (error) { setMessage(entrySaveErrorMessage(error)); } finally {
      submissionInFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="entry-form panel patient-entry-form" id="entry-editor" onSubmit={submit} aria-busy={busy}>
      <div className="section-heading entry-form-heading">
        <div>
          <p className="eyebrow">{initial ? "EDITAR REGISTRO" : "NOVO REGISTRO"}</p>
          <h1 id="entry-form-title" tabIndex={-1}>{initial ? "Revise sua anotação" : "O que você quer guardar?"}</h1>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Fechar formulário" disabled={busy}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="entry-form-intro">
        <p className="entry-privacy-note">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{remainsShared ? <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></> : <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>}</svg>
          <span><strong>{remainsShared ? "Compartilhado com Mateus." : initial ? "Registro privado." : "Começa privado."}</strong>{" "}
            {remainsShared
              ? "As alterações salvas também ficarão visíveis para ele."
              : initial
                ? "Salvar as alterações não compartilha o registro."
                : "Você decide depois se quer compartilhar."}
          </span>
        </p>
        <p className="form-requirements-note">
          <strong>Para salvar, bastam dois campos:</strong> “Título breve” e “O que aconteceu?”. O restante é opcional.
        </p>
        {guidance ? (
          <p className="education-entry-guidance" id="education-entry-guidance">
            {guidance}
          </p>
        ) : null}
      </div>

      <section className="entry-step entry-step-situation" aria-labelledby="entry-step-one">
        <div className="entry-step-heading">
          <div><h2 id="entry-step-one">A situação</h2></div>
        </div>
        <div className="field">
          <label className="field-label-line" htmlFor="entry-title"><span>Título breve</span><small>Necessário</small></label>
          <input ref={titleRef} id="entry-title" value={draft.title} maxLength={120} placeholder="Ex.: conversa no trabalho" onChange={(e) => update("title", e.target.value)} required disabled={busy} aria-invalid={validationError?.field === "title" || undefined} aria-describedby={[guidance ? "education-entry-guidance" : "", "entry-title-help", "entry-title-character-limit", validationError?.field === "title" ? "entry-title-error" : ""].filter(Boolean).join(" ")} />
          <small className="entry-field-help" id="entry-title-help">Uma frase curta para encontrar este registro depois.</small>
          {validationError?.field === "title" ? <small className="entry-field-error" id="entry-title-error" role="alert">{validationError.message}</small> : null}
          <CharacterLimit id="entry-title-character-limit" value={draft.title} maxLength={120} />
        </div>
        <div className="field">
          <label className="field-label-line" htmlFor="entry-happened"><span>O que aconteceu?</span><small>Necessário</small></label>
          <textarea ref={happenedRef} id="entry-happened" value={draft.happened} maxLength={2000} rows={5} placeholder="Conte do seu jeito. Não precisa escrever muito." onChange={(e) => update("happened", e.target.value)} required disabled={busy} aria-invalid={validationError?.field === "happened" || undefined} aria-describedby={validationError?.field === "happened" ? "entry-happened-character-limit entry-happened-error" : "entry-happened-character-limit"} />
          {validationError?.field === "happened" ? <small className="entry-field-error" id="entry-happened-error" role="alert">{validationError.message}</small> : null}
          <CharacterLimit id="entry-happened-character-limit" value={draft.happened} maxLength={2000} />
        </div>
      </section>

      <div className="optional-save-shortcut">
        <p>
          <strong>O restante é opcional</strong>
          <span>Você pode salvar aqui ou continuar com os campos abaixo.</span>
          {initial ? (
            <span>{remainsShared ? "Este registro continuará compartilhado com Mateus." : "Este registro continuará privado."}</span>
          ) : null}
        </p>
        <button className="secondary-button" type="submit" disabled={busy}>
          {busy ? "Salvando…" : initial ? "Salvar alterações agora" : "Salvar agora como privado"}
        </button>
      </div>
      {message && saveErrorLocation === "early" ? <Notice tone="error" message={message} /> : null}

      <section className="entry-step entry-step-emotion" aria-labelledby="entry-step-two">
        <div className="entry-step-heading">
          <div>
            <div className="optional-heading-line">
              <h2 id="entry-step-two">O que você sentiu?</h2>
              <span className="optional-badge">Opcional</span>
            </div>
            <p>Se não souber, pode deixar em branco.</p>
          </div>
        </div>
        <div className="emotion-row">
          <div className="field">
            <label htmlFor="entry-emotion"><span>Emoção principal, se souber</span></label>
            <input id="entry-emotion" value={draft.emotion} maxLength={120} placeholder="Ex.: ansiedade, tristeza, raiva" onChange={(e) => update("emotion", e.target.value)} disabled={busy} aria-describedby="entry-emotion-character-limit" />
            <CharacterLimit id="entry-emotion-character-limit" value={draft.emotion} maxLength={120} />
            <a
              className="field-help-link"
              href={guideUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Consultar o Guia de Emoções
              <span className="external-link-note"> (nova aba)</span>
            </a>
          </div>
          <div className="field range-field">
            <label htmlFor="entry-intensity">Intensidade percebida: <strong>{draft.intensity}</strong>/10</label>
            <input id="entry-intensity" type="range" min="0" max="10" value={draft.intensity} onChange={(e) => update("intensity", Number(e.target.value))} disabled={busy} />
            <small className="range-scale"><span>0 · muito leve</span><span>10 · muito intensa</span></small>
            <div className="range-adjustments" aria-label="Ajustar intensidade sem arrastar">
              <button
                type="button"
                onClick={() => update("intensity", Math.max(0, draft.intensity - 1))}
                disabled={busy || draft.intensity === 0}
              >
                − Diminuir
              </button>
              <output htmlFor="entry-intensity" aria-live="polite">{draft.intensity}/10</output>
              <button
                type="button"
                onClick={() => update("intensity", Math.min(10, draft.intensity + 1))}
                disabled={busy || draft.intensity === 10}
              >
                Aumentar +
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="entry-step entry-step-details" aria-labelledby="entry-step-three">
        <div className="entry-step-heading">
          <div>
            <div className="optional-heading-line">
              <h2 id="entry-step-three">Corpo, pensamentos e vontade</h2>
              <span className="optional-badge">Opcional</span>
            </div>
            <p>Preencha só o que fizer sentido para essa situação.</p>
          </div>
        </div>
        <div className="two-columns optional-fields">
          <div className="field">
            <label htmlFor="entry-body">O que percebeu no corpo?</label>
            <textarea id="entry-body" value={draft.body} maxLength={1500} rows={3} placeholder="Ex.: aperto no peito, tensão, calor ou cansaço." onChange={(e) => update("body", e.target.value)} disabled={busy} aria-describedby="entry-body-character-limit" />
            <CharacterLimit id="entry-body-character-limit" value={draft.body} maxLength={1500} />
          </div>
          <div className="field">
            <label htmlFor="entry-thoughts">Quais pensamentos apareceram?</label>
            <textarea id="entry-thoughts" value={draft.thoughts} maxLength={1500} rows={3} placeholder="Escreva as frases ou ideias que vieram à mente." onChange={(e) => update("thoughts", e.target.value)} disabled={busy} aria-describedby="entry-thoughts-character-limit" />
            <CharacterLimit id="entry-thoughts-character-limit" value={draft.thoughts} maxLength={1500} />
          </div>
          <div className="field">
            <label htmlFor="entry-urge">O que teve vontade de fazer?</label>
            <textarea id="entry-urge" value={draft.urge} maxLength={1500} rows={3} placeholder="Ex.: evitar, responder, sair, pedir ajuda ou ficar em silêncio." onChange={(e) => update("urge", e.target.value)} disabled={busy} aria-describedby="entry-urge-character-limit" />
            <CharacterLimit id="entry-urge-character-limit" value={draft.urge} maxLength={1500} />
          </div>
        </div>
      </section>

      <section className="entry-step entry-step-optional" aria-labelledby="entry-step-four">
        <div className="entry-step-heading">
          <div>
            <div className="optional-heading-line">
              <h2 id="entry-step-four">Levar para a próxima sessão</h2>
              <span className="optional-badge">Opcional</span>
            </div>
          </div>
        </div>
        <div className={`session-note-block ${remainsShared ? "shared" : "private"}`}>
          <div className="field session-note-field">
            <label htmlFor="entry-session-note">O que quero levar</label>
            <textarea
              id="entry-session-note"
              value={draft.message}
              maxLength={1500}
              rows={4}
              placeholder="Ex.: uma dúvida, um assunto difícil de começar ou algo que não quero esquecer."
              onChange={(event) => update("message", event.target.value)}
              disabled={busy}
              aria-describedby="entry-session-note-help entry-session-note-privacy entry-session-note-character-limit"
            />
            <small id="entry-session-note-help">
              Anote um assunto ou uma dúvida para a próxima sessão. Não precisa organizar tudo agora.
            </small>
            <CharacterLimit id="entry-session-note-character-limit" value={draft.message} maxLength={1500} />
          </div>
          <details className="session-note-prompts">
            <summary>Precisa de uma ideia para começar?</summary>
            <ul>
              <li>O que ficou presente desde a última sessão?</li>
              <li>O que você não gostaria de esquecer?</li>
              <li>O que quer compreender melhor?</li>
              <li>Existe algo difícil de começar a contar?</li>
              <li>O que gostaria de levar para a próxima sessão?</li>
            </ul>
          </details>
          <p className="session-note-privacy" id="entry-session-note-privacy">
            {remainsShared
              ? "Ao salvar, Mateus poderá ver também esta parte."
              : "Este conteúdo segue a privacidade do registro. Nada é compartilhado automaticamente."}{" "}
            Este campo não envia mensagem nem pedido de resposta imediata.
          </p>
        </div>
      </section>

      {message && saveErrorLocation === "final" ? <Notice tone="error" message={message} /> : null}
      <div className={`form-finish ${remainsShared ? "shared" : "private"}`}>
        <div className="form-finish-copy">
          <span aria-hidden="true" />
          <p>
            <strong>
              {remainsShared
                ? "Continuará compartilhado com Mateus."
                : initial
                  ? "Continuará privado."
                  : "Será salvo como privado."}
            </strong>{" "}
            {remainsShared
              ? "Salvar as alterações não retira o acesso atual. Você pode retirar o compartilhamento no histórico."
              : "Mateus só poderá ler se você decidir compartilhar este registro depois."}
          </p>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Salvando…" : initial ? "Salvar alterações" : "Salvar registro privado"}
          </button>
        </div>
      </div>
    </form>
  );
}

function EntryDetails({ entry }: { entry: Entry }) {
  const items = [["O que aconteceu", entry.happened], ["No corpo", entry.body], ["Pensamentos", entry.thoughts], ["Vontade de agir", entry.urge], ["Levar para a próxima sessão", entry.message]];
  return <div className="entry-details">{items.filter(([, value]) => value).map(([label, value]) => <div key={label}><strong>{label}</strong><p>{value}</p></div>)}</div>;
}

function PatientDashboard({
  user,
  csrf,
  config,
  setRecovery,
  getAccountActionVersion,
  onSessionLost,
  onDraftStateChange,
  mapRecovery,
  onMapRecoveryChange,
  recordRecovery,
  onRecordRecoveryChange,
}: {
  user: User;
  csrf: string;
  config: Config;
  setRecovery: (code: string) => void;
  getAccountActionVersion: () => number;
  onSessionLost: () => void;
  onDraftStateChange: (dirty: boolean) => void;
  mapRecovery: PatientMapDraftRecoverySnapshot | null;
  onMapRecoveryChange: (snapshot: PatientMapDraftRecoverySnapshot | null) => void;
  recordRecovery: PatientRecordDraftRecoverySnapshot | null;
  onRecordRecoveryChange: (snapshot: PatientRecordDraftRecoverySnapshot | null) => void;
}) {
  const [initialPatientRoute] = useState<PatientRoute>(() =>
    typeof window === "undefined"
      ? patientRouteFromHash("")
      : patientRouteFromHash(window.location.hash),
  );
  const [area, setArea] = useState<PatientArea>(initialPatientRoute.area);
  const [resourceView, setResourceView] = useState<PatientResourceView>(
    initialPatientRoute.resourceView,
  );
  const [selectedToolId, setSelectedToolId] = useState<string | null>(
    initialPatientRoute.toolId,
  );
  const [selectedEducationSlug, setSelectedEducationSlug] = useState<string | null>(
    initialPatientRoute.educationSlug,
  );
  const [entryReturn, setEntryReturn] = useState<EntryReturn>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null | "new">(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorAnnouncement, setEditorAnnouncement] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entriesRefreshAnnouncement, setEntriesRefreshAnnouncement] = useState<{
    area: PatientArea;
    message: string;
  } | null>(null);
  const [entriesError, setEntriesError] = useState("");
  const [savedEntryToFocus, setSavedEntryToFocus] = useState<string | null>(null);
  const [entryFilter, setEntryFilter] =
    useState<PatientEntrySharingFilter>("all");
  const [entryQuery, setEntryQuery] = useState("");
  const [entrySort, setEntrySort] = useState<PatientEntrySort>("newest");
  const entrySearchRef = useRef<HTMLInputElement>(null);
  const entrySearchPanelRef = useRef<HTMLDetailsElement>(null);
  const [entryActions, setEntryActions] = useState<
    Record<string, "sharing" | "removing">
  >({});
  const [thoughtReviewSnapshots, setThoughtReviewSnapshots] = useState<
    Record<string, ThoughtReviewEditorSnapshot>
  >({});
  const [pendingRecordRecovery, setPendingRecordRecovery] = useState(() => getPatientRecordRecovery(recordRecovery, user));
  const recordRecoveryToRestore = useRef(pendingRecordRecovery);
  const [blockedEntryRecovery, setBlockedEntryRecovery] = useState<{
    kind: "changed" | "missing";
    editor: PatientEntryEditorRecovery;
  } | null>(null);
  const [recordRecoveryAnnouncement, setRecordRecoveryAnnouncement] = useState("");
  const entryActionLocks = useRef<Set<string>>(new Set());
  const entriesRequestSequence = useRef(0);
  const entriesRequestsInFlight = useRef(0);
  const lastEntriesRequestAt = useRef(0);
  const entriesRefreshLock = useRef(false);
  const editorOriginRef = useRef<{
    entryId: string;
    scrollY: number;
    trigger: HTMLButtonElement;
  } | null>(null);
  const initialScrollResetRef = useRef(false);
  const patientMap = usePatientMapDraft({
    patientId: user.id,
    csrf,
    recovery: mapRecovery,
    onRecoveryChange: onMapRecoveryChange,
    onSessionLost,
  });
  const restoreRecoveredRecords = useCallback((freshEntries: Entry[]) => {
    const snapshot = recordRecoveryToRestore.current;
    if (!snapshot) return;
    recordRecoveryToRestore.current = null;
    setPendingRecordRecovery(null);
    setThoughtReviewSnapshots(snapshot.thoughtReviewSnapshots);
    if (snapshot.entryEditor) {
      const restored = resolvePatientEntryRecovery(snapshot.entryEditor, freshEntries);
      if (restored.kind === "new" || restored.kind === "edit") {
        setEditing(restored.kind === "new" ? "new" : restored.entry);
        setEntryDraft(restored.draft);
        setEditorVisible(!restored.editorPaused);
        setEditorDirty(true);
        setEntryReturn(restored.entryReturn);
      } else {
        setBlockedEntryRecovery({ kind: restored.kind, editor: restored.editor });
      }
    }
    setRecordRecoveryAnnouncement("Seu texto não salvo foi recuperado nesta aba. Confira antes de salvar. Fechar ou recarregar a página ainda pode apagar o rascunho.");
  }, []);
  const load = useCallback(async (showRefreshing = false) => {
    const sequence = entriesRequestSequence.current + 1;
    entriesRequestSequence.current = sequence;
    entriesRequestsInFlight.current += 1;
    lastEntriesRequestAt.current = Date.now();
    if (showRefreshing) setRefreshing(true);
    setEntriesRefreshAnnouncement(null);
    setEntriesError("");
    try {
      const result = await portalRequest<{ entries: Entry[] }>("/entries");
      if (sequence !== entriesRequestSequence.current) return;
      setEntries(result.entries);
      restoreRecoveredRecords(result.entries);
      return result.entries;
    }
    catch (error) {
      if (sequence !== entriesRequestSequence.current) return;
      if (isSessionExpiredError(error)) {
        onSessionLost();
      } else {
        setEntriesError((error as Error).message);
      }
    }
    finally {
      entriesRequestsInFlight.current = Math.max(
        0,
        entriesRequestsInFlight.current - 1,
      );
      if (sequence === entriesRequestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [onSessionLost, restoreRecoveredRecords]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    function refreshEntriesAfterReturn() {
      if (document.visibilityState !== "visible") return;
      if (entriesRefreshLock.current || entriesRequestsInFlight.current > 0) return;
      if (
        Date.now() - lastEntriesRequestAt.current <
        PATIENT_ENTRIES_AUTO_REFRESH_INTERVAL_MS
      ) return;

      entriesRefreshLock.current = true;
      void load().finally(() => {
        entriesRefreshLock.current = false;
      });
    }

    window.addEventListener("focus", refreshEntriesAfterReturn);
    window.addEventListener("pageshow", refreshEntriesAfterReturn);
    document.addEventListener("visibilitychange", refreshEntriesAfterReturn);
    return () => {
      window.removeEventListener("focus", refreshEntriesAfterReturn);
      window.removeEventListener("pageshow", refreshEntriesAfterReturn);
      document.removeEventListener("visibilitychange", refreshEntriesAfterReturn);
    };
  }, [load]);

  const applyPatientRoute = useCallback((route: PatientRoute) => {
    setArea(route.area);
    setResourceView(route.resourceView);
    setSelectedToolId(route.toolId);
    setSelectedEducationSlug(route.educationSlug);
  }, []);

  useEffect(() => {
    const canonicalHash = patientHashForRoute(initialPatientRoute);
    if (window.location.hash !== canonicalHash) {
      window.history.replaceState(null, "", canonicalHash);
    }
    function restoreRouteFromHistory() {
      const restoredRoute = patientRouteFromHash(window.location.hash);
      const restoredHash = patientHashForRoute(restoredRoute);
      if (window.location.hash !== restoredHash) {
        window.history.replaceState(null, "", restoredHash);
      }
      applyPatientRoute(restoredRoute);
    }
    window.addEventListener("popstate", restoreRouteFromHistory);
    window.addEventListener("hashchange", restoreRouteFromHistory);
    return () => {
      window.removeEventListener("popstate", restoreRouteFromHistory);
      window.removeEventListener("hashchange", restoreRouteFromHistory);
    };
  }, [applyPatientRoute, initialPatientRoute]);

  function navigatePatient(route: PatientRoute, replace = false) {
    const nextHash = patientHashForRoute(route);
    if (window.location.hash !== nextHash) {
      const currentHash = patientHashForRoute(
        patientRouteFromHash(window.location.hash),
      );
      if (replace) {
        const currentState = window.history.state as Partial<PatientHistoryState> | null;
        const replacementState: PatientHistoryState =
          currentState?.patientNavigation === true && typeof currentState.from === "string"
            ? { patientNavigation: true, from: currentState.from }
            : { patientNavigation: true, from: currentHash };
        window.history.replaceState(replacementState, "", nextHash);
      } else {
        const nextState: PatientHistoryState = {
          patientNavigation: true,
          from: currentHash,
        };
        window.history.pushState(nextState, "", nextHash);
      }
    }
    applyPatientRoute(route);
  }

  function returnPatient(route: PatientRoute) {
    const targetHash = patientHashForRoute(route);
    const currentState = window.history.state as Partial<PatientHistoryState> | null;
    if (
      currentState?.patientNavigation === true &&
      currentState.from === targetHash
    ) {
      window.history.back();
      return;
    }
    navigatePatient(route, true);
  }

  useEffect(() => {
    if (loading || initialScrollResetRef.current) return;
    initialScrollResetRef.current = true;
    scrollPageToTop();
  }, [loading]);

  useEffect(() => {
    if (area !== "records" || !editing || !editorVisible) return;
    const frame = window.requestAnimationFrame(() => {
      const editor = document.getElementById("entry-editor");
      // Do not move someone who has already begun using a field in the new form.
      if (editor?.contains(document.activeElement)) return;
      const title = document.getElementById("entry-title");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      editor?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      title?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [area, editing, editorVisible]);

  useEffect(() => {
    if (area === "records" && editing && editorVisible) return;
    if (area === "resources" && resourceView !== "index") return;
    const targetId =
      area === "home"
        ? "patient-home-title"
        : area === "records"
          ? "records-title"
          : area === "map"
            ? "patient-map-title"
            : resourceView === "tools"
              ? "patient-tools-title"
              : resourceView === "readings"
                ? "education-title"
                : "patient-resources-title";
    const frame = window.requestAnimationFrame(() => {
      // Saving can already have returned focus to the resulting history card.
      // A late navigation effect must not replace that useful focus with the title.
      const focused = document.activeElement;
      if (area === "records" && focused instanceof HTMLElement &&
        focused.matches(".patient-record-card > summary, .notice-error")) return;
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ block: "start", behavior: "auto" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [area, editing, editorVisible, resourceView, selectedEducationSlug, selectedToolId]);

  useEffect(() => {
    if (!savedEntryToFocus) return;
    // Wait for the history/filter render, not an assumed number of frames after
    // the HTTP response. Slow rendering must not lose the post-save destination.
    const frame = window.requestAnimationFrame(() => {
      if (area === "records" && !editorVisible) {
        const card = document.getElementById(`record-${savedEntryToFocus}`);
        const summary = card?.querySelector<HTMLElement>("summary");
        const target = summary ?? document.getElementById("records-title");
        const focused = document.activeElement;
        if (!(focused instanceof HTMLElement) || focused === document.body ||
          focused.id === "records-title" || focused === target) {
          target?.scrollIntoView({ block: summary ? "center" : "start", behavior: "auto" });
          target?.focus({ preventScroll: true });
        }
      }
      setSavedEntryToFocus(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [savedEntryToFocus, area, editorVisible, entries, entryFilter, entryQuery]);

  useEffect(() => {
    const snapshot = pendingRecordRecovery ?? createPatientRecordRecoverySnapshot({
      patientId: user.id,
      editing,
      draft: entryDraft,
      editorDirty,
      editorPaused: !editorVisible,
      entryReturn,
      thoughtReviewSnapshots,
    });
    onRecordRecoveryChange(blockedEntryRecovery
      ? { patientId: user.id, entryEditor: blockedEntryRecovery.editor, thoughtReviewSnapshots }
      : snapshot);
  }, [blockedEntryRecovery, editing, editorDirty, editorVisible, entryDraft, entryReturn,
    onRecordRecoveryChange, pendingRecordRecovery, thoughtReviewSnapshots, user.id]);

  function updateEntryDraft(nextDraft: EntryDraft) {
    setEntryDraft(nextDraft);
    const baseline = entryDraftFrom(editing && editing !== "new" ? editing : undefined);
    const dirty = (Object.keys(baseline) as Array<keyof EntryDraft>).some(key => baseline[key] !== nextDraft[key]);
    // Capture the last keystroke before an asynchronous 401 can unmount this editor.
    onRecordRecoveryChange(createPatientRecordRecoverySnapshot({
      patientId: user.id, editing, draft: nextDraft, editorDirty: dirty,
      editorPaused: !editorVisible, entryReturn, thoughtReviewSnapshots,
    }));
  }

  useEffect(() => {
    const hasUnsavedChanges =
      Boolean(editing && editorDirty) ||
      patientMap.hasUnsavedChanges ||
      Boolean(pendingRecordRecovery || blockedEntryRecovery) ||
      Object.keys(thoughtReviewSnapshots).length > 0;
    onDraftStateChange(hasUnsavedChanges);
    if (!hasUnsavedChanges) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [
    editing,
    editorDirty,
    pendingRecordRecovery,
    blockedEntryRecovery,
    onDraftStateChange,
    patientMap.hasUnsavedChanges,
    thoughtReviewSnapshots,
  ]);

  async function save(draft: EntryDraft) {
    const editedEntry = editing && editing !== "new" ? editing : null;
    let savedId = editedEntry?.id ?? "";
    if (editedEntry) {
      await portalRequest(`/entries/${editedEntry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...draft, expected_updated_at: editedEntry.updated_at }),
      }, csrf);
    } else {
      const result = await portalRequest<{ id: string }>("/entries", {
        method: "POST",
        body: JSON.stringify(draft),
      }, csrf);
      savedId = result.id;
    }
    setEditing(null);
    setEditorVisible(false);
    setEntryDraft(null);
    setEditorDirty(false);
    setEditorAnnouncement("");
    setEntryReturn(null);
    setMessageTone("success");
    setMessage(
      editedEntry
        ? isEntryShared(editedEntry)
          ? "Alterações salvas. O compartilhamento com Mateus foi mantido."
          : "Registro atualizado. Ele continua privado."
        : "Registro salvo de forma privada.",
    );
    onRecordRecoveryChange(createPatientRecordRecoverySnapshot({
      patientId: user.id, editing: null, draft: null, editorDirty: false,
      editorPaused: true, entryReturn: null, thoughtReviewSnapshots,
    }));
    const freshEntries = await load();
    if (!freshEntries) return;
    const savedEntry = freshEntries.find((entry) => entry.id === savedId);
    if (savedEntry) {
      // A successful save should not look lost behind the previous search.
      // Remove only controls that hide this record; keep useful filters/order.
      if (entryFilter !== "all" && isEntryShared(savedEntry) !== (entryFilter === "shared")) {
        setEntryFilter((current) => current === entryFilter ? "all" : current);
      }
      if (entryQuery.trim() && !filterAndSortPatientEntries([savedEntry], "all", entryQuery, entrySort).length) {
        setEntryQuery((current) => current === entryQuery ? "" : current);
      }
    }
    setSavedEntryToFocus(savedId);
  }
  async function sharing(entry: Entry) {
    if (entryActionLocks.current.has(entry.id)) return;
    const shared = isEntryShared(entry);
    const question = shared
      ? "Mateus deixará de ver este registro. Retirar o compartilhamento?"
      : "Compartilhar este registro com Mateus? Ele poderá lê-lo no painel profissional, mas não editá-lo.";
    if (!window.confirm(question)) return;
    const card = document.getElementById(`record-${entry.id}`);
    const restoreFocus = Boolean(card?.contains(document.activeElement));
    entryActionLocks.current.add(entry.id);
    setEntryActions((current) => ({ ...current, [entry.id]: "sharing" }));
    try {
      await portalRequest(`/entries/${entry.id}/sharing`, { method: "PATCH", body: JSON.stringify({ shared: !shared }) }, csrf);
      setMessageTone("success");
      setMessage(shared ? "Compartilhamento retirado." : "Registro compartilhado com Mateus.");
      await load();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          // Disabling the action or filtering its card can drop focus to body.
          // Keep a useful target without interrupting a move elsewhere.
          const focused = document.activeElement;
          if (restoreFocus &&
            (!focused || focused === document.body || focused === document.documentElement)) {
            const currentCard = document.getElementById(`record-${entry.id}`);
            const focusTarget = currentCard?.querySelector<HTMLElement>("summary") ??
              document.getElementById("records-title");
            focusTarget?.focus();
          }
        });
      });
    } catch (error) {
      if (isSessionExpiredError(error)) {
        onSessionLost();
      } else {
        setMessageTone("error");
        setMessage((error as Error).message);
      }
    } finally {
      entryActionLocks.current.delete(entry.id);
      setEntryActions((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
    }
  }
  async function remove(entry: Entry) {
    if (entryActionLocks.current.has(entry.id)) return;
    if (!window.confirm("Excluir este registro de forma permanente?")) return;
    const card = document.getElementById(`record-${entry.id}`);
    const restoreFocus = Boolean(card?.contains(document.activeElement));
    const adjacentSummary =
      card?.nextElementSibling?.querySelector<HTMLElement>("summary") ??
      card?.previousElementSibling?.querySelector<HTMLElement>("summary") ??
      null;
    entryActionLocks.current.add(entry.id);
    setEntryActions((current) => ({ ...current, [entry.id]: "removing" }));
    try {
      await portalRequest(`/entries/${entry.id}`, { method: "DELETE" }, csrf);
      setThoughtReviewSnapshots((current) => {
        if (!current[entry.id]) return current;
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      setMessageTone("success");
      setMessage("Registro excluído.");
      await load();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const focused = document.activeElement;
          if (!restoreFocus || (focused && focused !== document.body && focused !== document.documentElement)) return;
          const focusTarget = adjacentSummary?.isConnected
            ? adjacentSummary
            : document.getElementById("records-title");
          focusTarget?.focus();
        });
      });
    } catch (error) {
      if (isSessionExpiredError(error)) {
        onSessionLost();
      } else {
        setMessageTone("error");
        setMessage((error as Error).message);
      }
    } finally {
      entryActionLocks.current.delete(entry.id);
      setEntryActions((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
    }
  }
  function saveThoughtReview(
    entryId: string,
    review: ThoughtReview,
    updatedAt: string,
  ) {
    setThoughtReviewSnapshots((current) => {
      if (!current[entryId]) return current;
      const next = { ...current };
      delete next[entryId];
      return next;
    });
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              thought_review: review,
              updated_at: updatedAt,
            }
          : entry,
      ),
    );
  }
  function deleteThoughtReview(entryId: string, updatedAt: string) {
    setThoughtReviewSnapshots((current) => {
      if (!current[entryId]) return current;
      const next = { ...current };
      delete next[entryId];
      return next;
    });
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? { ...entry, thought_review: null, updated_at: updatedAt }
          : entry,
      ),
    );
  }
  const updateThoughtReviewSnapshot = useCallback(
    (entryId: string, snapshot: ThoughtReviewEditorSnapshot | null) => {
      setThoughtReviewSnapshots((current) => {
        if (!snapshot) {
          if (!current[entryId]) return current;
          const next = { ...current };
          delete next[entryId];
          return next;
        }
        if (current[entryId] === snapshot) return current;
        const next = { ...current };
        next[entryId] = snapshot;
        return next;
      });
    },
    [],
  );
  function openNewRecord() {
    if (pendingRecordRecovery || blockedEntryRecovery) {
      document.getElementById("patient-recovered-drafts-title")?.scrollIntoView({ block: "center" });
      return;
    }
    if (editing) {
      setEditorVisible(true);
      navigatePatient({
        area: "records",
        resourceView: "index",
        toolId: null,
        educationSlug: null,
      });
      setEditorAnnouncement("Registro não salvo retomado.");
      return;
    }
    setEntryReturn(null);
    editorOriginRef.current = null;
    setEditorDirty(false);
    setEditorAnnouncement("Formulário para um novo registro aberto.");
    setMessage("");
    setEntryDraft({ ...blankEntry });
    setEditing("new");
    setEditorVisible(true);
    navigatePatient({
      area: "records",
      resourceView: "index",
      toolId: null,
      educationSlug: null,
    });
  }
  function createRecordFromEducation(slug: string) {
    if (pendingRecordRecovery || blockedEntryRecovery) return;
    if (editing) {
      setMessageTone("success");
      setMessage("Você já tem um registro não salvo. Ele foi mantido nesta sessão.");
      navigatePatient({
        area: "records",
        resourceView: "index",
        toolId: null,
        educationSlug: null,
      });
      return;
    }
    setSelectedEducationSlug(slug);
    setEntryReturn({ kind: "reading", id: slug });
    editorOriginRef.current = null;
    setEditorDirty(false);
    setEditorAnnouncement("Formulário para um novo registro aberto.");
    setEntryDraft({ ...blankEntry });
    setEditing("new");
    setEditorVisible(true);
    setMessage("");
    navigatePatient({
      area: "records",
      resourceView: "index",
      toolId: null,
      educationSlug: null,
    });
  }
  function createRecordFromTool(toolId: string) {
    if (pendingRecordRecovery || blockedEntryRecovery) return;
    if (editing) {
      setMessageTone("success");
      setMessage("Você já tem um registro não salvo. Ele foi mantido nesta sessão.");
      navigatePatient({
        area: "records",
        resourceView: "index",
        toolId: null,
        educationSlug: null,
      });
      return;
    }
    setSelectedToolId(toolId);
    setEntryReturn({ kind: "tool", id: toolId });
    editorOriginRef.current = null;
    setEditorDirty(false);
    setEditorAnnouncement("Formulário para um novo registro aberto.");
    setEntryDraft({ ...blankEntry });
    setEditing("new");
    setEditorVisible(true);
    setMessage("");
    navigatePatient({
      area: "records",
      resourceView: "index",
      toolId: null,
      educationSlug: null,
    });
  }
  function confirmDiscard(): boolean {
    return !editorDirty || window.confirm("Descartar as alterações que ainda não foram salvas?");
  }
  function cancelEntry() {
    if (!confirmDiscard()) return;
    const origin = editorOriginRef.current;
    const returnTo = entryReturn;
    setEditing(null);
    setEditorVisible(false);
    setEntryDraft(null);
    setEditorDirty(false);
    setEditorAnnouncement("");
    setEntryReturn(null);
    editorOriginRef.current = null;
    if (!returnTo) {
      if (origin) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: origin.scrollY, behavior: "auto" });
          origin.trigger.focus({ preventScroll: true });
        });
      }
      return;
    }
    navigatePatient({
      area: "resources",
      resourceView: returnTo.kind === "reading" ? "readings" : "tools",
      toolId: returnTo.kind === "tool" ? returnTo.id : null,
      educationSlug: returnTo.kind === "reading" ? returnTo.id : null,
    });
  }
  function openEditRecord(entry: Entry, trigger: HTMLButtonElement) {
    if (editing) {
      if (editing !== "new" && editing.id === entry.id) {
        setEditorVisible(true);
        setEditorAnnouncement(`Edição do registro “${entry.title}” retomada.`);
        return;
      }
      setMessageTone("success");
      setMessage("Conclua ou descarte o registro não salvo antes de editar outro.");
      document.getElementById("patient-paused-draft-title")?.focus();
      return;
    }
    editorOriginRef.current = {
      entryId: entry.id,
      scrollY: window.scrollY,
      trigger,
    };
    setEntryReturn(null);
    setEditorDirty(false);
    setEditorAnnouncement(`Edição do registro “${entry.title}” aberta.`);
    setMessage("");
    setEntryDraft(entryDraftFrom(entry));
    setEditing(entry);
    setEditorVisible(true);
  }
  function discardPausedDraft() {
    if (!confirmDiscard()) return;
    setEditing(null);
    setEditorVisible(false);
    setEntryDraft(null);
    setEntryReturn(null);
    setEditorDirty(false);
    setEditorAnnouncement("");
    editorOriginRef.current = null;
    setMessageTone("success");
    setMessage("Registro não salvo descartado.");
    window.requestAnimationFrame(() => {
      document.getElementById("records-title")?.focus();
    });
  }
  function recoverBlockedEntryAsNew() {
    if (!blockedEntryRecovery || editing) return;
    setEntryDraft({ ...blockedEntryRecovery.editor.draft });
    setEntryReturn(blockedEntryRecovery.editor.entryReturn);
    setEditing("new");
    setEditorVisible(true);
    setEditorDirty(true);
    setBlockedEntryRecovery(null);
    setRecordRecoveryAnnouncement("Seu texto foi colocado em um novo rascunho privado. Ele ainda não foi salvo.");
    navigatePatient({ area: "records", resourceView: "index", toolId: null, educationSlug: null });
  }
  function discardBlockedEntryRecovery() {
    if (!window.confirm("Descartar este texto que ainda não foi salvo?")) return;
    setBlockedEntryRecovery(null);
  }
  function discardUnavailableThoughtReviews() {
    if (!window.confirm("Descartar somente os rascunhos ligados a registros indisponíveis?")) return;
    const ids = new Set(entries.map(entry => entry.id));
    setThoughtReviewSnapshots(current => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
  }
  function openRecordHistory() {
    setEditorVisible(false);
    navigatePatient({
      area: "records",
      resourceView: "index",
      toolId: null,
      educationSlug: null,
    });
  }
  function changeArea(nextArea: PatientArea) {
    if (area === nextArea && nextArea === "records") {
      if (editorVisible) setEditorVisible(false);
      return;
    }
    if (area === nextArea && nextArea !== "resources") return;
    if (nextArea === "records") setEditorVisible(false);
    navigatePatient({
      area: nextArea,
      resourceView: "index",
      toolId: null,
      educationSlug: null,
    });
  }
  function openResourceIndex() {
    navigatePatient({
      area: "resources",
      resourceView: "index",
      toolId: null,
      educationSlug: null,
    });
  }
  function changeResourceView(
    nextView: PatientResourceView,
    mode: PatientNavigationMode = "push",
  ) {
    const route: PatientRoute = {
      area: "resources",
      resourceView: nextView,
      toolId: null,
      educationSlug: null,
    };
    if (mode === "return") returnPatient(route);
    else navigatePatient(route, mode === "replace");
  }
  function changeTool(
    toolId: string | null,
    mode: PatientNavigationMode = "push",
  ) {
    const route: PatientRoute = {
      area: "resources",
      resourceView: "tools",
      toolId,
      educationSlug: null,
    };
    if (mode === "return") returnPatient(route);
    else navigatePatient(route, mode === "replace");
  }
  function changeEducationArticle(
    slug: string | null,
    mode: PatientNavigationMode = "push",
  ) {
    const route: PatientRoute = {
      area: "resources",
      resourceView: "readings",
      toolId: null,
      educationSlug: slug,
    };
    if (mode === "return") returnPatient(route);
    else navigatePatient(route, mode === "replace");
  }
  function refreshEntries(retryAfterError = false) {
    if (entriesRefreshLock.current || entriesRequestsInFlight.current > 0) return;
    entriesRefreshLock.current = true;
    if (retryAfterError) {
      // The retry button disappears when load clears the error. Hand focus to
      // the current, persistent heading before that commit, never after await.
      const targetId = area === "home" ? "patient-home-title"
        : editorVisible ? "entry-form-title" : "records-title";
      document.getElementById(targetId)?.focus();
      setLoading(true);
    }
    void load(!retryAfterError)
      .then((freshEntries) => {
        if (freshEntries) setEntriesRefreshAnnouncement({ area, message: "Seus registros foram atualizados." });
      })
      .finally(() => {
        entriesRefreshLock.current = false;
      });
  }
  function focusEntrySearch() {
    window.requestAnimationFrame(() => {
      if (entrySearchPanelRef.current) entrySearchPanelRef.current.open = true;
      entrySearchRef.current?.focus();
    });
  }
  const sharedCount = entries.filter(isEntryShared).length;
  const privateCount = entries.length - sharedCount;
  const sharedViewCounts = entries.reduce(
    (counts, entry) => {
      if (isEntryShared(entry)) {
        const status = patientEntryViewStatus(entry).kind;
        if (status !== "private") counts[status] += 1;
      }
      return counts;
    },
    { unseen: 0, viewed: 0, updated: 0, reshared: 0 },
  );
  const awaitingViewCount =
    sharedViewCounts.unseen + sharedViewCounts.updated + sharedViewCounts.reshared;
  const visibleEntries = useMemo(
    () => filterAndSortPatientEntries(entries, entryFilter, entryQuery, entrySort),
    [entries, entryFilter, entryQuery, entrySort],
  );
  const hasEntryQuery = Boolean(entryQuery.trim());
  const recordMonthGroups = useMemo(
    () => groupPatientEntriesByMonth(visibleEntries),
    [visibleEntries],
  );
  const hasActiveEntryControls =
    hasEntryQuery || entryFilter !== "all" || entrySort !== "newest";
  const filterLabels: Array<{
    value: PatientEntrySharingFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "Todos", count: entries.length },
    { value: "private", label: "Privados", count: privateCount },
    { value: "shared", label: "Com Mateus", count: sharedCount },
  ];
  const entryReturnTool =
    entryReturn?.kind === "tool" ? findPatientTool(entryReturn.id) : null;
  const entryGuidance =
    entryReturn?.kind === "reading"
      ? "O que chamou sua atenção neste texto? Registre somente o que fizer sentido para você."
      : entryReturnTool
        ? `Se quiser, use esta pergunta como ponto de partida: ${entryReturnTool.recordPrompt}`
        : undefined;
  return (
    <main className="dashboard patient-dashboard" id="conteudo" tabIndex={-1}>
      <nav className="patient-navigation" aria-label="Navegação da Área do paciente">
        <button
          type="button"
          className={area === "home" ? "active" : ""}
          aria-current={area === "home" ? "page" : undefined}
          onClick={() => changeArea("home")}
        >
          Início
        </button>
        <button
          type="button"
          className={area === "records" ? "active" : ""}
          aria-current={area === "records" ? "page" : undefined}
          onClick={() => changeArea("records")}
        >
          Meus registros
        </button>
        <button
          type="button"
          className={area === "map" ? "active" : ""}
          aria-current={area === "map" ? "page" : undefined}
          onClick={() => changeArea("map")}
        >
          Meu mapa
        </button>
        <button
          type="button"
          className={area === "resources" ? "active" : ""}
          aria-current={area === "resources" ? "page" : undefined}
          onClick={openResourceIndex}
        >
          Recursos
        </button>
      </nav>

      <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
        {refreshing ? "Atualizando seus registros." : entriesRefreshAnnouncement?.area === area ? entriesRefreshAnnouncement.message : ""}
      </p>

      {recordRecoveryAnnouncement && (Boolean(editing && editorDirty) || blockedEntryRecovery ||
        Object.keys(thoughtReviewSnapshots).length > 0) ? <Notice tone="success" message={recordRecoveryAnnouncement} /> : null}
      {!loading && !entriesError ? <PatientRecoveredDrafts
        entry={blockedEntryRecovery}
        thoughtReviews={Object.entries(thoughtReviewSnapshots).filter(([id]) => !entries.some(entry => entry.id === id))
          .map(([entryId, snapshot]) => ({ entryId, snapshot }))}
        onRecoverEntryAsNew={recoverBlockedEntryAsNew}
        onDiscardEntry={discardBlockedEntryRecovery}
        onDiscardThoughtReviews={discardUnavailableThoughtReviews}
      /> : null}

      {entriesError && (area === "home" || area === "records") ? (
        <div className="panel error-state">
          <Notice
            tone="error"
            message={`${entriesError} Nenhum registro foi alterado por esta tentativa.`}
          />
          <button className="secondary-button" type="button" onClick={() => refreshEntries(true)}>
            Tentar carregar os registros novamente
          </button>
        </div>
      ) : null}

      {area === "home" ? (
        <section className="patient-home" aria-labelledby="patient-home-title">
          <section className="dashboard-hero patient-hero">
            <div className="patient-hero-copy">
              <h1 id="patient-home-title" tabIndex={-1}>Olá, {user.name}.</h1>
              <p>Registros, mapa e materiais para acompanhar sua terapia.</p>
            </div>
            <PatientQuickRecordAction hasDraft={Boolean(editing)} onRecord={openNewRecord} />
          </section>

          <div className="patient-home-workspace">
          <PatientNotices patientId={user.id} csrf={csrf} onSessionLost={onSessionLost} />
          <PatientHomeActions hasDraft={Boolean(editing)} onRecord={openNewRecord} onHistory={openRecordHistory} onMap={() => changeArea("map")} onResources={openResourceIndex} />
          </div>

          <section className="patient-overview" aria-label="Resumo da Área do paciente">
            <header className="patient-overview-heading">
              <h2>Resumo dos registros</h2>
              <button className="patient-overview-refresh" type="button" disabled={loading} aria-disabled={loading || refreshing} onClick={() => refreshEntries()}>
                <span aria-hidden="true">↻</span> {refreshing ? "Atualizando…" : "Atualizar"}
              </button>
            </header>
            {entriesError && entries.length > 0 ? <p className="patient-summary-stale">Este resumo mostra os últimos dados carregados. Tente atualizar para conferir se houve mudanças.</p> : null}
            <div className="patient-overview-metrics">
              <article>
                <span className="overview-number">{loading ? "…" : entriesError && entries.length === 0 ? "—" : entries.length}</span>
                <div>
                  <strong>{entries.length === 1 ? "registro no histórico" : "registros no histórico"}</strong>
                  <small>
                    {loading ? "Consultando seus registros…" : entriesError && entries.length === 0 ? "Resumo indisponível. Tente carregar novamente." : privateCount === 0
                      ? "Nenhum registro está privado."
                      : privateCount === 1
                        ? "1 privado · só você vê."
                        : `${privateCount} privados · só você vê.`}
                  </small>
                </div>
              </article>
              <article className="patient-sharing-overview">
                <span className="overview-number">{loading ? "…" : entriesError && entries.length === 0 ? "—" : sharedCount}</span>
                <div>
                  <strong>{sharedCount === 1 ? "compartilhado com Mateus" : "compartilhados com Mateus"}</strong>
                  {loading ? (
                    <small>Consultando visualizações…</small>
                  ) : entriesError && entries.length === 0 ? (
                    <small>Não foi possível consultar os compartilhamentos.</small>
                  ) : sharedCount === 0 ? (
                    <small>Nenhum registro está visível para Mateus.</small>
                  ) : (
                    <ul className="patient-sharing-states" aria-label="Visualização dos registros compartilhados">
                      {sharedViewCounts.viewed > 0 ? (
                        <li className="viewed">
                          <span aria-hidden="true">✓</span>
                          <div className="patient-sharing-state-copy"><strong className="patient-sharing-state-count">{sharedViewCounts.viewed}</strong>{" "}{sharedViewCounts.viewed === 1 ? "visualizado" : "visualizados"}</div>
                        </li>
                      ) : null}
                      {awaitingViewCount > 0 ? (
                        <li className="pending">
                          <span aria-hidden="true" />
                          <div className="patient-sharing-state-copy"><strong className="patient-sharing-state-count">{awaitingViewCount}</strong>{" "}{awaitingViewCount === 1 ? "aguarda visualização" : "aguardam visualização"}</div>
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              </article>
            </div>
            <footer className="patient-overview-footer">
              <span className="patient-home-privacy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3" /></svg><span>Seus registros começam privados. Nada é compartilhado automaticamente.</span></span>
              <button className="patient-sharing-history-link" type="button" onClick={openRecordHistory}>Abrir meus registros <span aria-hidden="true">→</span></button>
            </footer>
          </section>

          <details className="patient-how-to">
            <summary>Como usar esta área</summary>
            <div>
              <ol className="patient-how-to-steps">
                <li><span aria-hidden="true">1</span><p><strong>Registre quando fizer sentido.</strong> Não precisa escrever toda semana nem preencher todos os campos.</p></li>
                <li><span aria-hidden="true">2</span><p><strong>O registro começa privado.</strong> Só você consegue ver o que acabou de salvar.</p></li>
                <li><span aria-hidden="true">3</span><p><strong>Você escolhe se quer compartilhar.</strong> As leituras e buscas não são informadas a Mateus.</p></li>
              </ol>
              <p>Esta área ajuda a organizar assuntos para a psicoterapia, mas não é acompanhada em tempo real e não substitui ajuda imediata. <a href={config.care_url}>Consulte Cuidados e ajuda imediata.</a></p>
            </div>
          </details>
        </section>
      ) : area === "records" ? (
        <>
          <p className="sr-status" role="status" aria-live="polite" aria-atomic="true">
            {editorAnnouncement}
          </p>
          {message ? <Notice tone={messageTone} message={message} /> : null}
          {editing && editorVisible ? (
            <EntryForm
              key={
                editing === "new"
                  ? entryReturn
                    ? `${entryReturn.kind}-${entryReturn.id}`
                    : "new"
                  : editing.id
              }
              initial={editing === "new" ? undefined : editing}
              draft={entryDraft ?? entryDraftFrom(editing === "new" ? undefined : editing)}
              guideUrl={config.guide_url}
              guidance={entryGuidance}
              onSave={save}
              onCancel={cancelEntry}
              onDraftChange={updateEntryDraft}
              onDirtyChange={setEditorDirty}
            />
          ) : null}
          {!editorVisible ? (
          <section className="records-section" aria-labelledby="records-title">
        <div className="section-heading patient-records-heading">
          <div>
            <h1 id="records-title" tabIndex={-1}>Meus registros</h1>
            <p>Seus registros, privados ou compartilhados com Mateus.</p>
          </div>
          <div className="patient-records-heading-actions">
            <span className="count">
              {loading
                ? "Carregando…"
                : entriesError && entries.length === 0
                  ? "Contagem indisponível"
                  : hasEntryQuery || entryFilter !== "all"
                    ? `${visibleEntries.length} de ${entries.length}`
                    : `${entries.length} ${entries.length === 1 ? "registro" : "registros"}`}
            </span>
            <button
              className="secondary-button compact-button patient-record-refresh"
              type="button"
              disabled={loading}
              aria-disabled={loading || refreshing}
              onClick={() => refreshEntries()}
            >
              {refreshing ? "Atualizando…" : "Atualizar"}
            </button>
            <button className="primary-button compact-button" type="button" onClick={openNewRecord}>
              {editing ? "Continuar registro" : "Novo registro"}
            </button>
          </div>
        </div>
        {editing ? (
          <aside className="patient-paused-draft" aria-labelledby="patient-paused-draft-title">
            <div>
              <p className="eyebrow">RASCUNHO NESTA SESSÃO</p>
              <h2 id="patient-paused-draft-title" tabIndex={-1}>Seu registro continua guardado.</h2>
              <p>Você pode consultar o histórico e retomar a escrita quando quiser.</p>
            </div>
            <div className="patient-paused-draft-actions">
              <button className="secondary-button" type="button" onClick={openNewRecord}>
                Continuar escrevendo
              </button>
              <button className="quiet-button" type="button" onClick={discardPausedDraft}>
                Descartar
              </button>
            </div>
          </aside>
        ) : null}
        {loading ? <div className="empty-state patient-loading"><div className="loader" /><p>Carregando seus registros…</p></div> : entriesError && entries.length === 0 ? null : entries.length === 0 ? (
          <div className="empty-state patient-empty-state">
            <h2>Ainda não há registros.</h2>
            <p>Você pode começar com uma situação breve. Não precisa entender tudo antes de escrever.</p>
            <div className="empty-state-actions"><button className="primary-button" onClick={openNewRecord}>Criar o primeiro registro</button><a className="secondary-button" href={config.guide_url} target="_blank" rel="noopener noreferrer">Explorar o Guia de Emoções <span className="sr-status">(abre em nova aba)</span></a></div>
          </div>
        ) : <>
          <div className="patient-record-finder">
          <div className="patient-entry-toolbar" role="group" aria-label="Filtrar registros por compartilhamento">
            {filterLabels.map((item) => (
              <button
                key={item.value}
                className={entryFilter === item.value ? "active" : ""}
                type="button"
                aria-pressed={entryFilter === item.value}
                onClick={() => setEntryFilter(item.value)}
              >
                <span>{item.label}</span>
                <small>{item.count}</small>
              </button>
            ))}
          </div>
          <details className="patient-record-search-panel" ref={entrySearchPanelRef}>
            <summary>
              <svg className="patient-record-search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
              <span className="patient-record-search-label">Buscar e ordenar</span>
              {hasEntryQuery || entrySort !== "newest" ? (
                <span className="patient-record-search-state">{hasEntryQuery ? "Busca ativa" : ""}{hasEntryQuery && entrySort !== "newest" ? " · " : ""}{entrySort !== "newest" ? "Mais antigos primeiro" : ""}</span>
              ) : null}
              <svg className="patient-record-search-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
          <div className="patient-record-search-row">
            <label className="field patient-record-search">
              <span>Buscar nos meus registros</span>
              <input
                ref={entrySearchRef}
                type="search"
                value={entryQuery}
                onChange={(event) => setEntryQuery(event.target.value)}
                placeholder="Ex.: trabalho ansiedade"
                autoComplete="off"
                aria-describedby="patient-record-search-hint"
              />
              <small id="patient-record-search-hint">Pode combinar palavras. A busca acontece somente nesta tela.</small>
            </label>
            <label className="field patient-record-order">
              <span>Ordenar</span>
              <select
                value={entrySort}
                onChange={(event) => setEntrySort(event.target.value as PatientEntrySort)}
              >
                <option value="newest">Mais recentes primeiro</option>
                <option value="oldest">Mais antigos primeiro</option>
              </select>
            </label>
          </div>
          </details>
          {hasActiveEntryControls ? (
            <div className="filter-reset-row">
              <button
                className="filter-reset-button"
                type="button"
                onClick={() => {
                  setEntryQuery("");
                  setEntryFilter("all");
                  setEntrySort("newest");
                  focusEntrySearch();
                }}
              >
                Limpar busca e filtros
              </button>
            </div>
          ) : null}
          </div>
          <div className="sr-status" aria-live="polite">
            {hasEntryQuery
              ? `${visibleEntries.length} ${visibleEntries.length === 1 ? "registro encontrado" : "registros encontrados"} para a busca.`
              : entryFilter === "all"
                ? `Exibindo todos os ${entries.length} registros.`
                : entryFilter === "private"
                  ? `Exibindo ${privateCount} ${privateCount === 1 ? "registro privado" : "registros privados"}.`
                  : `Exibindo ${sharedCount} ${sharedCount === 1 ? "registro compartilhado" : "registros compartilhados"}.`}
          </div>
          {visibleEntries.length === 0 ? (
            <div className="empty-state patient-filter-empty">
              <h2>{hasEntryQuery ? "Nenhum registro encontrado." : entryFilter === "shared" ? "Nenhum registro compartilhado agora." : "Nenhum registro privado agora."}</h2>
              <p>{hasEntryQuery ? "Tente outra palavra ou limpe a busca para voltar ao histórico." : entryFilter === "shared" ? "Quando você decidir compartilhar um registro com Mateus, ele aparecerá aqui." : "Você pode deixar um registro privado novamente abrindo-o e retirando o compartilhamento."}</p>
              <div className="button-row">
                {hasEntryQuery ? <button className="secondary-button" type="button" onClick={() => {
                  setEntryQuery("");
                  focusEntrySearch();
                }}>Limpar busca</button> : null}
                {entryFilter !== "all" ? <button className="secondary-button" type="button" onClick={() => {
                  setEntryFilter("all");
                  focusEntrySearch();
                }}>Mostrar todos</button> : null}
              </div>
            </div>
          ) : <div className="record-list patient-record-list">{recordMonthGroups.map((group) => (
            <section className="patient-record-month" key={group.key} aria-labelledby={`patient-record-month-${group.key}`}>
              <header className="patient-record-month-heading">
                <h2 id={`patient-record-month-${group.key}`}>{group.label}</h2>
                <span>{group.entries.length} {group.entries.length === 1 ? "registro" : "registros"}</span>
              </header>
              <div className="patient-record-month-items">{group.entries.map((entry) => {
          const shared = isEntryShared(entry);
          const viewStatus = patientEntryViewStatus(entry);
          const entryAction = entryActions[entry.id];
          return (
            <details className="record-card patient-record-card" id={`record-${entry.id}`} key={entry.id}>
              <summary>
                <span className="record-summary-marker" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg>
                </span>
                <span className="patient-record-summary-copy">
                  <strong>{entry.title}</strong>
                  <small className="patient-record-meta"><time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time><span>{entry.emotion || "sem emoção definida"} · intensidade {entry.intensity}/10</span></small>
                  <span className="patient-record-statuses">
                    <span className={`status ${shared ? "shared" : "private"}`}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{shared ? <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></> : <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>}</svg>
                      {shared ? "Compartilhado com Mateus" : "Privado · só você vê"}
                    </span>
                    {shared ? (
                      <span className={`patient-view-summary ${viewStatus.kind}`}>
                        <span className="patient-view-summary-marker" aria-hidden="true" />
                        {patientEntryViewSummary(viewStatus)}
                      </span>
                    ) : null}
                  </span>
                  {entry.message.trim() || entry.thought_review ? (
                    <span className="patient-record-tags">
                      {entry.message.trim() ? <span className="status session-note">Para a próxima sessão</span> : null}
                      {entry.thought_review ? <span className="status thought-review-status">Pensamento revisto</span> : null}
                    </span>
                  ) : null}
                </span>
                <span className="patient-record-toggle" aria-hidden="true"><span className="when-closed">Abrir</span><span className="when-open">Fechar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></span>
              </summary>
              <div className="patient-record-content" aria-busy={Boolean(entryAction)}>
                {shared ? (
                  <aside className="patient-record-view-note" aria-label="Visualização por Mateus">
                    <p className={`patient-view-status ${viewStatus.kind}`}>
                      {viewStatus.kind === "unseen"
                        ? "Ainda não visualizado por Mateus"
                        : viewStatus.kind === "updated"
                          ? `Atualizado após a última visualização de Mateus em ${formatViewTimestamp(entry.viewed_at!)}`
                          : viewStatus.kind === "reshared"
                            ? `Visualizado anteriormente por Mateus em ${formatViewTimestamp(entry.viewed_at!)}; ainda não visualizado após o compartilhamento atual`
                            : `Visualizado por Mateus em ${formatViewTimestamp(entry.viewed_at!)}`}
                    </p>
                    <p className="patient-view-explanation">A confirmação mostra que Mateus marcou este registro como visualizado. Isso não significa resposta, avaliação clínica completa ou acompanhamento em tempo real.</p>
                  </aside>
                ) : null}
                <EntryDetails entry={entry} />
                {entry.thoughts.trim() ||
                entry.thought_review ||
                thoughtReviewSnapshots[entry.id] ? (
                  <ThoughtReviewEditor
                    entryId={entry.id}
                    thoughts={entry.thoughts}
                    review={entry.thought_review}
                    shared={shared}
                    csrf={csrf}
                    onSaved={(review, updatedAt) =>
                      saveThoughtReview(entry.id, review, updatedAt)
                    }
                    onDeleted={(updatedAt) => deleteThoughtReview(entry.id, updatedAt)}
                    recovery={thoughtReviewSnapshots[entry.id] ?? null}
                    onSnapshotChange={updateThoughtReviewSnapshot}
                  />
                ) : null}
                <div className="record-actions">
                  <button
                    className={shared ? "secondary-button" : "share-button"}
                    type="button"
                    disabled={Boolean(entryAction)}
                    onClick={() => void sharing(entry)}
                  >
                    {entryAction === "sharing"
                      ? "Atualizando compartilhamento…"
                      : shared
                        ? "Deixar privado novamente"
                        : "Compartilhar com Mateus"}
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={Boolean(entryAction)}
                    onClick={(event) => openEditRecord(entry, event.currentTarget)}
                  >
                    Editar
                  </button>
                  <button
                    className="danger-link"
                    type="button"
                    disabled={Boolean(entryAction)}
                    onClick={() => void remove(entry)}
                  >
                    {entryAction === "removing" ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </div>
            </details>
          );
        })}</div>
            </section>
          ))}</div>}
          <a className="records-guide-callout" href={config.guide_url} target="_blank" rel="noopener noreferrer">
            <span>Está difícil nomear o que sentiu?</span>
            <strong>Consultar o Guia de Emoções → <span className="external-link-note">(nova aba)</span></strong>
          </a>
        </>}
          </section>
          ) : null}
        </>
      ) : area === "map" ? (
        <PatientMapShell
          csrf={csrf}
          draft={patientMap.draft}
          onDraftChange={patientMap.updateDraft}
          loadState={patientMap.loadState}
          loadMessage={patientMap.loadMessage}
          saveState={patientMap.saveState}
          saveMessage={patientMap.saveMessage}
          conflict={patientMap.conflict}
          clearing={patientMap.clearing}
          onRetryLoad={patientMap.retryLoad}
          onRetrySave={patientMap.retryPending}
          onResolveConflict={patientMap.resolveConflict}
          onClearDraft={patientMap.clearDraft}
          onSaveAndExit={patientMap.flushPending}
          onBackHome={() => changeArea("home")}
        />
      ) : (
        <PatientResources
          view={resourceView}
          guideUrl={config.guide_url}
          careUrl={config.care_url}
          selectedEducationSlug={selectedEducationSlug}
          selectedToolId={selectedToolId}
          onViewChange={changeResourceView}
          onArticleChange={changeEducationArticle}
          onToolChange={changeTool}
          onCreateRecordFromReading={createRecordFromEducation}
          onCreateRecordFromTool={createRecordFromTool}
        />
      )}
      {!editing ? <AccountPanel role="patient" csrf={csrf} config={config} setRecovery={setRecovery} getAccountActionVersion={getAccountActionVersion} onSessionsEnded={onSessionLost} /> : null}
    </main>
  );
}

function PatientAccountGroup({
  enabled = true,
  title,
  children,
}: {
  enabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  if (!enabled) return <>{children}</>;
  return (
    <section className="patient-account-group" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {children}
    </section>
  );
}

function PatientAccountAction({
  enabled = true,
  title,
  description,
  titleId,
  danger = false,
  children,
}: {
  enabled?: boolean;
  title: string;
  description: string;
  titleId?: string;
  danger?: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <details className={`patient-account-action${danger ? " patient-account-action-danger" : ""}`}>
      <summary>
        <span className="patient-account-action-copy">
          <strong className="patient-account-action-title" id={titleId}>{title}</strong>
          <small>{description}</small>
        </span>
        <svg className="patient-account-action-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="patient-account-action-body">{children}</div>
    </details>
  );
}

function AccountPanel({
  role,
  csrf,
  config,
  setRecovery,
  getAccountActionVersion,
  onSessionsEnded,
}: {
  role: Role;
  csrf: string;
  config: Config;
  setRecovery: (code: string) => void;
  getAccountActionVersion: () => number;
  onSessionsEnded: () => void;
}) {
  type AccountAction = "password" | "recovery" | "sessions" | "delete";
  const [messages, setMessages] = useState<Partial<Record<AccountAction, {
    tone: "error" | "success";
    text: string;
    focus: boolean;
  }>>>({});
  const [invalidPasswordField, setInvalidPasswordField] = useState<
    "confirmation" | null
  >(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [mfaRecoveryCodesBusy, setMfaRecoveryCodesBusy] = useState(false);
  const [mfaRecoveryCodesStatus, setMfaRecoveryCodesStatus] =
    useState<MfaRecoveryCodeStatus | null>(null);
  const [mfaRecoveryCodesStatusBusy, setMfaRecoveryCodesStatusBusy] = useState(
    role === "therapist",
  );
  const [mfaRecoveryCodesStatusError, setMfaRecoveryCodesStatusError] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [mfaTransferBusy, setMfaTransferBusy] = useState(false);
  const [mfaTransfer, setMfaTransfer] = useState<MfaTransferDetails | null>(null);
  const [mfaTransferFeedback, setMfaTransferFeedback] = useState<{
    tone: "error" | "success" | "info";
    text: string;
  } | null>(null);
  const closeMfaTransfer = useCallback(() => {
    setMfaTransfer(null);
  }, []);
  const expireMfaTransfer = useCallback(() => {
    setMfaTransfer(null);
    setMfaTransferFeedback({
      tone: "info",
      text: "O tempo para copiar a chave terminou. Nada foi alterado. Quando quiser, comece novamente.",
    });
  }, []);
  const confirmMfaTransfer = useCallback(() => {
    setMfaTransfer(null);
    setMfaTransferFeedback({
      tone: "success",
      text: "Pronto. O Mac já gera os códigos do seu acesso profissional. Antes de entregar o iPhone antigo, saia e entre uma vez usando um código do Mac.",
    });
  }, []);
  const [endingSessions, setEndingSessions] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const passwordRequestInFlight = useRef(false);
  const recoveryRequestInFlight = useRef<{
    controller: AbortController;
    stopFocusWatch: () => void;
  } | null>(null);
  const mfaRecoveryCodesRequestInFlight = useRef(false);
  const mfaTransferRequestInFlight = useRef(false);
  const endSessionsRequestInFlight = useRef(false);
  const deleteAccountRequestInFlight = useRef(false);
  const exportRequestInFlight = useRef<AbortController | null>(null);

  useLayoutEffect(() => () => {
    // Invalidate during the unmount commit, before a response microtask can
    // download a private file or reveal a recovery code outside this account.
    exportRequestInFlight.current?.abort();
    exportRequestInFlight.current = null;
    recoveryRequestInFlight.current?.controller.abort();
    recoveryRequestInFlight.current?.stopFocusWatch();
    recoveryRequestInFlight.current = null;
  }, []);

  const loadMfaRecoveryCodesStatus = useCallback(async () => {
    if (role !== "therapist") return;
    setMfaRecoveryCodesStatusBusy(true);
    setMfaRecoveryCodesStatusError("");
    try {
      const result = await portalRequest<{
        remaining: number;
        total: number;
        generated_at: string | null;
      }>("/account/mfa-recovery-codes");
      setMfaRecoveryCodesStatus({
        remaining: result.remaining,
        total: result.total,
        generatedAt: result.generated_at,
      });
    } catch (error) {
      if (isSessionExpiredError(error)) {
        onSessionsEnded();
        return;
      }
      setMfaRecoveryCodesStatusError((error as Error).message);
    } finally {
      setMfaRecoveryCodesStatusBusy(false);
    }
  }, [onSessionsEnded, role]);

  useEffect(() => {
    if (role !== "therapist") return;
    let active = true;
    void portalRequest<{
      remaining: number;
      total: number;
      generated_at: string | null;
    }>("/account/mfa-recovery-codes")
      .then((result) => {
        if (!active) return;
        setMfaRecoveryCodesStatus({
          remaining: result.remaining,
          total: result.total,
          generatedAt: result.generated_at,
        });
      })
      .catch((error) => {
        if (!active) return;
        if (isSessionExpiredError(error)) {
          onSessionsEnded();
          return;
        }
        setMfaRecoveryCodesStatusError((error as Error).message);
      })
      .finally(() => {
        if (active) setMfaRecoveryCodesStatusBusy(false);
      });
    return () => {
      active = false;
    };
  }, [onSessionsEnded, role]);

  function setAccountMessage(action: AccountAction, text: string, tone: "error" | "success" = "error", focus = tone === "error") {
    setMessages((current) => ({ ...current, [action]: text ? { tone, text, focus } : undefined }));
  }
  function watchAccountActionFocus(formElement: HTMLFormElement) {
    let movedElsewhere = false;
    const track = (event: Event) => {
      const target = event.target;
      // Safari may leave focus on body after a pointer submission. Only a real
      // interaction elsewhere should cancel this request's focus destination.
      if (target instanceof Node && !formElement.contains(target) &&
        !(event.type === "focusin" && (target === document.body || target === document.documentElement))) {
        movedElsewhere = true;
      }
    };
    document.addEventListener("focusin", track, true);
    document.addEventListener("pointerdown", track, true);
    return {
      canFocus: () => !movedElsewhere && formElement.isConnected && !formElement.closest("details:not([open])"),
      stop: () => {
        document.removeEventListener("focusin", track, true);
        document.removeEventListener("pointerdown", track, true);
      },
    };
  }
  function handleAccountError(error: unknown, action: AccountAction, shouldFocus: boolean) {
    if (isSessionExpiredError(error)) {
      onSessionsEnded();
      return;
    }
    setAccountMessage(action, (error as Error).message, "error", shouldFocus);
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordRequestInFlight.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setInvalidPasswordField(null);
    if (form.get("new_password") !== form.get("confirmation")) {
      setInvalidPasswordField("confirmation");
      setAccountMessage("password", "As novas senhas não coincidem.");
      window.requestAnimationFrame(() => {
        const confirmation = formElement.elements.namedItem("confirmation");
        if (confirmation instanceof HTMLInputElement) confirmation.focus();
      });
      return;
    }
    const focus = watchAccountActionFocus(formElement);
    passwordRequestInFlight.current = true;
    setPasswordBusy(true);
    setAccountMessage("password", "");
    try { await portalRequest("/account/password", { method: "PATCH", body: JSON.stringify({ current_password: form.get("current_password"), new_password: form.get("new_password"), totp: form.get("totp") }) }, csrf); formElement.reset(); setAccountMessage("password", "Senha alterada.", "success"); }
    catch (error) { handleAccountError(error, "password", focus.canFocus()); }
    finally {
      focus.stop();
      passwordRequestInFlight.current = false;
      setPasswordBusy(false);
    }
  }
  async function rotate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryRequestInFlight.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const focus = watchAccountActionFocus(formElement);
    const request = { controller: new AbortController(), stopFocusWatch: focus.stop };
    const accountActionVersion = getAccountActionVersion();
    recoveryRequestInFlight.current = request;
    const isCurrentRequest = () => recoveryRequestInFlight.current === request &&
      !request.controller.signal.aborted && getAccountActionVersion() === accountActionVersion;
    setRecoveryBusy(true);
    setAccountMessage("recovery", "");
    try {
      const result = await portalRequest<{ recovery_code: string }>("/account/recovery-code", {
        method: "POST",
        body: JSON.stringify({ current_password: form.get("current_password"), totp: form.get("totp") }),
        signal: request.controller.signal,
      }, csrf);
      if (!isCurrentRequest()) return;
      formElement.reset();
      setRecovery(result.recovery_code);
    } catch (error) {
      if (isCurrentRequest()) handleAccountError(error, "recovery", focus.canFocus());
    }
    finally {
      focus.stop();
      if (recoveryRequestInFlight.current === request) {
        recoveryRequestInFlight.current = null;
        setRecoveryBusy(false);
      }
    }
  }
  async function rotateMfaRecoveryCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mfaRecoveryCodesRequestInFlight.current) return;
    const confirmed = window.confirm(
      "Criar uma nova lista? Todos os códigos emergenciais anteriores deixarão de funcionar. Sua senha e o autenticador atual não serão alterados.",
    );
    if (!confirmed) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    mfaRecoveryCodesRequestInFlight.current = true;
    setMfaRecoveryCodesBusy(true);
    setMfaRecoveryCodesStatusError("");
    try {
      const result = await portalRequest<{
        recovery_codes: string[];
        generated_at: string;
      }>(
        "/account/mfa-recovery-codes",
        {
          method: "POST",
          body: JSON.stringify({
            current_password: form.get("current_password"),
            totp: form.get("totp"),
          }),
        },
        csrf,
      );
      if (!Array.isArray(result.recovery_codes) || result.recovery_codes.length === 0) {
        throw new Error("A nova lista não pôde ser exibida. Tente novamente.");
      }
      formElement.reset();
      setMfaRecoveryCodesStatus({
        remaining: result.recovery_codes.length,
        total: result.recovery_codes.length,
        generatedAt: result.generated_at,
      });
      setMfaRecoveryCodes(result.recovery_codes);
    } catch (error) {
      if (isSessionExpiredError(error)) {
        onSessionsEnded();
        return;
      }
      setMfaRecoveryCodesStatusError((error as Error).message);
    } finally {
      mfaRecoveryCodesRequestInFlight.current = false;
      setMfaRecoveryCodesBusy(false);
    }
  }
  async function prepareMfaTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mfaTransferRequestInFlight.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    mfaTransferRequestInFlight.current = true;
    setMfaTransferBusy(true);
    setMfaTransferFeedback(null);
    try {
      const result = await portalRequest<{
        totp_secret: string;
        ticket: string;
        expires_at: string;
      }>(
        "/account/mfa-transfer",
        {
          method: "POST",
          body: JSON.stringify({
            current_password: form.get("current_password"),
            totp: form.get("totp"),
          }),
        },
        csrf,
      );
      formElement.reset();
      setMfaTransfer({
        secret: result.totp_secret,
        ticket: result.ticket,
        expiresAt: result.expires_at,
      });
    } catch (error) {
      if (isSessionExpiredError(error)) {
        onSessionsEnded();
        return;
      }
      setMfaTransferFeedback({
        tone: "error",
        text: (error as Error).message,
      });
    } finally {
      mfaTransferRequestInFlight.current = false;
      setMfaTransferBusy(false);
    }
  }
  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteAccountRequestInFlight.current) return;
    if (!window.confirm("Excluir sua conta e todos os registros de forma permanente? Esta ação não pode ser desfeita.")) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const focus = watchAccountActionFocus(formElement);
    deleteAccountRequestInFlight.current = true;
    setDeletingAccount(true);
    setAccountMessage("delete", "");
    try { await portalRequest("/account", { method: "DELETE", body: JSON.stringify({ current_password: form.get("current_password") }) }, csrf); window.location.reload(); }
    catch (error) { handleAccountError(error, "delete", focus.canFocus()); }
    finally {
      focus.stop();
      deleteAccountRequestInFlight.current = false;
      setDeletingAccount(false);
    }
  }
  async function endAllSessions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (endSessionsRequestInFlight.current) return;
    if (
      !window.confirm(
        "Encerrar sua conta em todos os dispositivos? Você precisará entrar novamente. Seus registros e dados não serão apagados.",
      )
    ) {
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const focus = watchAccountActionFocus(formElement);
    endSessionsRequestInFlight.current = true;
    setEndingSessions(true);
    setAccountMessage("sessions", "");
    try {
      await portalRequest(
        "/account/sessions",
        {
          method: "DELETE",
          body: JSON.stringify({
            current_password: form.get("current_password"),
            totp: form.get("totp"),
          }),
        },
        csrf,
      );
      onSessionsEnded();
    } catch (error) {
      handleAccountError(error, "sessions", focus.canFocus());
    } finally {
      focus.stop();
      endSessionsRequestInFlight.current = false;
      setEndingSessions(false);
    }
  }
  async function downloadPatientData() {
    if (exportRequestInFlight.current) return;
    const controller = new AbortController();
    const accountActionVersion = getAccountActionVersion();
    exportRequestInFlight.current = controller;
    const isCurrentRequest = () => exportRequestInFlight.current === controller &&
      !controller.signal.aborted && getAccountActionVersion() === accountActionVersion;
    setExportBusy(true);
    setExportMessage(null);
    try {
      let response: Response;
      try {
        response = await fetch("/api/portal/export", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
      } catch {
        throw new PortalRequestError(
          0,
          "Não foi possível preparar a cópia. Verifique sua internet e tente novamente.",
        );
      }
      if (!isCurrentRequest()) return;
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        throw new PortalRequestError(
          response.status,
          typeof payload.error === "string"
            ? payload.error
            : "Não foi possível preparar a cópia agora.",
          payload,
        );
      }
      const data = await response.blob();
      // A response/body can finish after logout or another account has opened.
      // The old action must not create a private file outside its own lifetime.
      if (!isCurrentRequest()) return;
      const downloadUrl = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "meus-dados-area-do-paciente.json";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      setExportMessage({
        tone: "success",
        text: "Download iniciado. Procure o arquivo em Downloads.",
      });
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (isSessionExpiredError(error)) {
        onSessionsEnded();
        return;
      }
      setExportMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível preparar a cópia agora.",
      });
    } finally {
      if (exportRequestInFlight.current === controller) {
        exportRequestInFlight.current = null;
        setExportBusy(false);
      }
    }
  }
  return (
    <>
    <details className={`account-panel ${role === "patient" ? "patient-account-panel" : ""}`}>
      <summary>
        <span>{role === "patient" ? "Conta e privacidade" : "Segurança e conta"}</span>
        {role === "patient" ? <small>Cuide do seu acesso e dos seus dados</small> : null}
      </summary>
      <PatientAccountGroup enabled={role === "patient"} title="Acesso e recuperação">
      <div className="account-grid">
        <PatientAccountAction
          enabled={role === "patient"}
          title="Alterar senha"
          description="Escolha outra senha para entrar na sua conta."
        >
        <form className="stack panel" onSubmit={password} aria-busy={passwordBusy}>
          {role === "therapist" ? <h3>Alterar senha</h3> : null}
          <Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />
          <Field label="Nova senha ou frase-senha" name="new_password" type="password" autoComplete="new-password" required passwordRequirements hint="Não são 12 dígitos: pode ser uma frase curta com espaços. Use palavras fáceis para você e inclua pelo menos um número." />
          <Field
            label="Repita a nova senha"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            invalid={invalidPasswordField === "confirmation"}
            errorId={
              invalidPasswordField === "confirmation"
                ? "account-password-message"
                : undefined
            }
            onValueChange={() => {
              if (invalidPasswordField !== "confirmation") return;
              setInvalidPasswordField(null);
              setAccountMessage("password", "");
            }}
          />
          {role === "therapist" ? <Field label="Código do autenticador" name="totp" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} maxLength={12} hint="Digite ou cole os 6 números. Espaços e hífens são ignorados." required /> : null}
          <button className="secondary-button" aria-disabled={passwordBusy}>
            {passwordBusy ? "Alterando senha…" : "Alterar senha"}
          </button>
          {messages.password ? <Notice id="account-password-message" tone={messages.password.tone} message={messages.password.text} focusOnMount={messages.password.focus && !invalidPasswordField} /> : null}
        </form>
        </PatientAccountAction>
        <PatientAccountAction
          enabled={role === "patient"}
          title="Código para recuperar a senha"
          description="Prepare um código para usar se esquecer sua senha."
        >
        <form className="stack panel" onSubmit={rotate} aria-busy={recoveryBusy}>
          {role === "therapist" ? <h3>Código para recuperar a senha</h3> : null}
          {role === "patient" ? <p>Guarde o novo código em um lugar seguro. Se esquecer a senha, use-o em “Esqueci minha senha”, na tela de entrada.</p> : null}
          <p>
            O código atual deixará de funcionar.
            {role === "therapist" ? " Ele recupera a senha, mas não substitui o aplicativo autenticador." : ""}
          </p>
          <Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />
          {role === "therapist" ? <Field label="Código do autenticador" name="totp" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} maxLength={12} hint="Digite ou cole os 6 números. Espaços e hífens são ignorados." required /> : null}
          <button className="secondary-button" aria-disabled={recoveryBusy}>
            {recoveryBusy ? "Gerando código…" : "Criar novo código"}
          </button>
          {messages.recovery ? <Notice tone={messages.recovery.tone} message={messages.recovery.text} focusOnMount={messages.recovery.focus} /> : null}
        </form>
        </PatientAccountAction>
      </div>
      </PatientAccountGroup>
      {role === "therapist" ? (
        <section
          className="professional-recovery-codes"
          aria-labelledby="professional-recovery-codes-title"
          aria-busy={mfaRecoveryCodesStatusBusy || mfaRecoveryCodesBusy}
        >
          <div className="professional-recovery-codes-copy">
            <p className="mfa-status-line"><span aria-hidden="true" /> Recuperação independente</p>
            <h3 id="professional-recovery-codes-title">Códigos emergenciais do autenticador</h3>
            <p>
              Eles permitem recuperar o painel se você perder o celular e ficar sem
              qualquer autenticador. Você ainda precisará da sua senha. Cada código
              funciona uma única vez.
            </p>
            <div className="professional-recovery-codes-status" role="status" aria-live="polite">
              {mfaRecoveryCodesStatusBusy ? (
                <span>Consultando seus códigos…</span>
              ) : mfaRecoveryCodesStatus ? (
                <>
                  <strong>
                    {mfaRecoveryCodesStatus.remaining} de {mfaRecoveryCodesStatus.total} disponíveis
                  </strong>
                  <small>
                    {mfaRecoveryCodesStatus.generatedAt
                      ? `Lista criada em ${formatDate(mfaRecoveryCodesStatus.generatedAt)}.`
                      : "Crie sua primeira lista e guarde-a antes de precisar dela."}
                  </small>
                </>
              ) : (
                <span>Status indisponível no momento.</span>
              )}
            </div>
            <p className="professional-recovery-codes-safety">
              Criar uma lista nova invalida todos os códigos anteriores. A nova lista
              aparece uma única vez e não fica salva no navegador.
            </p>
          </div>
          <form className="stack" onSubmit={rotateMfaRecoveryCodes} aria-busy={mfaRecoveryCodesBusy}>
            <Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />
            <Field
              label="Código atual do autenticador"
              name="totp"
              autoComplete="one-time-code"
              inputMode="numeric"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={12}
              hint="Digite ou cole os 6 números. Espaços e hífens são ignorados."
              required
            />
            <button className="primary-button" disabled={mfaRecoveryCodesBusy}>
              {mfaRecoveryCodesBusy ? "Criando lista…" : "Criar 8 novos códigos"}
            </button>
          </form>
          {mfaRecoveryCodesStatusError ? (
            <div className="professional-recovery-codes-feedback">
              <Notice tone="error" message={mfaRecoveryCodesStatusError} focusOnMount />
              {!mfaRecoveryCodesBusy ? (
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => void loadMfaRecoveryCodesStatus()}
                >
                  Consultar novamente
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {role === "therapist" ? (
        <section className="professional-mfa-transfer" aria-labelledby="professional-mfa-transfer-title">
          <div className="professional-mfa-transfer-copy">
            <p className="mfa-status-line"><span aria-hidden="true" /> Prevenção opcional</p>
            <h3 id="professional-mfa-transfer-title">Quer preparar um segundo autenticador?</h3>
            <p>
              Cadastre a mesma chave em outro aparelho confiável. Pode ser celular,
              tablet, computador ou uma cópia física privada. O Mac é apenas uma opção,
              não uma dependência para recuperar o acesso.
            </p>
            <p className="professional-mfa-transfer-safety">
              Isso não muda sua conta. Se perder todos os autenticadores, use um código emergencial no login.
            </p>
          </div>
          <form className="stack" onSubmit={prepareMfaTransfer} aria-busy={mfaTransferBusy}>
            <Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />
            <Field
              label="Código atual do autenticador"
              name="totp"
              autoComplete="one-time-code"
              inputMode="numeric"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={12}
              hint="Use os 6 números do iPhone antigo ou do Mac já preparado. Se acabou de entrar, espere o número mudar."
              required
            />
            <button className="primary-button" disabled={mfaTransferBusy}>
              {mfaTransferBusy ? "Preparando…" : "Preparar segundo autenticador"}
            </button>
          </form>
          {mfaTransferFeedback ? (
            <div className="professional-mfa-transfer-feedback">
              <Notice
                tone={mfaTransferFeedback.tone}
                message={mfaTransferFeedback.text}
                focusOnMount={mfaTransferFeedback.tone === "error"}
              />
            </div>
          ) : null}
        </section>
      ) : null}
      {role === "therapist" ? <section className="account-sessions" aria-labelledby={`account-sessions-title-${role}`}>
        <div>
          <h3 id={`account-sessions-title-${role}`}>Sessões e dispositivos</h3>
          <p>
            Use esta opção se perdeu um aparelho ou deixou sua conta aberta. Você sairá
            de todos os dispositivos, inclusive deste. Seus registros não serão apagados.
          </p>
        </div>
        <form className="stack" onSubmit={endAllSessions} aria-busy={endingSessions}>
          <Field label="Senha atual para confirmar" name="current_password" type="password" autoComplete="current-password" required />
          {role === "therapist" ? <Field label="Código atual do autenticador" name="totp" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} maxLength={12} hint="Se acabou de entrar, aguarde o número exibido mudar e use o próximo código de 6 dígitos." required /> : null}
          <button className="danger-button" aria-disabled={endingSessions}>
            {endingSessions ? "Encerrando sessões…" : "Encerrar em todos os dispositivos"}
          </button>
          {messages.sessions ? <Notice tone={messages.sessions.tone} message={messages.sessions.text} focusOnMount={messages.sessions.focus} /> : null}
        </form>
      </section> : null}
      {role === "patient" ? (
        <>
        <PatientAccountGroup title="Seus dados">
        <div className="patient-account-actions">
          <PatientAccountAction
            title="Baixar uma cópia"
            titleId="account-data-copy-title"
            description="Guarde uma cópia dos dados que estão na sua conta."
          >
          <section
            className="account-data-copy"
            aria-labelledby="account-data-copy-title"
            aria-busy={exportBusy}
          >
            <div>
              <p>Reúna seus registros, o Meu mapa, os avisos recebidos e os dados básicos da conta em um arquivo para guardar com você.</p>
            </div>
            <p className="account-export-explanation">É uma cópia técnica para guardar ou encaminhar quando precisar. Para ler seus registros no dia a dia, use Meus registros.</p>
            <button
              className="secondary-button account-export-link"
              type="button"
              disabled={exportBusy}
              onClick={() => void downloadPatientData()}
            >
              {exportBusy ? "Preparando cópia…" : "Baixar cópia dos meus dados"}
            </button>
            {exportMessage ? (
              <div className="account-export-feedback">
                <Notice
                  tone={exportMessage.tone}
                  message={exportMessage.text}
                  focusOnMount={exportMessage.tone === "error"}
                />
              </div>
            ) : null}
            <small>A cópia inclui registros privados, o rascunho do Meu mapa e as partes que estão compartilhadas. Ela fica salva no seu dispositivo; faça isso somente em um aparelho seguro.</small>
          </section>
          </PatientAccountAction>
        </div>
        </PatientAccountGroup>
        <PatientAccountGroup title="Ações da conta">
        <div className="patient-account-actions">
          <PatientAccountAction
            title="Sessões e dispositivos"
            titleId="account-sessions-title-patient"
            description="Saia dos aparelhos em que sua conta está aberta."
          >
            <section className="account-sessions" aria-labelledby="account-sessions-title-patient">
              <p>
                Use esta opção se perdeu um aparelho ou deixou sua conta aberta. Você sairá
                de todos os dispositivos, inclusive deste. Seus registros não serão apagados.
              </p>
              <form className="stack" onSubmit={endAllSessions} aria-busy={endingSessions}>
                <Field label="Senha atual para confirmar" name="current_password" type="password" autoComplete="current-password" required />
                <button className="danger-button" aria-disabled={endingSessions}>
                  {endingSessions ? "Encerrando sessões…" : "Encerrar em todos os dispositivos"}
                </button>
                {messages.sessions ? <Notice tone={messages.sessions.tone} message={messages.sessions.text} focusOnMount={messages.sessions.focus} /> : null}
              </form>
            </section>
          </PatientAccountAction>
          <PatientAccountAction
            title="Excluir conta"
            titleId="account-delete-title"
            description="Apague sua conta e os dados de forma permanente."
            danger
          >
          <section className="account-delete" aria-labelledby="account-delete-title">
            <p>Esta ação apaga permanentemente sua conta, todos os seus registros, o Meu mapa e os avisos recebidos.</p>
            <form onSubmit={deleteAccount} aria-busy={deletingAccount}>
              <Field label="Senha atual para confirmar" name="current_password" type="password" autoComplete="current-password" required />
              <button className="danger-button" aria-disabled={deletingAccount}>
                {deletingAccount ? "Excluindo conta…" : "Excluir conta e registros"}
              </button>
              {messages.delete ? <Notice tone={messages.delete.tone} message={messages.delete.text} focusOnMount={messages.delete.focus} /> : null}
            </form>
          </section>
          </PatientAccountAction>
        </div>
        </PatientAccountGroup>
        </>
      ) : null}
      <nav className="account-links" aria-label="Outros links da conta">
        <a href="/privacidade/">Aviso de privacidade</a>
        <a href={config.public_site_url}>Voltar ao site profissional</a>
      </nav>
    </details>
    {mfaTransfer ? (
      <MfaTransferCard
        details={mfaTransfer}
        csrf={csrf}
        onClose={closeMfaTransfer}
        onExpired={expireMfaTransfer}
        onConfirmed={confirmMfaTransfer}
        onSessionEnded={onSessionsEnded}
      />
    ) : null}
    {mfaRecoveryCodes.length > 0 ? (
      <RecoveryCodesCard
        codes={mfaRecoveryCodes}
        onClose={() => setMfaRecoveryCodes([])}
      />
    ) : null}
    </>
  );
}

function EmergencyFooter({ config }: { config: Config }) {
  return <footer className="site-footer"><div><strong>Este espaço não é acompanhado em tempo real.</strong><p>Não use os registros para pedir ajuda urgente. Em risco imediato, procure um serviço de emergência da sua região ou ligue 192.</p></div><nav aria-label="Links do rodapé"><a href={config.public_site_url} target="_blank" rel="noopener noreferrer">Site profissional<span className="sr-status"> (abre em nova aba)</span></a><a href={config.guide_url} target="_blank" rel="noopener noreferrer">Guia de Emoções<span className="sr-status"> (abre em nova aba)</span></a><a href="/privacidade/">Privacidade</a></nav></footer>;
}

function scrollPageToTop() {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      root.style.scrollBehavior = previousScrollBehavior;
    });
  });
}

export function PortalApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState("");
  const [recovery, setRecovery] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [fatal, setFatal] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [patientMapRecovery, setPatientMapRecovery] =
    useState<PatientMapDraftRecoverySnapshot | null>(null);
  const [patientRecordRecovery, setPatientRecordRecovery] =
    useState<PatientRecordDraftRecoverySnapshot | null>(null);
  const protectedDraft = hasUnsavedDraft || Boolean(patientMapRecovery || patientRecordRecovery);
  const logoutInFlight = useRef(false);
  const accountActionVersion = useRef(0);
  const getAccountActionVersion = useCallback(() => accountActionVersion.current, []);
  const rememberPatientMapRecovery = useCallback(
    (snapshot: PatientMapDraftRecoverySnapshot | null) => {
      setPatientMapRecovery(snapshot);
    },
    [],
  );
  const rememberPatientRecordRecovery = useCallback((snapshot: PatientRecordDraftRecoverySnapshot | null) => {
    setPatientRecordRecovery(snapshot);
  }, []);
  useEffect(() => {
    if (user || !protectedDraft) return;
    // The editor is unmounted at expiry, but its in-memory recovery still needs protection.
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [protectedDraft, user]);
  const clear = useCallback((message = "", preservePatientRecovery = false) => {
    // Invalidate old private actions immediately, before React commits logout.
    accountActionVersion.current += 1;
    setUser(null);
    setCsrf("");
    setRecovery("");
    setMfaRecoveryCodes([]);
    setHasUnsavedDraft(false);
    if (!preservePatientRecovery) {
      setPatientMapRecovery(null);
      setPatientRecordRecovery(null);
    }
    setSessionMessage(message);
    scrollPageToTop();
  }, []);
  const sessionEnded = useCallback(() => {
    clear("Sua sessão terminou. Entre novamente para continuar. Se tinha texto não salvo, mantenha esta aba aberta.", true);
  }, [clear]);
  const loadInitial = useCallback(async () => {
    setFatal("");
    setInitialLoading(true);
    try {
      const [nextConfig, session] = await Promise.all([
        portalRequest<Config>("/config"),
        portalRequest<{ user: User | null; csrf?: string }>("/session"),
      ]);
      setConfig(nextConfig);
      setUser(session.user);
      setCsrf(session.csrf || "");
    } catch (error) {
      setFatal((error as Error).message);
    } finally {
      setInitialLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      portalRequest<Config>("/config"),
      portalRequest<{ user: User | null; csrf?: string }>("/session"),
    ])
      .then(([nextConfig, session]) => {
        if (!active) return;
        setConfig(nextConfig);
        setUser(session.user);
        setCsrf(session.csrf || "");
      })
      .catch((error) => {
        if (active) setFatal((error as Error).message);
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const authenticated = useCallback((nextUser: User, token: string, nextRecovery?: string) => {
    accountActionVersion.current += 1;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    scrollPageToTop();
    setPatientMapRecovery((current) =>
      nextUser.role === "patient" && current?.patientId === nextUser.id ? current : null,
    );
    setPatientRecordRecovery(current => getPatientRecordRecovery(current, nextUser));
    setUser(nextUser);
    setCsrf(token);
    setSessionMessage("");
    if (nextRecovery) setRecovery(nextRecovery);
    scrollPageToTop();
  }, []);
  const professionalMfaRecovered = useCallback(
    (nextUser: User, token: string, recoveryCodes: string[]) => {
      authenticated(nextUser, token);
      setMfaRecoveryCodes(recoveryCodes);
    },
    [authenticated],
  );
  async function logout() {
    if (logoutInFlight.current) return;
    if (
      protectedDraft &&
      !window.confirm("Sair da conta? As alterações que ainda não foram salvas serão perdidas.")
    ) {
      return;
    }
    logoutInFlight.current = true;
    setLogoutBusy(true);
    try {
      await portalRequest("/logout", { method: "POST" }, csrf);
    } finally {
      logoutInFlight.current = false;
      setLogoutBusy(false);
      clear("", false);
    }
  }
  const content = (() => {
    if (!config && fatal) {
      return (
        <main className="loading loading-error" id="conteudo" tabIndex={-1}>
          <Notice tone="error" message={`${fatal} Verifique sua conexão e tente novamente.`} />
          <button
            className="primary-button"
            type="button"
            onClick={() => void loadInitial()}
            disabled={initialLoading}
          >
            {initialLoading ? "Tentando novamente…" : "Tentar novamente"}
          </button>
        </main>
      );
    }
    if (!config) {
      return (
        <main className="loading" id="conteudo" tabIndex={-1}>
          <div className="loader" />
          <p>Preparando seu espaço…</p>
        </main>
      );
    }
    if (!user) {
      return (
        <Guest
          config={config}
          sessionMessage={sessionMessage}
          onAuthenticated={authenticated}
          onRecoveryCode={setRecovery}
          onProfessionalMfaRecovered={professionalMfaRecovered}
        />
      );
    }
    return <><Header config={config} user={user} onLogout={() => void logout()} logoutBusy={logoutBusy} />{user.role === "patient" ? <PatientDashboard user={user} csrf={csrf} config={config} setRecovery={setRecovery} getAccountActionVersion={getAccountActionVersion} onSessionLost={sessionEnded} onDraftStateChange={setHasUnsavedDraft} mapRecovery={patientMapRecovery?.patientId === user.id ? patientMapRecovery : null} onMapRecoveryChange={rememberPatientMapRecovery} recordRecovery={getPatientRecordRecovery(patientRecordRecovery, user)} onRecordRecoveryChange={rememberPatientRecordRecovery} /> : <ProfessionalDashboard user={{ ...user, role: "therapist" }} csrf={csrf} onSessionLost={sessionEnded} onDraftStateChange={setHasUnsavedDraft} accountPanel={<AccountPanel role="therapist" csrf={csrf} config={config} setRecovery={setRecovery} getAccountActionVersion={getAccountActionVersion} onSessionsEnded={sessionEnded} />} />}<EmergencyFooter config={config} /></>;
  })();
  return (
    <>
      <SlowMutationStatus />
      {content}
      <AppUpdateManager hasUnsavedDraft={protectedDraft} />
      {recovery ? <RecoveryCard code={recovery} onClose={() => setRecovery("")} /> : null}
      {mfaRecoveryCodes.length > 0 ? (
        <RecoveryCodesCard
          codes={mfaRecoveryCodes}
          onClose={() => setMfaRecoveryCodes([])}
        />
      ) : null}
    </>
  );
}
