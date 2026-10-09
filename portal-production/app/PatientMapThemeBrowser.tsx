"use client";

import { useState } from "react";
import {
  PATIENT_MAP_RESPONSES,
  type PatientMapDefinition,
} from "../content/patient-map-catalog";
import type { PatientMapSessionDraft } from "./PatientMapShell";

type PatientMapThemeBrowserProps = {
  map: PatientMapDefinition;
  draft: PatientMapSessionDraft;
  onBack: () => void;
  onContinue: () => void;
  onOpenItem: (sectionIndex: number, itemIndex: number) => void;
  onReview: () => void;
  onSharing: () => void;
};

function sentenceCase(value: string): string {
  const lower = value.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

function MapChevron({ direction = "right" }: { direction?: "left" | "right" | "down" }) {
  const path = direction === "left"
    ? "m15 5-7 7 7 7"
    : direction === "down"
      ? "m6 9 6 6 6-6"
      : "m9 5 7 7-7 7";
  return (
    <svg
      className="patient-map-chevron"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

export function PatientMapThemeBrowser({
  map,
  draft,
  onBack,
  onContinue,
  onOpenItem,
  onReview,
  onSharing,
}: PatientMapThemeBrowserProps) {
  const savedPosition = draft.positions?.[map.id];
  const rememberedSectionIndex = Math.min(
    Math.max(savedPosition?.sectionIndex ?? 0, 0),
    map.sections.length - 1,
  );
  const rememberedSection = map.sections[rememberedSectionIndex];
  const rememberedItemIndex = Math.min(
    Math.max(savedPosition?.itemIndex ?? 0, 0),
    rememberedSection.items.length - 1,
  );
  const rememberedItem = rememberedSection.items[rememberedItemIndex];
  const hasContent = map.sections.some((section) => section.items.some((item) => {
    const answer = draft.answers?.[item.id];
    return Boolean(answer?.response || answer?.note.trim());
  }));
  const canResume = hasContent || Boolean(savedPosition);
  const [expandedGroups, setExpandedGroups] = useState(() => ({
    mapId: map.id,
    indexes: [rememberedSectionIndex],
  }));
  const openSectionIndexes = expandedGroups.mapId === map.id
    ? expandedGroups.indexes
    : [rememberedSectionIndex];

  return (
    <section
      className="patient-module patient-map-theme patient-map-topic-browser"
      aria-labelledby="patient-map-theme-title"
    >
      <button className="back-button" type="button" onClick={onBack}>
        <MapChevron direction="left" />
        Voltar aos temas
      </button>

      <header className="patient-module-header patient-map-theme-header">
        <h1 id="patient-map-theme-title" tabIndex={-1}>{map.navigationTitle}</h1>
        <p className="patient-module-lead">{map.description}</p>
      </header>

      {canResume ? (
        <section className="patient-map-resume" aria-labelledby="patient-map-resume-title">
          <div>
            <h2 id="patient-map-resume-title">Continuar no seu ritmo</h2>
            <p>{rememberedItem.title}</p>
            <small>{sentenceCase(rememberedSection.title)}</small>
          </div>
          <button
            id="patient-map-theme-continue"
            className="primary-button"
            type="button"
            onClick={onContinue}
          >
            Continuar de onde parei
          </button>
        </section>
      ) : null}

      <section className="patient-map-topics" aria-labelledby="patient-map-topics-title">
        <div className="patient-map-topics-heading">
          <h2 id="patient-map-topics-title">Escolha o que quer explorar</h2>
          <p>Não precisa seguir a ordem. Abra um assunto e escolha um item.</p>
        </div>

        <div className="patient-map-topic-groups">
          {map.sections.map((section, sectionIndex) => {
            const markedCount = section.items.filter((item) => {
              const answer = draft.answers?.[item.id];
              return Boolean(answer?.response || answer?.note.trim());
            }).length;
            return (
              <details
                className="patient-map-topic-group"
                key={section.id}
                open={openSectionIndexes.includes(sectionIndex)}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setExpandedGroups((current) => {
                    const indexes = current.mapId === map.id
                      ? current.indexes
                      : [rememberedSectionIndex];
                    if (indexes.includes(sectionIndex) === isOpen && current.mapId === map.id) {
                      return current;
                    }
                    return {
                      mapId: map.id,
                      indexes: isOpen
                        ? indexes.includes(sectionIndex) ? indexes : [...indexes, sectionIndex]
                        : indexes.filter((index) => index !== sectionIndex),
                    };
                  });
                }}
              >
                <summary>
                  <span className="patient-map-topic-heading">
                    <strong>{sentenceCase(section.title)}</strong>
                    <small>
                      {markedCount > 0
                        ? `${markedCount} ${markedCount === 1 ? "item guardado" : "itens guardados"}`
                        : openSectionIndexes.includes(sectionIndex) ? "Recolher assunto" : "Abrir assunto"}
                    </small>
                  </span>
                  <MapChevron direction="down" />
                </summary>
                <div className="patient-map-topic-content">
                  <p className="patient-map-topic-question">{section.question}</p>
                  <ul className="patient-map-topic-items">
                    {section.items.map((item, itemIndex) => {
                      const answer = draft.answers?.[item.id];
                      const response = PATIENT_MAP_RESPONSES.find((option) => option.key === answer?.response);
                      const status = response?.label || (answer?.note.trim() ? "Só observação" : "Responder");
                      return (
                        <li key={item.id}>
                          <button
                            id={`patient-map-pick-${item.id}`}
                            className={`patient-map-topic-item${response || answer?.note.trim() ? " has-answer" : ""}`}
                            type="button"
                            aria-label={`${item.title} — ${status}`}
                            onClick={() => onOpenItem(sectionIndex, itemIndex)}
                          >
                            <span>
                              <strong>{item.title}</strong>
                              <small>{status}</small>
                            </span>
                            <MapChevron />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <div className="patient-map-topic-actions">
        <button className="secondary-button" type="button" onClick={onReview}>
          Ver minhas respostas neste tema
        </button>
        <button className="quiet-button" type="button" onClick={onSharing}>
          Gerenciar o que Mateus vê
        </button>
      </div>
    </section>
  );
}
