import type {
  EducationArticle,
  EducationCategory,
} from "./education-content";

export type EducationCategoryFilter = "all" | EducationCategory;

export function normalizeEducationSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function filterEducationArticles(
  articles: EducationArticle[],
  query: string,
  category: EducationCategoryFilter,
): EducationArticle[] {
  const normalizedQuery = normalizeEducationSearch(query);

  return articles.filter((article) => {
    if (category !== "all" && article.category !== category) return false;
    if (!normalizedQuery) return true;

    const searchable = normalizeEducationSearch(
      [article.title, article.summary, ...article.keywords].join(" "),
    );
    return searchable.includes(normalizedQuery);
  });
}

export function educationReadingMinutes(article: EducationArticle): number {
  const blockText = (
    block: EducationArticle["observe"][number],
  ): string[] =>
    "text" in block ? [block.text] : block.items;

  const words = [
    article.title,
    article.summary,
    ...article.sections.flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap(blockText),
    ]),
    ...article.observe.flatMap(blockText),
  ]
    .join(" ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;

  return Math.max(2, Math.ceil(words / 200));
}
