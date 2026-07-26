import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  educationArticleAliases,
  educationArticles,
  educationCategories,
  educationReferenceReview,
  educationReferences,
  findEducationArticle,
} from "../app/education-content.ts";
import {
  educationReadingMinutes,
  filterEducationArticles,
  normalizeEducationSearch,
} from "../app/education-search.ts";

test("education catalog has 30 complete and uniquely identified articles", () => {
  assert.equal(educationArticles.length, 30);
  assert.equal(new Set(educationArticles.map((article) => article.slug)).size, 30);
  assert.deepEqual(educationCategories, [
    "Como a mente funciona",
    "Dificuldades do dia a dia",
    "Condições e transtornos",
  ]);
  assert.deepEqual(
    educationCategories.map(
      (category) =>
        educationArticles.filter((article) => article.category === category).length,
    ),
    [4, 11, 15],
  );

  for (const article of educationArticles) {
    assert.match(article.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(article.title.length > 2);
    assert.ok(article.summary.length > 20);
    assert.ok(educationCategories.includes(article.category));
    assert.ok(article.keywords.length > 0);
    assert.ok(article.sections.length > 0);
    assert.ok(article.observe.length > 0);
    assert.ok(article.references.length > 0);
    assert.ok(educationReadingMinutes(article) >= 2);
    assert.ok((article.relatedSlugs?.length ?? 0) <= 3);
    for (const relatedSlug of article.relatedSlugs ?? []) {
      assert.notEqual(relatedSlug, article.slug);
      assert.ok(findEducationArticle(relatedSlug));
    }
    for (const section of article.sections) {
      assert.ok(section.heading.length > 2);
      assert.ok(section.blocks.length > 0);
    }
    for (const block of [
      ...article.sections.flatMap((section) => section.blocks),
      ...article.observe,
    ]) {
      assert.ok(["paragraph", "quote", "bullets", "steps"].includes(block.kind));
      if ("text" in block) assert.ok(block.text.length > 0);
      else assert.ok(block.items.length > 0);
    }
    for (const referenceId of article.references) {
      assert.ok(educationReferences[referenceId], `${referenceId} precisa existir`);
    }
  }
});

test("education references have complete, typed and HTTPS metadata", () => {
  const allowedKinds = new Set([
    "book",
    "journal-article",
    "classification",
    "clinical-guideline",
    "brazilian-pcdt",
    "professional-regulation",
    "law",
    "public-health-guidance",
  ]);

  for (const [id, reference] of Object.entries(educationReferences)) {
    assert.equal(reference.id, id);
    assert.ok(reference.institution.length > 2);
    assert.ok(reference.title.length > 3);
    assert.ok(["international", "brazil"].includes(reference.jurisdiction));
    assert.ok(allowedKinds.has(reference.kind));
    assert.equal(typeof reference.patientFacing, "boolean");
    assert.match(reference.lastVerified, /^\d{4}-\d{2}-\d{2}$/u);
    if ("url" in reference && reference.url) {
      assert.equal(new URL(reference.url).protocol, "https:");
    }
  }

  assert.equal(educationReferenceReview.lastVerified, "2026-07-26");
  assert.equal(
    educationReferenceReview.autismGuide2026.status,
    "public-consultation-only",
  );
});

test("education preserves the final reviewed clinical material", () => {
  const allBlocks = educationArticles.flatMap((article) => [
    ...article.sections.flatMap((section) => section.blocks),
    ...article.observe,
  ]);
  const allText = educationArticles
    .flatMap((article) => [
      article.title,
      article.summary,
      ...article.sections.flatMap((section) => [
        section.heading,
        ...section.blocks.flatMap((block) =>
          "text" in block ? [block.text] : block.items,
        ),
      ]),
      ...article.observe.flatMap((block) =>
        "text" in block ? [block.text] : block.items,
      ),
    ])
    .join("\n");

  assert.equal(
    educationArticles.reduce(
      (total, article) => total + article.sections.length,
      0,
    ),
    108,
  );
  assert.equal(allBlocks.length, 394);
  assert.equal(allBlocks.filter((block) => block.kind === "quote").length, 11);
  assert.equal(allBlocks.filter((block) => block.kind === "steps").length, 2);
  assert.equal(
    educationArticles[0].summary,
    "Uma mesma situação pode ser interpretada de maneiras diferentes e gerar reações diferentes no corpo, nas emoções e nas ações.",
  );
  assert.match(allText, /Autismo não é uma doença a ser curada/u);
  assert.match(
    allText,
    /Não use o portal como sistema de vigilância de:/u,
  );
  assert.match(
    allText,
    /Este conteúdo não orienta redução, dose ou interrupção específica\./u,
  );
  assert.match(
    allText,
    /Compreender a função de um comportamento não significa concordar com ele nem retirar a responsabilidade pelas consequências\./u,
  );
  assert.deepEqual(
    educationArticles.filter((article) => article.guideLink).map(
      (article) => article.slug,
    ),
    ["regulacao-emocional"],
  );
});

test("Brazilian references point to the reviewed official documents", () => {
  const expectedBrazilianUrls = {
    BR_MS_PCDT: "https://www.gov.br/saude/pt-br/assuntos/pcdt/pcdt",
    BR_PCDT_TDAH:
      "https://www.gov.br/saude/pt-br/assuntos/pcdt/t/transtorno-do-deficit-de-atencao-com-hiperatividade-tdah/view",
    BR_PCDT_BIPOLAR_I:
      "https://www.gov.br/saude/pt-br/assuntos/pcdt/t/transtorno-afetivo-bipolar-do-tipo-i/view",
    BR_PCDT_ESQUIZOFRENIA:
      "https://www.gov.br/saude/pt-br/assuntos/pcdt/e/esquizofrenia/view",
    BR_DIRETRIZ_TEA:
      "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-pessoa-com-deficiencia/publicacoes/diretrizes-de-atencao-a-reabilitacao-da-pessoa-com-transtornos-do-espectro-do-autismo.pdf/@@download/file",
    BR_MS_AUTISMO:
      "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/autismo",
    BR_MS_SAMU_192:
      "https://www.gov.br/saude/pt-br/composicao/saes/samu-192",
    BR_MS_CAPS:
      "https://www.gov.br/saude/pt-br/composicao/saes/desmad/raps/caps",
    BR_MS_CVV_188:
      "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/suicidio-prevencao",
    BR_CFP_RES_9_2024:
      "https://atosoficiais.com.br/lei/orientacao-psicologica-pela-internet-cfp",
    BR_CFP_RES_7_2025:
      "https://atosoficiais.com.br/cfp/resolucao-do-exercicio-profissional-n-7-2025-estabelece-normas-para-o-exercicio-profissional-da-psicologa-e-do-psicologo-no-atendimento-as-pessoas-com-deficiencia-e-no-enfrentamento-do-capacitismo",
    BR_LGPD:
      "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm",
  };

  for (const [id, url] of Object.entries(expectedBrazilianUrls)) {
    assert.equal(educationReferences[id]?.url, url);
    assert.equal(educationReferences[id]?.jurisdiction, "brazil");
  }
});

test("article references follow the reviewed clinical mapping", () => {
  const expected = {
    "emocoes-pensamentos-comportamentos": [
      "BECK2020",
      "WHO_MENTAL_HEALTH_2025",
    ],
    "pensamentos-automaticos": ["BECK2020"],
    "distorcoes-cognitivas": ["BECK2020"],
    "crencas-e-padroes": ["BECK2020"],
    "evitacao-e-alivio-imediato": ["BECK2020", "NICE_CG113", "NICE_CG159"],
    "preocupacao-e-ruminacao": ["BECK2020", "NICE_NG222", "NICE_CG113"],
    "regulacao-emocional": ["BECK2020", "WHO_MENTAL_HEALTH_2025"],
    "procrastinacao-e-dificuldade-para-comecar": [
      "BECK2020",
      "NICE_NG87",
      "BR_PCDT_TDAH",
    ],
    "comunicacao-assertiva-e-limites": ["BECK2020"],
    "ativacao-comportamental-rotina-e-energia": ["BECK2020", "NICE_NG222"],
    "sono-e-saude-mental": [
      "WHO_MENTAL_HEALTH_2025",
      "NICE_NG222",
      "NICE_CG185",
    ],
    "raiva-impulsividade-e-perda-de-controle": [
      "BECK2020",
      "WHO_MENTAL_DISORDERS_2025",
    ],
    "estresse-sobrecarga-e-burnout": [
      "WHO_BURNOUT",
      "WHO_MENTAL_HEALTH_AT_WORK",
      "WHO_MENTAL_HEALTH_2025",
    ],
    "autocritica-perfeccionismo-e-autoestima": [
      "BECK2020",
      "SHAFRAN2002",
      "EGAN2014",
    ],
    "luto-perdas-e-mudancas-importantes": [
      "CID11_CDDR",
      "WHO_MENTAL_HEALTH_2025",
    ],
    "ansiedade-generalizada-e-preocupacao-excessiva": [
      "CID11_CDDR",
      "WHO_ANXIETY_DISORDERS",
      "NICE_CG113",
    ],
    panico: ["CID11_CDDR", "NICE_CG113", "NIMH_TOPICS"],
    "ansiedade-social": ["CID11_CDDR", "NICE_CG159", "NIMH_TOPICS"],
    depressao: [
      "CID11_CDDR",
      "NICE_NG222",
      "WHO_MENTAL_DISORDERS_2025",
      "NIMH_TOPICS",
    ],
    "tdah-na-vida-adulta": [
      "CID11_CDDR",
      "NICE_NG87",
      "BR_PCDT_TDAH",
      "NIMH_TOPICS",
    ],
    "autismo-na-vida-adulta": [
      "CID11_CDDR",
      "NICE_CG142",
      "BR_DIRETRIZ_TEA",
      "BR_MS_AUTISMO",
      "NIMH_TOPICS",
    ],
    toc: ["CID11_CDDR", "NICE_CG31", "NIMH_TOPICS"],
    "transtorno-bipolar": [
      "CID11_CDDR",
      "NICE_CG185",
      "BR_PCDT_BIPOLAR_I",
      "NIMH_TOPICS",
    ],
    "trauma-e-tept": ["CID11_CDDR", "NICE_NG116", "NIMH_TOPICS"],
    "dissociacao-despersonalizacao-e-desrealizacao": [
      "CID11_CDDR",
      "NICE_NG116",
    ],
    "fobias-especificas-e-agorafobia": [
      "CID11_CDDR",
      "WHO_ANXIETY_DISORDERS",
      "NICE_CG113",
    ],
    "transtornos-alimentares": ["CID11_CDDR", "NICE_NG69", "NIMH_EATING"],
    "uso-problematico-de-substancias": [
      "CID11_CDDR",
      "NIMH_SUBSTANCE",
      "WHO_MENTAL_DISORDERS_2025",
    ],
    "psicose-e-esquizofrenia": [
      "CID11_CDDR",
      "NICE_CG178",
      "BR_PCDT_ESQUIZOFRENIA",
      "NIMH_TOPICS",
    ],
    "transtorno-personalidade-borderline": [
      "CID11_CDDR",
      "NIMH_BORDERLINE",
      "WHO_MENTAL_DISORDERS_2025",
    ],
  };

  assert.equal(Object.keys(expected).length, educationArticles.length);
  for (const article of educationArticles) {
    assert.deepEqual(article.references, expected[article.slug]);
  }
});

test("legacy article links resolve to the current canonical article", () => {
  assert.deepEqual(educationArticleAliases, {
    "transtornos-de-ansiedade":
      "ansiedade-generalizada-e-preocupacao-excessiva",
  });
  assert.equal(
    findEducationArticle("transtornos-de-ansiedade")?.slug,
    "ansiedade-generalizada-e-preocupacao-excessiva",
  );
  assert.equal(
    educationArticles.some(
      (article) => article.slug === "transtornos-de-ansiedade",
    ),
    false,
  );
});

test("high-risk readings point to the dedicated immediate-help page", async () => {
  const education = await readFile(
    new URL("../app/PatientEducation.tsx", import.meta.url),
    "utf8",
  );
  const safetySlugs = educationArticles
    .filter((article) => article.safety !== undefined)
    .map((article) => article.slug);

  assert.deepEqual(safetySlugs, [
    "raiva-impulsividade-e-perda-de-controle",
    "depressao",
    "transtorno-bipolar",
    "transtornos-alimentares",
    "uso-problematico-de-substancias",
    "psicose-e-esquizofrenia",
    "transtorno-personalidade-borderline",
  ]);
  assert.match(education, /href=\{careUrl\}/);
  assert.match(education, /Cuidados e ajuda imediata/);
  assert.doesNotMatch(education, /education-safety"[^>]*role="alert"/);
});

test("technical and legal references never appear in clinical articles", () => {
  const technicalIds = Object.values(educationReferences)
    .filter((reference) => !reference.patientFacing)
    .map((reference) => reference.id);
  assert.deepEqual(
    new Set(technicalIds),
    new Set(["BR_MS_PCDT", "BR_CFP_RES_9_2024", "BR_CFP_RES_7_2025", "BR_LGPD"]),
  );

  for (const article of educationArticles) {
    for (const referenceId of article.references) {
      assert.equal(
        educationReferences[referenceId].patientFacing,
        true,
        `${referenceId} não deve aparecer automaticamente em ${article.slug}`,
      );
    }
  }
});

test("education copy does not become a score, diagnosis or medication instruction", () => {
  const copy = JSON.stringify(educationArticles);
  assert.doesNotMatch(copy, /se você marcou|isso significa que você tem|você é (?:TDAH|bipolar|autista)/iu);
  assert.doesNotMatch(copy, /pontuação|resultado do teste|dose de|mg\b/iu);
  assert.doesNotMatch(copy, /garantia de melhora|vai curar|cura garantida/iu);
  assert.doesNotMatch(
    copy,
    /\b(?:NHS|GP|insurance provider|counselor|911)\b/iu,
  );
  assert.doesNotMatch(
    copy,
    /\b(?:metilfenidato|lítio|clozapina|risperidona|olanzapina)\b/iu,
  );
  assert.match(
    copy,
    /Em risco imediato, procure um serviço de emergência da sua região ou ligue 192\./u,
  );
});

test("education search ignores accents and case and respects keywords and category", () => {
  assert.equal(normalizeEducationSearch("  REGULAÇÃO  "), "regulacao");
  assert.deepEqual(
    filterEducationArticles(educationArticles, "PANICO", "all").map(
      (article) => article.slug,
    ),
    ["panico"],
  );
  assert.ok(
    filterEducationArticles(educationArticles, "pensar demais", "all").some(
      (article) => article.slug === "preocupacao-e-ruminacao",
    ),
  );
  assert.deepEqual(
    filterEducationArticles(
      educationArticles,
      "ansiedade",
      "Como a mente funciona",
    ),
    [],
  );
  assert.deepEqual(
    filterEducationArticles(educationArticles, "termo inexistente", "all"),
    [],
  );
});

test("education search is pure and does not request the network", () => {
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    throw new Error("A busca não deveria acessar a rede.");
  };
  try {
    filterEducationArticles(educationArticles, "sono", "all");
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("education remains patient-only and isolated from API, database and storage", async () => {
  const [app, education, professional, route, schema] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PatientEducation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ProfessionalDashboard.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/portal/[...segments]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
  ]);
  const guest =
    app.match(/function Guest[\s\S]*?(?=\nfunction EntryForm)/u)?.[0] ?? "";
  const patient =
    app.match(/function PatientDashboard[\s\S]*?(?=\nfunction AccountPanel)/u)?.[0] ??
    "";

  assert.doesNotMatch(guest, /<PatientEducation/);
  assert.match(guest, /Leitura complementar/);
  assert.match(patient, /<PatientEducation/);
  assert.match(app, /user\.role === "patient" \? <PatientDashboard/);
  assert.doesNotMatch(professional, /PatientEducation|Leitura complementar/);
  assert.doesNotMatch(education, /fetch\(|portalRequest|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(route, /education|leitura_psicoeducacao|reading_history/iu);
  assert.doesNotMatch(schema, /education|leitura_psicoeducacao|reading_history/iu);
});

test("education CTA opens the existing blank and private record flow", async () => {
  const [app, education] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PatientEducation.tsx", import.meta.url), "utf8"),
  ]);
  const integration =
    app.match(
      /function createRecordFromEducation[\s\S]*?(?=\n  function cancelEntry)/u,
    )?.[0] ?? "";

  assert.match(education, /Criar um registro sobre isso/);
  assert.match(integration, /setEditing\("new"\)/);
  assert.doesNotMatch(integration, /portalRequest|title:|emotion:|shared/);
  assert.match(
    app,
    /O que chamou sua atenção neste texto\? Registre somente o que fizer sentido para você\./,
  );
  assert.match(app, /initial=\{editing === "new" \? undefined : editing\}/);
  assert.match(app, /Privado ao salvar/);
  assert.match(app, /setArea\("education"\)/);
});

test("education uses Leitura complementar consistently", async () => {
  const [app, education] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PatientEducation.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, />\s*Leitura complementar\s*</);
  assert.match(app, /área “Leitura complementar”/);
  assert.match(education, />\s*Leitura complementar\s*</);
  assert.match(education, /Voltar à Leitura complementar/);
  assert.doesNotMatch(
    `${app}\n${education}`,
    /Entender melhor|Leituras de apoio|Temas para a terapia/,
  );
});

test("education keeps the Guide URL configurable and external sources safe", async () => {
  const [app, education] = await Promise.all([
    readFile(new URL("../app/PortalApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PatientEducation.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /guideUrl=\{config\.guide_url\}/);
  assert.match(education, /href=\{guideUrl\}/);
  assert.match(education, /target="_blank"/);
  assert.match(education, /rel="noopener noreferrer"/);
  assert.match(education, /education-disclosure-arrow/);
  assert.match(education, /education-reference-arrow/);
  assert.match(education, /education-related-arrow/);
  assert.match(education, /Ler texto/);
  assert.doesNotMatch(education, /localStorage|sessionStorage/);
});

test("education mobile and focus rules preserve a usable 390px layout", async () => {
  const [education, styles] = await Promise.all([
    readFile(new URL("../app/PatientEducation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const mobileEducation =
    styles.match(
      /\/\* Biblioteca de psicoeducação[\s\S]*?@media\(max-width:560px\)\{[\s\S]*?(?=\n@media\(prefers-reduced-motion:reduce\))/u,
    )?.[0] ?? "";

  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.education-card-list\{grid-template-columns:1fr\}/u);
  assert.match(mobileEducation, /\.education-category-filters\{display:grid\}/);
  assert.match(mobileEducation, /\.education-group-header\{align-items:flex-start;flex-direction:column/);
  assert.match(mobileEducation, /\.education-card \.secondary-button\{width:100%\}/);
  assert.match(mobileEducation, /\.education-record-cta\{padding:1\.2rem\}/);
  assert.match(education, /educationCategoryDescriptions/);
  assert.match(education, /className="education-groups"/);
  assert.match(education, /className="education-group"/);
  assert.match(education, /aria-labelledby=\{`education-group-\$\{groupIndex\}`\}/);
  assert.match(education, /restoreArticleSlug/);
  assert.match(education, /education-read-\$\{articleSlug\}/);
  assert.match(education, /trigger\.focus\(\)/);
  assert.match(education, /aria-pressed=\{category === option\.value\}/);
  assert.match(education, /aria-live="polite"/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.education-card:hover,.education-card:focus-within/);
  assert.match(
    styles,
    /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.education-card\{transition:none\}/u,
  );
  assert.doesNotMatch(education, /lastVerified/);
});
