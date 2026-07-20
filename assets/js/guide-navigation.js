(() => {
  "use strict";

  const scrollToHash = (hash) => {
    if (!hash || hash === "#") {
      window.scrollTo({ top: 0, behavior: "auto" });
      return true;
    }

    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      id = hash.slice(1);
    }

    const target = document.getElementById(id);
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

  const dialogFocusable = (dialog) =>
    Array.from(dialog.querySelectorAll(focusableSelector)).filter(
      (element) => !element.closest('[aria-hidden="true"]'),
    );

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

  dialogObserver.observe(document.body, { childList: true, subtree: true });
})();
