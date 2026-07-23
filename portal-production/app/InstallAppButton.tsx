"use client";

import { useEffect, useRef, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isRunningAsApp() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function InstallAppButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const standaloneCheck = window.requestAnimationFrame(() => {
      setInstalled(isRunningAsApp());
    });

    const rememberPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const confirmInstallation = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("Aplicativo instalado.");
    };

    window.addEventListener("beforeinstallprompt", rememberPrompt);
    window.addEventListener("appinstalled", confirmInstallation);
    navigator.serviceWorker?.register("/sw.js").catch(() => {
      // O portal continua funcionando como site se o navegador não aceitar o registro.
    });

    return () => {
      window.cancelAnimationFrame(standaloneCheck);
      window.removeEventListener("beforeinstallprompt", rememberPrompt);
      window.removeEventListener("appinstalled", confirmInstallation);
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

  if (installed) return null;

  return (
    <>
      <button type="button" className="install-app-button" onClick={install}>
        Instalar aplicativo
      </button>
      <span className="sr-status" role="status" aria-live="polite">
        {message}
      </span>

      <dialog
        ref={dialogRef}
        className="install-dialog"
        aria-labelledby="install-dialog-title"
      >
        <form method="dialog">
          <div className="install-dialog-heading">
            <div>
              <p className="eyebrow">ACESSO RÁPIDO</p>
              <h2 id="install-dialog-title">Instale o portal</h2>
            </div>
            <button
              type="submit"
              className="icon-button"
              aria-label="Fechar instruções"
            >
              ×
            </button>
          </div>
          <p>
            O portal pode ficar na tela inicial e abrir como aplicativo, sem
            cobrança e sem baixar nada de uma loja.
          </p>
          <ol className="install-steps">
            <li>
              <strong>No iPhone ou iPad:</strong> abra no Safari, toque em
              Compartilhar, escolha “Adicionar à Tela de Início”, ative “Abrir
              como App da Web” e toque em “Adicionar”.
            </li>
            <li>
              <strong>No MacBook ou iMac:</strong> no Safari, clique em Compartilhar,
              escolha “Adicionar ao Dock” e confirme em “Adicionar”.
            </li>
            <li>
              <strong>No Android ou Windows:</strong> abra o menu do Chrome ou
              Edge e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.
            </li>
          </ol>
          <button type="submit" className="primary-button">
            Entendi
          </button>
        </form>
      </dialog>
    </>
  );
}
