"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { InstallAppButton } from "./InstallAppButton";
import { ProfessionalDashboard } from "./ProfessionalDashboard";
import {
  filterPatientEntries,
  isEntryShared,
  type PatientEntrySharingFilter,
} from "./patient-dashboard-data";
import { formatDate, portalRequest } from "./portal-client";

type Role = "patient" | "therapist";
type User = { id: string; name: string; role: Role };
type Config = {
  configured: boolean;
  pending: boolean;
  public_site_url: string;
  guide_url: string;
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
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required={required} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Notice({ message, tone = "info" }: { message: string; tone?: "info" | "error" | "success" }) {
  return <p className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{message}</p>;
}

function Header({ config, user, onLogout }: { config: Config; user?: User | null; onLogout?: () => void }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Início dos Registros entre sessões">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width="48" height="48" />
        <span><strong>Registros entre sessões</strong><small>Mateus Ribeiro Marcos · Psicólogo</small></span>
      </Link>
      <nav className="top-links" aria-label="Links principais">
        <a href={config.public_site_url}>Site profissional</a>
        <a href={config.guide_url}>Guia de Emoções</a>
        {user?.role !== "therapist" ? <InstallAppButton /> : null}
        {user && onLogout ? <button type="button" className="link-button" onClick={onLogout}>Sair</button> : null}
      </nav>
    </header>
  );
}

function RecoveryCard({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <p className="eyebrow">GUARDE AGORA</p>
        <h2 id="recovery-title">Seu código de recuperação</h2>
        <p>Com ele, você pode redefinir sua senha por conta própria. Guarde em um local seguro. Se perdê-lo, peça a Mateus uma recuperação assistida. O código anterior deixa de funcionar.</p>
        <code className="secret-code">{code}</code>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={copy}>{copied ? "Copiado" : "Copiar código"}</button>
          <button className="primary-button" type="button" onClick={onClose}>Já guardei</button>
        </div>
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
      <Field label="Código de 6 dígitos do autenticador" name="totp" autoComplete="one-time-code" required />
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
      <Field label="Crie uma senha" name="password" type="password" autoComplete="new-password" required hint="Pelo menos 12 caracteres, com letras e números." />
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
          <p className="eyebrow">REGISTROS ENTRE SESSÕES</p>
          <h1>Anote o que aconteceu. <em>Você decide o que compartilhar.</em></h1>
          <p className="lead">Um espaço para guardar situações, pensamentos e emoções que você queira retomar depois, no seu tempo.</p>
          <p className="portal-audience-note"><strong>Para pacientes atuais.</strong> Este portal é reservado a pessoas em acompanhamento com Mateus. A criação da conta acontece somente por convite.</p>
          <div className="principles">
            <article><span>01</span><div><strong>Privado ao salvar</strong><p>Mateus só vê um registro quando você o compartilha.</p></div></article>
            <article><span>02</span><div><strong>Compartilhar é opcional</strong><p>Você pode permitir ou retirar o acesso a cada registro.</p></div></article>
            <article><span>03</span><div><strong>Sem acompanhamento imediato</strong><p>Este espaço não é monitorado em tempo real.</p></div></article>
          </div>
          <a className="guide-callout" href={config.guide_url}><span>Aberto a qualquer pessoa, sem conta</span><strong>Usar o Guia de Emoções →</strong></a>
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
          <div className="tab-list" role="tablist" aria-label="Forma de acesso">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Entrar</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setMessage(""); }}>Criar conta</button>
          </div>
          <form className="stack" onSubmit={submit}>
            {mode === "register" ? <><Field label="Código de convite entregue por Mateus" name="invitation_code" required /><Field label="Como prefere ser chamado(a)" name="name" autoComplete="name" required /></> : null}
            <Field label="E-mail" name="email" type="email" autoComplete="username" required />
            {mode === "recover" ? <Field label="Código de recuperação" name="recovery_code" autoComplete="off" required /> : null}
            <Field label={mode === "recover" ? "Nova senha" : "Senha"} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required hint={mode !== "login" ? "Pelo menos 12 caracteres, com letras e números." : undefined} />
            {mode !== "login" ? <Field label="Repita a senha" name="confirmation" type="password" autoComplete="new-password" required /> : null}
            {mode === "login" ? <Field label="Código do autenticador (somente acesso profissional)" name="totp" autoComplete="one-time-code" /> : null}
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

