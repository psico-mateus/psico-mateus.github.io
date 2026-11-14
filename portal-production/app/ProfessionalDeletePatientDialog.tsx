"use client";

import { useEffect, useRef, type FormEvent } from "react";

/**
 * Confirmação da exclusão definitiva de uma conta de paciente já desativada.
 *
 * Pede senha profissional, autenticador e uma marcação explícita. O servidor
 * decide a autorização; esta janela só coleta a confirmação.
 */
export function ProfessionalDeletePatientDialog({
  patientName,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  patientName: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (currentPassword: string, totp: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(
      String(form.get("current_password") ?? ""),
      String(form.get("totp") ?? ""),
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="assisted-recovery-dialog delete-patient-dialog"
      aria-labelledby="delete-patient-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form className="assisted-recovery-shell" onSubmit={submit}>
        <div className="assisted-recovery-heading">
          <div>
            <p className="eyebrow">EXCLUSÃO DEFINITIVA</p>
            <h2 id="delete-patient-title" ref={titleRef} tabIndex={-1}>
              Excluir a conta de {patientName}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Fechar exclusão"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </div>
        <p>
          Isso apaga a conta e tudo o que a pessoa guardou aqui: registros
          privados e compartilhados, revisões, “Meu mapa” e avisos. Não é
          possível desfazer nem restaurar o acesso depois. Se o acompanhamento
          puder ser retomado, mantenha a conta apenas com o acesso revogado.
        </p>
        <label className="delete-patient-confirmation">
          <input name="understood" type="checkbox" required />
          <span>Entendo que a exclusão é definitiva.</span>
        </label>
        <label className="field">
          <span>Sua senha profissional</span>
          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="field">
          <span>Código atual do autenticador</span>
          <input
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={12}
            required
          />
          <small>
            Se acabou de entrar, aguarde o número exibido mudar e use o próximo
            código de 6 dígitos.
          </small>
        </label>
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="danger-button" disabled={busy}>
            {busy ? "Excluindo…" : "Excluir definitivamente"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
