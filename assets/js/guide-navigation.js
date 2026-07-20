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

  document.addEventListener(
    "click",
    (event) => {
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
})();