function EntryForm({ initial, onSave, onCancel }: { initial?: Entry; onSave: (entry: EntryDraft) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<EntryDraft>(initial ? {
    title: initial.title, happened: initial.happened, body: initial.body, thoughts: initial.thoughts, urge: initial.urge,
    emotion: initial.emotion, intensity: initial.intensity, message: initial.message,
  } : blankEntry);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(Boolean(initial && (initial.body || initial.thoughts || initial.urge || initial.message)));
  function update(name: keyof EntryDraft, value: string | number) { setDraft((current) => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await onSave(draft); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return (
    <form className="entry-form panel patient-entry-form" id="entry-editor" onSubmit={submit}>
      <div className="section-heading entry-form-heading">
        <div>
          <p className="eyebrow">{initial ? "EDITAR REGISTRO" : "NOVO REGISTRO"}</p>
          <h2>{initial ? "Revise sua anotação" : "O que você quer guardar?"}</h2>
          <p>Não precisa preencher tudo. Comece pelo que estiver mais claro agora.</p>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Fechar formulário">×</button>
      </div>

      <section className="entry-step" aria-labelledby="entry-step-one">
        <div className="entry-step-heading">
          <span aria-hidden="true">01</span>
          <div><h3 id="entry-step-one">Comece pela situação</h3><p>Uma frase curta já basta para localizar esse momento depois.</p></div>
        </div>
        <label className="field"><span>Título breve</span><input value={draft.title} maxLength={120} placeholder="Ex.: conversa no trabalho" onChange={(e) => update("title", e.target.value)} required /></label>
        <label className="field"><span>O que aconteceu?</span><textarea value={draft.happened} maxLength={2000} rows={5} placeholder="Conte do seu jeito, sem precisar organizar perfeitamente." onChange={(e) => update("happened", e.target.value)} required /></label>
      </section>

      <section className="entry-step" aria-labelledby="entry-step-two">
        <div className="entry-step-heading">
          <span aria-hidden="true">02</span>
          <div><h3 id="entry-step-two">Como isso chegou em você?</h3><p>Se não souber nomear a emoção, pode deixar o campo em branco.</p></div>
        </div>
        <div className="emotion-row">
          <label className="field"><span>Emoção principal, se souber</span><input value={draft.emotion} maxLength={120} placeholder="Ex.: ansiedade, tristeza, raiva" onChange={(e) => update("emotion", e.target.value)} /></label>
          <label className="field range-field">
            <span>Intensidade percebida: <strong>{draft.intensity}</strong>/10</span>
            <input type="range" min="0" max="10" value={draft.intensity} onChange={(e) => update("intensity", Number(e.target.value))} />
            <small className="range-scale"><span>0 · muito leve</span><span>10 · muito intensa</span></small>
          </label>
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

function PatientDashboard({ user, csrf, config, setRecovery, onSessionLost }: { user: User; csrf: string; config: Config; setRecovery: (code: string) => void; onSessionLost: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null | "new">(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [entryFilter, setEntryFilter] =
    useState<PatientEntrySharingFilter>("all");
  const load = useCallback(async () => {
    try { setEntries((await portalRequest<{ entries: Entry[] }>("/entries")).entries); }
    catch (error) { if ((error as Error).message.includes("login")) onSessionLost(); else setMessage((error as Error).message); }
    finally { setLoading(false); }
  }, [onSessionLost]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function save(draft: EntryDraft) {
    if (editing && editing !== "new") await portalRequest(`/entries/${editing.id}`, { method: "PATCH", body: JSON.stringify(draft) }, csrf);
    else await portalRequest("/entries", { method: "POST", body: JSON.stringify(draft) }, csrf);
    setEditing(null); setMessage("Registro salvo de forma privada."); await load();
  }
  async function sharing(entry: Entry) {
    const shared = isEntryShared(entry);
    const question = shared
      ? "Mateus deixará de ver este registro. Retirar o compartilhamento?"
      : "Compartilhar este registro com Mateus? Ele poderá lê-lo no painel profissional, mas não editá-lo.";
    if (!window.confirm(question)) return;
    await portalRequest(`/entries/${entry.id}/sharing`, { method: "PATCH", body: JSON.stringify({ shared: !shared }) }, csrf);
    setMessage(shared ? "Compartilhamento retirado." : "Registro compartilhado com Mateus."); await load();
  }
  async function remove(entry: Entry) {
    if (!window.confirm("Excluir este registro de forma permanente?")) return;
    await portalRequest(`/entries/${entry.id}`, { method: "DELETE" }, csrf); setMessage("Registro excluído."); await load();
  }
  const sharedCount = entries.filter(isEntryShared).length;
  const privateCount = entries.length - sharedCount;
  const visibleEntries = filterPatientEntries(entries, entryFilter);
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
      <section className="dashboard-hero patient-hero">
        <div className="patient-hero-copy">
          <p className="eyebrow">SEU ESPAÇO</p>
          <h1>Olá, {user.name}.</h1>
          <p>Guarde situações, pensamentos e emoções que você queira retomar depois. Nada é compartilhado automaticamente.</p>
          <span className="patient-privacy-chip"><span aria-hidden="true" /> Privado por padrão</span>
        </div>
        <button className="primary-button" onClick={() => setEditing("new")}>Registrar algo</button>
      </section>

      <section className="patient-overview" aria-label="Resumo dos seus registros">
        <article><span className="overview-number">{entries.length}</span><div><strong>{entries.length === 1 ? "registro salvo" : "registros salvos"}</strong><small>Seu histórico nesta conta</small></div></article>
        <article><span className="overview-number">{sharedCount}</span><div><strong>{sharedCount === 1 ? "compartilhado" : "compartilhados"}</strong><small>Visíveis para Mateus agora</small></div></article>
        <a href={config.guide_url}><span>Não sabe bem o que está sentindo?</span><strong>Abrir o Guia de Emoções →</strong></a>
      </section>

      {message ? <Notice tone="success" message={message} /> : null}
      {editing ? <EntryForm initial={editing === "new" ? undefined : editing} onSave={save} onCancel={() => setEditing(null)} /> : null}
      <section className="records-section" aria-labelledby="records-title">
        <div className="section-heading patient-records-heading"><div><p className="eyebrow">HISTÓRICO</p><h2 id="records-title">Seus registros</h2><p>Encontre rapidamente o que está privado ou compartilhado com Mateus.</p></div><span className="count">{entryFilter === "all" ? `${entries.length} ${entries.length === 1 ? "registro" : "registros"}` : `${visibleEntries.length} de ${entries.length}`}</span></div>
        {loading ? <div className="empty-state patient-loading"><div className="loader" /><p>Carregando seus registros…</p></div> : entries.length === 0 ? (
          <div className="empty-state patient-empty-state">
            <span className="empty-state-number" aria-hidden="true">01</span>
            <h3>Seu histórico começa quando você quiser.</h3>
            <p>Você pode começar com uma situação breve. Não precisa entender tudo antes de escrever.</p>
            <div className="empty-state-actions"><button className="primary-button" onClick={() => setEditing("new")}>Criar o primeiro registro</button><a className="secondary-button" href={config.guide_url}>Explorar o Guia de Emoções</a></div>
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
          <div className="sr-status" aria-live="polite">
            {entryFilter === "all"
              ? `Exibindo todos os ${entries.length} registros.`
              : entryFilter === "private"
                ? `Exibindo ${privateCount} ${privateCount === 1 ? "registro privado" : "registros privados"}.`
                : `Exibindo ${sharedCount} ${sharedCount === 1 ? "registro compartilhado" : "registros compartilhados"}.`}
          </div>
          {visibleEntries.length === 0 ? (
            <div className="empty-state patient-filter-empty">
              <h3>{entryFilter === "shared" ? "Nenhum registro compartilhado agora." : "Nenhum registro privado agora."}</h3>
              <p>{entryFilter === "shared" ? "Quando você decidir compartilhar um registro com Mateus, ele aparecerá aqui." : "Você pode deixar um registro privado novamente abrindo-o e retirando o compartilhamento."}</p>
              <button className="secondary-button" type="button" onClick={() => setEntryFilter("all")}>Mostrar todos</button>
            </div>
          ) : <div className="record-list patient-record-list">{visibleEntries.map((entry) => {
          const shared = isEntryShared(entry);
          return (
            <details className="record-card patient-record-card" key={entry.id}>
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
                <EntryDetails entry={entry} />
                <div className="record-actions">
                  <button className={shared ? "secondary-button" : "share-button"} onClick={() => void sharing(entry)}>{shared ? "Deixar privado novamente" : "Compartilhar com Mateus"}</button>
                  <button className="quiet-button" onClick={() => setEditing(entry)}>Editar</button>
                  <button className="danger-link" onClick={() => void remove(entry)}>Excluir</button>
                </div>
              </div>
            </details>
          );
        })}</div>}
        </>}
      </section>
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
      <div className="account-grid"><form className="stack panel" onSubmit={password}><h3>Alterar senha</h3><Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required /><Field label="Nova senha" name="new_password" type="password" autoComplete="new-password" required /><Field label="Repita a nova senha" name="confirmation" type="password" autoComplete="new-password" required />{role === "therapist" ? <Field label="Código do autenticador" name="totp" required /> : null}<button className="secondary-button">Alterar senha</button></form><form className="stack panel" onSubmit={rotate}><h3>Novo código de recuperação</h3><p>O código atual deixará de funcionar.</p><Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" required />{role === "therapist" ? <Field label="Código do autenticador" name="totp" required /> : null}<button className="secondary-button">Gerar novo código</button></form></div>{message ? <Notice tone={message.includes("alterada") ? "success" : "error"} message={message} /> : null}<div className="account-links">{role === "patient" ? <><a href="/api/portal/export" download>Baixar cópia dos meus registros</a><form onSubmit={deleteAccount}><Field label="Senha atual para excluir a conta" name="current_password" type="password" autoComplete="current-password" required /><button className="danger-button">Excluir conta e registros</button></form></> : null}<a href="/privacidade/">Aviso de privacidade</a><a href={config.public_site_url}>Voltar ao site profissional</a></div>
    </details>
  );
}

function EmergencyFooter({ config }: { config: Config }) {
  return <footer className="site-footer"><div><strong>Este espaço não é acompanhado em tempo real.</strong><p>Não use os registros para pedir ajuda urgente. Em risco imediato, procure um serviço de emergência da sua região ou ligue 192.</p></div><nav aria-label="Links do rodapé"><a href={config.public_site_url}>Site profissional</a><a href={config.guide_url}>Guia de Emoções</a><a href="/privacidade/">Privacidade</a></nav></footer>;
}

export function PortalApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState("");
  const [recovery, setRecovery] = useState("");
  const [fatal, setFatal] = useState("");
  const clear = useCallback(() => { setUser(null); setCsrf(""); }, []);
  useEffect(() => {
    Promise.all([portalRequest<Config>("/config"), portalRequest<{ user: User | null; csrf?: string }>("/session")])
      .then(([nextConfig, session]) => { setConfig(nextConfig); setUser(session.user); setCsrf(session.csrf || ""); })
      .catch((error) => setFatal((error as Error).message));
  }, []);
  const authenticated = useCallback((nextUser: User, token: string, nextRecovery?: string) => { setUser(nextUser); setCsrf(token); if (nextRecovery) setRecovery(nextRecovery); }, []);
  async function logout() { try { await portalRequest("/logout", { method: "POST" }, csrf); } finally { clear(); } }
  const content = (() => {
    if (!config) return <main className="loading"><div className="loader" /><p>{fatal || "Preparando seu espaço…"}</p></main>;
    if (!user) return <Guest config={config} onAuthenticated={authenticated} />;
    return <><Header config={config} user={user} onLogout={() => void logout()} />{user.role === "patient" ? <PatientDashboard user={user} csrf={csrf} config={config} setRecovery={setRecovery} onSessionLost={clear} /> : <ProfessionalDashboard user={{ ...user, role: "therapist" }} csrf={csrf} onSessionLost={clear} accountPanel={<AccountPanel role="therapist" csrf={csrf} config={config} setRecovery={setRecovery} />} />}<EmergencyFooter config={config} /></>;
  })();
  return <>{content}{recovery ? <RecoveryCard code={recovery} onClose={() => setRecovery("")} /> : null}</>;
}
