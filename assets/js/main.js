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

  const menuFocusable = () =>
    menu
      ? Array.from(
          menu.querySelectorAll(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];

  const closeMenu = ({ restoreFocus = true } = {}) => {
    if (!menu || !menuToggle) return;
    menu.dataset.open = "false";
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
    document.body.classList.remove("menu-open");
    window.clearTimeout(menuFocusTimer);
    menuFocusTimer = undefined;
    if (restoreFocus && menuTrigger) menuTrigger.focus();
  };

  const openMenu = () => {
    if (!menu || !menuToggle) return;
    menuTrigger = menuToggle;
    menu.dataset.open = "true";
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Fechar menu");
    document.body.classList.add("menu-open");
    menuFocusTimer = window.setTimeout(() => menuFocusable()[0]?.focus(), 180);
  };

  if (menuToggle && menu) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      if (isOpen) closeMenu();
      else openMenu();
    });

    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu({ restoreFocus: false });
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

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 960) closeMenu({ restoreFocus: false });
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
      text: "Material de apoio para reconhecer emoções, por Mateus Ribeiro Marcos.",
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
