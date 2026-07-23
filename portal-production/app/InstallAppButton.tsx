"use client";

import { useEffect, useRef, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type NavigatorWithPwaDetection = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{
    id?: string;
    platform?: string;
    url?: string;
  }>>;
};

function isRunningAsApp() {
  const navigatorWithStandalone = navigator as NavigatorWithPwaDetection;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

async function isInstalled() {
  if (isRunningAsApp()) return true;

  const navigatorWithDetection = navigator as NavigatorWithPwaDetection;
  if (!navigatorWithDetection.getInstalledRelatedApps) return false;

  try {
    const relatedApps = await navigatorWithDetection.getInstalledRelatedApps();
    return relatedApps.some((app) => app.platform === "webapp");
  } catch {
    return false;
  }
}

export function InstallAppButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const displayMode = window.matchMedia("(display-mode: standalone)");

    const refreshInstallation = async () => {
      const nextInstalled = await isInstalled();
      if (!active) return;
      setInstalled(nextInstalled);
      setReady(true);
    };

    const rememberPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
      setInstalled(false);
      setReady(true);
    };
    const confirmInstallation = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("Aplicativo instalado.");
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshInstallation();
    };

    void refreshInstallation();
    window.addEventListener("beforeinstallprompt", rememberPrompt);
    window.addEventListener("appinstalled", confirmInstallation);
    window.addEventListener("focus", refreshInstallation);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    displayMode.addEventListener?.("change", refreshInstallation);
    navigator.serviceWorker?.register("/sw.js").catch(() => {
      // O portal continua funcionando como site se o navegador não aceitar o registro.
    });

    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", rememberPrompt);
      window.removeEventListener("appinstalled", confirmInstallation);
      window.removeEventListener("focus", refreshInstallation);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      displayMode.removeEventListener?.("change", refreshInstallation);
    };
  }, []);

  async function install() {
    setMessage("");

    if (!installPrompt) {
      dialogRef.current?.showModal();
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(
      choice.outcome === "accepted"
        ? "Instalação iniciada."
        : "Instalação cancelada. Você pode tentar novamente pelo menu do navegador.",
    );
  }

  if (!ready || installed) return null;

  return (
    <>
      <button type="button" className="install-app-button" onClick={install}>
        Instalar
      </button>
      <span className="sr-status" role="status" aria-live="polite">
        {message}
      </span>

      <dialog
        ref={dialogRef}
        className="install-dialog"
        aria-labelledby="install-dialog-title"
      >
        <form method="dialog" className="install-dialog-shell">
          <div className="install-dialog-heading">
            <div>
              <p className="eyebrow">ACESSO PELO APARELHO</p>
              <h2 id="install-dialog-title">Instalar Registros</h2>
            </div>
            <button
              type="submit"
              className="icon-button"
              aria-label="Fechar instruções"
            >
              ×
            </button>
          </div>
          <p className="install-dialog-intro">Use o portal como aplicativo, sem loja e sem cobrança. Escolha abaixo o seu aparelho.</p>
          <div className="install-device-grid">
            <section>
              <span>iPhone e iPad</span>
              <h3>No Safari</h3>
              <p>Toque em Compartilhar, escolha “Adicionar à Tela de Início”, ative “Abrir como App da Web” e toque em “Adicionar”.</p>
            </section>
            <section>
              <span>MacBook e iMac</span>
              <h3>No Safari</h3>
              <p>Clique em Compartilhar, escolha “Adicionar ao Dock” e confirme em “Adicionar”.</p>
            </section>
            <section>
              <span>Android</span>
              <h3>No Chrome</h3>
              <p>Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.</p>
            </section>
            <section>
              <span>Windows</span>
              <h3>No Chrome ou Edge</h3>
              <p>Use o ícone de instalação na barra de endereço ou procure “Instalar aplicativo” no menu.</p>
            </section>
          </div>
          <div className="install-dialog-footer"><p>Depois de instalar, abra pelo novo ícone. A opção deixa de ocupar espaço quando o navegador reconhece a instalação.</p><button type="submit" className="primary-button">Fechar</button></div>
        </form>
      </dialog>
    </>
  );
}
