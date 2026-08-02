(() => {
  "use strict";

  const PDF_PATH = "/assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf";
  const PORTAL_PATH = "https://area-do-paciente.psico-mateus.workers.dev";

  const hashTarget = (hash) => {
    if (!hash || hash === "#") return document.documentElement;

    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      id = hash.slice(1);
    }

    return document.getElementById(id);
  };

  const scrollToHash = (hash) => {
    if (!hash || hash === "#") {
      window.scrollTo({ top: 0, behavior: "auto" });
      return true;
    }

    const target = hashTarget(hash);
    if (!target) return false;
    target.scrollIntoView({ behavior: "auto", block: "start" });
    return true;
  };

  const dialogSelector = '[role="dialog"][aria-modal="true"]';
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  let activeDialog = null;
  let dialogTrigger = null;
  let semanticsReady = false;

  const dialogFocusable = (dialog) =>
    Array.from(dialog.querySelectorAll(focusableSelector)).filter(
      (element) => !element.closest('[aria-hidden="true"]'),
    );

  const enhanceGuideSemantics = () => {
    const main = document.querySelector("main");
    const header = document.querySelector("main > header");
    const footer = document.querySelector("main > footer");
    const authorCard = document.querySelector("main .author-card");
    const target = document.getElementById("inicio");
    const guidedExploration = document.getElementById("registrar");

    if (main) {
      main.setAttribute("aria-label", "Conteúdo principal do Guia de Emoções");
    }
    // O build atual mantém cabeçalho, autoria e rodapé dentro do <main>.
    // O papel explícito evita criar landmarks aninhados sem retirar conteúdo.
    if (header) header.setAttribute("role", "group");
    if (footer) footer.setAttribute("role", "group");
    if (authorCard) authorCard.setAttribute("role", "presentation");

    document
      .querySelectorAll(".modal-backdrop > .emotion-modal, .modal-backdrop > .install-modal")
      .forEach((modal) => {
        const backdrop = modal.parentElement;
        if (!backdrop) return;
        const labelledBy = modal.getAttribute("aria-labelledby");
        backdrop.setAttribute("role", "dialog");
        backdrop.setAttribute("aria-modal", "true");
        if (labelledBy) backdrop.setAttribute("aria-labelledby", labelledBy);
        modal.removeAttribute("role");
        modal.removeAttribute("aria-modal");
        modal.removeAttribute("aria-labelledby");
      });
    if (target) target.setAttribute("tabindex", "-1");

    const guidedExplorationLink = header?.querySelector('nav a[href="#registrar"]');
    if (guidedExplorationLink?.textContent !== "Exploração guiada") {
      guidedExplorationLink.textContent = "Exploração guiada";
    }

    const guidedExplorationEyebrow = guidedExploration?.querySelector(".eyebrow");
    if (guidedExplorationEyebrow?.textContent !== "EXPLORAÇÃO GUIADA") {
      guidedExplorationEyebrow.textContent = "EXPLORAÇÃO GUIADA";
    }

    const privacyCopy = document.querySelector(".privacy-note p");
    if (privacyCopy?.textContent.includes("O que você escreve no registro")) {
      Array.from(privacyCopy.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent = node.textContent.replace(
            "O que você escreve no registro",
            "O que você escreve nesta exploração",
          );
        }
      });
    }

    if (!document.querySelector(".guide-skip-link")) {
      const skipLink = document.createElement("a");
      skipLink.className = "guide-skip-link";
      skipLink.href = "#inicio";
      skipLink.textContent = "Pular para o conteúdo do Guia";
      document.body.prepend(skipLink);
    }

    const cueTabs = document.querySelector(".cue-tabs");
    if (cueTabs) {
      cueTabs.setAttribute("role", "group");
      cueTabs.querySelectorAll("button").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.classList.contains("active")));
      });
    }

    const footerLinks = document.querySelector("main > footer .footer-links");
    if (footerLinks && !footerLinks.querySelector(`a[href="${PDF_PATH}"]`)) {
      const pdfLink = document.createElement("a");
      pdfLink.href = PDF_PATH;
      pdfLink.download = "Guia_Pratico_para_Reconhecer_Emocoes.pdf";
      pdfLink.textContent = "Baixar versão em PDF";
      footerLinks.append(pdfLink);
    }

    const heroActions = document.querySelector(".hero-actions");
    const professionalSiteLink = heroActions?.querySelector('a[href="/"]');
    if (professionalSiteLink && !professionalSiteLink.classList.contains("guide-professional-link")) {
      professionalSiteLink.classList.remove("button-quiet");
      professionalSiteLink.classList.add("button-secondary", "guide-professional-link");
      professionalSiteLink.textContent = "Site profissional";
    }

    const heroPortalLink = heroActions?.querySelector(`a[href="${PORTAL_PATH}"]`);
    if (heroActions) {
      const portalLink = heroPortalLink || document.createElement("a");
      if (
        !portalLink.classList.contains("button") ||
        !portalLink.classList.contains("button-secondary") ||
        !portalLink.classList.contains("guide-portal-link") ||
        portalLink.classList.contains("button-quiet")
      ) {
        portalLink.classList.add("button", "button-secondary", "guide-portal-link");
        portalLink.classList.remove("button-quiet");
      }
      portalLink.href = PORTAL_PATH;
      if (portalLink.textContent !== "Área do paciente") {
        portalLink.textContent = "Área do paciente";
      }
      portalLink.setAttribute(
        "aria-label",
        "Acessar a Área do paciente, espaço exclusivo para pacientes atuais",
      );
      if (!heroPortalLink) {
        heroActions.insertBefore(portalLink, professionalSiteLink || null);
      }
    }

    const footerPortalLink = footerLinks?.querySelector(`a[href="${PORTAL_PATH}"]`);
    if (footerLinks) {
      const portalLink = footerPortalLink || document.createElement("a");
      portalLink.href = PORTAL_PATH;
      if (portalLink.textContent !== "Acessar a Área do paciente") {
        portalLink.textContent = "Acessar a Área do paciente";
      }
      portalLink.setAttribute(
        "aria-label",
        "Acessar a Área do paciente, espaço exclusivo para pacientes atuais",
      );
      if (!footerPortalLink) footerLinks.append(portalLink);
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      const possibleDialogTrigger = event.target.closest(
        ".emotion-card, .install-button",
      );
      if (possibleDialogTrigger) dialogTrigger = possibleDialogTrigger;

      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const hash = link.getAttribute("href");
      if (!scrollToHash(hash)) return;

      event.preventDefault();
      event.stopPropagation();
      window.history.pushState(null, "", hash);

      if (link.classList.contains("guide-skip-link")) {
        const target = hashTarget(hash);
        window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
      }
    },
    true,
  );

  window.addEventListener("popstate", () => {
    scrollToHash(window.location.hash);
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Tab" || !activeDialog) return;

      const focusable = dialogFocusable(activeDialog);
      if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!activeDialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    },
    true,
  );

  const dialogObserver = new MutationObserver(() => {
    if (semanticsReady) enhanceGuideSemantics();
    const dialog = document.querySelector(dialogSelector);

    if (dialog && dialog !== activeDialog) {
      activeDialog = dialog;
      if (!activeDialog.hasAttribute("tabindex")) activeDialog.tabIndex = -1;
      window.requestAnimationFrame(() => {
        if (!document.contains(activeDialog)) return;
        const first = dialogFocusable(activeDialog)[0] || activeDialog;
        first.focus({ preventScroll: true });
      });
      return;
    }

    if (!dialog && activeDialog) {
      activeDialog = null;
      const trigger = dialogTrigger;
      dialogTrigger = null;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    }
  });

  dialogObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });

  const startSemanticEnhancements = () => {
    if (semanticsReady) return;
    semanticsReady = true;
    enhanceGuideSemantics();
    window.setTimeout(enhanceGuideSemantics, 150);
  };

  const waitForHydration = (startedAt = performance.now()) => {
    const hydratedAt = Number(window.__VINEXT_HYDRATED_AT || 0);
    if (
      (hydratedAt > 0 && performance.now() - hydratedAt >= 250) ||
      performance.now() - startedAt >= 5_000
    ) {
      startSemanticEnhancements();
      return;
    }
    window.requestAnimationFrame(() => waitForHydration(startedAt));
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => waitForHydration(),
      { once: true },
    );
  } else {
    waitForHydration();
  }
})();
