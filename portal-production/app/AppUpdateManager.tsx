"use client";

import { useEffect, useRef, useState } from "react";

const DISMISSED_BUILD_KEY = "area-paciente:update-dismissed:v1";

function workerBuildId(worker: ServiceWorker): Promise<string> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let finished = false;
    const finish = (id: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      resolve(id);
    };
    const timeout = window.setTimeout(() => finish(""), 1_000);
    channel.port1.onmessage = (event) => {
      const id = event.data?.buildId;
      finish(typeof id === "string" && /^[a-f0-9]{16}$/u.test(id) ? id : "");
    };
    try {
      worker.postMessage({ type: "GET_BUILD_ID" }, [channel.port2]);
    } catch { finish(""); }
  });
}

export function AppUpdateManager({ hasUnsavedDraft }: { hasUnsavedDraft: boolean }) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [buildId, setBuildId] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [supported, setSupported] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const reloadRequestedRef = useRef(false);
  const reloadTimeoutRef = useRef<number | null>(null);
  const dismissedWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let generation = 0;
    const workerListeners = new Map<ServiceWorker, () => void>();
    const showWaitingUpdate = async () => {
      const current = ++generation;
      const waiting = registrationRef.current?.waiting ?? null;
      if (!waiting) {
        if (active) { setWaitingWorker(null); setBuildId(""); }
        return;
      }
      const id = await workerBuildId(waiting);
      if (!active || current !== generation || registrationRef.current?.waiting !== waiting) return;
      let wasDismissed = dismissedWorkerRef.current === waiting;
      try {
        wasDismissed ||= Boolean(id && localStorage.getItem(DISMISSED_BUILD_KEY) === id);
      } catch { /* Apenas uma preferência técnica; o portal funciona sem storage. */ }
      setWaitingWorker(waiting);
      setBuildId(id);
      setDismissed(wasDismissed);
    };
    const watchInstallingWorker = () => {
      const installing = registrationRef.current?.installing;
      if (!installing || workerListeners.has(installing)) return;
      const handleStateChange = () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) void showWaitingUpdate();
        if (installing.state === "redundant") void showWaitingUpdate();
      };
      workerListeners.set(installing, handleStateChange);
      installing.addEventListener("statechange", handleStateChange);
    };
    const checkForUpdate = () => {
      if (document.visibilityState === "hidden") return;
      void registrationRef.current?.update().then(showWaitingUpdate).catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    const handleControllerChange = () => {
      if (reloadRequestedRef.current) window.location.reload();
      else void showWaitingUpdate();
    };
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        if (!active) return;
        setSupported(true);
        registrationRef.current = registration;
        void showWaitingUpdate();
        registration.addEventListener("updatefound", watchInstallingWorker);
        watchInstallingWorker();
        checkForUpdate();
      })
      .catch(() => { if (active) setSupported(false); });
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("pageshow", checkForUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => {
      active = false;
      registrationRef.current?.removeEventListener("updatefound", watchInstallingWorker);
      for (const [worker, listener] of workerListeners) worker.removeEventListener("statechange", listener);
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("pageshow", checkForUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      if (reloadTimeoutRef.current !== null) clearTimeout(reloadTimeoutRef.current);
    };
  }, []);

  async function checkNow() {
    if (checking) return;
    setChecking(true);
    setMessage("");
    try {
      await registrationRef.current?.update();
      setMessage(registrationRef.current?.waiting || registrationRef.current?.installing
        ? "Uma versão está sendo preparada. Você pode continuar usando esta página."
        : "Verificação concluída. Nenhuma atualização pendente foi encontrada.");
    } catch {
      setMessage("Não foi possível verificar agora. Confira a conexão e tente novamente.");
    } finally { setChecking(false); }
  }

  function dismiss() {
    dismissedWorkerRef.current = waitingWorker;
    setDismissed(true);
    try { if (buildId) localStorage.setItem(DISMISSED_BUILD_KEY, buildId); } catch { /* Opcional. */ }
    if (detailsRef.current) {
      detailsRef.current.open = false;
      detailsRef.current.querySelector("summary")?.focus();
    }
  }

  function updateNow() {
    if (reloading || !waitingWorker) return;
    if (hasUnsavedDraft && !window.confirm(
      "Atualizar agora? As alterações que ainda não foram salvas serão perdidas. Cancele para salvar primeiro.",
    )) return;
    setMessage("");
    reloadRequestedRef.current = true;
    setReloading(true);
    reloadTimeoutRef.current = window.setTimeout(() => {
      reloadRequestedRef.current = false;
      setReloading(false);
      setMessage("A atualização demorou mais que o esperado. Salve o que estiver preenchendo e tente novamente.");
    }, 12_000);
    try {
      if (waitingWorker.state === "activated") window.location.reload();
      else waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      clearTimeout(reloadTimeoutRef.current);
      reloadRequestedRef.current = false;
      setReloading(false);
      setMessage("Não foi possível aplicar a atualização. Salve seu trabalho e recarregue a página quando puder.");
    }
  }

  if (!supported) return null;
  return (
    <details ref={detailsRef} className="app-updates-panel">
      <summary>
        <span>Atualizações do aplicativo</span>
        {waitingWorker && !dismissed ? <small>Nova versão disponível</small> : null}
      </summary>
      <div className="app-updates-content">
        <p>{waitingWorker
          ? "Há uma versão pronta. Atualize quando terminar o que está fazendo."
          : "Você pode verificar aqui se há uma versão nova."}</p>
        {waitingWorker ? (
          <div className="app-update-actions">
            <button className="secondary-button" type="button" onClick={updateNow} disabled={reloading}>
              {reloading ? "Atualizando…" : "Atualizar agora"}
            </button>
            <button className="quiet-button" type="button" onClick={dismiss} disabled={reloading}>Depois</button>
          </div>
        ) : (
          <button className="quiet-button" type="button" onClick={() => void checkNow()} disabled={checking}>
            {checking ? "Verificando…" : "Verificar atualização"}
          </button>
        )}
        <p role="status" aria-live="polite" className={message ? "app-updates-status" : "sr-status"}>{message}</p>
      </div>
    </details>
  );
}
