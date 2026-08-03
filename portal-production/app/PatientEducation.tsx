"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  educationArticles,
  educationCategories,
  findEducationArticle,
  educationReferences,
  type EducationArticle,
  type EducationCategory,
  type EducationContentBlock,
  type EducationReference,
} from "./education-content";
import {
  educationReadingMinutes,
  filterEducationArticles,
  type EducationCategoryFilter,
} from "./education-search";

type PatientEducationProps = {
  guideUrl: string;
  careUrl: string;
  selectedSlug: string | null;
  onArticleChange: (slug: string | null) => void;
  onCreateRecord: (slug: string) => void;
};

const educationCategoryDescriptions: Record<EducationCategory, string> = {
  "Como a mente funciona":
    "Conceitos para perceber relações entre situações, pensamentos, emoções e ações.",
  "Dificuldades do dia a dia":
    "Temas comuns da rotina que podem ser observados e retomados na sessão.",
  "Condições e transtornos":
    "Introduções cuidadosas para organizar dúvidas, sem funcionar como autodiagnóstico.",
};

function ArticleReferences({ article }: { article: EducationArticle }) {
  return (
    <details className="education-references">
      <summary>
        <span>Fontes consultadas</span>
        <span className="education-disclosure-arrow" aria-hidden="true">▾</span>
      </summary>
      <ul>
        {article.references.map((referenceId) => {
          const reference: EducationReference =
            educationReferences[referenceId];
          if (!reference.patientFacing) return null;
          return (
            <li key={referenceId}>
              <strong>{reference.institution}.</strong>{" "}
              <cite>{reference.title}</cite>
              {reference.year ? ` ${reference.year}.` : "."}
              {reference.documentCode ? ` ${reference.documentCode}.` : ""}
              {reference.patientNote ? (
                <span className="education-reference-note">
                  {" "}
                  {reference.patientNote}
                </span>
              ) : null}
              {"url" in reference && reference.url ? (
                <>
                  {" "}
                  <a
                    className="education-reference-link"
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>
                      Abrir fonte <span className="external-link-note">(nova aba)</span>
                    </span>
                    <span className="education-reference-arrow" aria-hidden="true">↗</span>
                  </a>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function InlineEducationText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/gu).map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function EducationBlocks({ blocks }: { blocks: EducationContentBlock[] }) {
  return blocks.map((block, blockIndex) => {
    const key = `${block.kind}-${blockIndex}`;
    if (block.kind === "paragraph") {
      return (
        <p key={key}>
          <InlineEducationText text={block.text} />
        </p>
      );
    }
    if (block.kind === "quote") {
      return (
        <blockquote key={key}>
          <InlineEducationText text={block.text} />
        </blockquote>
      );
    }
    if (block.kind === "steps") {
      return (
        <ol key={key}>
          {block.items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>
              <InlineEducationText text={item} />
            </li>
          ))}
        </ol>
      );
    }
    return (
      <ul key={key}>
        {block.items.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`}>
            <InlineEducationText text={item} />
          </li>
        ))}
      </ul>
    );
  });
}

function EducationArticleView({
  article,
  guideUrl,
  careUrl,
  onBack,
  onOpenRelated,
  onCreateRecord,
}: {
  article: EducationArticle;
  guideUrl: string;
  careUrl: string;
  onBack: () => void;
  onOpenRelated: (slug: string) => void;
  onCreateRecord: () => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      articleRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      titleRef.current?.focus({ preventScroll: true });
      root.style.scrollBehavior = previousScrollBehavior;
    });
  }, [article.slug]);

  return (
    <article ref={articleRef} className="education-article" aria-labelledby="education-article-title">
      <button className="back-button" type="button" onClick={onBack}>
        ← Voltar à Leitura complementar
      </button>

      <header className="education-article-header">
        <p className="eyebrow">{article.category}</p>
        <h1 id="education-article-title" ref={titleRef} tabIndex={-1}>
          {article.title}
        </h1>
        <p className="education-article-summary">{article.summary}</p>
        <p className="education-reading-time">
          Leitura de cerca de {educationReadingMinutes(article)} minutos
        </p>
      </header>

      <div className="education-article-body">
        {article.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <EducationBlocks blocks={section.blocks} />
          </section>
        ))}

        {article.safety !== undefined ? (
          <aside className="education-safety" aria-labelledby="education-safety-title">
            <h2 id="education-safety-title">Ajuda imediata</h2>
            {article.safety ? <p>{article.safety}</p> : null}
            <a href={careUrl}>Cuidados e ajuda imediata</a>
          </aside>
        ) : null}

        <section className="education-observe">
          <p className="eyebrow">PARA OBSERVAR DURANTE A SEMANA</p>
          <h2>Leve somente o que fizer sentido</h2>
          <EducationBlocks blocks={article.observe} />
        </section>

        {article.relatedSlugs?.length ? (
          <nav className="education-related" aria-label="Temas relacionados">
            <h2>Leia também</h2>
            <ul>
              {article.relatedSlugs.slice(0, 3).map((slug) => {
                const relatedArticle = findEducationArticle(slug);
                if (!relatedArticle) return null;
                return (
                  <li key={relatedArticle.slug}>
                    <button
                      type="button"
                      onClick={() => onOpenRelated(relatedArticle.slug)}
                    >
                      <span>{relatedArticle.title}</span>
                      <span className="education-related-arrow" aria-hidden="true">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        {article.guideLink ? (
          <aside className="education-guide-link" aria-label="Recurso relacionado">
            <p>
              Se estiver difícil nomear a emoção, o Guia pode ajudar nessa etapa.
              Ele funciona separado da Área do paciente.
            </p>
            <a
              className="secondary-button"
              href={guideUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir o Guia de Emoções
              <span className="external-link-note"> (nova aba)</span>
            </a>
          </aside>
        ) : null}

        <div className="education-record-cta">
          <div>
            <p className="eyebrow">SE QUISER ESCREVER</p>
            <h2>Guarde uma reflexão no seu espaço</h2>
            <p>
              O formulário abrirá vazio e o registro continuará privado ao salvar.
            </p>
          </div>
          <button className="primary-button" type="button" onClick={onCreateRecord}>
            Criar um registro sobre isso
          </button>
        </div>

        <ArticleReferences article={article} />

        <p className="education-diagnostic-note">
          Reconhecer características não basta para confirmar um diagnóstico.
          Leve suas dúvidas para a sessão ou para uma avaliação adequada.
        </p>
      </div>
    </article>
  );
}

export function PatientEducation({
  guideUrl,
  careUrl,
  selectedSlug,
  onArticleChange,
  onCreateRecord,
}: PatientEducationProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] =
    useState<EducationCategoryFilter>("all");
  const libraryTitleRef = useRef<HTMLHeadingElement>(null);
  const restoreArticleSlug = useRef<string | null>(null);
  const selectedArticle = findEducationArticle(selectedSlug);
  const visibleArticles = useMemo(
    () => filterEducationArticles(educationArticles, query, category),
    [category, query],
  );
  const hasActiveFilters = Boolean(query.trim()) || category !== "all";
  const groupedArticles = useMemo(
    () =>
      educationCategories
        .map((groupCategory) => ({
          category: groupCategory,
          articles: visibleArticles.filter(
            (article) => article.category === groupCategory,
          ),
        }))
        .filter((group) => group.articles.length > 0),
    [visibleArticles],
  );

  useEffect(() => {
    if (selectedArticle || !restoreArticleSlug.current) return;
    const articleSlug = restoreArticleSlug.current;
    restoreArticleSlug.current = null;
    window.requestAnimationFrame(() => {
      const trigger = document.getElementById(`education-read-${articleSlug}`);
      const target =
        trigger instanceof HTMLButtonElement ? trigger : libraryTitleRef.current;
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      target?.scrollIntoView({ block: "center", behavior: "auto" });
      target?.focus({ preventScroll: true });
      root.style.scrollBehavior = previousScrollBehavior;
    });
  }, [selectedArticle]);

  if (selectedArticle) {
    return (
      <EducationArticleView
        article={selectedArticle}
        guideUrl={guideUrl}
        careUrl={careUrl}
        onBack={() => {
          restoreArticleSlug.current = selectedArticle.slug;
          onArticleChange(null);
        }}
        onOpenRelated={onArticleChange}
        onCreateRecord={() => onCreateRecord(selectedArticle.slug)}
      />
    );
  }

  const categoryOptions: Array<{
    value: EducationCategoryFilter;
    label: string;
  }> = [
    { value: "all", label: "Todos os temas" },
    ...educationCategories.map((item) => ({ value: item, label: item })),
  ];

  return (
    <section className="education-library" aria-labelledby="education-title">
      <header className="education-library-header">
        <p className="eyebrow">PARA LER NO SEU TEMPO</p>
        <h1 id="education-title" ref={libraryTitleRef} tabIndex={-1}>
          Leitura complementar
        </h1>
        <p className="education-library-intro">
          Textos breves sobre questões que podem aparecer dentro e fora da
          terapia. Eles ajudam a organizar dúvidas, reconhecer padrões e
          encontrar assuntos que você queira retomar na sessão. Não servem para
          confirmar diagnósticos nem substituem uma avaliação.
        </p>
        <p className="education-privacy-note">
          <span aria-hidden="true" />
          Você pode apenas ler. Nada é salvo ou compartilhado por abrir uma
          leitura.
        </p>
      </header>

      <div className="education-tools">
        <label className="field education-search">
          <span>Buscar na Leitura complementar</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            placeholder="Ex.: ansiedade, sono ou pensamentos"
          />
        </label>

        <div
          className="education-category-filters"
          role="group"
          aria-label="Filtrar leituras por tema"
        >
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={category === option.value ? "active" : ""}
              aria-pressed={category === option.value}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="education-results-status" aria-live="polite" aria-atomic="true">
        {visibleArticles.length}{" "}
        {visibleArticles.length === 1 ? "leitura encontrada" : "leituras encontradas"}
      </p>

      {hasActiveFilters && visibleArticles.length > 0 ? (
        <div className="filter-reset-row education-filter-reset-row">
          <button
            className="filter-reset-button"
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Limpar busca e filtros
          </button>
        </div>
      ) : null}

      {visibleArticles.length === 0 ? (
        <div className="empty-state education-empty-state">
          <h2>Nenhuma leitura encontrada.</h2>
          <p>Tente outra palavra ou veja todos os temas.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Limpar busca e filtros
          </button>
        </div>
      ) : (
        <div className="education-groups">
          {groupedArticles.map((group, groupIndex) => (
            <section
              className="education-group"
              key={group.category}
              aria-labelledby={`education-group-${groupIndex}`}
            >
              <header className="education-group-header">
                <div>
                  <h2 id={`education-group-${groupIndex}`}>
                    {group.category}
                  </h2>
                  <p>{educationCategoryDescriptions[group.category]}</p>
                </div>
                <span>
                  {group.articles.length}{" "}
                  {group.articles.length === 1 ? "texto" : "textos"}
                </span>
              </header>

              <div className="education-card-list">
                {group.articles.map((article) => (
                  <article className="education-card" key={article.slug}>
                    <div className="education-card-meta">
                      <span>{article.category}</span>
                      <small>
                        {educationReadingMinutes(article)} min de leitura
                      </small>
                    </div>
                    <h3>{article.title}</h3>
                    <p>{article.summary}</p>
                    <button
                      id={`education-read-${article.slug}`}
                      className="secondary-button"
                      type="button"
                      aria-label={`Ler: ${article.title}`}
                      onClick={() => onArticleChange(article.slug)}
                    >
                      <span>Ler texto</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
