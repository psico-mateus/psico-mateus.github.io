(() => {
  "use strict";

  const state = { user: null, csrf: null, entries: [], pendingAction: null };
  const elements = {
    loginView: document.getElementById("login-view"),
    dashboardView: document.getElementById("dashboard-view"),
    patientPanel: document.getElementById("patient-panel"),
    therapistPanel: document.getElementById("therapist-panel"),
    loginForm: document.getElementById("login-form"),
    entryForm: document.getElementById("entry-form"),
    logoutButton: document.getElementById("logout-button"),
    patientRecords: document.getElementById("patient-records"),
    sharedRecords: document.getElementById("shared-records"),
    status: document.getElementById("status-message"),
    dialog: document.getElementById("confirmation-dialog"),
    dialogTitle: document.getElementById("confirmation-title"),
    dialogDescription: document.getElementById("confirmation-description"),
    dialogConfirm: document.getElementById("confirmation-button"),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers };
    if (state.csrf && options.method && options.method !== "GET") headers["X-CSRF-Token"] = state.csrf;
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a ação.");
    return payload;
  }

  let statusTimer;
  function announce(message) {
    elements.status.textContent = message;
    elements.status.classList.add("visible");
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => elements.status.classList.remove("visible"), 3_200);
  }

  function setView(user) {
    state.user = user;
    elements.loginView.hidden = Boolean(user);
    elements.dashboardView.hidden = !user;
    elements.logoutButton.hidden = !user;
    elements.patientPanel.hidden = user?.role !== "patient";
    elements.therapistPanel.hidden = user?.role !== "therapist";
    if (!user) return;

    const patient = user.role === "patient";
    document.getElementById("dashboard-eyebrow").textContent = patient ? "SEU ESPAÇO PARTICULAR" : "VISÃO PROFISSIONAL";
    document.getElementById("dashboard-title").innerHTML = patient
      ? `Olá, ${escapeHtml(user.name.split(" (")[0])}. <span>Você decide o que compartilhar.</span>`
      : "Acesso somente ao que foi <span>compartilhado para a sessão.</span>";
    document.getElementById("dashboard-description").textContent = patient
      ? "Escreva para você primeiro. Um registro só aparece para o profissional quando você escolhe compartilhar."
      : "Este painel não mostra registros privados e não permite alterar o texto escrito pelo paciente.";
    document.getElementById("privacy-summary").innerHTML = patient
      ? "<strong>Privacidade por padrão</strong><p>Novo registro: privado · Compartilhamento: manual · Revogação: disponível</p>"
      : "<strong>Limite de acesso ativo</strong><p>Somente pacientes vinculados e registros compartilhados aparecem aqui.</p>";
  }

  function detail(label, value) {
    if (!value) return "";
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function recordMarkup(entry, professional = false) {
    const isShared = Boolean(entry.shared_at && !entry.revoked_at);
    const status = isShared ? "Compartilhado" : "Privado";
    const patient = professional ? `<p class="record-date">${escapeHtml(entry.patient_name)}</p>` : "";
    const actions = professional
      ? ""
      : `<div class="record-actions">
          <button class="share-action" type="button" data-action="${isShared ? "revoke" : "share"}" data-entry-id="${escapeHtml(entry.id)}">
            ${isShared ? "Revogar compartilhamento" : "Compartilhar para a sessão"}
          </button>
          <button class="delete-action" type="button" data-action="delete" data-entry-id="${escapeHtml(entry.id)}">Excluir registro</button>
        </div>`;
    return `<article class="record-card ${isShared ? "is-shared" : ""}">
      <div class="record-topline">
        <div>${patient}<h3>${escapeHtml(entry.title)}</h3><span class="record-date">${escapeHtml(formatDate(entry.created_at))}</span></div>
        <span class="status-badge ${isShared ? "shared" : "private"}">${status}</span>
      </div>
      <p class="record-summary">${escapeHtml(entry.happened)}</p>
      <dl class="record-details">
        ${detail("Corpo", entry.body)}
        ${detail("Pensamentos", entry.thoughts)}
        ${detail("Vontade de agir", entry.urge)}
        ${detail("Emoção e intensidade", entry.emotion ? `${entry.emotion} · ${entry.intensity}/10` : `${entry.intensity}/10`)}
        ${detail("O que pode comunicar", entry.message)}
      </dl>
      ${actions}
    </article>`;
  }

  function emptyMarkup(professional) {
    return `<div class="empty-state"><strong>${professional ? "Nenhum registro compartilhado" : "Nenhum registro por enquanto"}</strong><p>${
      professional
        ? "Quando o paciente compartilhar algo explicitamente, o conteúdo aparecerá aqui."
        : "O primeiro registro será salvo de forma privada."
    }</p></div>`;
  }

  function renderEntries() {
    const professional = state.user?.role === "therapist";
    const target = professional ? elements.sharedRecords : elements.patientRecords;
    target.innerHTML = state.entries.length
      ? state.entries.map((entry) => recordMarkup(entry, professional)).join("")
      : emptyMarkup(professional);
  }

  async function loadEntries() {
    const payload = await api("/api/entries");
    state.entries = payload.entries;
    renderEntries();
  }

  async function restoreSession() {
    const payload = await api("/api/session");
    state.csrf = payload.csrf || null;
    setView(payload.user);
    if (payload.user) await loadEntries();
  }

  document.querySelectorAll("[data-demo-email]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.loginForm.email.value = button.dataset.demoEmail;
      elements.loginForm.password.value = button.dataset.demoPassword;
      elements.loginForm.querySelector('button[type="submit"]').focus();
      announce("Conta fictícia preenchida. Agora escolha Entrar.");
    });
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(elements.loginForm);
    try {
      const payload = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      state.csrf = payload.csrf;
      setView(payload.user);
      await loadEntries();
      elements.dashboardView.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
      announce("Entrada realizada com uma conta de demonstração.");
    } catch (error) {
      announce(error.message);
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST" });
      state.csrf = null;
      state.entries = [];
      setView(null);
      elements.loginForm.reset();
      window.scrollTo({ top: 0, behavior: "auto" });
      announce("Você saiu do protótipo.");
    } catch (error) {
      announce(error.message);
    }
  });

  const intensity = document.getElementById("entry-intensity");
  intensity.addEventListener("input", () => {
    document.getElementById("intensity-output").textContent = `${intensity.value}/10`;
  });

  elements.entryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(elements.entryForm));
    form.intensity = Number(form.intensity);
    try {
      await api("/api/entries", { method: "POST", body: JSON.stringify(form) });
      elements.entryForm.reset();
      intensity.value = "5";
      document.getElementById("intensity-output").textContent = "5/10";
      await loadEntries();
      announce("Registro salvo como privado.");
    } catch (error) {
      announce(error.message);
    }
  });

  function askConfirmation({ title, description, label, action }) {
    state.pendingAction = action;
    elements.dialogTitle.textContent = title;
    elements.dialogDescription.textContent = description;
    elements.dialogConfirm.textContent = label;
    elements.dialog.showModal();
  }

  elements.patientRecords.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const entryId = button.dataset.entryId;
    if (button.dataset.action === "share") {
      askConfirmation({
        title: "Compartilhar este registro?",
        description: "O profissional poderá ler este registro. Você poderá revogar o acesso depois.",
        label: "Compartilhar",
        action: { type: "sharing", entryId, shared: true },
      });
    } else if (button.dataset.action === "revoke") {
      askConfirmation({
        title: "Revogar o compartilhamento?",
        description: "O registro voltará a aparecer somente para você.",
        label: "Revogar acesso",
        action: { type: "sharing", entryId, shared: false },
      });
    } else {
      askConfirmation({
        title: "Excluir este registro?",
        description: "Esta ação remove o registro do banco de teste e não pode ser desfeita.",
        label: "Excluir definitivamente",
        action: { type: "delete", entryId },
      });
    }
  });

  elements.dialog.addEventListener("close", async () => {
    if (elements.dialog.returnValue !== "confirm" || !state.pendingAction) {
      state.pendingAction = null;
      return;
    }
    const action = state.pendingAction;
    state.pendingAction = null;
    try {
      if (action.type === "sharing") {
        await api(`/api/entries/${action.entryId}/sharing`, {
          method: "PATCH",
          body: JSON.stringify({ shared: action.shared }),
        });
        announce(action.shared ? "Registro compartilhado para a sessão." : "Compartilhamento revogado.");
      } else {
        await api(`/api/entries/${action.entryId}`, { method: "DELETE" });
        announce("Registro excluído.");
      }
      await loadEntries();
    } catch (error) {
      announce(error.message);
    }
  });

  restoreSession().catch(() => announce("Não foi possível iniciar o protótipo local."));
})();
