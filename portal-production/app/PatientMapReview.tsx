"use client";

import { useMemo } from "react";
import { PATIENT_MAP_CATALOG, PATIENT_MAP_RESPONSES, type PatientMapDefinition } from "../content/patient-map-catalog";
import { createPatientMapSummary } from "../lib/patient-map-summary";
import type { PatientMapSessionDraft } from "./PatientMapShell";

type PatientMapReviewProps = {
  draft: PatientMapSessionDraft;
  mapId: string;
  onMapChange: (mapId: string) => void;
  onOpenItem: (mapId: string, sectionIndex: number, itemIndex: number) => void;
  onExplore: () => void;
  onSynthesis: () => void;
};

export function PatientMapReview({
  draft, mapId, onMapChange, onOpenItem, onExplore, onSynthesis,
}: PatientMapReviewProps) {
  const summary = useMemo(
    () => createPatientMapSummary(draft.answers, mapId === "all" ? undefined : mapId),
    [draft.answers, mapId],
  );
  const maps: readonly PatientMapDefinition[] = PATIENT_MAP_CATALOG.maps.filter((map) => mapId === "all" || map.id === mapId);
  const maximum = Math.max(1, ...summary.rows.map((row) => row.count));
  const hasContent = summary.answeredItems + summary.noteOnlyItems > 0;
  const synthesisCount = PATIENT_MAP_CATALOG.summary.prompts.filter(
    (prompt) => Boolean(draft.synthesis?.[prompt.id]?.trim()),
  ).length;
  const firstSavedSectionId = maps.flatMap((map) => map.sections).find((section) =>
    section.items.some((item) => {
      const answer = draft.answers?.[item.id];
      return Boolean(answer?.response || answer?.note.trim());
    }),
  )?.id;

  return (
    <section className="patient-map-review" aria-labelledby="patient-map-summary-title">
      <header className="patient-map-review-heading">
        <h2 id="patient-map-summary-title" tabIndex={-1}>Minhas respostas</h2>
        <p>Veja o que você marcou ou escreveu. Você pode mudar suas respostas quando quiser.</p>
      </header>
      <div className="patient-map-review-filter">
        <label htmlFor="patient-map-review-theme-filter">Tema</label>
        <select id="patient-map-review-theme-filter" value={mapId} onChange={(event) => onMapChange(event.target.value)}>
          <option value="all">Todos os temas</option>
          {PATIENT_MAP_CATALOG.maps.map((map) => (
            <option key={map.id} value={map.id}>{map.navigationTitle}</option>
          ))}
        </select>
      </div>

      <div className="patient-map-review-grid">
        <figure className="patient-map-chart" aria-labelledby="patient-map-chart-title" aria-describedby="patient-map-chart-caption">
          <h3 id="patient-map-chart-title">Como você respondeu</h3>
          {summary.answeredItems > 0 ? (
            <>
              <p className="patient-map-chart-total">{summary.answeredItems} {summary.answeredItems === 1 ? "resposta marcada" : "respostas marcadas"}</p>
              <ul className="patient-map-chart-rows">
                {summary.rows.map((row) => (
                  <li key={row.key} data-response={row.key} data-count={row.count}>
                    <span className="patient-map-chart-label">{row.label}</span>
                    <div className="patient-map-chart-track" aria-hidden="true">
                      <span style={{ width: `${row.count / maximum * 100}%` }} />
                    </div>
                    <strong>{row.count}<span className="sr-status"> {row.count === 1 ? "item" : "itens"}</span></strong>
                  </li>
                ))}
              </ul>
              <p className="patient-map-chart-scale">Quantidade de itens · barras de 0 a {maximum}</p>
            </>
          ) : (
            <p className="patient-map-chart-empty">
              {summary.noteOnlyItems > 0
                ? "Você guardou observações, mas ainda não marcou opções. Elas aparecem abaixo."
                : "Quando você marcar uma opção, ela aparecerá aqui. Não é preciso responder tudo."}
            </p>
          )}
          <figcaption id="patient-map-chart-caption">
            As barras contam suas escolhas. Não são uma avaliação.
            {summary.noteOnlyItems > 0 ? (
              <span className="patient-map-chart-note-only">
                {summary.noteOnlyItems} {summary.noteOnlyItems === 1
                  ? "item tem só uma observação e não entra nas barras."
                  : "itens têm só observações e não entram nas barras."}
              </span>
            ) : null}
          </figcaption>
        </figure>
        <aside className="patient-map-review-reflection" aria-labelledby="patient-map-review-reflection-title">
          <h3 id="patient-map-review-reflection-title">O que percebi</h3>
          <p>Reúna o que chamou sua atenção, se quiser.</p>
          <button id="patient-map-view-synthesis" className="secondary-button" type="button" onClick={onSynthesis}>Abrir minhas anotações</button>
          <small>{synthesisCount > 0 ? `${synthesisCount} ${synthesisCount === 1 ? "anotação privada" : "anotações privadas"}` : "Opcional e privado"}</small>
        </aside>
      </div>

      <section className="patient-map-review-answers patient-map-section-summary" aria-labelledby="patient-map-section-summary-title">
        <h3 id="patient-map-section-summary-title">Minhas respostas guardadas</h3>
        {hasContent ? (
          <>
            <p className="patient-map-summary-hint">Abra um assunto para reler suas respostas e observações.</p>
            {maps.map((map) => {
              const sections = map.sections.map((section, sectionIndex) => ({
                section, sectionIndex,
                items: section.items.map((item, itemIndex) => ({ item, itemIndex, answer: draft.answers?.[item.id] }))
                  .filter(({ answer }) => Boolean(answer?.response || answer?.note.trim())),
              })).filter(({ items }) => items.length > 0);
              if (sections.length === 0) return null;
              return (
                <section className="patient-map-review-theme" key={map.id} aria-labelledby={`patient-map-review-theme-${map.id}`}>
                  <h4 id={`patient-map-review-theme-${map.id}`}>{map.navigationTitle}</h4>
                  <ul>
                    {sections.map(({ section, sectionIndex, items }) => {
                      const initiallyOpen = section.id === firstSavedSectionId;
                      return (
                        <li key={section.id}>
                          <details className="patient-map-answer-group" open={initiallyOpen}>
                            <summary>
                              <span><strong>{section.title.charAt(0) + section.title.slice(1).toLocaleLowerCase("pt-BR")}</strong><small>{items.length} {items.length === 1 ? "item guardado" : "itens guardados"}</small></span>
                              <svg className="patient-map-disclosure-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </summary>
                            <div className="patient-map-saved-answers">
                              {items.map(({ item, itemIndex, answer }) => {
                                const response = PATIENT_MAP_RESPONSES.find((option) => option.key === answer!.response);
                                return (
                                  <article key={item.id}>
                                    <div>
                                      <h5>{item.title}</h5>
                                      <p className="patient-map-saved-response">{response ? response.label : "Só observação · sem opção marcada"}</p>
                                      {answer!.note ? <p className="patient-map-saved-note">{answer!.note}</p> : null}
                                    </div>
                                    <button type="button" aria-label={`Editar resposta de ${item.title}`} onClick={() => onOpenItem(map.id, sectionIndex, itemIndex)}>Editar resposta</button>
                                  </article>
                                );
                              })}
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </>
        ) : (
          <div className="patient-map-review-empty">
            <p>Ainda não há respostas ou observações {mapId === "all" ? "guardadas no seu mapa" : "neste tema"}.</p>
            <button className="primary-button" type="button" onClick={onExplore}>Explorar os temas</button>
          </div>
        )}
      </section>
      <details className="patient-map-reading-guide">
        <summary>Como ler estas respostas sem transformar em teste</summary>
        <p>{PATIENT_MAP_CATALOG.summary.readingGuide.replace(/^COMO LER SEM TRANSFORMAR EM TESTE\s*/u, "")}</p>
      </details>
    </section>
  );
}
