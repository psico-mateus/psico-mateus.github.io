"use client";

import {
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { PortalRequestError, portalRequest } from "./portal-client";
import {
  type ThoughtReview,
  type ThoughtReviewDraft,
} from "./thought-review";

const EMPTY_THOUGHT_REVIEW: ThoughtReviewDraft = {
  source_thought: "",
  supporting_context: "",
  missing_context: "",
  alternative_view: "",
  current_view: "",
};

const THOUGHT_REVIEW_QUESTIONS: Array<{
  field: Exclude<keyof ThoughtReviewDraft, "source_thought">;
  label: string;
  help: string;
}> = [
  {
    field: "supporting_context",
    label: "O que faz esse pensamento parecer verdadeiro?",
    help: "O que aconteceu que faz essa interpretação parecer possível?",
  },
  {
    field: "missing_context",
    label: "O que ele pode não estar considerando?",
    help: "Existe alguma informação que não combina completamente com essa interpretação?",
  },
  {
    field: "alternative_view",
    label: "Existe outra forma possível de compreender?",
    help: "Uma alternativa não precisa ser otimista. Ela só precisa considerar melhor as informações disponíveis.",
  },
  {
    field: "current_view",
    label: "Como isso fica agora?",
    help: "O pensamento continua igual, mudou um pouco ou ficou mais incerto? O que você sente agora, se algo mudou?",
  },
];

function draftFromReview(review: ThoughtReview | null): ThoughtReviewDraft {
  if (!review) return { ...EMPTY_THOUGHT_REVIEW };
  return {
    source_thought: review.source_thought,
    supporting_context: review.supporting_context,
    missing_context: review.missing_context,
    alternative_view: review.alternative_view,
    current_view: review.current_view,
  };
}

function sameDraft(
  first: ThoughtReviewDraft,
  second: ThoughtReviewDraft,
): boolean {
  return (Object.keys(first) as Array<keyof ThoughtReviewDraft>).every(
    (field) => first[field] === second[field],
  );
}

function restoreFocus(target: HTMLButtonElement | null) {
  window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
}

type ThoughtReviewFeedback = {
  tone: "success" | "error";
  text: string;
};

export type ThoughtReviewEditorSnapshot = {
  draft: ThoughtReviewDraft;
  baselineDraft: ThoughtReviewDraft;
  sourceChosen: boolean;
  step: number;
  baseRevision: number;
  conflictReview: { review: ThoughtReview | null } | null;
  backupDraft: ThoughtReviewDraft | null;
  feedback: ThoughtReviewFeedback | null;
};

function thoughtReviewFromConflict(error: unknown): ThoughtReview | null | undefined {
  if (
    !(error instanceof PortalRequestError) ||
    error.status !== 409 ||
    error.payload.code !== "entry_thought_review_conflict"
  ) {
    return undefined;
  }
  const candidate = Object.prototype.hasOwnProperty.call(
    error.payload,
    "current_review",
  )
    ? error.payload.current_review
    : error.payload.thought_review;
  if (candidate === null) return null;
  if (
    typeof candidate !== "object" ||
    !candidate ||
    typeof (candidate as Record<string, unknown>).source_thought !== "string" ||
    typeof (candidate as Record<string, unknown>).revision !== "number"
  ) {
    return undefined;
  }
  return candidate as ThoughtReview;
}

export function ThoughtReviewEditor({
  entryId,
  thoughts,
  review,
  shared,
  csrf,
  onSaved,
  onDeleted,
  recovery,
  onSnapshotChange,
}: {
  entryId: string;
  thoughts: string;
  review: ThoughtReview | null;
  shared: boolean;
  csrf: string;
  onSaved: (review: ThoughtReview, updatedAt: string) => void;
  onDeleted: (updatedAt: string) => void;
  recovery: ThoughtReviewEditorSnapshot | null;
  onSnapshotChange: (
    entryId: string,
    snapshot: ThoughtReviewEditorSnapshot | null,
  ) => void;
}) {
  const [open, setOpen] = useState(Boolean(recovery));
  const [sourceChosen, setSourceChosen] = useState(
    recovery?.sourceChosen ?? Boolean(review),
  );
  const [step, setStep] = useState(() =>
    Math.max(
      0,
      Math.min(recovery?.step ?? 0, THOUGHT_REVIEW_QUESTIONS.length - 1),
    ),
  );
  const [draft, setDraft] = useState<ThoughtReviewDraft>(() =>
    recovery?.draft ?? draftFromReview(review),
  );
  const [baselineDraft, setBaselineDraft] = useState<ThoughtReviewDraft>(() =>
    recovery?.baselineDraft ?? draftFromReview(review),
  );
  const [baseRevision, setBaseRevision] = useState(
    recovery?.baseRevision ?? review?.revision ?? 0,
  );
  const [conflictReview, setConflictReview] = useState<
    { review: ThoughtReview | null } | null
  >(recovery?.conflictReview ?? null);
  const [backupDraft, setBackupDraft] = useState<ThoughtReviewDraft | null>(
    recovery?.backupDraft ?? null,
  );
  const [busy, setBusy] = useState<"saving" | "deleting" | null>(null);
  const [feedback, setFeedback] = useState<ThoughtReviewFeedback | null>(
    recovery?.feedback ?? null,
  );
  const launchRef = useRef<HTMLButtonElement>(null);
  const editorTitleRef = useRef<HTMLHeadingElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const requestInFlight = useRef(false);
  const sourceHelpId = useId();
  const questionHelpId = useId();
  const questionSkipId = useId();
  const dirty = Boolean(backupDraft) || (sourceChosen && !sameDraft(draft, baselineDraft));
  const question = THOUGHT_REVIEW_QUESTIONS[step];

  useEffect(() => {
    onSnapshotChange(
      entryId,
      dirty
        ? {
            draft,
            baselineDraft,
            sourceChosen,
            step,
            baseRevision,
            conflictReview,
            backupDraft,
            feedback,
          }
        : null,
    );
  }, [
    backupDraft,
    baseRevision,
    baselineDraft,
    conflictReview,
    dirty,
    draft,
    entryId,
    feedback,
    onSnapshotChange,
    sourceChosen,
    step,
  ]);

  function focusEditor() {
    window.requestAnimationFrame(() => {
      editorTitleRef.current?.focus({ preventScroll: true });
      editorTitleRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
  }

  function focusQuestion() {
    window.requestAnimationFrame(() => questionRef.current?.focus());
  }

  function openReview() {
    const latestDraft = draftFromReview(review);
    setDraft(latestDraft);
    setBaselineDraft(latestDraft);
    setBaseRevision(review?.revision ?? 0);
    setSourceChosen(Boolean(review));
    setStep(0);
    setConflictReview(null);
    setBackupDraft(null);
    setFeedback(null);
    setOpen(true);
    focusEditor();
  }

  function closeReview() {
    if (dirty && !window.confirm("Fechar sem salvar as mudanças desta revisão?")) {
      return;
    }
    const latestDraft = draftFromReview(review);
    setDraft(latestDraft);
    setBaselineDraft(latestDraft);
    setBaseRevision(review?.revision ?? 0);
    setSourceChosen(Boolean(review));
    setConflictReview(null);
    setBackupDraft(null);
    setOpen(false);
    setFeedback(null);
    restoreFocus(launchRef.current);
  }

  function chooseSourceThought() {
    setDraft((current) => ({ ...current, source_thought: thoughts }));
    setSourceChosen(true);
    setFeedback(null);
    setConflictReview(null);
    focusQuestion();
  }

  function update(
    field: keyof ThoughtReviewDraft,
    value: string,
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (feedback?.tone === "error") setFeedback(null);
  }

  function move(nextStep: number) {
    setStep(nextStep);
    setFeedback(null);
    focusQuestion();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    if (!draft.source_thought.trim()) {
      setFeedback({
        tone: "error",
        text: "Escolha ou escreva o pensamento que deseja rever. O restante pode ficar em branco.",
      });
      window.requestAnimationFrame(() => sourceRef.current?.focus());
      return;
    }
    requestInFlight.current = true;
    setBusy("saving");
    setFeedback(null);
    try {
      const result = await portalRequest<{
        thought_review: ThoughtReview;
        updated_at: string;
      }>(
        `/entries/${encodeURIComponent(entryId)}/thought-review`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...draft,
            expected_revision: baseRevision,
          }),
        },
        csrf,
      );
      onSaved(result.thought_review, result.updated_at);
      const savedDraft = draftFromReview(result.thought_review);
      setDraft(savedDraft);
      setBaselineDraft(savedDraft);
      setBaseRevision(result.thought_review.revision);
      setConflictReview(null);
      setBackupDraft(null);
      setOpen(false);
      setFeedback({
        tone: "success",
        text: "Revisão salva junto deste registro.",
      });
      restoreFocus(launchRef.current);
    } catch (error) {
      const currentReview = thoughtReviewFromConflict(error);
      if (currentReview !== undefined) {
        setConflictReview({ review: currentReview });
        setFeedback({
          tone: "error",
          text: "Esta revisão mudou em outro dispositivo. Seu texto continua nesta tela.",
        });
        return;
      }
      setFeedback({
        tone: "error",
        text: "Não foi possível salvar a revisão agora. O que você escreveu continua nesta tela.",
      });
      window.requestAnimationFrame(() => questionRef.current?.focus());
    } finally {
      requestInFlight.current = false;
      setBusy(null);
    }
  }

  async function removeReview() {
    if (baseRevision <= 0 || requestInFlight.current) return;
    if (
      !window.confirm(
        "Excluir somente esta revisão? O registro original e o pensamento escrito nele serão mantidos.",
      )
    ) {
      return;
    }
    requestInFlight.current = true;
    setBusy("deleting");
    setFeedback(null);
    try {
      const result = await portalRequest<{ updated_at: string }>(
        `/entries/${encodeURIComponent(entryId)}/thought-review`,
        {
          method: "DELETE",
          body: JSON.stringify({ expected_revision: baseRevision }),
        },
        csrf,
      );
      onDeleted(result.updated_at);
      setDraft({ ...EMPTY_THOUGHT_REVIEW });
      setBaselineDraft({ ...EMPTY_THOUGHT_REVIEW });
      setBaseRevision(0);
      setConflictReview(null);
      setBackupDraft(null);
      setSourceChosen(false);
      setOpen(false);
      setFeedback({
        tone: "success",
        text: "Revisão excluída. O registro original foi mantido.",
      });
      restoreFocus(launchRef.current);
    } catch (error) {
      const currentReview = thoughtReviewFromConflict(error);
      if (currentReview !== undefined) {
        setConflictReview({ review: currentReview });
        setFeedback({
          tone: "error",
          text: "Esta revisão mudou em outro dispositivo. Nada foi excluído e seu texto continua nesta tela.",
        });
        return;
      }
      setFeedback({
        tone: "error",
        text: "Não foi possível excluir a revisão agora. Nenhum conteúdo foi alterado.",
      });
    } finally {
      requestInFlight.current = false;
      setBusy(null);
    }
  }

  function keepDraftAfterConflict() {
    const current = conflictReview?.review ?? null;
    setBaselineDraft(draftFromReview(current));
    setBaseRevision(current?.revision ?? 0);
    setConflictReview(null);
    setFeedback({
      tone: "success",
      text: "Seu texto foi mantido. Revise e salve novamente quando estiver pronto.",
    });
    focusQuestion();
  }

  function loadCurrentReview() {
    if (!conflictReview) return;
    setBackupDraft({ ...draft });
    const current = conflictReview.review;
    const currentDraft = draftFromReview(current);
    setDraft(currentDraft);
    setBaselineDraft(currentDraft);
    setBaseRevision(current?.revision ?? 0);
    setSourceChosen(Boolean(current));
    setConflictReview(null);
    setFeedback({
      tone: "success",
      text: "Versão mais recente carregada. Seu texto anterior continua disponível para recuperar.",
    });
    focusEditor();
  }

  function restoreBackupDraft() {
    if (!backupDraft) return;
    setDraft(backupDraft);
    setSourceChosen(Boolean(backupDraft.source_thought.trim()));
    setBackupDraft(null);
    setFeedback({
      tone: "success",
      text: "Seu texto anterior foi recuperado. Revise e salve novamente quando estiver pronto.",
    });
    focusQuestion();
  }

  return (
    <section className={`thought-review${open ? " is-open" : ""}`}>
      <div className="thought-review-intro">
        <div>
          <p className="eyebrow">CONTINUAÇÃO OPCIONAL</p>
          <h3>Rever um pensamento</h3>
          <p>
            Olhe com mais calma para uma interpretação, sem precisar trocar por
            um pensamento positivo.
          </p>
        </div>
        <button
          ref={launchRef}
          className="secondary-button thought-review-launch"
          type="button"
          aria-expanded={open}
          aria-controls={`thought-review-editor-${entryId}`}
          disabled={Boolean(busy)}
          onClick={open ? closeReview : openReview}
        >
          {open
            ? "Fechar revisão"
            : review
              ? "Continuar revisão"
              : "Rever um pensamento"}
        </button>
      </div>

      {feedback ? (
        <p
          className={`thought-review-feedback ${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.text}
        </p>
      ) : null}

      {open ? (
        <div
          className="thought-review-editor"
          id={`thought-review-editor-${entryId}`}
          aria-busy={Boolean(busy)}
        >
          <div className="thought-review-heading">
            <h4 ref={editorTitleRef} tabIndex={-1}>
              {review ? "Continue sua revisão" : "Escolha o pensamento"}
            </h4>
            <p>
              Esta parte pode ajudar a verificar se existem outras formas
              possíveis de compreender a situação.
            </p>
          </div>

          {conflictReview ? (
            <div className="thought-review-conflict" role="group" aria-label="Escolher como continuar após uma alteração em outro dispositivo">
              <strong>
                {conflictReview.review
                  ? "Existe uma versão mais recente desta revisão."
                  : "Esta revisão foi excluída em outro dispositivo."}
              </strong>
              <p>
                Você pode manter o texto que está nesta tela ou carregar a versão
                mais recente. Nenhuma opção altera o registro original.
              </p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={keepDraftAfterConflict}
                >
                  Manter meu texto
                </button>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={loadCurrentReview}
                >
                  Carregar versão mais recente
                </button>
              </div>
            </div>
          ) : null}

          {backupDraft ? (
            <button
              className="thought-review-restore-backup"
              type="button"
              onClick={restoreBackupDraft}
            >
              Recuperar o texto que estava nesta tela
            </button>
          ) : null}

          {!sourceChosen ? (
            <div className="thought-review-source-choice">
              <span>Pensamento escrito neste registro</span>
              <blockquote>{thoughts}</blockquote>
              <p>Nada será copiado até você confirmar.</p>
              <button
                className="primary-button"
                type="button"
                onClick={chooseSourceThought}
              >
                Usar este texto
              </button>
            </div>
          ) : (
            <form className="thought-review-form" onSubmit={save}>
              <label className="field thought-review-source-field">
                <span>Pensamento que quero rever</span>
                <textarea
                  ref={sourceRef}
                  value={draft.source_thought}
                  maxLength={1500}
                  rows={3}
                  disabled={Boolean(busy)}
                  aria-describedby={sourceHelpId}
                  onChange={(event) => update("source_thought", event.target.value)}
                />
                <small id={sourceHelpId}>Você pode ajustar o texto sem alterar o registro original.</small>
              </label>

              <div className="thought-review-question" key={question.field}>
                <label className="field">
                  <span>{question.label}</span>
                  <small id={questionHelpId}>{question.help}</small>
                  <textarea
                    ref={questionRef}
                    value={draft[question.field]}
                    maxLength={1500}
                    rows={5}
                    disabled={Boolean(busy)}
                    aria-describedby={`${questionHelpId} ${questionSkipId}`}
                    onChange={(event) => update(question.field, event.target.value)}
                  />
                  <small id={questionSkipId}>Se não quiser responder agora, pode continuar em branco.</small>
                </label>
              </div>

              <p className={`thought-review-privacy ${shared ? "shared" : "private"}`}>
                {shared
                  ? "Este registro está compartilhado com Mateus. Ele poderá ver também o que você salvar nesta parte."
                  : "A revisão segue a mesma privacidade do registro. Nada é compartilhado automaticamente."}
              </p>

              <div className="thought-review-actions">
                <div>
                  {step > 0 ? (
                    <button
                      className="quiet-button"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => move(step - 1)}
                    >
                      ← Pergunta anterior
                    </button>
                  ) : null}
                  {baseRevision > 0 ? (
                    <button
                      className="danger-link"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void removeReview()}
                    >
                      {busy === "deleting" ? "Excluindo revisão…" : "Excluir somente a revisão"}
                    </button>
                  ) : null}
                </div>
                {step < THOUGHT_REVIEW_QUESTIONS.length - 1 ? (
                  <div className="thought-review-next-actions">
                    <button
                      className="quiet-button"
                      type="submit"
                      disabled={Boolean(busy)}
                    >
                      {busy === "saving" ? "Salvando revisão…" : "Salvar por enquanto"}
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => move(step + 1)}
                    >
                      {draft[question.field].trim()
                        ? "Próxima pergunta"
                        : "Pular por enquanto"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={Boolean(busy)}
                  >
                    {busy === "saving" ? "Salvando revisão…" : "Salvar revisão"}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ThoughtReviewReadOnly({ review }: { review: ThoughtReview }) {
  const headingId = useId();
  const answers = [
    ["Pensamento escolhido", review.source_thought],
    ["O que faz esse pensamento parecer verdadeiro?", review.supporting_context],
    ["O que ele pode não estar considerando?", review.missing_context],
    ["Existe outra forma possível de compreender?", review.alternative_view],
    ["Como isso fica agora?", review.current_view],
  ].filter((item): item is [string, string] => Boolean(item[1].trim()));

  return (
    <section className="thought-review-read-only" aria-labelledby={headingId}>
      <div className="thought-review-read-only-heading">
        <p className="eyebrow">CONTINUAÇÃO DO REGISTRO</p>
        <h4 id={headingId}>Revisão do pensamento</h4>
      </div>
      <div className="thought-review-answer-list">
        {answers.map(([label, value]) => (
          <div key={label}>
            <strong>{label}</strong>
            <p>{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
