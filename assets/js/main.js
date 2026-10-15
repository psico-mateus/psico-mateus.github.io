(() => {
  "use strict";

  const config = window.SITE_CONFIG;
  if (!config) return;

  document.querySelectorAll("[data-link]").forEach((element) => {
    const href = config.links[element.dataset.link];
    if (href) element.setAttribute("href", href);
  });

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const menuToggle = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-menu]");
  let menuTrigger = null;
  let menuFocusTimer;
  let menuToggleHadFocus = false;
  const menuBackgroundState = new Map();
  const menuFallbackFocusState = new Map();

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  const menuFocusable = () =>
    menu
      ? [menuToggle, ...menu.querySelectorAll(focusableSelector)].filter(
          (element) => element && element.tabIndex >= 0 &&
            !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
            element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden",
        )
      : [];

  const menuBackgroundElements = () => {
    const elements = [];
    const visit = (parent) => {
      Array.from(parent.children).forEach((element) => {
        if (element === menu || element === menuToggle) return;
        if (element.contains(menu) || element.contains(menuToggle)) visit(element);
        else elements.push(element);
      });
    };
    if (menu && menuToggle) visit(document.body);
    return elements;
  };

  const setMenuBackgroundInert = (isInert) => {
    if (isInert) {
      menuBackgroundElements().forEach((element) => {
        if (menuBackgroundState.has(element)) return;

        const supportsInert = "inert" in element;
        menuBackgroundState.set(element, {
          inert: element.getAttribute("inert"),
          ariaHidden: element.getAttribute("aria-hidden"),
        });
        element.setAttribute("inert", "");
        element.setAttribute("aria-hidden", "true");

        if (supportsInert) return;
        const fallbackFocusable = [
          ...(element.matches(focusableSelector) ? [element] : []),
          ...element.querySelectorAll(focusableSelector),
        ];
        fallbackFocusable.forEach((focusable) => {
          if (menuFallbackFocusState.has(focusable)) return;
          menuFallbackFocusState.set(focusable, {
            hadTabindex: focusable.hasAttribute("tabindex"),
            tabindex: focusable.getAttribute("tabindex"),
          });
          focusable.setAttribute("tabindex", "-1");
        });
      });
      return;
    }

    menuBackgroundState.forEach((state, element) => {
      if (state.inert === null) element.removeAttribute("inert");
      else element.setAttribute("inert", state.inert);
      if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", state.ariaHidden);
    });
    menuBackgroundState.clear();

    menuFallbackFocusState.forEach((state, element) => {
      if (!state.hadTabindex) element.removeAttribute("tabindex");
      else if (state.tabindex !== null) element.setAttribute("tabindex", state.tabindex);
    });
    menuFallbackFocusState.clear();
  };

  const closeMenu = ({ restoreFocus = true } = {}) => {
    if (!menu || !menuToggle) return;
    menu.dataset.open = "false";
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
    document.body.classList.remove("menu-open");
    setMenuBackgroundInert(false);
    window.clearTimeout(menuFocusTimer);
    menuFocusTimer = undefined;
    if (restoreFocus && menuTrigger) menuTrigger.focus({ preventScroll: true });
  };

  const openMenu = () => {
    if (!menu || !menuToggle) return;
    menuTrigger = menuToggle;
    menu.dataset.open = "true";
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Fechar menu");
    document.body.classList.add("menu-open");
    menuToggle.focus({ preventScroll: true });
    setMenuBackgroundInert(true);
    // Aguarda a transição de visibilidade sem roubar foco de quem já navegou.
    menuFocusTimer = window.setTimeout(() => {
      if (menuToggle.getAttribute("aria-expanded") !== "true" || document.activeElement !== menuToggle) return;
      menuFocusable().find((element) => element !== menuToggle)?.focus({ preventScroll: true });
    }, 180);
  };

  if (menuToggle && menu) {
    document.addEventListener("focusin", (event) => {
      menuToggleHadFocus = event.target === menuToggle;
    });

    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      if (isOpen) closeMenu();
      else openMenu();
    });

    menu.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest("a");
      if (!link) return;

      const hash = link.getAttribute("href");
      let target = null;
      if (hash?.startsWith("#")) {
        try {
          target = document.getElementById(decodeURIComponent(hash.slice(1)));
        } catch {
          target = document.getElementById(hash.slice(1));
        }
      }

      closeMenu({ restoreFocus: !target });
      if (!target) return;

      event.preventDefault();
      window.history.pushState(null, "", hash);
      if (!target.hasAttribute("tabindex")) {
        target.tabIndex = -1;
        target.addEventListener("blur", () => {
          if (target.getAttribute("tabindex") === "-1") target.removeAttribute("tabindex");
        }, { once: true });
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    });

    document.addEventListener("keydown", (event) => {
      if (menuToggle.getAttribute("aria-expanded") !== "true") return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = menuFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!focusable.includes(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth <= 960) return;
      const wasToggleFocused = menuToggleHadFocus || document.activeElement === menuToggle;
      closeMenu({ restoreFocus: false });
      if (wasToggleFocused) menuFocusable()[0]?.focus({ preventScroll: true });
    });

    window.addEventListener("popstate", () => {
      if (menuToggle.getAttribute("aria-expanded") === "true") {
        closeMenu();
      }
    });
  }

  const shareButton = document.querySelector("[data-share-guide]");
  const shareStatus = document.querySelector("[data-share-status]");
  let shareStatusTimer;

  const setShareStatus = (message) => {
    if (!shareStatus) return;
    window.clearTimeout(shareStatusTimer);
    shareStatus.textContent = message;
    shareStatusTimer = window.setTimeout(() => {
      shareStatus.textContent = "";
    }, 4500);
  };

  const copyWithFallback = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  };

  const copyGuideLink = async () => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(config.canonicalGuide);
      return true;
    }
    return copyWithFallback(config.canonicalGuide);
  };

  shareButton?.addEventListener("click", async () => {
    const shareData = {
      title: "Guia Prático para Reconhecer Emoções",
      text: "Recurso aberto para reconhecer emoções, por Mateus Ribeiro Marcos.",
      url: config.canonicalGuide,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShareStatus("Guia compartilhado.");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    try {
      const copied = await copyGuideLink();
      setShareStatus(
        copied
          ? "Link do guia copiado."
          : `Copie este endereço: ${config.canonicalGuide}`,
      );
    } catch {
      setShareStatus(`Copie este endereço: ${config.canonicalGuide}`);
    }
  });

  const mobileCta = document.querySelector("[data-mobile-cta]");
  const nearbyActions = [
    document.querySelector(".hero .button-dark"),
    document.querySelector(".services-section"),
    document.querySelector(".guide-section"),
    document.querySelector(".contact-section"),
    document.querySelector(".appointment-section"),
    document.querySelector(".site-footer"),
  ].filter(Boolean);

  const setMobileCtaHidden = (hidden) => {
    if (!mobileCta) return;
    mobileCta.dataset.hidden = hidden ? "true" : "false";
    if (hidden) {
      mobileCta.setAttribute("aria-hidden", "true");
      mobileCta.setAttribute("tabindex", "-1");
    } else {
      mobileCta.removeAttribute("aria-hidden");
      mobileCta.removeAttribute("tabindex");
    }
  };

  if (mobileCta && "IntersectionObserver" in window) {
    const visibleTargets = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleTargets.add(entry.target);
          else visibleTargets.delete(entry.target);
        });
        setMobileCtaHidden(visibleTargets.size > 0);
      },
      { threshold: 0.06 },
    );
    nearbyActions.forEach((element) => observer.observe(element));
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => {
        if (registration && new URL(registration.scope).pathname === "/") {
          return registration.update();
        }
        return undefined;
      })
      .catch(() => undefined);
  }
})();
