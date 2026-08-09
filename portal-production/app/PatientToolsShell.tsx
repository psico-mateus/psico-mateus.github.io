"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  filterPatientTools,
  findPatientTool,
  patientToolNeeds,
  type PatientTool,
  type PatientToolNeedId,
} from "../content/patient-tools-catalog";

type PatientToolsShellProps = {
  onBack: () => void;
  onCreateRecord?: (toolId: string) => void;
  selectedToolId: string | null;
  onToolChange: (
    toolId: string | null,
    mode?: "push" | "replace" | "return",
  ) => void;
};

type PatientToolFilter = PatientToolNeedId | "all";

function PatientToolDetail({
  tool,
  onBack,
  onCreateRecord,
}: {
  tool: PatientTool;
  onBack: () => void;
  onCreateRecord?: (toolId: string) => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      titleRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      titleRef.current?.focus({ preventScroll: true });
      root.style.scrollBehavior = previousScrollBehavior;
    });
  }, [tool.id]);

  return (
    <article className="patient-module patient-tool-detail" aria-labelledby="patient-tool-detail-title">
      <button className="back-button patient-tool-detail-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Voltar às ferramentas
      </button>

      <header className="patient-module-header patient-tool-detail-header">
        <p className="eyebrow">FERRAMENTA DO DIA A DIA</p>
        <h1 id="patient-tool-detail-title" ref={titleRef} tabIndex={-1}>{tool.title}</h1>
        <p className="patient-module-lead">{tool.summary}</p>
        <p className="patient-module-privacy">
          <span aria-hidden="true" />
          Abrir ou usar esta ferramenta não cria histórico nem informa Mateus.
        </p>
      </header>

      <dl className="patient-tool-meta">
        <div>
          <dt>Pode ajudar quando</dt>
          <dd>{tool.mayHelpWhen}</dd>
        </div>
        <div>
          <dt>Tempo aproximado</dt>
          <dd>{tool.duration}</dd>
        </div>
      </dl>

      <section className="patient-tool-section" aria-labelledby="patient-tool-steps-title">
        <h2 id="patient-tool-steps-title">Como fazer</h2>
        <ol className="patient-tool-steps">
          {tool.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="patient-tool-section patient-tool-adaptations" aria-labelledby="patient-tool-adaptations-title">
        <h2 id="patient-tool-adaptations-title">Adapte se precisar</h2>
        <ul>
          {tool.adaptations.map((adaptation) => <li key={adaptation}>{adaptation}</li>)}
        </ul>
      </section>

      <aside className="patient-tool-stop" aria-labelledby="patient-tool-stop-title">
        <h2 id="patient-tool-stop-title">Quando parar</h2>
        <p>{tool.stopWhen}</p>
      </aside>

      <aside className="patient-tool-safety" aria-labelledby="patient-tool-safety-title">
        <h2 id="patient-tool-safety-title">Importante</h2>
        <p>{tool.safetyNote}</p>
      </aside>

      {onCreateRecord ? (
        <section className="patient-tool-record-cta" aria-labelledby="patient-tool-record-title">
          <div>
            <p className="eyebrow">SE QUISER ESCREVER</p>
            <h2 id="patient-tool-record-title">Guarde o que percebeu</h2>
            <p>
              O registro abrirá vazio e continuará privado quando for salvo.
              Você decide depois se quer compartilhá-lo.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => onCreateRecord(tool.id)}
          >
            Criar registro sobre isso
          </button>
        </section>
      ) : null}
    </article>
  );
}

