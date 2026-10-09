"use client";

import { useState } from "react";
import { copyText } from "./copy-text";
import type { PatientEntryEditorRecovery } from "./patient-record-recovery";
import type { ThoughtReviewEditorSnapshot } from "./ThoughtReview";
import type { ThoughtReviewDraft } from "./thought-review";

const entryLabels = {
  title: "Título", happened: "O que aconteceu", body: "No corpo", thoughts: "Pensamentos",
  urge: "Vontade de agir", emotion: "Emoção", intensity: "Intensidade", message: "Levar para a próxima sessão",
};
const thoughtLabels: Record<keyof ThoughtReviewDraft, string> = {
  source_thought: "Pensamento escolhido",
  supporting_context: "O que faz esse pensamento parecer verdadeiro?",
  missing_context: "O que ele pode não estar considerando?",
  alternative_view: "Existe outra forma possível de compreender?",
  current_view: "Como isso fica agora?",
};

function thoughtText(draft: ThoughtReviewDraft) {
  return (Object.keys(thoughtLabels) as Array<keyof ThoughtReviewDraft>)
    .filter(key => draft[key])
    .map(key => `${thoughtLabels[key]}\n${draft[key]}`).join("\n\n");
}

export function PatientRecoveredDrafts({ entry, thoughtReviews, onRecoverEntryAsNew, onDiscardEntry, onDiscardThoughtReviews }: {
  entry: { kind: "changed" | "missing"; editor: PatientEntryEditorRecovery } | null;
  thoughtReviews: Array<{ entryId: string; snapshot: ThoughtReviewEditorSnapshot }>;
  onRecoverEntryAsNew: () => void;
  onDiscardEntry: () => void;
  onDiscardThoughtReviews: () => void;
}) {
  const [copyFeedback, setCopyFeedback] = useState<{ error: boolean; text: string } | null>(null);
  if (!entry && thoughtReviews.length === 0) return null;
  async function copyThoughts() {
    const text = thoughtReviews.map(({ snapshot }, index) => [
      `Revisão não salva ${index + 1}`,
      thoughtText(snapshot.draft),
      snapshot.backupDraft ? `Texto anterior preservado\n${thoughtText(snapshot.backupDraft)}` : "",
    ].filter(Boolean).join("\n\n")).join("\n\n—\n\n");
    try {
      await copyText(text);
      setCopyFeedback({ error: false, text: "Texto copiado. Guarde somente em um local seguro." });
    } catch {
      setCopyFeedback({ error: true, text: "Não foi possível copiar automaticamente. Abra o texto abaixo para copiar manualmente." });
    }
  }
  return (
    <section className="panel patient-recovered-drafts" aria-labelledby="patient-recovered-drafts-title">
      <h2 id="patient-recovered-drafts-title">Texto não salvo recuperado</h2>
      <p>Este texto está só nesta aba. Nada foi salvo ou compartilhado novamente.</p>
      {entry ? (
        <div>
          <p>{entry.kind === "changed"
            ? "O registro que você estava editando mudou enquanto sua sessão estava encerrada. Seu rascunho não substituiu a versão da conta."
            : "O registro que você estava editando não está mais disponível. Ele não será recriado automaticamente."}</p>
          <details>
            <summary>Ver o texto do rascunho</summary>
            <div className="entry-details">
              {(Object.keys(entryLabels) as Array<keyof typeof entryLabels>).map(key => (
                entry.editor.draft[key] !== "" ? <div key={key}><strong>{entryLabels[key]}</strong><p>{entry.editor.draft[key]}</p></div> : null
              ))}
            </div>
          </details>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onRecoverEntryAsNew}>Usar em um novo registro privado</button>
            <button className="quiet-button" type="button" onClick={onDiscardEntry}>Descartar este rascunho</button>
          </div>
        </div>
      ) : null}
      {thoughtReviews.length > 0 ? (
        <div>
          <p>{thoughtReviews.length === 1 ? "Uma revisão não salva pertence" : `${thoughtReviews.length} revisões não salvas pertencem`} a {thoughtReviews.length === 1 ? "um registro indisponível" : "registros indisponíveis"}. Você pode copiar o texto, mas ele não será enviado ao registro antigo.</p>
          <details>
            <summary>Ver as revisões recuperadas</summary>
            <div className="entry-details">
              {thoughtReviews.map(({ entryId, snapshot }, index) => <div key={entryId}><strong>Revisão não salva {index + 1}</strong><p>{thoughtText(snapshot.draft)}</p>{snapshot.backupDraft ? <><strong>Texto anterior preservado</strong><p>{thoughtText(snapshot.backupDraft)}</p></> : null}</div>)}
            </div>
          </details>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => void copyThoughts()}>Copiar texto das revisões</button>
            <button className="quiet-button" type="button" onClick={onDiscardThoughtReviews}>Descartar essas revisões</button>
          </div>
          {copyFeedback ? <p role={copyFeedback.error ? "alert" : "status"}>{copyFeedback.text}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
