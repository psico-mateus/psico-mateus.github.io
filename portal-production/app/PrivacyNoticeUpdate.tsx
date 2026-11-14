"use client";

import { useState } from "react";
import { portalRequest } from "./portal-client";

/**
 * Comunicado de que o aviso de privacidade mudou.
 *
 * Aparece só para pacientes cuja versão aceita é anterior à atual. Não bloqueia
 * o uso da área. A ciência é guardada no servidor, nunca no aparelho.
 */
export function PrivacyNoticeUpdate({
  csrf,
  onAcknowledged,
}: {
  csrf: string;
  onAcknowledged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function acknowledge() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await portalRequest("/account/privacy-notice", { method: "POST", body: "{}" }, csrf);
      onAcknowledged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="privacy-notice-update" aria-labelledby="privacy-notice-update-title">
      <h2 id="privacy-notice-update-title">O aviso de privacidade foi atualizado</h2>
      <p>
        Nova versão de 14 de novembro de 2026. Nada mudou em quem pode ver seus
        registros. O texto agora explica melhor onde os dados ficam guardados e
        por quanto tempo.
      </p>
      <div className="privacy-notice-update-actions">
        <a href="/privacidade/" target="_blank" rel="noreferrer">
          Ler o aviso<span className="sr-status"> (abre em nova aba)</span>
        </a>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => void acknowledge()}>
          {busy ? "Salvando…" : "Entendi"}
        </button>
      </div>
      {failed ? (
        <p role="alert" className="privacy-notice-update-error">
          Não foi possível registrar agora. Você pode continuar usando a área e tentar de novo depois.
        </p>
      ) : null}
    </section>
  );
}
