import { PatientEducation } from "./PatientEducation";
import { PatientToolsShell } from "./PatientToolsShell";

export type PatientResourceView = "index" | "tools" | "readings";

type PatientResourcesProps = {
  view: PatientResourceView;
  guideUrl: string;
  careUrl: string;
  selectedEducationSlug: string | null;
  selectedToolId: string | null;
  onViewChange: (view: PatientResourceView, mode?: "push" | "replace" | "return") => void;
  onArticleChange: (slug: string | null, mode?: "push" | "replace" | "return") => void;
  onToolChange: (toolId: string | null, mode?: "push" | "replace" | "return") => void;
  onCreateRecordFromReading: (slug: string) => void;
  onCreateRecordFromTool: (toolId: string) => void;
};

export function PatientResources({
  view,
  guideUrl,
  careUrl,
  selectedEducationSlug,
  selectedToolId,
  onViewChange,
  onArticleChange,
  onToolChange,
  onCreateRecordFromReading,
  onCreateRecordFromTool,
}: PatientResourcesProps) {
  if (view === "tools") {
    return (
      <PatientToolsShell
        selectedToolId={selectedToolId}
        onToolChange={onToolChange}
        onCreateRecord={onCreateRecordFromTool}
        onBack={() => onViewChange("index", "return")}
      />
    );
  }

  if (view === "readings") {
    return (
      <div className="patient-resource-readings">
        {!selectedEducationSlug ? (
          <button
            className="back-button patient-resource-back"
            type="button"
            onClick={() => onViewChange("index", "return")}
          >
            <span aria-hidden="true">←</span> Voltar aos recursos
          </button>
        ) : null}
        <PatientEducation
          guideUrl={guideUrl}
          careUrl={careUrl}
          selectedSlug={selectedEducationSlug}
          onArticleChange={onArticleChange}
          onCreateRecord={onCreateRecordFromReading}
        />
      </div>
    );
  }

  return (
    <section className="patient-module patient-resources" aria-labelledby="patient-resources-title">
      <header className="patient-module-header">
        <p className="eyebrow">PARA CONSULTAR QUANDO PRECISAR</p>
        <h1 id="patient-resources-title" tabIndex={-1}>Recursos</h1>
        <p className="patient-module-lead">
          Escolha entre uma orientação prática para o momento ou um texto para
          entender melhor um tema.
        </p>
        <p className="patient-module-privacy">
          <span aria-hidden="true" />
          Abrir um recurso não cria histórico nem informa Mateus.
        </p>
      </header>

      <div className="patient-resource-paths">
        <article className="patient-resource-card practical">
          <p className="eyebrow">PRECISO DE ALGO PRÁTICO AGORA</p>
          <h2>Ferramentas do dia a dia</h2>
          <p>
            Passos curtos para lidar com uma situação específica. Você pode
            adaptar ou parar a qualquer momento.
          </p>
          <small>Abrir uma ferramenta não salva atividade.</small>
          <button className="secondary-button" type="button" onClick={() => onViewChange("tools")}>
            <span>Ver ferramentas</span><span aria-hidden="true">→</span>
          </button>
        </article>

        <article className="patient-resource-card reading">
          <p className="eyebrow">QUERO ENTENDER MELHOR UM TEMA</p>
          <h2>Leitura complementar</h2>
          <p>
            Textos para entender um tema com mais contexto. Ler ou buscar
            não salva nenhuma atividade.
          </p>
          <small>Nada é compartilhado por abrir uma leitura.</small>
          <button className="secondary-button" type="button" onClick={() => onViewChange("readings")}>
            <span>Ver leituras</span><span aria-hidden="true">→</span>
          </button>
        </article>
      </div>

      <aside className="patient-guide-resource" aria-labelledby="patient-guide-resource-title">
        <div>
          <p className="eyebrow">RECURSO PÚBLICO</p>
          <h2 id="patient-guide-resource-title">Guia de Emoções</h2>
          <p>
            Ajuda a encontrar palavras aproximadas para o que você está sentindo.
            Funciona sem conta e separado da Área do paciente.
          </p>
        </div>
        <a className="secondary-button" href={guideUrl} target="_blank" rel="noopener noreferrer">
          Abrir o Guia de Emoções <span className="external-link-note">(nova aba)</span>
        </a>
      </aside>
    </section>
  );
}
