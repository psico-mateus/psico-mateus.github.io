"use client";

import { useEffect, useRef, useState } from "react";

export function AppUpdateManager({
  hasUnsavedDraft,
}: {
  hasUnsavedDraft: boolean;
}) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [reloading, setReloading] = useState(false);
  const reloadRequestedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let active = true;
    let registration: ServiceWorkerRegistration | null = null;

    const showWaitingUpdate = () => {
      if (active && registration?.waiting) {
        setWaitingWorker(registration.waiting);
      }
    };
    const watchInstallingWorker = () => {
      const installing = registration?.installing;
      if (!installing) return;
      const handleStateChange = () => {
        if (installing.state !== "installed" || !navigator.serviceWorker.controller) return;
        window.setTimeout(showWaitingUpdate, 0);
      };
      installing.addEventListener("statechange", handleStateChange);
    };
    const checkForUpdate = () => {
      if (document.visibilityState === "hidden") return;
      void registration?.update().catch(() => {
        // A próxima retomada do aplicativo tentará novamente.
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    const handleControllerChange = () => {
      if (!reloadRequestedRef.current) return;
      window.location.reload();
    };

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((nextRegistration) => {
        if (!active) return;
        registration = nextRegistration;
        showWaitingUpdate();
        registration.addEventListener("updatefound", watchInstallingWorker);
        checkForUpdate();
      })
      .catch(() => {
        // O portal continua funcionando como site se o navegador não aceitar o registro.
      });

    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("pageshow", checkForUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      active = false;
      registration?.removeEventListener("updatefound", watchInstallingWorker);
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("pageshow", checkForUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  function updateNow() {
    if (
      hasUnsavedDraft &&
      !window.confirm(
        "Atualizar agora? As alterações deste registro que ainda não foram salvas serão perdidas.",
      )
    ) {
      return;
    }
    reloadRequestedRef.current = true;
    setReloading(true);
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  }

  if (!waitingWorker) return null;

  return (
    <aside className="app-update-notice" aria-labelledby="app-update-title">
      <div role="status" aria-live="polite">
        <strong id="app-update-title">Uma atualização está pronta.</strong>
        <span>Atualize para receber as melhorias mais recentes da Área do paciente.</span>
      </div>
      <div className="app-update-actions">
        <button
          className="primary-button"
          type="button"
          onClick={updateNow}
          disabled={reloading}
        >
          {reloading ? "Atualizando…" : "Atualizar agora"}
        </button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => setWaitingWorker(null)}
          disabled={reloading}
        >
          Depois
        </button>
      </div>
    </aside>
  );
}
