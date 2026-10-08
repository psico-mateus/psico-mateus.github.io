import type { ReactNode } from "react";

type PatientHomeActionsProps = {
  hasDraft: boolean;
  onRecord: () => void;
  onHistory: () => void;
  onMap: () => void;
  onResources: () => void;
};

function ActionIcon({ children }: { children: ReactNode }) {
  return <svg className="patient-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export function PatientQuickRecordAction({ hasDraft, onRecord }: Pick<PatientHomeActionsProps, "hasDraft" | "onRecord">) {
  return (
    <button className="patient-mobile-record primary-button" type="button" onClick={onRecord}>
      <span>{hasDraft ? "Continuar registro" : "Registrar algo"}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
    </button>
  );
}

export function PatientHomeActions({ hasDraft, onRecord, onHistory, onMap, onResources }: PatientHomeActionsProps) {
  const actions = [
    {
      label: hasDraft ? "Continuar registro" : "Registrar algo",
      description: hasDraft ? "Retome o que escreveu nesta sessão. Ainda não foi salvo na conta." : "Guardar uma situação, emoção ou dúvida.",
      onClick: onRecord,
      icon: <ActionIcon><path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M7 12h5M7 16h3M15 17l5-5 2 2-5 5-3 1z" /></ActionIcon>,
    },
    {
      label: "Ver meus registros",
      description: "Consultar seu histórico e os compartilhamentos.",
      onClick: onHistory,
      icon: <ActionIcon><path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M7 12h9M7 16h9" /></ActionIcon>,
    },
    {
      label: "Abrir Meu mapa",
      description: "Observar gostos, limites e possibilidades.",
      onClick: onMap,
      icon: <ActionIcon><path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3zM9 2v17M15 5v17" /></ActionIcon>,
    },
    {
      label: "Ver recursos",
      description: "Encontrar ferramentas e leituras complementares.",
      onClick: onResources,
      icon: <ActionIcon><path d="M12 4v17M12 4C8 1 3 3 2 3v17c4-1 7-1 10 1 3-2 6-2 10-1V3c-4-1-7-1-10 1Z" /></ActionIcon>,
    },
  ];

  return (
    <section className="patient-start" aria-labelledby="patient-start-title">
      <header><h2 id="patient-start-title">O que você quer fazer?</h2></header>
      <div className="patient-start-actions">
        {actions.map((action, index) => (
          <button key={index} className={`patient-start-card${index === 0 ? " primary" : ""}`} type="button" onClick={action.onClick}>
            {action.icon}
            <span className="patient-action-copy"><strong>{action.label}</strong><span>{action.description}</span></span>
            <svg className="patient-start-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        ))}
      </div>
    </section>
  );
}