export function PatientToolsShell({
  onBack,
  onCreateRecord,
  selectedToolId,
  onToolChange,
}: PatientToolsShellProps) {
  const [filter, setFilter] = useState<PatientToolFilter>("all");
  const returnToolIdRef = useRef<string | null>(selectedToolId);
  const previousToolIdRef = useRef<string | null>(selectedToolId);
  const firstLibraryFocusRef = useRef(true);
  const selectedTool = findPatientTool(selectedToolId);
  const visibleTools = useMemo(() => filterPatientTools(filter), [filter]);

  useEffect(() => {
    const previousToolId = previousToolIdRef.current;
    previousToolIdRef.current = selectedToolId;
    if (selectedToolId) return;
    const shouldRestoreTool = Boolean(previousToolId);
    if (!shouldRestoreTool && !firstLibraryFocusRef.current) return;
    firstLibraryFocusRef.current = false;
    window.requestAnimationFrame(() => {
      const returnToolId = returnToolIdRef.current;
      const target = shouldRestoreTool && returnToolId
        ? document.getElementById(`patient-tool-card-${returnToolId}`)
        : document.getElementById("patient-tools-title");
      if (!target?.isConnected) {
        document.getElementById("patient-tools-title")?.focus();
        return;
      }
      target.scrollIntoView({ block: "center", behavior: "auto" });
      target.focus({ preventScroll: true });
    });
  }, [selectedToolId]);

  function openTool(toolId: string) {
    returnToolIdRef.current = toolId;
    onToolChange(toolId);
  }

  function closeTool() {
    onToolChange(null, "return");
  }

  if (selectedTool) {
    return (
      <PatientToolDetail
        tool={selectedTool}
        onBack={closeTool}
        onCreateRecord={onCreateRecord}
      />
    );
  }

  return (
    <section className="patient-module patient-tools-library" aria-labelledby="patient-tools-title">
      <button className="back-button" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Voltar aos recursos
      </button>

      <header className="patient-module-header">
        <p className="eyebrow">PARA UMA SITUAÇÃO ESPECÍFICA</p>
        <h1 id="patient-tools-title" tabIndex={-1}>Ferramentas do dia a dia</h1>
        <p className="patient-module-lead">
          Orientações curtas para momentos específicos. Você escolhe o que
          testar, adapta ao seu jeito e pode parar a qualquer momento.
        </p>
        <p className="patient-module-privacy">
          <span aria-hidden="true" />
          Abrir ou usar uma ferramenta não cria histórico nem informa Mateus.
        </p>
      </header>

      <section className="patient-tools-finder" aria-labelledby="patient-tools-finder-title">
        <div className="patient-tools-finder-heading">
          <h2 id="patient-tools-finder-title">O que seria útil agora?</h2>
          <p>Escolha uma situação aproximada ou veja todas as ferramentas.</p>
        </div>

        <div className="patient-tools-filters" role="group" aria-label="Filtrar ferramentas por situação">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Todas
          </button>
          {patientToolNeeds.map((need) => (
            <button
              key={need.id}
              type="button"
              className={filter === need.id ? "active" : ""}
              aria-pressed={filter === need.id}
              onClick={() => setFilter(need.id)}
            >
              {need.label}
            </button>
          ))}
        </div>
      </section>

      <p className="patient-tools-results-status" role="status" aria-live="polite" aria-atomic="true">
        {visibleTools.length} {visibleTools.length === 1 ? "ferramenta encontrada" : "ferramentas encontradas"}
      </p>

      <div className="patient-tools-list">
        {visibleTools.map((tool) => (
          <article className="patient-tool-card" key={tool.id}>
            <div className="patient-tool-card-meta">
              <span>{tool.duration}</span>
            </div>
            <h3>{tool.title}</h3>
            <p>{tool.summary}</p>
            <button
              id={`patient-tool-card-${tool.id}`}
              className="secondary-button"
              type="button"
              aria-label={`Abrir ferramenta: ${tool.title}`}
              onClick={() => openTool(tool.id)}
            >
              <span>Abrir ferramenta</span>
              <span aria-hidden="true">→</span>
            </button>
          </article>
        ))}
      </div>

      <aside className="patient-tools-general-safety" aria-labelledby="patient-tools-general-safety-title">
        <h2 id="patient-tools-general-safety-title">Antes de usar</h2>
        <p>
          Estas ferramentas não substituem atendimento e esta área não é
          acompanhada em tempo real. Pare se uma orientação aumentar o
          desconforto. Em risco imediato, procure um serviço de emergência da
          sua região ou ligue 192.
        </p>
      </aside>
    </section>
  );
}
