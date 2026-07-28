"use client";

import Link from "next/link";
import {
  FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { copyText } from "./copy-text";
import { InstallAppButton } from "./InstallAppButton";
import { PatientEducation } from "./PatientEducation";
import { ProfessionalDashboard } from "./ProfessionalDashboard";
import {
  filterAndSortPatientEntries,
  patientEntryViewStatus,
  isEntryShared,
  type PatientEntrySharingFilter,
  type PatientEntrySort,
} from "./patient-dashboard-data";
import { formatDate, formatViewTimestamp, portalRequest } from "./portal-client";

type Role = "patient" | "therapist";
type PatientArea = "home" | "records" | "education";
type User = { id: string; name: string; role: Role };
type Config = {
  configured: boolean;
  pending: boolean;
  public_site_url: string;
  guide_url: string;
  care_url: string;
  privacy_version: string;
};
type Entry = {
  id: string;
  title: string;
  happened: string;
  body: string;
  thoughts: string;
  urge: string;
  emotion: string;
  intensity: number;
  message: string;
  created_at: string;
  updated_at: string;
  shared_at: string | null;
  revoked_at?: string | null;
  viewed_at?: string | null;
};
type EntryDraft = Omit<Entry, "id" | "created_at" | "updated_at" | "shared_at" | "revoked_at">;

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
}) {
  const inputId = useId();
  const hintId = useId();
  const requirementsId = useId();
  const isPassword = type === "password";
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const describedBy = [
    hint ? hintId : "",
    passwordRequirements ? requirementsId : "",
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  const requirements = passwordRequirements
    ? [
        { label: "12 caracteres ou mais", met: typedValue.length >= 12 },
        { label: "pelo menos uma letra", met: /[A-Za-zÀ-ÿ]/u.test(typedValue) },
        { label: "pelo menos um número", met: /\d/u.test(typedValue) },
      ]
    : [];

  return (
    <div className="field">
      <label htmlFor={inputId}><span>{label}</span></label>
      <div className={isPassword ? "password-input-control" : undefined}>
        <input
          id={inputId}
          name={name}
          type={isPassword && passwordVisible ? "text" : type}
          autoComplete={autoComplete}
          required={required}
          minLength={passwordRequirements ? 12 : undefined}
          maxLength={isPassword ? 128 : maxLength}
          aria-describedby={describedBy}
          inputMode={inputMode}
          autoCapitalize={isPassword ? "none" : autoCapitalize}
          spellCheck={isPassword ? false : spellCheck}
          onChange={passwordRequirements ? (event) => setTypedValue(event.target.value) : undefined}
        />
        {isPassword ? (
          <button
            className="password-visibility-button"
            type="button"
            aria-controls={inputId}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((current) => !current)}
          >
            {passwordVisible ? "Ocultar" : "Mostrar"}
          </button>
        ) : null}
      </div>
      {hint ? <small id={hintId}>{hint}</small> : null}
      {passwordRequirements ? (
        <ul className="password-requirements" id={requirementsId}>
          {requirements.map((requirement) => (
            <li className={requirement.met ? "met" : ""} key={requirement.label}>
              <span aria-hidden="true">{requirement.met ? "✓" : "○"}</span>
              {requirement.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Notice({
  message,
  tone = "info",
  focusOnMount = tone === "error",
}: {
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

function Header({ config, user, onLogout }: { config: Config; user?: User | null; onLogout?: () => void }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Início da Área do paciente">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width="48" height="48" />
        <span><strong>Área do paciente</strong><small>Mateus Ribeiro Marcos · Psicólogo</small></span>
      </Link>
      <nav className="top-links" aria-label="Links principais">
        <a href={config.public_site_url} target="_blank" rel="noopener noreferrer">
          Site profissional<span className="sr-status"> (abre em nova aba)</span>
        </a>
        <a href={config.guide_url} target="_blank" rel="noopener noreferrer">
          Guia de Emoções<span className="sr-status"> (abre em nova aba)</span>
        </a>
        {user?.role !== "therapist" ? <InstallAppButton /> : null}
        {user && onLogout ? <button type="button" className="link-button" onClick={onLogout}>Sair</button> : null}
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
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
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

function SetupPanel({ onAuthenticated }: { onAuthenticated: (user: User, csrf: string, recovery?: string) => void }) {
  const [step, setStep] = useState<"start" | "confirm">("start");
  const [setupSecret, setSetupSecret] = useState("");
  const [email, setEmail] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [recovery, setRecovery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmation")) return setMessage("As senhas não coincidem.");
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
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      const result = await portalRequest<{ user: User; csrf: string }>("/setup/confirm", {
        method: "POST",
        body: JSON.stringify({ setup_secret: setupSecret, email, totp: form.get("totp") }),
      });
      onAuthenticated(result.user, result.csrf, recovery);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  if (step === "confirm") return (
    <form className="stack" onSubmit={confirm}>
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
    <form className="stack" onSubmit={start}>
      <h3>Configuração inicial do profissional</h3>
      <p>Esta etapa só é feita uma vez por Mateus.</p>
      <Field label="Código de configuração" name="setup_secret" type="password" autoComplete="off" required />
      <Field label="Nome profissional" name="name" autoComplete="name" required />
      <Field label="E-mail de acesso" name="email" type="email" autoComplete="username" required />
      <Field label="Crie uma senha" name="password" type="password" autoComplete="new-password" required passwordRequirements hint="Uma frase que só faça sentido para você costuma ser mais fácil de lembrar. Espaços são permitidos." />
      <Field label="Repita a senha" name="confirmation" type="password" autoComplete="new-password" required />
      {message ? <Notice tone="error" message={message} /> : null}
      <button className="primary-button" disabled={busy}>{busy ? "Preparando…" : "Continuar"}</button>
    </form>
  );
}

function Guest({ config, onAuthenticated }: { config: Config; onAuthenticated: (user: User, csrf: string, recovery?: string) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if ((mode === "register" || mode === "recover") && form.get("password") !== form.get("confirmation")) {
      setMessage("As senhas não coincidem."); return;
    }
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
        setMessage(`Senha alterada. Seu novo código de recuperação é ${result.recovery_code}. Guarde-o antes de entrar.`);
      }
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Header config={config} />
      <main className="guest-layout" id="conteudo">
        <section className="guest-intro">
          <p className="eyebrow">ÁREA DO PACIENTE</p>
          <h1>Acompanhe seu processo. <em>Use este espaço no seu tempo.</em></h1>
          <p className="lead">Um espaço privado para organizar situações, pensamentos e emoções, consultar materiais e levar o que fizer sentido para a psicoterapia.</p>
          <p className="portal-audience-note"><strong>Para pacientes atuais.</strong> O acesso é reservado a pessoas em acompanhamento com Mateus e a criação da conta acontece somente por convite.</p>
          <div className="principles">
            <article><span>01</span><div><strong>Privado ao salvar</strong><p>Mateus só vê um registro quando você decide compartilhá-lo.</p></div></article>
            <article><span>02</span><div><strong>Compartilhar é opcional</strong><p>Você pode permitir ou retirar o acesso a cada registro.</p></div></article>
            <article><span>03</span><div><strong>Sem acompanhamento imediato</strong><p>Este espaço não é monitorado em tempo real.</p></div></article>
          </div>
          <p className="education-public-note">
            Os materiais da área “Leitura complementar” são informativos. Abrir ou
            pesquisar um conteúdo não confirma diagnóstico e não é informado a
            Mateus.
          </p>
          <a className="guide-callout" href={config.guide_url} target="_blank" rel="noopener noreferrer"><span>Aberto a qualquer pessoa, sem conta</span><strong>Usar o Guia de Emoções → <span className="sr-status">(abre em nova aba)</span></strong></a>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">ACESSO PROTEGIDO</p>
          <h2 id="auth-title">{mode === "login" ? "Entre na sua conta" : mode === "register" ? "Crie sua conta" : "Recupere seu acesso"}</h2>
          {mode !== "recover" ? (
            <p className="auth-audience-note">O cadastro é destinado a pacientes em acompanhamento atual e exige um convite entregue por Mateus.</p>
          ) : null}
          {mode === "recover" ? (
            <p className="recovery-help">
              Use o código que você guardou ao criar a conta. Se também perdeu
              esse código, peça a Mateus um novo código de recuperação.
            </p>
          ) : null}
          <div className="tab-list" role="group" aria-label="Forma de acesso">
            <button type="button" className={mode === "login" ? "active" : ""} aria-pressed={mode === "login"} onClick={() => { setMode("login"); setMessage(""); }}>Entrar</button>
            <button type="button" className={mode === "register" ? "active" : ""} aria-pressed={mode === "register"} onClick={() => { setMode("register"); setMessage(""); }}>Criar conta</button>
          </div>
          <form className="stack" onSubmit={submit}>
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
            <Field label={mode === "recover" ? "Nova senha" : "Senha"} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required passwordRequirements={mode !== "login"} hint={mode !== "login" ? "Use uma frase fácil de lembrar. Ela pode ter espaços e precisa incluir pelo menos um número." : undefined} />
            {mode !== "login" ? <Field label="Repita a senha" name="confirmation" type="password" autoComplete="new-password" required /> : null}
            {mode === "login" ? (
              <Field
                label="Código do autenticador (somente acesso profissional)"
                name="totp"
                autoComplete="one-time-code"
                inputMode="numeric"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={12}
                hint="Pacientes deixam este campo vazio. No acesso profissional, espaços e hífens são ignorados."
              />
            ) : null}
            {mode === "register" ? (
              <div className="checks">
                <label className="check-row">
                  <input type="checkbox" name="adult_confirmation" required />
                  <span>Confirmo que tenho 18 anos ou mais.</span>
                </label>
                <label className="check-row">
                  <input type="checkbox" name="privacy_confirmation" required />
                  <span>Li e aceito o <a href="/privacidade/" target="_blank" rel="noreferrer">aviso de privacidade</a>.</span>
                </label>
              </div>
            ) : null}
            {message ? <Notice tone={message.startsWith("Senha alterada") ? "success" : "error"} message={message} /> : null}
            <button className="primary-button" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Alterar senha"}</button>
          </form>
          {mode === "login" ? <button className="text-action" type="button" onClick={() => { setMode("recover"); setMessage(""); }}>Esqueci minha senha</button> : <button className="text-action" type="button" onClick={() => { setMode("login"); setMessage(""); }}>Voltar para o login</button>}
          {!config.configured ? <details className="setup-details"><summary>Primeiro acesso profissional</summary><SetupPanel onAuthenticated={onAuthenticated} /></details> : null}
        </section>
      </main>
      <EmergencyFooter config={config} />
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

function EntryForm({
  initial,
  guidance,
  guideUrl,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  initial?: Entry;
  guidance?: string;
  guideUrl: string;
  onSave: (entry: EntryDraft) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [originalDraft] = useState<EntryDraft>(() => entryDraftFrom(initial));
  const [draft, setDraft] = useState<EntryDraft>(() => entryDraftFrom(initial));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(Boolean(initial && (initial.body || initial.thoughts || initial.urge || initial.message)));
  const dirty = (Object.keys(originalDraft) as Array<keyof EntryDraft>).some(
    (key) => draft[key] !== originalDraft[key],
  );
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  function update(name: keyof EntryDraft, value: string | number) { setDraft((current) => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await onSave(draft); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return (
    <form className="entry-form panel patient-entry-form" id="entry-editor" onSubmit={submit}>
      {guidance ? (
        <p className="education-entry-guidance" id="education-entry-guidance">
          {guidance}
        </p>
      ) : null}
      <div className="section-heading entry-form-heading">
        <div>
          <p className="eyebrow">{initial ? "EDITAR REGISTRO" : "NOVO REGISTRO"}</p>
          <h2 id="entry-form-title">{initial ? "Revise sua anotação" : "O que você quer guardar?"}</h2>
          <p>Não precisa preencher tudo. Comece pelo que estiver mais claro agora.</p>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Fechar formulário">×</button>
      </div>

      <section className="entry-step" aria-labelledby="entry-step-one">
        <div className="entry-step-heading">
          <span aria-hidden="true">01</span>
          <div><h3 id="entry-step-one">Comece pela situação</h3><p>Uma frase curta já basta para localizar esse momento depois.</p></div>
        </div>
        <label className="field"><span>Título breve</span><input id="entry-title" value={draft.title} maxLength={120} placeholder="Ex.: conversa no trabalho" onChange={(e) => update("title", e.target.value)} required aria-describedby={guidance ? "education-entry-guidance" : undefined} /></label>
        <label className="field"><span>O que aconteceu?</span><textarea value={draft.happened} maxLength={2000} rows={5} placeholder="Conte do seu jeito, sem precisar organizar perfeitamente." onChange={(e) => update("happened", e.target.value)} required /></label>
      </section>

      <section className="entry-step" aria-labelledby="entry-step-two">
        <div className="entry-step-heading">
          <span aria-hidden="true">02</span>
          <div><h3 id="entry-step-two">Como isso chegou em você?</h3><p>Se não souber nomear a emoção, pode deixar o campo em branco.</p></div>
        </div>
        <div className="emotion-row">
          <div className="field">
            <label htmlFor="entry-emotion"><span>Emoção principal, se souber</span></label>
            <input id="entry-emotion" value={draft.emotion} maxLength={120} placeholder="Ex.: ansiedade, tristeza, raiva" onChange={(e) => update("emotion", e.target.value)} />
            <a
              className="field-help-link"
              href={guideUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Não sabe como nomear? Abrir o Guia de Emoções
              <span className="external-link-note"> (nova aba)</span>
            </a>
          </div>
          <div className="field range-field">
            <label htmlFor="entry-intensity">Intensidade percebida: <strong>{draft.intensity}</strong>/10</label>
            <input id="entry-intensity" type="range" min="0" max="10" value={draft.intensity} onChange={(e) => update("intensity", Number(e.target.value))} />
            <small className="range-scale"><span>0 · muito leve</span><span>10 · muito intensa</span></small>
            <div className="range-adjustments" aria-label="Ajustar intensidade sem arrastar">
              <button
                type="button"
                onClick={() => update("intensity", Math.max(0, draft.intensity - 1))}
                disabled={draft.intensity === 0}
              >
                − Diminuir
              </button>
              <output htmlFor="entry-intensity" aria-live="polite">{draft.intensity}/10</output>
              <button
                type="button"
                onClick={() => update("intensity", Math.min(10, draft.intensity + 1))}
                disabled={draft.intensity === 10}
              >
                Aumentar +
              </button>
            </div>
          </div>
        </div>
      </section>

      <details className="entry-optional" open={optionalOpen} onToggle={(event) => setOptionalOpen(event.currentTarget.open)}>
        <summary><span><strong>Aprofundar este registro</strong><small>Campos opcionais para quando fizer sentido.</small></span><span className="optional-toggle" aria-hidden="true">+</span></summary>
        <div className="two-columns">
          <label className="field"><span>O que percebeu no corpo?</span><textarea value={draft.body} maxLength={1500} rows={4} onChange={(e) => update("body", e.target.value)} /></label>
          <label className="field"><span>Quais pensamentos apareceram?</span><textarea value={draft.thoughts} maxLength={1500} rows={4} onChange={(e) => update("thoughts", e.target.value)} /></label>
          <label className="field"><span>O que teve vontade de fazer?</span><textarea value={draft.urge} maxLength={1500} rows={4} onChange={(e) => update("urge", e.target.value)} /></label>
          <label className="field"><span>Há algo que queira levar para a sessão?</span><textarea value={draft.message} maxLength={1500} rows={4} onChange={(e) => update("message", e.target.value)} /></label>
        </div>
      </details>

      <div className="privacy-save-note"><span aria-hidden="true" /><p><strong>Privado ao salvar.</strong> Mateus só poderá ler se você decidir compartilhar este registro depois.</p></div>
      {message ? <Notice tone="error" message={message} /> : null}
      <div className="button-row"><button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Salvando…" : "Salvar registro"}</button></div>
    </form>
  );
}

function EntryDetails({ entry }: { entry: Entry }) {
  const items = [["O que aconteceu", entry.happened], ["No corpo", entry.body], ["Pensamentos", entry.thoughts], ["Vontade de agir", entry.urge], ["Para a sessão", entry.message]];
  return <div className="entry-details">{items.filter(([, value]) => value).map(([label, value]) => <div key={label}><strong>{label}</strong><p>{value}</p></div>)}</div>;
}

function PatientDashboard({
  user,
  csrf,
  config,
  setRecovery,
  onSessionLost,
  onDraftStateChange,
}: {
  user: User;
  csrf: string;
  config: Config;
  setRecovery: (code: string) => void;
  onSessionLost: () => void;
  onDraftStateChange: (dirty: boolean) => void;
}) {
  const [area, setArea] = useState<PatientArea>("home");
  const [selectedEducationSlug, setSelectedEducationSlug] = useState<string | null>(null);
  const [educationReturnSlug, setEducationReturnSlug] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null | "new">(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorAnnouncement, setEditorAnnouncement] = useState("");
  const [loading, setLoading] = useState(true);
  const [entryFilter, setEntryFilter] =
    useState<PatientEntrySharingFilter>("all");
  const [entryQuery, setEntryQuery] = useState("");
  const [entrySort, setEntrySort] = useState<PatientEntrySort>("newest");
  const editorOriginRef = useRef<{
    entryId: string;
    scrollY: number;
    trigger: HTMLButtonElement;
  } | null>(null);
  const initialScrollResetRef = useRef(false);
  const load = useCallback(async () => {
    try { setEntries((await portalRequest<{ entries: Entry[] }>("/entries")).entries); }
    catch (error) {
      if ((error as Error).message.includes("login")) onSessionLost();
      else {
        setMessageTone("error");
        setMessage((error as Error).message);
      }
    }
    finally { setLoading(false); }
  }, [onSessionLost]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading || initialScrollResetRef.current) return;
    initialScrollResetRef.current = true;
    scrollPageToTop();
  }, [loading]);

  useEffect(() => {
    if (area !== "records" || !editing) return;
    window.requestAnimationFrame(() => {
      const editor = document.getElementById("entry-editor");
      const title = document.getElementById("entry-title");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      editor?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      title?.focus({ preventScroll: true });
    });
  }, [area, editing]);

  useEffect(() => {
    const hasUnsavedChanges = Boolean(editing && editorDirty);
    onDraftStateChange(hasUnsavedChanges);
    if (!hasUnsavedChanges) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [editing, editorDirty, onDraftStateChange]);

  async function save(draft: EntryDraft) {
    const editedEntry = editing && editing !== "new" ? editing : null;
    let savedId = editedEntry?.id ?? "";
    if (editedEntry) {
      await portalRequest(`/entries/${editedEntry.id}`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      }, csrf);
    } else {
      const result = await portalRequest<{ id: string }>("/entries", {
        method: "POST",
        body: JSON.stringify(draft),
      }, csrf);
      savedId = result.id;
    }
    setEditing(null);
    setEditorDirty(false);
    setEditorAnnouncement("");
    setEducationReturnSlug(null);
    setMessageTone("success");
    setMessage(
      editedEntry
        ? isEntryShared(editedEntry)
          ? "Alterações salvas. O compartilhamento com Mateus foi mantido."
          : "Registro atualizado. Ele continua privado."
        : "Registro salvo de forma privada.",
    );
    await load();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const card = document.getElementById(`record-${savedId}`);
        const summary = card?.querySelector<HTMLElement>("summary");
        card?.scrollIntoView({ block: "center", behavior: "auto" });
        summary?.focus({ preventScroll: true });
      });
    });
  }
  async function sharing(entry: Entry) {
    const shared = isEntryShared(entry);
    const question = shared
      ? "Mateus deixará de ver este registro. Retirar o compartilhamento?"
      : "Compartilhar este registro com Mateus? Ele poderá lê-lo no painel profissional, mas não editá-lo.";
    if (!window.confirm(question)) return;
    try {
      await portalRequest(`/entries/${entry.id}/sharing`, { method: "PATCH", body: JSON.stringify({ shared: !shared }) }, csrf);
      setMessageTone("success");
      setMessage(shared ? "Compartilhamento retirado." : "Registro compartilhado com Mateus.");
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage((error as Error).message);
    }
  }
  async function remove(entry: Entry) {
    if (!window.confirm("Excluir este registro de forma permanente?")) return;
    try {
      await portalRequest(`/entries/${entry.id}`, { method: "DELETE" }, csrf);
      setMessageTone("success");
      setMessage("Registro excluído.");
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage((error as Error).message);
    }
  }
  function openNewRecord() {
    setArea("records");
    setEducationReturnSlug(null);
    editorOriginRef.current = null;
    setEditorDirty(false);
    setEditorAnnouncement("Formulário para um novo registro aberto.");
    setMessage("");
    setEditing("new");
  }
  function createRecordFromEducation(slug: string) {
    setSelectedEducationSlug(slug);
    setEducationReturnSlug(slug);
    setArea("records");
    editorOriginRef.current = null;
    setEditorDirty(false);
    setEditorAnnouncement("Formulário para um novo registro aberto.");
    setEditing("new");
    setMessage("");
  }
  function confirmDiscard(): boolean {
    return !editorDirty || window.confirm("Descartar as alterações que ainda não foram salvas?");
  }
  function cancelEntry() {
    if (!confirmDiscard()) return;
    const origin = editorOriginRef.current;
    if (!educationReturnSlug) {
      setEditing(null);
      setEditorDirty(false);
      setEditorAnnouncement("");
      editorOriginRef.current = null;
      if (origin) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: origin.scrollY, behavior: "auto" });
          origin.trigger.focus({ preventScroll: true });
        });
      }
      return;
    }
    setSelectedEducationSlug(educationReturnSlug);
    setEditing(null);
    setEditorDirty(false);
    setEditorAnnouncement("");
    setEducationReturnSlug(null);
    editorOriginRef.current = null;
    setArea("education");
  }
  function openEditRecord(entry: Entry, trigger: HTMLButtonElement) {
    editorOriginRef.current = {
      entryId: entry.id,
      scrollY: window.scrollY,
      trigger,
    };
    setEducationReturnSlug(null);
    setEditorDirty(false);
    setEditorAnnouncement(`Edição do registro “${entry.title}” aberta.`);
    setMessage("");
    setEditing(entry);
  }
  function changeArea(nextArea: PatientArea) {
    if (area === nextArea) return;
    if (editing && !confirmDiscard()) return;
    setEditing(null);
    setEditorDirty(false);
    setEditorAnnouncement("");
    editorOriginRef.current = null;
    setEducationReturnSlug(null);
    setArea(nextArea);
    window.requestAnimationFrame(() => {
      const targetId =
        nextArea === "home"
          ? "patient-home-title"
          : nextArea === "records"
            ? "records-title"
            : selectedEducationSlug
              ? "education-article-title"
              : "education-title";
      document.getElementById(targetId)?.focus();
    });
  }
  function openEducationLibrary() {
    setSelectedEducationSlug(null);
    setArea("education");
    window.requestAnimationFrame(() =>
      document.getElementById("education-title")?.focus(),
    );
  }
  const sharedCount = entries.filter(isEntryShared).length;
  const privateCount = entries.length - sharedCount;
  const sharedViewCounts = entries.reduce(
    (counts, entry) => {
      if (isEntryShared(entry)) {
        counts[patientEntryViewStatus(entry).kind] += 1;
      }
      return counts;
    },
    { unseen: 0, viewed: 0, updated: 0, reshared: 0 },
  );
  const sharedOverview = [
    sharedViewCounts.viewed
      ? `${sharedViewCounts.viewed} ${sharedViewCounts.viewed === 1 ? "visualizado" : "visualizados"}`
      : "",
    sharedViewCounts.unseen
      ? `${sharedViewCounts.unseen} ${sharedViewCounts.unseen === 1 ? "ainda não visualizado" : "ainda não visualizados"}`
      : "",
    sharedViewCounts.updated
      ? `${sharedViewCounts.updated} ${sharedViewCounts.updated === 1 ? "atualizado após visualização" : "atualizados após visualização"}`
      : "",
    sharedViewCounts.reshared
      ? `${sharedViewCounts.reshared} ${sharedViewCounts.reshared === 1 ? "compartilhado novamente" : "compartilhados novamente"}`
      : "",
  ].filter(Boolean).join(" · ");
  const visibleEntries = filterAndSortPatientEntries(
    entries,
    entryFilter,
    entryQuery,
    entrySort,
  );
  const hasEntryQuery = Boolean(entryQuery.trim());
  const filterLabels: Array<{
    value: PatientEntrySharingFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "Todos", count: entries.length },
    { value: "private", label: "Privados", count: privateCount },
    { value: "shared", label: "Com Mateus", count: sharedCount },
  ];
  return (
    <main className="dashboard patient-dashboard" id="conteudo">
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
          className={area === "education" ? "active" : ""}
          aria-current={area === "education" ? "page" : undefined}
          onClick={() => changeArea("education")}
        >
          Leitura complementar
        </button>
      </nav>

      {area === "home" ? (
        <section className="patient-home" aria-labelledby="patient-home-title">
          <section className="dashboard-hero patient-hero">
            <div className="patient-hero-copy">
              <p className="eyebrow">SUA ÁREA DO PACIENTE</p>
              <h1 id="patient-home-title" tabIndex={-1}>Olá, {user.name}.</h1>
              <p>Use esta área quando algo merecer ser guardado, quando quiser voltar ao seu histórico ou quando um material puder ajudar a organizar uma dúvida. Nada é compartilhado automaticamente.</p>
              <span className="patient-privacy-chip"><span aria-hidden="true" /> Privado por padrão</span>
            </div>
            <div className="patient-home-actions">
              <button className="primary-button" onClick={openNewRecord}>Registrar algo</button>
              <button className="secondary-button" onClick={openEducationLibrary}>Leitura complementar</button>
            </div>
          </section>

          <section className="patient-overview" aria-label="Resumo da Área do paciente">
            <article><span className="overview-number">{loading ? "…" : entries.length}</span><div><strong>{entries.length === 1 ? "registro salvo" : "registros salvos"}</strong><small>Seu histórico nesta conta</small></div></article>
            <article><span className="overview-number">{loading ? "…" : sharedCount}</span><div><strong>{sharedCount === 1 ? "compartilhado com Mateus" : "compartilhados com Mateus"}</strong><small>{loading ? "Consultando visualizações…" : sharedCount === 0 ? "Nenhum conteúdo visível para ele" : sharedOverview}</small></div></article>
            <a href={config.guide_url} target="_blank" rel="noopener noreferrer"><span>Não sabe bem o que está sentindo?</span><strong>Abrir o Guia de Emoções → <span className="sr-status">(abre em nova aba)</span></strong></a>
          </section>

          <details className="patient-how-to">
            <summary>Como usar esta área</summary>
            <div>
              <p>Você não precisa escrever toda semana nem preencher todos os campos. Pode registrar uma situação breve, consultar um conteúdo ou apenas voltar ao que já guardou. Cada registro nasce privado. Você escolhe se quer compartilhá-lo com Mateus. As leituras e buscas da área “Leitura complementar” não são informadas a ele.</p>
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
          {editing ? (
            <EntryForm
              key={
                editing === "new"
                  ? educationReturnSlug
                    ? `education-${educationReturnSlug}`
                    : "new"
                  : editing.id
              }
              initial={editing === "new" ? undefined : editing}
              guideUrl={config.guide_url}
              guidance={
                educationReturnSlug
                  ? "O que chamou sua atenção neste texto? Registre somente o que fizer sentido para você."
                  : undefined
              }
              onSave={save}
              onCancel={cancelEntry}
              onDirtyChange={setEditorDirty}
            />
          ) : null}
          <section className="records-section" aria-labelledby="records-title">
        <div className="section-heading patient-records-heading">
          <div>
            <p className="eyebrow">HISTÓRICO</p>
            <h2 id="records-title" tabIndex={-1}>Meus registros</h2>
            <p>Encontre rapidamente o que está privado ou compartilhado com Mateus.</p>
          </div>
          <div className="patient-records-heading-actions">
            <span className="count">
              {hasEntryQuery || entryFilter !== "all"
                ? `${visibleEntries.length} de ${entries.length}`
                : `${entries.length} ${entries.length === 1 ? "registro" : "registros"}`}
            </span>
            {!editing ? <button className="primary-button compact-button" type="button" onClick={openNewRecord}>Novo registro</button> : null}
          </div>
        </div>
        <a className="records-guide-callout" href={config.guide_url} target="_blank" rel="noopener noreferrer">
          <span>Está difícil nomear o que sentiu?</span>
          <strong>Consultar o Guia de Emoções → <span className="external-link-note">(nova aba)</span></strong>
        </a>
        {loading ? <div className="empty-state patient-loading"><div className="loader" /><p>Carregando seus registros…</p></div> : entries.length === 0 ? (
          <div className="empty-state patient-empty-state">
            <span className="empty-state-number" aria-hidden="true">01</span>
            <h3>Seu histórico começa quando você quiser.</h3>
            <p>Você pode começar com uma situação breve. Não precisa entender tudo antes de escrever.</p>
            <div className="empty-state-actions"><button className="primary-button" onClick={openNewRecord}>Criar o primeiro registro</button><a className="secondary-button" href={config.guide_url} target="_blank" rel="noopener noreferrer">Explorar o Guia de Emoções <span className="sr-status">(abre em nova aba)</span></a></div>
          </div>
        ) : <>
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
          <div className="patient-record-search-row">
            <label className="field patient-record-search">
              <span>Buscar nos meus registros</span>
              <input
                type="search"
                value={entryQuery}
                onChange={(event) => setEntryQuery(event.target.value)}
                placeholder="Busque por situação, emoção ou palavra"
                autoComplete="off"
              />
              <small>A busca acontece somente nesta tela.</small>
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
              <h3>{hasEntryQuery ? "Nenhum registro encontrado." : entryFilter === "shared" ? "Nenhum registro compartilhado agora." : "Nenhum registro privado agora."}</h3>
              <p>{hasEntryQuery ? "Tente outra palavra ou limpe a busca para voltar ao histórico." : entryFilter === "shared" ? "Quando você decidir compartilhar um registro com Mateus, ele aparecerá aqui." : "Você pode deixar um registro privado novamente abrindo-o e retirando o compartilhamento."}</p>
              <div className="button-row">
                {hasEntryQuery ? <button className="secondary-button" type="button" onClick={() => setEntryQuery("")}>Limpar busca</button> : null}
                {entryFilter !== "all" ? <button className="secondary-button" type="button" onClick={() => setEntryFilter("all")}>Mostrar todos</button> : null}
              </div>
            </div>
          ) : <div className="record-list patient-record-list">{visibleEntries.map((entry) => {
          const shared = isEntryShared(entry);
          const viewStatus = patientEntryViewStatus(entry);
          return (
            <details className="record-card patient-record-card" id={`record-${entry.id}`} key={entry.id}>
              <summary>
                <span className="record-summary-marker" aria-hidden="true" />
                <span className="patient-record-summary-copy">
                  <span className={`status ${shared ? "shared" : "private"}`}>{shared ? "Compartilhado com Mateus" : "Privado · só você vê"}</span>
                  <strong>{entry.title}</strong>
                  <small>{formatDate(entry.created_at)} · {entry.emotion || "sem emoção definida"} · intensidade {entry.intensity}/10</small>
                </span>
                <span className="patient-record-toggle" aria-hidden="true"><span className="when-closed">Abrir</span><span className="when-open">Fechar</span></span>
              </summary>
              <div className="patient-record-content">
                {shared ? (
                  <>
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
                  </>
                ) : null}
                <EntryDetails entry={entry} />
                <div className="record-actions">
                  <button className={shared ? "secondary-button" : "share-button"} onClick={() => void sharing(entry)}>{shared ? "Deixar privado novamente" : "Compartilhar com Mateus"}</button>
                  <button className="quiet-button" onClick={(event) => openEditRecord(entry, event.currentTarget)}>Editar</button>
                  <button className="danger-link" onClick={() => void remove(entry)}>Excluir</button>
                </div>
              </div>
            </details>
          );
        })}</div>}
        </>}
          </section>
        </>
      ) : (
        <PatientEducation
          guideUrl={config.guide_url}
          careUrl={config.care_url}
          selectedSlug={selectedEducationSlug}
          onArticleChange={setSelectedEducationSlug}
          onCreateRecord={createRecordFromEducation}
        />
      )}
      <AccountPanel role="patient" csrf={csrf} config={config} setRecovery={setRecovery} />
    </main>
  );
}

function AccountPanel({ role, csrf, config, setRecovery }: { role: Role; csrf: string; config: Config; setRecovery: (code: string) => void }) {
  const [message, setMessage] = useState("");
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get("new_password") !== form.get("confirmation")) return setMessage("As novas senhas não coincidem.");
    try { await portalRequest("/account/password", { method: "PATCH", body: JSON.stringify({ current_password: form.get("current_password"), new_password: form.get("new_password"), totp: form.get("totp") }) }, csrf); event.currentTarget.reset(); setMessage("Senha alterada."); }
    catch (error) { setMessage((error as Error).message); }
  }
  async function rotate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const result = await portalRequest<{ recovery_code: string }>("/account/recovery-code", { method: "POST", body: JSON.stringify({ current_password: form.get("current_password"), totp: form.get("totp") }) }, csrf); event.currentTarget.reset(); setRecovery(result.recovery_code); }
    catch (error) { setMessage((error as Error).message); }
  }
  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!window.confirm("Excluir sua conta e todos os registros de forma permanente? Esta ação não pode ser desfeita.")) return;
    const form = new FormData(event.currentTarget);
    try { await portalRequest("/account", { method: "DELETE", body: JSON.stringify({ current_password: form.get("current_password") }) }, csrf); window.location.reload(); }
    catch (error) { setMessage((error as Error).message); }
  }
  return (
    <details className={`account-panel ${role === "patient" ? "patient-account-panel" : ""}`}>
      <summary><span>{role === "patient" ? "Conta e privacidade" : "Segurança e conta"}</span>{role === "patient" ? <small>Senha, recuperação, exportação e exclusão</small> : null}</summary>
      <div className="account-grid"><form className="stack panel" onSubmit={password}><h3>Alterar senha</h3><Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required /><Field label="Nova senha" name="new_password" type="password" autoComplete="new-password" required passwordRequirements hint="Uma frase fácil de lembrar pode ter espaços; inclua pelo menos um número." /><Field label="Repita a nova senha" name="confirmation" type="password" autoComplete="new-password" required />{role === "therapist" ? <Field label="Código do autenticador" name="totp" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} maxLength={12} hint="Digite ou cole os 6 números. Espaços e hífens são ignorados." required /> : null}<button className="secondary-button">Alterar senha</button></form><form className="stack panel" onSubmit={rotate}><h3>Novo código de recuperação</h3><p>O código atual deixará de funcionar.</p><Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />{role === "therapist" ? <Field label="Código do autenticador" name="totp" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} maxLength={12} hint="Digite ou cole os 6 números. Espaços e hífens são ignorados." required /> : null}<button className="secondary-button">Gerar novo código</button></form></div>{message ? <Notice tone={message.includes("alterada") ? "success" : "error"} message={message} /> : null}<div className="account-links">{role === "patient" ? <><a href="/api/portal/export" download>Baixar cópia dos meus registros</a><form onSubmit={deleteAccount}><Field label="Senha atual para excluir a conta" name="current_password" type="password" autoComplete="current-password" required /><button className="danger-button">Excluir conta e registros</button></form></> : null}<a href="/privacidade/">Aviso de privacidade</a><a href={config.public_site_url}>Voltar ao site profissional</a></div>
    </details>
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
  const [fatal, setFatal] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const clear = useCallback(() => {
    setUser(null);
    setCsrf("");
    setHasUnsavedDraft(false);
    scrollPageToTop();
  }, []);
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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    scrollPageToTop();
    setUser(nextUser);
    setCsrf(token);
    if (nextRecovery) setRecovery(nextRecovery);
    scrollPageToTop();
  }, []);
  async function logout() {
    if (
      hasUnsavedDraft &&
      !window.confirm("Sair da conta? As alterações que ainda não foram salvas serão perdidas.")
    ) {
      return;
    }
    try { await portalRequest("/logout", { method: "POST" }, csrf); } finally { clear(); }
  }
  const content = (() => {
    if (!config && fatal) {
      return (
        <main className="loading loading-error">
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
    if (!config) return <main className="loading"><div className="loader" /><p>Preparando seu espaço…</p></main>;
    if (!user) return <Guest config={config} onAuthenticated={authenticated} />;
    return <><Header config={config} user={user} onLogout={() => void logout()} />{user.role === "patient" ? <PatientDashboard user={user} csrf={csrf} config={config} setRecovery={setRecovery} onSessionLost={clear} onDraftStateChange={setHasUnsavedDraft} /> : <ProfessionalDashboard user={{ ...user, role: "therapist" }} csrf={csrf} onSessionLost={clear} accountPanel={<AccountPanel role="therapist" csrf={csrf} config={config} setRecovery={setRecovery} />} />}<EmergencyFooter config={config} /></>;
  })();
  return <>{content}{recovery ? <RecoveryCard code={recovery} onClose={() => setRecovery("")} /> : null}</>;
}
