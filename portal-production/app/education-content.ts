export const educationCategories = [
  "Como a mente funciona",
  "Dificuldades do dia a dia",
  "Condições e transtornos",
] as const;

export type EducationCategory = (typeof educationCategories)[number];

export type EducationReferenceKind =
  | "book"
  | "journal-article"
  | "classification"
  | "clinical-guideline"
  | "brazilian-pcdt"
  | "professional-regulation"
  | "law"
  | "public-health-guidance";

export type EducationReference = {
  id: string;
  institution: string;
  title: string;
  year?: number;
  url?: string;
  jurisdiction: "international" | "brazil";
  kind: EducationReferenceKind;
  patientFacing: boolean;
  lastVerified: string;
  documentCode?: string;
  note?: string;
  patientNote?: string;
};

export const educationReferenceReview = {
  lastVerified: "2026-07-26",
  autismGuide2026: {
    status: "public-consultation-only",
    note:
      "A consulta pública foi encerrada, mas a versão final revisada não foi localizada no portal oficial. Mantida a diretriz oficialmente disponível, com a página atual do Ministério da Saúde como complemento.",
  },
} as const;

const lastVerified = educationReferenceReview.lastVerified;

export const educationReferences = {
  BECK2020: {
    id: "BECK2020",
    institution: "Judith S. Beck",
    title: "Cognitive Behavior Therapy: Basics and Beyond",
    year: 2020,
    jurisdiction: "international",
    kind: "book",
    patientFacing: true,
    lastVerified,
    note: "3ª edição. Guilford Press.",
  },
  WHO_MENTAL_DISORDERS_2025: {
    id: "WHO_MENTAL_DISORDERS_2025",
    institution: "World Health Organization",
    title: "Mental disorders",
    year: 2025,
    url: "https://www.who.int/news-room/fact-sheets/detail/mental-disorders",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  WHO_MENTAL_HEALTH_2025: {
    id: "WHO_MENTAL_HEALTH_2025",
    institution: "World Health Organization",
    title: "Mental health: strengthening our response",
    year: 2025,
    url: "https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  WHO_ANXIETY_DISORDERS: {
    id: "WHO_ANXIETY_DISORDERS",
    institution: "World Health Organization",
    title: "Anxiety disorders",
    year: 2025,
    url: "https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  WHO_BURNOUT: {
    id: "WHO_BURNOUT",
    institution: "World Health Organization",
    title: "Burn-out an occupational phenomenon",
    url: "https://www.who.int/standards/classifications/frequently-asked-questions/burn-out-an-occupational-phenomenon",
    jurisdiction: "international",
    kind: "classification",
    patientFacing: true,
    lastVerified,
    note: "Referência da CID-11.",
  },
  WHO_MENTAL_HEALTH_AT_WORK: {
    id: "WHO_MENTAL_HEALTH_AT_WORK",
    institution: "World Health Organization",
    title: "Mental health at work",
    year: 2024,
    url: "https://www.who.int/news-room/fact-sheets/detail/mental-health-at-work",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  CID11_CDDR: {
    id: "CID11_CDDR",
    institution: "World Health Organization",
    title:
      "Clinical descriptions and diagnostic requirements for ICD-11 mental, behavioural and neurodevelopmental disorders",
    year: 2024,
    url: "https://www.who.int/publications/b/68103",
    jurisdiction: "international",
    kind: "classification",
    patientFacing: true,
    lastVerified,
    note:
      "Manual clínico complementar à CID-11, usado para conferir nomenclatura e descrições gerais, não como instrumento de autodiagnóstico.",
  },
  NIMH_TOPICS: {
    id: "NIMH_TOPICS",
    institution: "National Institute of Mental Health",
    title: "Health Topics",
    url: "https://www.nimh.nih.gov/health/topics",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  NICE_CG113: {
    id: "NICE_CG113",
    institution: "National Institute for Health and Care Excellence",
    title: "Generalised anxiety disorder and panic disorder in adults: management",
    url: "https://www.nice.org.uk/guidance/cg113",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "CG113",
  },
  NICE_CG159: {
    id: "NICE_CG159",
    institution: "National Institute for Health and Care Excellence",
    title: "Social anxiety disorder: recognition, assessment and treatment",
    url: "https://www.nice.org.uk/guidance/cg159",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "CG159",
  },
  NICE_NG222: {
    id: "NICE_NG222",
    institution: "National Institute for Health and Care Excellence",
    title: "Depression in adults: treatment and management",
    url: "https://www.nice.org.uk/guidance/ng222",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "NG222",
  },
  NICE_NG87: {
    id: "NICE_NG87",
    institution: "National Institute for Health and Care Excellence",
    title: "Attention deficit hyperactivity disorder: diagnosis and management",
    url: "https://www.nice.org.uk/guidance/ng87",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "NG87",
  },
  NICE_CG142: {
    id: "NICE_CG142",
    institution: "National Institute for Health and Care Excellence",
    title: "Autism spectrum disorder in adults: diagnosis and management",
    url: "https://www.nice.org.uk/guidance/cg142",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "CG142",
  },
  NICE_CG31: {
    id: "NICE_CG31",
    institution: "National Institute for Health and Care Excellence",
    title: "Obsessive-compulsive disorder and body dysmorphic disorder: treatment",
    url: "https://www.nice.org.uk/guidance/cg31",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "CG31",
  },
  NICE_CG185: {
    id: "NICE_CG185",
    institution: "National Institute for Health and Care Excellence",
    title: "Bipolar disorder: assessment and management",
    url: "https://www.nice.org.uk/guidance/cg185",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "CG185",
  },
  NICE_NG116: {
    id: "NICE_NG116",
    institution: "National Institute for Health and Care Excellence",
    title: "Post-traumatic stress disorder",
    url: "https://www.nice.org.uk/guidance/ng116",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "NG116",
  },
  NICE_NG225: {
    id: "NICE_NG225",
    institution: "National Institute for Health and Care Excellence",
    title: "Self-harm: assessment, management and preventing recurrence",
    url: "https://www.nice.org.uk/guidance/ng225",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "NG225",
  },
  NICE_NG69: {
    id: "NICE_NG69",
    institution: "National Institute for Health and Care Excellence",
    title: "Eating disorders: recognition and treatment",
    url: "https://www.nice.org.uk/guidance/ng69",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "NG69",
  },
  NICE_CG178: {
    id: "NICE_CG178",
    institution: "National Institute for Health and Care Excellence",
    title: "Psychosis and schizophrenia in adults: prevention and management",
    url: "https://www.nice.org.uk/guidance/cg178",
    jurisdiction: "international",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    documentCode: "CG178",
  },
  NIMH_EATING: {
    id: "NIMH_EATING",
    institution: "National Institute of Mental Health",
    title: "Eating Disorders",
    url: "https://www.nimh.nih.gov/health/topics/eating-disorders",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  NIMH_SUBSTANCE: {
    id: "NIMH_SUBSTANCE",
    institution: "National Institute of Mental Health",
    title: "Finding Help for Co-Occurring Substance Use and Mental Disorders",
    url: "https://www.nimh.nih.gov/health/topics/substance-use-and-mental-health",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  NIMH_BORDERLINE: {
    id: "NIMH_BORDERLINE",
    institution: "National Institute of Mental Health",
    title: "Borderline Personality Disorder",
    url: "https://www.nimh.nih.gov/health/topics/borderline-personality-disorder",
    jurisdiction: "international",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  SHAFRAN2002: {
    id: "SHAFRAN2002",
    institution: "Shafran, R.; Cooper, Z.; Fairburn, C. G.",
    title: "Clinical perfectionism: a cognitive-behavioural analysis",
    year: 2002,
    url: "https://doi.org/10.1016/S0005-7967(01)00059-6",
    jurisdiction: "international",
    kind: "journal-article",
    patientFacing: true,
    lastVerified,
    note: "Behaviour Research and Therapy, 40(7), 773–791.",
  },
  EGAN2014: {
    id: "EGAN2014",
    institution: "Egan, S. J.; Wade, T. D.; Shafran, R.; Antony, M. M.",
    title: "Cognitive-Behavioral Treatment of Perfectionism",
    year: 2014,
    url: "https://www.guilford.com/books/Cognitive-Behavioral-Treatment-of-Perfectionism/Egan-Wade-Shafran-Antony/9781462527649",
    jurisdiction: "international",
    kind: "book",
    patientFacing: true,
    lastVerified,
    note: "Guilford Press.",
  },
  BR_MS_SAMU_192: {
    id: "BR_MS_SAMU_192",
    institution: "Ministério da Saúde",
    title: "SAMU 192",
    url: "https://www.gov.br/saude/pt-br/composicao/saes/samu-192",
    jurisdiction: "brazil",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  BR_MS_CAPS: {
    id: "BR_MS_CAPS",
    institution: "Ministério da Saúde",
    title: "Centros de Atenção Psicossocial — CAPS",
    url: "https://www.gov.br/saude/pt-br/composicao/saes/desmad/raps/caps",
    jurisdiction: "brazil",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  BR_MS_CVV_188: {
    id: "BR_MS_CVV_188",
    institution: "Ministério da Saúde",
    title: "Suicídio (Prevenção)",
    url: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/suicidio-prevencao",
    jurisdiction: "brazil",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  BR_MS_PCDT: {
    id: "BR_MS_PCDT",
    institution: "Ministério da Saúde",
    title: "Protocolos Clínicos e Diretrizes Terapêuticas — PCDT",
    url: "https://www.gov.br/saude/pt-br/assuntos/pcdt/pcdt",
    jurisdiction: "brazil",
    kind: "public-health-guidance",
    patientFacing: false,
    lastVerified,
    note:
      "Portal técnico geral. Nos artigos, deve ser substituído pelo documento específico da condição.",
  },
  BR_PCDT_TDAH: {
    id: "BR_PCDT_TDAH",
    institution: "Ministério da Saúde",
    title:
      "Protocolo Clínico e Diretrizes Terapêuticas do Transtorno do Déficit de Atenção com Hiperatividade — TDAH",
    url: "https://www.gov.br/saude/pt-br/assuntos/pcdt/t/transtorno-do-deficit-de-atencao-com-hiperatividade-tdah/view",
    jurisdiction: "brazil",
    kind: "brazilian-pcdt",
    patientFacing: true,
    lastVerified,
  },
  BR_PCDT_BIPOLAR_I: {
    id: "BR_PCDT_BIPOLAR_I",
    institution: "Ministério da Saúde",
    title:
      "Protocolo Clínico e Diretrizes Terapêuticas do Transtorno Afetivo Bipolar do Tipo I",
    url: "https://www.gov.br/saude/pt-br/assuntos/pcdt/t/transtorno-afetivo-bipolar-do-tipo-i/view",
    jurisdiction: "brazil",
    kind: "brazilian-pcdt",
    patientFacing: true,
    lastVerified,
    patientNote:
      "Este PCDT brasileiro possui escopo específico para o transtorno bipolar do tipo I.",
  },
  BR_PCDT_ESQUIZOFRENIA: {
    id: "BR_PCDT_ESQUIZOFRENIA",
    institution: "Ministério da Saúde",
    title: "Protocolo Clínico e Diretrizes Terapêuticas — Esquizofrenia",
    url: "https://www.gov.br/saude/pt-br/assuntos/pcdt/e/esquizofrenia/view",
    jurisdiction: "brazil",
    kind: "brazilian-pcdt",
    patientFacing: true,
    lastVerified,
  },
  BR_DIRETRIZ_TEA: {
    id: "BR_DIRETRIZ_TEA",
    institution: "Ministério da Saúde",
    title:
      "Diretrizes de Atenção à Reabilitação da Pessoa com Transtornos do Espectro do Autismo",
    year: 2014,
    url: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-pessoa-com-deficiencia/publicacoes/diretrizes-de-atencao-a-reabilitacao-da-pessoa-com-transtornos-do-espectro-do-autismo.pdf/@@download/file",
    jurisdiction: "brazil",
    kind: "clinical-guideline",
    patientFacing: true,
    lastVerified,
    note:
      "A revisão de 2026 ainda constava somente como consulta pública encerrada na data da verificação.",
  },
  BR_MS_AUTISMO: {
    id: "BR_MS_AUTISMO",
    institution: "Ministério da Saúde",
    title: "Autismo — Saúde de A a Z",
    url: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/autismo",
    jurisdiction: "brazil",
    kind: "public-health-guidance",
    patientFacing: true,
    lastVerified,
  },
  BR_CFP_RES_9_2024: {
    id: "BR_CFP_RES_9_2024",
    institution: "Conselho Federal de Psicologia",
    title: "Resolução CFP nº 9, de 18 de julho de 2024",
    year: 2024,
    url: "https://atosoficiais.com.br/lei/orientacao-psicologica-pela-internet-cfp",
    jurisdiction: "brazil",
    kind: "professional-regulation",
    patientFacing: false,
    lastVerified,
  },
  BR_CFP_RES_7_2025: {
    id: "BR_CFP_RES_7_2025",
    institution: "Conselho Federal de Psicologia",
    title: "Resolução CFP nº 7, de 10 de abril de 2025",
    year: 2025,
    url: "https://atosoficiais.com.br/cfp/resolucao-do-exercicio-profissional-n-7-2025-estabelece-normas-para-o-exercicio-profissional-da-psicologa-e-do-psicologo-no-atendimento-as-pessoas-com-deficiencia-e-no-enfrentamento-do-capacitismo",
    jurisdiction: "brazil",
    kind: "professional-regulation",
    patientFacing: false,
    lastVerified,
  },
  BR_LGPD: {
    id: "BR_LGPD",
    institution: "Presidência da República",
    title:
      "Lei nº 13.709, de 14 de agosto de 2018 — Lei Geral de Proteção de Dados Pessoais",
    year: 2018,
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm",
    jurisdiction: "brazil",
    kind: "law",
    patientFacing: false,
    lastVerified,
  },
} as const satisfies Record<string, EducationReference>;

export type EducationReferenceId = keyof typeof educationReferences;

export type EducationContentBlock =
  | {
      kind: "paragraph" | "quote";
      text: string;
    }
  | {
      kind: "bullets" | "steps";
      items: string[];
    };

export type EducationSection = {
  heading: string;
  blocks: EducationContentBlock[];
};

export type EducationArticle = {
  slug: string;
  title: string;
  summary: string;
  category: EducationCategory;
  keywords: string[];
  sections: EducationSection[];
  observe: EducationContentBlock[];
  references: EducationReferenceId[];
  guideLink?: boolean;
  safety?: string;
  relatedSlugs?: string[];
};

export const educationArticles: EducationArticle[] = [
  {
    "slug": "emocoes-pensamentos-comportamentos",
    "title": "Emoções, pensamentos e comportamentos",
    "summary": "Uma mesma situação pode ser interpretada de maneiras diferentes e gerar reações diferentes no corpo, nas emoções e nas ações.",
    "category": "Como a mente funciona",
    "keywords": [
      "emoção",
      "pensamento",
      "comportamento",
      "corpo",
      "situação",
      "modelo cognitivo",
      "TCC"
    ],
    "sections": [
      {
        "heading": "A situação não explica tudo sozinha",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Imagine que alguém visualizou sua mensagem e não respondeu."
          },
          {
            "kind": "paragraph",
            "text": "Uma pessoa pode pensar: “deve estar ocupada” e continuar o dia.\nOutra pode pensar: “fiz alguma coisa errada”, sentir ansiedade, perceber um aperto no peito e mandar novas mensagens."
          },
          {
            "kind": "paragraph",
            "text": "A situação é a mesma. O que muda é a forma como ela foi interpretada e o que aconteceu depois."
          },
          {
            "kind": "paragraph",
            "text": "Na TCC, costuma ser útil separar algumas partes:"
          },
          {
            "kind": "bullets",
            "items": [
              "**situação:** o que aconteceu;",
              "**pensamento:** o que passou pela cabeça;",
              "**emoção:** o que foi sentido;",
              "**corpo:** quais sinais apareceram;",
              "**comportamento:** o que a pessoa fez ou evitou fazer."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Na vida real, tudo isso acontece misturado. A separação serve apenas para entender melhor o ciclo."
          }
        ]
      },
      {
        "heading": "Pensamento não é emoção",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "“Estou ansioso” descreve uma emoção ou estado."
          },
          {
            "kind": "paragraph",
            "text": "“Vai dar errado” descreve um pensamento."
          },
          {
            "kind": "paragraph",
            "text": "“Meu coração acelerou” descreve uma reação do corpo."
          },
          {
            "kind": "paragraph",
            "text": "“Cancelei” descreve um comportamento."
          },
          {
            "kind": "paragraph",
            "text": "Quando essas partes ficam misturadas, pode parecer que não existe nenhum ponto possível de trabalho. Separá-las ajuda a localizar onde o ciclo começou e o que o mantém."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Pense em uma situação que mudou seu humor recentemente:"
      },
      {
        "kind": "bullets",
        "items": [
          "O que aconteceu?",
          "Qual foi a primeira frase ou imagem que apareceu na sua cabeça?",
          "O que você sentiu?",
          "O que percebeu no corpo?",
          "O que fez em seguida?",
          "O que aconteceu depois?"
        ]
      },
      {
        "kind": "paragraph",
        "text": "Não precisa preencher tudo. Comece pela parte mais clara."
      }
    ],
    "references": [
      "BECK2020",
      "WHO_MENTAL_HEALTH_2025"
    ]
  },
  {
    "slug": "pensamentos-automaticos",
    "title": "Pensamentos automáticos",
    "summary": "Pensamentos automáticos surgem rápido e influenciam emoções e decisões, mesmo quando passam quase despercebidos.",
    "category": "Como a mente funciona",
    "keywords": [
      "pensamento automático",
      "interpretação",
      "previsão",
      "autocrítica",
      "TCC"
    ],
    "sections": [
      {
        "heading": "O pensamento pode passar antes de você perceber",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Depois de cometer um erro, alguém pode sentir vergonha antes de notar que pensou:"
          },
          {
            "kind": "quote",
            "text": "“Agora vão perceber que sou incompetente.”"
          },
          {
            "kind": "paragraph",
            "text": "Esse tipo de pensamento é chamado de automático porque aparece rapidamente, sem uma análise cuidadosa. Ele pode vir como frase, imagem, lembrança ou previsão."
          },
          {
            "kind": "paragraph",
            "text": "Em muitos casos, a pessoa percebe primeiro a emoção, o corpo ou a vontade de agir."
          }
        ]
      },
      {
        "heading": "Automático não significa verdadeiro",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Um pensamento pode parecer muito convincente e ainda estar incompleto."
          },
          {
            "kind": "paragraph",
            "text": "“Ela não respondeu porque está irritada comigo” pode ser uma possibilidade. Não é necessariamente um fato."
          },
          {
            "kind": "paragraph",
            "text": "O objetivo não é trocar toda ideia negativa por uma frase positiva. É examinar melhor aquilo que apareceu."
          },
          {
            "kind": "paragraph",
            "text": "Perguntas úteis:"
          },
          {
            "kind": "bullets",
            "items": [
              "O que me fez concluir isso?",
              "Estou tratando uma possibilidade como certeza?",
              "Existe outra explicação compatível com os fatos?",
              "Estou ignorando alguma informação?",
              "O que eu diria a alguém próximo na mesma situação?"
            ]
          }
        ]
      },
      {
        "heading": "Quando a mesma frase aparece em lugares diferentes",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Alguns pensamentos retornam em situações distintas:"
          },
          {
            "kind": "bullets",
            "items": [
              "“Vou ser rejeitado.”",
              "“Não posso errar.”",
              "“Preciso resolver isso sozinho.”",
              "“Se eu demonstrar dificuldade, vão perder o respeito por mim.”"
            ]
          },
          {
            "kind": "paragraph",
            "text": "Quando uma frase se repete, ela pode fazer parte de um padrão mais amplo."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Escolha uma situação que alterou seu humor. Em vez de explicar tudo, tente escrever a frase mais próxima do que passou pela sua cabeça naquele instante."
      },
      {
        "kind": "paragraph",
        "text": "Uma frase curta costuma ser mais útil do que uma justificativa longa."
      }
    ],
    "references": [
      "BECK2020"
    ]
  },
  {
    "slug": "distorcoes-cognitivas",
    "title": "Distorções cognitivas",
    "summary": "Alguns atalhos de pensamento se repetem e podem fazer um problema parecer maior, mais certo ou mais definitivo do que ele é.",
    "category": "Como a mente funciona",
    "keywords": [
      "distorções cognitivas",
      "tudo ou nada",
      "catastrofização",
      "leitura mental",
      "generalização"
    ],
    "sections": [
      {
        "heading": "Atalhos que parecem fatos",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "O cérebro simplifica informações o tempo todo. Isso é necessário para decidir rápido, mas nem sempre produz uma leitura completa da situação."
          },
          {
            "kind": "paragraph",
            "text": "Alguns atalhos aparecem com frequência:"
          },
          {
            "kind": "bullets",
            "items": [
              "transformar um erro em fracasso total;",
              "imaginar o pior cenário e tratá-lo como o mais provável;",
              "concluir o que alguém pensa sem ter confirmação;",
              "ignorar o que deu certo e destacar apenas o problema;",
              "usar palavras como “sempre”, “nunca”, “todo mundo” ou “ninguém”;",
              "pensar que sentir algo prova que aquilo é verdade."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Exemplo:"
          },
          {
            "kind": "quote",
            "text": "“Eu me sinto incapaz, então devo ser incapaz.”"
          },
          {
            "kind": "paragraph",
            "text": "A emoção é real. A conclusão ainda precisa ser examinada."
          }
        ]
      },
      {
        "heading": "Dar nome ao padrão não encerra o trabalho",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Perceber que um pensamento é “tudo ou nada” ou “catastrofização” pode ajudar, mas não basta."
          },
          {
            "kind": "paragraph",
            "text": "O passo seguinte é voltar para:"
          },
          {
            "kind": "bullets",
            "items": [
              "os fatos;",
              "o contexto;",
              "as informações ausentes;",
              "as alternativas;",
              "as consequências de acreditar naquela ideia sem questioná-la."
            ]
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Quando um pensamento vier acompanhado de muita certeza, procure:"
      },
      {
        "kind": "bullets",
        "items": [
          "palavras absolutas;",
          "previsões;",
          "conclusões sobre o que outra pessoa pensa;",
          "generalizações a partir de um único episódio."
        ]
      },
      {
        "kind": "paragraph",
        "text": "Depois, separe em três partes:"
      },
      {
        "kind": "steps",
        "items": [
          "o que é fato;",
          "o que é interpretação;",
          "o que ainda não está claro."
        ]
      }
    ],
    "references": [
      "BECK2020"
    ]
  },
  {
    "slug": "crencas-e-padroes",
    "title": "Crenças e padrões que se repetem",
    "summary": "Experiências antigas podem formar conclusões profundas que continuam influenciando relações, escolhas e autocrítica.",
    "category": "Como a mente funciona",
    "keywords": [
      "crença",
      "padrão",
      "regra",
      "rejeição",
      "abandono",
      "perfeccionismo",
      "autoestima"
    ],
    "sections": [
      {
        "heading": "Algumas ideias funcionam como lentes",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Ao longo da vida, construímos conclusões sobre nós, os outros e o mundo."
          },
          {
            "kind": "paragraph",
            "text": "Algumas ficam mais profundas:"
          },
          {
            "kind": "bullets",
            "items": [
              "“Não sou suficiente.”",
              "“As pessoas acabam indo embora.”",
              "“Se eu depender de alguém, vou me decepcionar.”",
              "“Só tenho valor quando faço tudo certo.”"
            ]
          },
          {
            "kind": "paragraph",
            "text": "Nem sempre essas ideias aparecem de forma tão direta. Muitas vezes surgem como regras:"
          },
          {
            "kind": "bullets",
            "items": [
              "“Preciso agradar para não perder as pessoas.”",
              "“Não posso demonstrar dificuldade.”",
              "“Se não for perfeito, não vale a pena.”",
              "“É melhor me afastar antes que me rejeitem.”"
            ]
          }
        ]
      },
      {
        "heading": "O padrão pode se confirmar pelas próprias reações",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Uma pessoa que espera rejeição pode:"
          },
          {
            "kind": "bullets",
            "items": [
              "prestar atenção exagerada a sinais de distância;",
              "pedir reafirmação repetidamente;",
              "interpretar silêncio como abandono;",
              "afastar-se antes que o outro tenha a chance de permanecer."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Essas respostas fazem sentido dentro da crença. Ao mesmo tempo, podem dificultar relações e reforçar a sensação de que o padrão sempre se repete."
          }
        ]
      },
      {
        "heading": "Trabalhar uma crença não apaga a história",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A mudança não acontece fingindo que experiências dolorosas não existiram."
          },
          {
            "kind": "paragraph",
            "text": "O trabalho costuma envolver:"
          },
          {
            "kind": "bullets",
            "items": [
              "entender de onde a conclusão veio;",
              "perceber em quais situações ela é ativada;",
              "reconhecer o que ela faz a pessoa ignorar;",
              "testar novas formas de interpretar e agir."
            ]
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Pense em uma situação que trouxe a sensação de “a mesma história de sempre”."
      },
      {
        "kind": "paragraph",
        "text": "Pergunte:"
      },
      {
        "kind": "bullets",
        "items": [
          "O que essa situação parece dizer sobre mim?",
          "O que parece dizer sobre os outros?",
          "Qual regra senti que precisava seguir?",
          "O que fiz para me proteger?",
          "Essa proteção ajudou apenas no momento ou também depois?"
        ]
      }
    ],
    "references": [
      "BECK2020"
    ]
  },
  {
    "slug": "evitacao-e-alivio-imediato",
    "title": "Evitação e alívio imediato",
    "summary": "Evitar pode diminuir a ansiedade na hora, mas também ensinar ao cérebro que a situação era perigosa demais para ser enfrentada.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "evitação",
      "ansiedade",
      "medo",
      "cancelamento",
      "segurança",
      "exposição"
    ],
    "sections": [
      {
        "heading": "Por que evitar funciona tão rápido",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Cancelar uma conversa, não abrir uma mensagem, sair de um lugar ou adiar uma tarefa pode trazer alívio imediato."
          },
          {
            "kind": "paragraph",
            "text": "Esse alívio é real."
          },
          {
            "kind": "paragraph",
            "text": "O problema é o aprendizado que pode vir junto:"
          },
          {
            "kind": "quote",
            "text": "“Eu melhorei porque escapei. Então aquilo devia ser perigoso.”"
          },
          {
            "kind": "paragraph",
            "text": "Na próxima vez, a vontade de evitar tende a aparecer mais cedo."
          }
        ]
      },
      {
        "heading": "Nem toda evitação parece fuga",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Também pode ser:"
          },
          {
            "kind": "bullets",
            "items": [
              "falar pouco para não errar;",
              "ensaiar uma conversa muitas vezes;",
              "pedir garantia repetidamente;",
              "conferir tudo antes de sair;",
              "usar o celular para não entrar em contato com o desconforto;",
              "controlar detalhes;",
              "permanecer na situação apenas de um jeito muito rígido."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Essas estratégias costumam ser chamadas de comportamentos de segurança. Elas ajudam a suportar o momento, mas podem impedir a descoberta de que seria possível lidar com a situação de outra forma."
          }
        ]
      },
      {
        "heading": "Enfrentar não significa se forçar sem preparo",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Não se trata de “ir com medo mesmo” em qualquer situação."
          },
          {
            "kind": "paragraph",
            "text": "O trabalho costuma ser mais útil quando:"
          },
          {
            "kind": "bullets",
            "items": [
              "o risco real é diferenciado do desconforto;",
              "os passos são graduais;",
              "a pessoa entende o que está tentando evitar;",
              "existe espaço para revisar o que aconteceu depois."
            ]
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Escolha uma situação que você evitou."
      },
      {
        "kind": "paragraph",
        "text": "Anote:"
      },
      {
        "kind": "bullets",
        "items": [
          "o que imaginou que aconteceria;",
          "o que fez para escapar ou se proteger;",
          "quanto o alívio durou;",
          "qual foi o custo depois;",
          "qual seria um passo menor, mas diferente, em uma próxima vez."
        ]
      }
    ],
    "references": [
      "BECK2020",
      "NICE_CG113",
      "NICE_CG159"
    ]
  },
  {
    "slug": "preocupacao-e-ruminacao",
    "title": "Preocupação e ruminação",
    "summary": "Pensar muito pode dar a sensação de estar resolvendo algo, mesmo quando as mesmas perguntas apenas se repetem.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "preocupação",
      "ruminação",
      "pensar demais",
      "ansiedade",
      "passado",
      "futuro"
    ],
    "sections": [
      {
        "heading": "Duas formas de ficar preso no pensamento",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A preocupação costuma olhar para o futuro:"
          },
          {
            "kind": "quote",
            "text": "“E se acontecer?”"
          },
          {
            "kind": "paragraph",
            "text": "A ruminação costuma voltar ao passado ou à própria pessoa:"
          },
          {
            "kind": "quote",
            "text": "“Por que fiz isso?”\n“O que há de errado comigo?”"
          },
          {
            "kind": "paragraph",
            "text": "As duas podem começar como tentativas de encontrar uma resposta. O problema aparece quando o pensamento gira em torno das mesmas perguntas sem produzir nenhuma decisão."
          }
        ]
      },
      {
        "heading": "Sinais de que o pensamento ficou circular",
        "blocks": [
          {
            "kind": "bullets",
            "items": [
              "nenhuma resposta parece suficiente;",
              "a pessoa busca uma certeza que não existe;",
              "o corpo fica mais tenso;",
              "outras tarefas ficam paradas;",
              "o problema parece crescer;",
              "a conversa interna retorna sempre ao mesmo ponto."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Pensar de forma útil tende a produzir alguma coisa concreta: uma decisão, uma conversa, uma pergunta, uma informação a buscar ou a aceitação de que ainda não existe resposta."
          }
        ]
      },
      {
        "heading": "Nem toda dúvida pode ser resolvida agora",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Continuar pensando pode parecer uma forma de não desistir. Às vezes é apenas uma tentativa de reduzir a incerteza."
          },
          {
            "kind": "paragraph",
            "text": "Quando não existe ação possível no momento, pode ser mais útil escolher quando retomar o assunto do que continuar preso a ele."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Quando perceber que está pensando há muito tempo, pergunte:"
      },
      {
        "kind": "bullets",
        "items": [
          "Estou chegando a algo novo?",
          "Existe alguma ação realista possível?",
          "Estou tentando obter certeza total?",
          "O que aconteceria se eu deixasse essa pergunta sem resposta por enquanto?"
        ]
      }
    ],
    "references": [
      "BECK2020",
      "NICE_NG222",
      "NICE_CG113"
    ]
  },
  {
    "slug": "regulacao-emocional",
    "title": "Regulação emocional",
    "summary": "Regular uma emoção não é fazê-la desaparecer, mas conseguir reconhecê-la e escolher o que fazer com ela.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "regulação emocional",
      "intensidade",
      "impulso",
      "emoção",
      "tolerância",
      "crise"
    ],
    "sections": [
      {
        "heading": "Sentir e agir não são a mesma coisa",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A raiva pode trazer vontade de confrontar.\nO medo pode trazer vontade de fugir.\nA tristeza pode reduzir o ritmo.\nA culpa pode trazer vontade de reparar ou se punir."
          },
          {
            "kind": "paragraph",
            "text": "A emoção organiza o corpo e chama para uma ação. Isso não significa que a primeira urgência precise ser seguida."
          }
        ]
      },
      {
        "heading": "Regular não é controlar perfeitamente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Em alguns momentos, regular significa apenas perceber:"
          },
          {
            "kind": "quote",
            "text": "“Estou ficando mais ativado.”"
          },
          {
            "kind": "paragraph",
            "text": "Depois disso, pode ser necessário criar alguns minutos antes de decidir."
          },
          {
            "kind": "paragraph",
            "text": "Algumas possibilidades:"
          },
          {
            "kind": "bullets",
            "items": [
              "sair temporariamente de uma discussão;",
              "diminuir estímulos;",
              "adiar uma mensagem;",
              "diminuir o ritmo da respiração, sem tentar forçá-la;",
              "nomear o que está acontecendo;",
              "pedir tempo;",
              "voltar ao problema quando houver mais condições."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Essas ações não resolvem o conflito. Elas reduzem a chance de a urgência decidir sozinha."
          }
        ]
      },
      {
        "heading": "Quando ainda não existe um nome claro",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Nem sempre a pessoa consegue identificar qual emoção está presente."
          },
          {
            "kind": "paragraph",
            "text": "Pode começar pelo corpo:"
          },
          {
            "kind": "bullets",
            "items": [
              "aperto;",
              "calor;",
              "tremor;",
              "peso;",
              "cansaço;",
              "agitação."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Ou pela vontade:"
          },
          {
            "kind": "bullets",
            "items": [
              "fugir;",
              "discutir;",
              "se esconder;",
              "pedir garantia;",
              "desistir."
            ]
          },
          {
            "kind": "paragraph",
            "text": "O Guia de Emoções já disponível no portal pode ajudar nessa parte."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Perceba os primeiros sinais de aumento de intensidade."
      },
      {
        "kind": "bullets",
        "items": [
          "O que aparece no corpo?",
          "Qual pensamento acelera a emoção?",
          "Que ação costuma piorar a situação?",
          "O que ajuda a ganhar alguns minutos?",
          "Em que ponto ainda é possível interromper o ciclo?"
        ]
      }
    ],
    "references": [
      "BECK2020",
      "WHO_MENTAL_HEALTH_2025"
    ],
    "guideLink": true
  },
  {
    "slug": "procrastinacao-e-dificuldade-para-comecar",
    "title": "Procrastinação e dificuldade para começar",
    "summary": "Adiar nem sempre é preguiça. Pode envolver ansiedade, baixa energia, perfeccionismo ou dificuldade de organizar o primeiro passo.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "procrastinação",
      "iniciar tarefa",
      "organização",
      "perfeccionismo",
      "função executiva",
      "TDAH"
    ],
    "sections": [
      {
        "heading": "Muitas tarefas são adiadas por causa do que fazem a pessoa sentir",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Uma atividade pode trazer:"
          },
          {
            "kind": "bullets",
            "items": [
              "tédio;",
              "ansiedade;",
              "medo de errar;",
              "sensação de incapacidade;",
              "dúvida sobre por onde começar;",
              "frustração por não conseguir fazer do jeito ideal."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Adiar reduz esse desconforto por alguns minutos. Depois, a tarefa continua existindo, geralmente maior e acompanhada de culpa."
          }
        ]
      },
      {
        "heading": "“Fazer a tarefa” pode ser amplo demais",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Algumas instruções parecem simples, mas escondem muitas etapas:"
          },
          {
            "kind": "quote",
            "text": "“Organizar os documentos.”\n“Estudar.”\n“Resolver a casa.”\n“Responder mensagens pendentes.”"
          },
          {
            "kind": "paragraph",
            "text": "Quando o primeiro passo não está visível, a pessoa pode ficar parada mesmo sabendo o que precisa ser feito."
          },
          {
            "kind": "paragraph",
            "text": "Exemplos de começos mais definidos:"
          },
          {
            "kind": "bullets",
            "items": [
              "abrir o arquivo;",
              "separar três documentos;",
              "responder uma mensagem;",
              "trabalhar por dez minutos;",
              "escrever somente o título;",
              "colocar o material necessário sobre a mesa."
            ]
          }
        ]
      },
      {
        "heading": "O problema pode ter origens diferentes",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Procrastinação pode aparecer com:"
          },
          {
            "kind": "bullets",
            "items": [
              "ansiedade;",
              "perfeccionismo;",
              "depressão;",
              "TDAH;",
              "privação de sono;",
              "rotina sobrecarregada;",
              "dificuldade de planejamento;",
              "baixa clareza;",
              "recompensas imediatas mais disponíveis."
            ]
          },
          {
            "kind": "paragraph",
            "text": "A presença do comportamento não confirma uma causa específica."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Escolha uma tarefa adiada."
      },
      {
        "kind": "paragraph",
        "text": "Pergunte:"
      },
      {
        "kind": "bullets",
        "items": [
          "O que sinto quando penso nela?",
          "O que imagino que pode acontecer?",
          "Qual parte ainda está vaga?",
          "Qual seria uma ação pequena o suficiente para começar hoje?",
          "Estou esperando motivação ou clareza total antes de agir?"
        ]
      }
    ],
    "references": [
      "BECK2020",
      "NICE_NG87",
      "BR_PCDT_TDAH"
    ]
  },
  {
    "slug": "comunicacao-assertiva-e-limites",
    "title": "Comunicação assertiva e limites",
    "summary": "Assertividade é conseguir comunicar necessidades, discordâncias e limites sem apagar a si mesmo nem atacar o outro.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "assertividade",
      "limite",
      "comunicação",
      "dizer não",
      "conflito",
      "relacionamento"
    ],
    "sections": [
      {
        "heading": "Falar com clareza não garante concordância",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Algumas pessoas cedem para evitar conflito. Outras aumentam o tom para não se sentirem ignoradas."
          },
          {
            "kind": "paragraph",
            "text": "A assertividade procura outro caminho: apresentar o que aconteceu, como aquilo afeta você e o que precisa ser combinado."
          },
          {
            "kind": "paragraph",
            "text": "Exemplo:"
          },
          {
            "kind": "quote",
            "text": "“Quando o horário muda em cima da hora, eu tenho dificuldade para me organizar. Preciso que você me avise antes. Quando isso não for possível, vamos remarcar.”"
          },
          {
            "kind": "paragraph",
            "text": "O outro pode discordar. Ainda assim, sua posição foi colocada de maneira clara."
          }
        ]
      },
      {
        "heading": "Pedido e limite não são a mesma coisa",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Um pedido diz o que você gostaria que o outro fizesse."
          },
          {
            "kind": "paragraph",
            "text": "Um limite diz o que você fará caso uma situação continue."
          },
          {
            "kind": "paragraph",
            "text": "Exemplo:"
          },
          {
            "kind": "quote",
            "text": "“Peço que você não grite comigo.”"
          },
          {
            "kind": "paragraph",
            "text": "Limite:"
          },
          {
            "kind": "quote",
            "text": "“Se a conversa continuar aos gritos, vou interrompê-la e retomamos depois.”"
          },
          {
            "kind": "paragraph",
            "text": "Limite não é ameaça. Ele descreve como você vai se proteger ou organizar."
          }
        ]
      },
      {
        "heading": "O desconforto depois de dizer “não”",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Ser assertivo pode trazer culpa, medo de rejeição ou vontade de voltar atrás."
          },
          {
            "kind": "paragraph",
            "text": "Essas emoções não provam que o limite foi errado. Às vezes mostram apenas que a pessoa está fazendo algo diferente do padrão habitual."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Pense em uma situação na qual você:"
      },
      {
        "kind": "bullets",
        "items": [
          "disse “sim” querendo dizer “não”;",
          "ficou em silêncio;",
          "falou de forma indireta;",
          "explodiu depois de guardar muita coisa."
        ]
      },
      {
        "kind": "paragraph",
        "text": "Como seria uma frase mais direta, específica e possível?"
      }
    ],
    "references": [
      "BECK2020"
    ]
  },
  {
    "slug": "ativacao-comportamental-rotina-e-energia",
    "title": "Ativação comportamental, rotina e energia",
    "summary": "Quando a energia cai, esperar vontade pode aumentar o afastamento. Ações pequenas e planejadas ajudam a reconstruir ritmo.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "rotina",
      "energia",
      "motivação",
      "ativação comportamental",
      "depressão",
      "hábito"
    ],
    "sections": [
      {
        "heading": "A falta de vontade pode vir antes e depois da inatividade",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Quando alguém está desanimado ou esgotado, tende a reduzir atividades."
          },
          {
            "kind": "paragraph",
            "text": "Com menos contato, movimento, responsabilidade e prazer, o dia pode ficar ainda mais vazio. Isso aumenta a sensação de incapacidade e reduz a chance de agir no dia seguinte."
          },
          {
            "kind": "paragraph",
            "text": "A ativação comportamental trabalha esse ciclo por meio de ações possíveis, não de grandes metas."
          }
        ]
      },
      {
        "heading": "Atividades cumprem funções diferentes",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Algumas são necessárias:"
          },
          {
            "kind": "bullets",
            "items": [
              "higiene;",
              "alimentação;",
              "contas;",
              "consultas;",
              "organização básica."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Outras trazem sensação de avanço:"
          },
          {
            "kind": "bullets",
            "items": [
              "terminar uma pequena pendência;",
              "responder algo;",
              "arrumar uma parte do ambiente;",
              "caminhar por alguns minutos."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Outras oferecem prazer ou conexão:"
          },
          {
            "kind": "bullets",
            "items": [
              "conversar;",
              "ouvir música;",
              "cozinhar;",
              "sair de casa;",
              "retomar um interesse."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Uma mesma atividade pode cumprir mais de uma função."
          }
        ]
      },
      {
        "heading": "Fazer abaixo do ideal ainda conta",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Em um dia difícil, “voltar a treinar” pode ser grande demais."
          },
          {
            "kind": "paragraph",
            "text": "“Trocar de roupa e caminhar cinco minutos” pode ser executável."
          },
          {
            "kind": "paragraph",
            "text": "A medida não é o que seria perfeito. É o que reduz a paralisação sem ignorar os limites daquele dia."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Escolha uma atividade pequena e defina:"
      },
      {
        "kind": "bullets",
        "items": [
          "o que será feito;",
          "quando;",
          "por quanto tempo;",
          "qual dificuldade pode aparecer;",
          "o que precisa estar preparado antes."
        ]
      },
      {
        "kind": "paragraph",
        "text": "Depois, observe o efeito real. Não use apenas a vontade que existia antes de começar como medida."
      }
    ],
    "references": [
      "BECK2020",
      "NICE_NG222"
    ]
  },
  {
    "slug": "sono-e-saude-mental",
    "title": "Sono e saúde mental",
    "summary": "Sono, rotina, estresse e saúde mental influenciam uns aos outros. Um padrão persistente merece mais atenção do que uma noite isolada.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "sono",
      "insônia",
      "cansaço",
      "rotina",
      "ansiedade",
      "humor"
    ],
    "sections": [
      {
        "heading": "Dormir mal não tem uma única causa",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "O sono pode mudar com:"
          },
          {
            "kind": "bullets",
            "items": [
              "estresse;",
              "ansiedade;",
              "depressão;",
              "uso de substâncias;",
              "horários irregulares;",
              "dor;",
              "condições de saúde;",
              "medicações;",
              "mudanças na rotina."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Dormir mal também pode aumentar irritabilidade, desatenção e sensibilidade emocional."
          }
        ]
      },
      {
        "heading": "Quando tentar dormir aumenta a vigilância",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A pessoa pode começar a:"
          },
          {
            "kind": "bullets",
            "items": [
              "olhar o relógio;",
              "calcular quantas horas restam;",
              "imaginar como será o dia seguinte;",
              "controlar a respiração;",
              "ficar atenta a qualquer barulho;",
              "tentar obrigar o sono a acontecer."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Quanto mais vigilante, mais difícil relaxar."
          }
        ]
      },
      {
        "heading": "O padrão importa",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Vale observar:"
          },
          {
            "kind": "bullets",
            "items": [
              "horário em que deita e levanta;",
              "despertares;",
              "cochilos;",
              "uso de telas;",
              "cafeína, álcool e outras substâncias;",
              "pensamentos que aparecem na cama;",
              "mudanças no humor e na energia;",
              "ronco intenso, pausas na respiração ou agitação incomum durante a noite."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Uma mudança muito marcada na necessidade de sono, principalmente junto de aceleração, energia incomum ou impulsividade, precisa ser discutida."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Durante alguns dias, anote o padrão em vez de avaliar apenas “dormi bem” ou “dormi mal”."
      },
      {
        "kind": "paragraph",
        "text": "O que estava acontecendo ao redor? O que mudou na rotina? O que você fez quando percebeu que não estava dormindo?"
      }
    ],
    "references": [
      "WHO_MENTAL_HEALTH_2025",
      "NICE_NG222",
      "NICE_CG185"
    ]
  },
  {
    "slug": "raiva-impulsividade-e-perda-de-controle",
    "title": "Raiva, impulsividade e perda de controle",
    "summary": "A raiva pode sinalizar injustiça ou limite ultrapassado. A dificuldade aparece quando a reação causa dano ou fica difícil interrompê-la.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "raiva",
      "impulsividade",
      "explosão",
      "irritabilidade",
      "agressividade",
      "limite"
    ],
    "sections": [
      {
        "heading": "Raiva não é o mesmo que agressão",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Raiva é uma emoção.\nAgressão é uma forma de agir."
          },
          {
            "kind": "paragraph",
            "text": "A emoção pode aparecer quando algo parece:"
          },
          {
            "kind": "bullets",
            "items": [
              "injusto;",
              "invasivo;",
              "frustrante;",
              "ameaçador;",
              "desrespeitoso."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Ela pode trazer energia e vontade de reagir. O problema não é sentir raiva, mas o que acontece quando a reação se torna difícil de interromper."
          }
        ]
      },
      {
        "heading": "O corpo costuma avisar antes",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Alguns sinais aparecem antes do auge:"
          },
          {
            "kind": "bullets",
            "items": [
              "mandíbula apertada;",
              "calor;",
              "aumento do tom de voz;",
              "tensão nas mãos;",
              "aceleração;",
              "pensamentos absolutos;",
              "vontade de resolver imediatamente."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Quando a pessoa percebe apenas depois da explosão, pode parecer que tudo aconteceu de uma vez."
          }
        ]
      },
      {
        "heading": "Reduzir o dano vem antes de resolver a discussão",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Em alguns momentos, é necessário:"
          },
          {
            "kind": "bullets",
            "items": [
              "interromper a conversa;",
              "afastar-se por alguns minutos;",
              "não dirigir;",
              "não responder mensagens;",
              "não consumir mais álcool ou outras substâncias;",
              "retirar objetos do alcance;",
              "pedir ajuda."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Depois, com menor ativação, é possível revisar o que aconteceu e comunicar o limite."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Pense em um episódio recente."
      },
      {
        "kind": "bullets",
        "items": [
          "Qual foi o primeiro sinal?",
          "Que pensamento aumentou a urgência?",
          "Em qual ponto ainda seria possível interromper?",
          "O que você fez?",
          "Qual foi o custo depois?"
        ]
      }
    ],
    "references": [
      "BECK2020",
      "WHO_MENTAL_DISORDERS_2025"
    ],
    "safety": "Se você sente que pode agredir alguém, não consegue se afastar ou há armas e objetos que possam causar ferimentos ao alcance, interrompa a situação e procure ajuda imediata. Não use o registro esperando resposta."
  },
  {
    "slug": "estresse-sobrecarga-e-burnout",
    "title": "Estresse, sobrecarga e burnout",
    "summary": "Cansaço, estresse e burnout podem se parecer, mas não significam exatamente a mesma coisa.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "estresse",
      "sobrecarga",
      "burnout",
      "trabalho",
      "esgotamento",
      "cansaço",
      "exaustão"
    ],
    "sections": [
      {
        "heading": "Estresse não é sempre um problema",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "O estresse prepara o corpo para lidar com demandas. Em períodos curtos, pode ajudar a concentrar energia e responder a uma situação difícil."
          },
          {
            "kind": "paragraph",
            "text": "Quando as exigências se acumulam e a recuperação não acontece, o corpo e a mente podem permanecer em esforço por tempo demais."
          },
          {
            "kind": "paragraph",
            "text": "Sobrecarga pode envolver trabalho, cuidado de outras pessoas, problemas financeiros, conflitos, adoecimento e muitas responsabilidades ao mesmo tempo."
          }
        ]
      },
      {
        "heading": "Burnout tem relação específica com o trabalho",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A Organização Mundial da Saúde descreve burnout como um fenômeno ocupacional ligado ao estresse crônico no trabalho que não foi administrado com sucesso."
          },
          {
            "kind": "paragraph",
            "text": "Ele envolve três dimensões principais:"
          },
          {
            "kind": "bullets",
            "items": [
              "exaustão;",
              "aumento da distância mental, negatividade ou cinismo em relação ao trabalho;",
              "redução da sensação de eficácia profissional."
            ]
          },
          {
            "kind": "paragraph",
            "text": "O termo não deve ser usado como nome para qualquer tipo de esgotamento da vida."
          }
        ]
      },
      {
        "heading": "Nem todo cansaço é burnout",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Cansaço também pode aparecer com:"
          },
          {
            "kind": "bullets",
            "items": [
              "depressão;",
              "ansiedade;",
              "privação de sono;",
              "condições físicas;",
              "uso de substâncias;",
              "luto;",
              "rotina sem pausas;",
              "dupla jornada;",
              "conflitos fora do trabalho."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Burnout, depressão e ansiedade podem coexistir. Uma explicação não exclui automaticamente as outras."
          }
        ]
      },
      {
        "heading": "O problema não está apenas na capacidade individual de suportar",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Carga excessiva, pouco controle, insegurança, assédio, falta de apoio e conflito entre exigências também afetam a saúde mental."
          },
          {
            "kind": "paragraph",
            "text": "Descanso e estratégias pessoais podem ajudar, mas não corrigem sozinhos um ambiente de trabalho adoecedor."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "O cansaço melhora quando você se afasta do trabalho?",
          "Você percebe maior irritação, cinismo ou indiferença em relação ao que faz?",
          "A sensação de competência mudou?",
          "Quais demandas não deixam espaço para recuperação?",
          "O problema está apenas no volume de tarefas ou também na forma como o trabalho está organizado?",
          "Há sinais físicos ou mudanças persistentes que precisam de avaliação?"
        ]
      }
    ],
    "references": [
      "WHO_BURNOUT",
      "WHO_MENTAL_HEALTH_AT_WORK",
      "WHO_MENTAL_HEALTH_2025"
    ],
    "relatedSlugs": [
      "sono-e-saude-mental",
      "depressao",
      "ativacao-comportamental-rotina-e-energia"
    ]
  },
  {
    "slug": "autocritica-perfeccionismo-e-autoestima",
    "title": "Autocrítica, perfeccionismo e autoestima",
    "summary": "Exigir muito de si pode parecer uma forma de manter controle e desempenho, mas também pode transformar qualquer falha em ameaça ao próprio valor.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "autocrítica",
      "perfeccionismo",
      "autoestima",
      "desempenho",
      "comparação",
      "erro",
      "reafirmação"
    ],
    "sections": [
      {
        "heading": "Querer fazer bem não é o mesmo que não poder falhar",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Ter cuidado, responsabilidade e metas altas pode ser saudável."
          },
          {
            "kind": "paragraph",
            "text": "O perfeccionismo começa a cobrar um preço quando:"
          },
          {
            "kind": "bullets",
            "items": [
              "o valor pessoal depende do resultado;",
              "um erro apaga tudo o que foi feito;",
              "a tarefa nunca parece pronta;",
              "pedir ajuda é vivido como fraqueza;",
              "descansar gera culpa;",
              "a pessoa evita começar porque não sabe se conseguirá fazer no padrão esperado."
            ]
          }
        ]
      },
      {
        "heading": "A autocrítica costuma prometer controle",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Frases como “você precisa se cobrar” ou “se relaxar, vai piorar” podem parecer formas de manter disciplina."
          },
          {
            "kind": "paragraph",
            "text": "A curto prazo, medo e vergonha até podem produzir esforço. Com o tempo, também podem aumentar ansiedade, adiamento, exaustão e vontade de desistir."
          },
          {
            "kind": "paragraph",
            "text": "Autocrítica não é a mesma coisa que responsabilidade. É possível reconhecer um erro sem transformar o erro em identidade."
          }
        ]
      },
      {
        "heading": "A meta pode mudar depois de ser alcançada",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Quando o padrão é rígido, uma conquista traz alívio curto. Logo surge outra regra:"
          },
          {
            "kind": "bullets",
            "items": [
              "“Era o mínimo.”",
              "“Qualquer pessoa faria.”",
              "“Só vale se eu repetir.”",
              "“Agora não posso cair.”"
            ]
          },
          {
            "kind": "paragraph",
            "text": "Assim, o desempenho aumenta sem que a sensação de valor acompanhe."
          }
        ]
      },
      {
        "heading": "Reafirmação externa ajuda, mas pode nunca parecer suficiente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Perguntar se está tudo bem, comparar-se e procurar aprovação podem aliviar a insegurança."
          },
          {
            "kind": "paragraph",
            "text": "Quando a pessoa não consegue guardar a resposta, precisa pedir novamente. O trabalho não é deixar de ouvir os outros, mas construir critérios próprios e tolerar alguma incerteza."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Que erro você trata como prova sobre quem é?",
          "Qual regra define quando algo está “bom o bastante”?",
          "Você se cobra de um jeito que realmente melhora o desempenho?",
          "O que acontece depois de receber um elogio?",
          "Que tarefa foi adiada porque o primeiro resultado poderia não ficar perfeito?",
          "Como você falaria com alguém de quem gosta na mesma situação?"
        ]
      }
    ],
    "references": [
      "BECK2020",
      "SHAFRAN2002",
      "EGAN2014"
    ],
    "relatedSlugs": [
      "procrastinacao-e-dificuldade-para-comecar",
      "pensamentos-automaticos",
      "crencas-e-padroes"
    ]
  },
  {
    "slug": "luto-perdas-e-mudancas-importantes",
    "title": "Luto, perdas e mudanças importantes",
    "summary": "O luto não aparece apenas após uma morte. Términos, afastamentos, mudanças de saúde, trabalho ou projeto de vida também podem exigir reorganização.",
    "category": "Dificuldades do dia a dia",
    "keywords": [
      "luto",
      "perda",
      "morte",
      "término",
      "separação",
      "mudança",
      "saudade",
      "adaptação"
    ],
    "sections": [
      {
        "heading": "Luto não segue uma sequência obrigatória",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A experiência pode oscilar."
          },
          {
            "kind": "paragraph",
            "text": "Em um mesmo período, a pessoa pode:"
          },
          {
            "kind": "bullets",
            "items": [
              "sentir dor;",
              "funcionar normalmente;",
              "rir;",
              "evitar lembranças;",
              "desejar falar;",
              "sentir raiva;",
              "sentir alívio;",
              "não sentir quase nada."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Não existe uma ordem universal de etapas que todas as pessoas precisam cumprir."
          }
        ]
      },
      {
        "heading": "Algumas perdas são menos reconhecidas pelos outros",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Além da morte, pode haver luto por:"
          },
          {
            "kind": "bullets",
            "items": [
              "término de relacionamento;",
              "afastamento;",
              "perda de saúde;",
              "mudança de trabalho;",
              "aposentadoria;",
              "mudança de cidade;",
              "infertilidade;",
              "perda de um projeto;",
              "mudança de papel familiar;",
              "rompimento de uma expectativa importante."
            ]
          },
          {
            "kind": "paragraph",
            "text": "O fato de outras pessoas não reconhecerem a perda não torna a experiência menos real."
          }
        ]
      },
      {
        "heading": "Adaptar-se não significa esquecer",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Com o tempo, a relação com a perda pode mudar. Lembranças continuam existindo, mas ocupam outro lugar."
          },
          {
            "kind": "paragraph",
            "text": "O processo pode envolver momentos de contato com a dor e momentos de reconstrução da rotina."
          }
        ]
      },
      {
        "heading": "Quando o sofrimento precisa de avaliação",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Dor intensa não é automaticamente um transtorno."
          },
          {
            "kind": "paragraph",
            "text": "Vale procurar avaliação quando o sofrimento permanece muito incapacitante, não permite retomada mínima da vida, vem acompanhado de risco, ou quando depressão, trauma e outras dificuldades parecem estar presentes."
          },
          {
            "kind": "paragraph",
            "text": "A CID-11 reconhece o transtorno de luto prolongado, mas ele não deve ser concluído por identificação com um texto."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "O que exatamente foi perdido?",
          "O que mudou na sua rotina, identidade ou futuro imaginado?",
          "Quais situações aproximam a lembrança?",
          "Há espaço para sentir e também para continuar vivendo?",
          "Você está evitando tudo que lembra a perda ou ficando preso apenas a ela?",
          "De que tipo de apoio precisa agora?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "WHO_MENTAL_HEALTH_2025"
    ],
    "relatedSlugs": [
      "depressao"
    ]
  },
  {
    "slug": "ansiedade-generalizada-e-preocupacao-excessiva",
    "title": "Ansiedade generalizada e preocupação excessiva",
    "summary": "Quando a preocupação se espalha por várias áreas da vida e fica difícil interrompê-la, ela pode consumir tempo, energia e liberdade.",
    "category": "Condições e transtornos",
    "keywords": [
      "ansiedade generalizada",
      "preocupação",
      "tensão",
      "incerteza",
      "garantia",
      "controle"
    ],
    "sections": [
      {
        "heading": "Preocupar-se faz parte da vida",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A preocupação tenta antecipar dificuldades e preparar uma resposta. Antes de uma decisão, uma prova ou uma mudança, ela pode ser útil."
          },
          {
            "kind": "paragraph",
            "text": "A dificuldade aparece quando a mente procura problemas em muitas áreas ao mesmo tempo e nenhuma resposta parece suficiente."
          },
          {
            "kind": "paragraph",
            "text": "A pessoa pode passar do trabalho para a saúde, da saúde para o relacionamento, do relacionamento para o dinheiro e, depois, voltar ao primeiro assunto."
          }
        ]
      },
      {
        "heading": "A tentativa de ter certeza pode alimentar a dúvida",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Algumas respostas comuns são:"
          },
          {
            "kind": "bullets",
            "items": [
              "pesquisar por muito tempo;",
              "pedir várias opiniões;",
              "revisar decisões;",
              "imaginar todos os cenários;",
              "controlar detalhes;",
              "preparar-se além do necessário;",
              "procurar sinais de que algo deu errado."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Essas ações podem aliviar por alguns minutos. Quando a certeza desaparece, a preocupação retorna e pede uma nova verificação."
          }
        ]
      },
      {
        "heading": "O corpo também permanece em alerta",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Podem aparecer:"
          },
          {
            "kind": "bullets",
            "items": [
              "tensão;",
              "inquietação;",
              "irritabilidade;",
              "dificuldade de concentração;",
              "cansaço;",
              "sono prejudicado;",
              "sensação de que é difícil desacelerar."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Esses sinais não confirmam um diagnóstico sozinhos. Ansiedade, estresse, privação de sono, uso de substâncias e condições físicas podem se misturar."
          }
        ]
      },
      {
        "heading": "Não é a quantidade de assuntos que define o quadro",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A avaliação considera há quanto tempo isso acontece, quanto controle a pessoa sente que perdeu e o impacto na rotina, no sono, nas relações e nas decisões."
          },
          {
            "kind": "paragraph",
            "text": "Pânico, ansiedade social, fobias e agorafobia têm características próprias e são explicados em outros conteúdos."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Quais assuntos a preocupação costuma percorrer?",
          "O que você faz para obter certeza?",
          "Quanto tempo o alívio dura?",
          "Há uma decisão possível ou a mente está repetindo a mesma pergunta?",
          "O que ficou parado enquanto você tentava prever tudo?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "WHO_ANXIETY_DISORDERS",
      "NICE_CG113"
    ],
    "relatedSlugs": [
      "panico",
      "ansiedade-social",
      "fobias-especificas-e-agorafobia"
    ]
  },
  {
    "slug": "panico",
    "title": "Ataques de pânico e transtorno do pânico",
    "summary": "Um ataque de pânico é uma onda intensa de medo e sintomas físicos. Um episódio isolado não confirma transtorno do pânico.",
    "category": "Condições e transtornos",
    "keywords": [
      "pânico",
      "ataque de pânico",
      "falta de ar",
      "coração acelerado",
      "medo de morrer"
    ],
    "sections": [
      {
        "heading": "Quando o sistema de alarme dispara",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Durante um ataque de pânico, podem aparecer:"
          },
          {
            "kind": "bullets",
            "items": [
              "coração acelerado;",
              "falta de ar;",
              "tontura;",
              "tremor;",
              "calor;",
              "náusea;",
              "sensação de irrealidade;",
              "medo de morrer;",
              "medo de desmaiar;",
              "medo de perder o controle."
            ]
          },
          {
            "kind": "paragraph",
            "text": "A intensidade pode crescer rapidamente. Mesmo sendo assustador, o pico tende a passar."
          }
        ]
      },
      {
        "heading": "O medo das sensações",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Depois de um episódio, a pessoa pode começar a monitorar o corpo."
          },
          {
            "kind": "paragraph",
            "text": "Um aumento comum dos batimentos ao subir uma escada pode ser interpretado como sinal de outro ataque."
          },
          {
            "kind": "paragraph",
            "text": "A sequência pode ficar assim:"
          },
          {
            "kind": "steps",
            "items": [
              "sensação física;",
              "interpretação de perigo;",
              "aumento do medo;",
              "aumento dos sintomas;",
              "tentativa de escapar."
            ]
          }
        ]
      },
      {
        "heading": "Um ataque não define o diagnóstico",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Ataques de pânico podem ocorrer:"
          },
          {
            "kind": "bullets",
            "items": [
              "em outros transtornos;",
              "em situações específicas;",
              "com uso de substâncias;",
              "em algumas condições médicas."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Sintomas novos, muito diferentes ou sem avaliação prévia precisam ser examinados por um profissional de saúde."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Se ocorrer um episódio, anote depois:"
      },
      {
        "kind": "bullets",
        "items": [
          "qual sensação apareceu primeiro;",
          "o que você concluiu sobre ela;",
          "o que fez para se proteger;",
          "quanto tempo levou para a intensidade diminuir;",
          "o que começou a evitar após o episódio."
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_CG113",
      "NIMH_TOPICS"
    ],
    "relatedSlugs": [
      "fobias-especificas-e-agorafobia"
    ]
  },
  {
    "slug": "ansiedade-social",
    "title": "Ansiedade social",
    "summary": "Ansiedade social envolve medo persistente de avaliação, constrangimento ou rejeição em situações sociais.",
    "category": "Condições e transtornos",
    "keywords": [
      "ansiedade social",
      "vergonha",
      "julgamento",
      "interação",
      "apresentação",
      "rejeição"
    ],
    "sections": [
      {
        "heading": "A atenção fica presa em como você está sendo visto",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Antes ou durante uma interação, podem aparecer pensamentos como:"
          },
          {
            "kind": "bullets",
            "items": [
              "“Minha voz está estranha.”",
              "“Não sei o que dizer.”",
              "“Vão perceber que estou nervoso.”",
              "“Vou parecer ridículo.”",
              "“Já estraguei a conversa.”"
            ]
          },
          {
            "kind": "paragraph",
            "text": "A pessoa passa a monitorar o próprio corpo e comportamento enquanto tenta acompanhar o que está acontecendo."
          }
        ]
      },
      {
        "heading": "Formas de se proteger",
        "blocks": [
          {
            "kind": "bullets",
            "items": [
              "ensaiar frases por muito tempo;",
              "evitar contato visual;",
              "falar pouco;",
              "não discordar;",
              "ficar perto apenas de alguém conhecido;",
              "usar álcool para conseguir interagir;",
              "cancelar compromissos;",
              "revisar a conversa depois por horas."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Essas estratégias reduzem a exposição, mas também impedem que novas experiências contrariem as previsões."
          }
        ]
      },
      {
        "heading": "Timidez e introversão não são diagnósticos",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Preferir poucos contatos, precisar de tempo sozinho ou sentir nervosismo em situações específicas não confirma ansiedade social."
          },
          {
            "kind": "paragraph",
            "text": "A questão principal é o sofrimento e o quanto a vida fica limitada."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "paragraph",
        "text": "Antes, durante e depois de uma interação:"
      },
      {
        "kind": "bullets",
        "items": [
          "Onde sua atenção ficou?",
          "Que previsão fez?",
          "O que tentou esconder?",
          "Que comportamento usou para se proteger?",
          "O que de fato aconteceu?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_CG159",
      "NIMH_TOPICS"
    ]
  },
  {
    "slug": "depressao",
    "title": "Depressão",
    "summary": "Depressão envolve mudanças persistentes de humor, interesse, energia, pensamentos e funcionamento. Não é apenas tristeza.",
    "category": "Condições e transtornos",
    "keywords": [
      "depressão",
      "desânimo",
      "perda de interesse",
      "energia",
      "culpa",
      "isolamento"
    ],
    "sections": [
      {
        "heading": "A pessoa pode continuar funcionando e ainda estar muito mal",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Depressão pode aparecer como:"
          },
          {
            "kind": "bullets",
            "items": [
              "tristeza;",
              "vazio;",
              "irritabilidade;",
              "perda de interesse;",
              "cansaço;",
              "dificuldade de concentração;",
              "culpa;",
              "desesperança;",
              "mudanças no sono e no apetite;",
              "lentificação ou agitação."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Algumas pessoas continuam trabalhando e conversando, mas fazem tudo com esforço muito maior."
          }
        ]
      },
      {
        "heading": "O afastamento pode piorar o quadro",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Quando a energia cai, atividades e contatos costumam diminuir."
          },
          {
            "kind": "paragraph",
            "text": "Com menos experiências de prazer, avanço ou conexão, a vida fica mais estreita. A sensação de incapacidade pode aumentar."
          },
          {
            "kind": "paragraph",
            "text": "Isso não significa que a pessoa escolheu ficar assim. Mostra um ciclo que pode ser trabalhado."
          }
        ]
      },
      {
        "heading": "Um sintoma isolado não fecha o quadro",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Cansaço, insônia e desânimo podem ter várias causas."
          },
          {
            "kind": "paragraph",
            "text": "A avaliação considera:"
          },
          {
            "kind": "bullets",
            "items": [
              "conjunto;",
              "duração;",
              "intensidade;",
              "história;",
              "impacto;",
              "condições de saúde;",
              "uso de substâncias;",
              "períodos anteriores de humor muito elevado ou energia incomum."
            ]
          }
        ]
      },
      {
        "heading": "Quando procurar ajuda rapidamente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Pensamentos de morte, risco de se machucar, desesperança intensa ou incapacidade de manter cuidados básicos exigem ajuda imediata."
          },
          {
            "kind": "paragraph",
            "text": "Este portal não é monitorado em tempo real. Em risco imediato, procure um serviço de emergência da sua região ou ligue 192."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "O que mudou em seu interesse?",
          "Quais atividades foram abandonadas?",
          "Como estão sono, energia e apetite?",
          "Em quais horários ou situações o peso diminui, mesmo que pouco?",
          "Que pensamentos aparecem quando você tenta fazer algo?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_NG222",
      "WHO_MENTAL_DISORDERS_2025",
      "NIMH_TOPICS"
    ],
    "safety": ""
  },
  {
    "slug": "tdah-na-vida-adulta",
    "title": "TDAH na vida adulta",
    "summary": "TDAH é uma condição do neurodesenvolvimento que pode afetar atenção, organização, controle de impulsos e a capacidade de manter informações em mente durante uma tarefa.",
    "category": "Condições e transtornos",
    "keywords": [
      "TDAH",
      "atenção",
      "impulsividade",
      "organização",
      "memória de trabalho",
      "função executiva",
      "hiperatividade"
    ],
    "sections": [
      {
        "heading": "Atenção não é simplesmente ter ou não ter foco",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Uma pessoa pode permanecer horas em uma atividade muito estimulante e, ainda assim, ter grande dificuldade para começar tarefas repetitivas ou pouco claras."
          },
          {
            "kind": "paragraph",
            "text": "No TDAH, podem aparecer dificuldades em:"
          },
          {
            "kind": "bullets",
            "items": [
              "iniciar;",
              "manter sequência;",
              "perceber o tempo;",
              "manter em mente as etapas enquanto realiza uma tarefa;",
              "organizar materiais;",
              "interromper impulsos;",
              "retomar depois de uma distração;",
              "regular a atenção conforme a importância da tarefa."
            ]
          }
        ]
      },
      {
        "heading": "Hiperatividade pode não ser visível",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Na vida adulta, pode aparecer como:"
          },
          {
            "kind": "bullets",
            "items": [
              "inquietação interna;",
              "necessidade constante de estímulo;",
              "dificuldade de desacelerar;",
              "fala acelerada;",
              "impaciência;",
              "mudança frequente de atividade;",
              "sensação de estar sempre “ligado”."
            ]
          }
        ]
      },
      {
        "heading": "História e contexto fazem diferença",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Ansiedade, depressão, privação de sono, estresse e uso de substâncias também podem afetar atenção e organização."
          },
          {
            "kind": "paragraph",
            "text": "A avaliação procura entender:"
          },
          {
            "kind": "bullets",
            "items": [
              "quando as dificuldades começaram;",
              "em quais contextos aparecem;",
              "como interferem;",
              "quais outras explicações precisam ser consideradas."
            ]
          }
        ]
      },
      {
        "heading": "Estratégias externas costumam ajudar",
        "blocks": [
          {
            "kind": "bullets",
            "items": [
              "lembretes;",
              "divisão da tarefa;",
              "redução de etapas;",
              "ambientes com menos distração;",
              "prazos claros;",
              "objetos sempre no mesmo lugar;",
              "instruções visíveis;",
              "acompanhamento médico quando indicado."
            ]
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Em quais tarefas você perde o início?",
          "Onde perde a sequência?",
          "O que faz o tempo desaparecer?",
          "O que facilita: interesse, urgência, companhia, prazo ou ambiente?",
          "O que funciona por alguns dias e depois é abandonado?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_NG87",
      "BR_PCDT_TDAH",
      "NIMH_TOPICS"
    ]
  },
  {
    "slug": "autismo-na-vida-adulta",
    "title": "Autismo na vida adulta",
    "summary": "Autismo é uma condição do neurodesenvolvimento relacionada a diferenças na comunicação, na interação, na previsibilidade e no processamento sensorial.",
    "category": "Condições e transtornos",
    "keywords": [
      "autismo",
      "TEA",
      "comunicação",
      "sensorial",
      "rotina",
      "interesse intenso",
      "mascaramento"
    ],
    "sections": [
      {
        "heading": "Existem diferentes formas de perceber e responder ao ambiente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Pessoas autistas podem ter diferenças em:"
          },
          {
            "kind": "bullets",
            "items": [
              "comunicação social;",
              "leitura de sinais implícitos;",
              "necessidade de previsibilidade;",
              "interesses intensos;",
              "movimentos repetitivos;",
              "sensibilidade a sons, luzes, texturas ou cheiros;",
              "organização da rotina;",
              "recuperação após situações sociais."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Duas pessoas autistas podem ter necessidades, facilidades e formas de comunicação bastante diferentes."
          }
        ]
      },
      {
        "heading": "O esforço social pode ficar invisível",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Alguns adultos aprendem a:"
          },
          {
            "kind": "bullets",
            "items": [
              "ensaiar respostas;",
              "observar e imitar comportamentos;",
              "controlar movimentos;",
              "esconder desconforto;",
              "preparar conversas;",
              "permanecer em ambientes que geram sobrecarga."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Esse processo pode facilitar certas situações e, ao mesmo tempo, causar cansaço intenso."
          }
        ]
      },
      {
        "heading": "Autismo não é uma doença a ser curada",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "O cuidado não deve tentar apagar características autistas."
          },
          {
            "kind": "paragraph",
            "text": "O foco pode estar em:"
          },
          {
            "kind": "bullets",
            "items": [
              "compreender necessidades;",
              "melhorar a comunicação;",
              "reduzir sofrimento;",
              "adaptar ambientes;",
              "construir rotina possível;",
              "ampliar autonomia;",
              "reconhecer limites sensoriais e sociais."
            ]
          }
        ]
      },
      {
        "heading": "Avaliação",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Preferir rotina, ter interesses intensos ou sentir dificuldade social não basta para concluir autismo."
          },
          {
            "kind": "paragraph",
            "text": "A avaliação considera desenvolvimento, funcionamento atual, contexto e outras possíveis explicações."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Quais situações exigem mais esforço?",
          "O que costuma provocar sobrecarga?",
          "Como você percebe que está chegando ao limite?",
          "Que adaptações ajudam?",
          "O que você faz apenas para parecer confortável quando não está?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_CG142",
      "BR_DIRETRIZ_TEA",
      "BR_MS_AUTISMO",
      "NIMH_TOPICS"
    ]
  },
  {
    "slug": "toc",
    "title": "Transtorno obsessivo-compulsivo — TOC",
    "summary": "No TOC, pensamentos, imagens ou impulsos indesejados geram sofrimento e levam a rituais ou estratégias para reduzir a dúvida.",
    "category": "Condições e transtornos",
    "keywords": [
      "TOC",
      "obsessão",
      "compulsão",
      "ritual",
      "dúvida",
      "pensamento intrusivo",
      "checagem"
    ],
    "sections": [
      {
        "heading": "Obsessão e compulsão não são a mesma coisa",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Obsessões podem ser:"
          },
          {
            "kind": "bullets",
            "items": [
              "pensamentos;",
              "imagens;",
              "dúvidas;",
              "impulsos;",
              "sensações de que algo está incompleto."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Compulsões são ações ou rituais mentais usados para aliviar a ansiedade ou impedir algo temido."
          },
          {
            "kind": "paragraph",
            "text": "Exemplos:"
          },
          {
            "kind": "bullets",
            "items": [
              "conferir;",
              "lavar;",
              "repetir;",
              "organizar;",
              "pedir garantia;",
              "revisar mentalmente;",
              "neutralizar um pensamento;",
              "buscar certeza total."
            ]
          }
        ]
      },
      {
        "heading": "Pensamento intrusivo não é intenção",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Conteúdos agressivos, sexuais, religiosos ou moralmente desconfortáveis podem aparecer justamente por entrarem em conflito com os valores da pessoa."
          },
          {
            "kind": "paragraph",
            "text": "Pensar não é desejar.\nPensar não é fazer.\nA presença desse conteúdo, por si só, não prova intenção ou risco."
          }
        ]
      },
      {
        "heading": "O ritual alivia e reforça a dúvida",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Quando a compulsão reduz a ansiedade, o cérebro aprende que ela foi necessária."
          },
          {
            "kind": "paragraph",
            "text": "Na próxima vez, a dúvida tende a voltar e pedir outro ritual."
          }
        ]
      },
      {
        "heading": "O que não é TOC",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Gostar de organização, ter preferências ou seguir uma rotina não basta."
          },
          {
            "kind": "paragraph",
            "text": "A avaliação considera:"
          },
          {
            "kind": "bullets",
            "items": [
              "sofrimento;",
              "tempo gasto;",
              "rituais;",
              "evitação;",
              "interferência no cotidiano."
            ]
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Qual dúvida aparece?",
          "O que você faz para aliviar?",
          "Quanto tempo o alívio dura?",
          "O ritual aumenta ou diminui com o tempo?",
          "O que você teme que aconteça se não fizer?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_CG31",
      "NIMH_TOPICS"
    ]
  },
  {
    "slug": "transtorno-bipolar",
    "title": "Transtorno bipolar",
    "summary": "Transtorno bipolar envolve episódios de alteração marcante do humor, da energia e da atividade. Não é o mesmo que mudar de humor ao longo do dia.",
    "category": "Condições e transtornos",
    "keywords": [
      "bipolaridade",
      "mania",
      "hipomania",
      "depressão",
      "energia",
      "sono",
      "impulsividade"
    ],
    "sections": [
      {
        "heading": "O ponto central é a mudança em relação ao padrão habitual",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "No transtorno bipolar, podem ocorrer episódios depressivos e episódios de mania ou hipomania."
          },
          {
            "kind": "paragraph",
            "text": "Durante mania ou hipomania, podem aparecer:"
          },
          {
            "kind": "bullets",
            "items": [
              "aumento incomum de energia;",
              "redução da necessidade de sono;",
              "aceleração dos pensamentos;",
              "fala aumentada;",
              "irritabilidade;",
              "confiança muito acima do padrão;",
              "aumento de atividades;",
              "gastos;",
              "decisões impulsivas;",
              "busca de risco."
            ]
          },
          {
            "kind": "paragraph",
            "text": "A duração, a intensidade e o prejuízo ajudam a diferenciar esses episódios de oscilações comuns."
          }
        ]
      },
      {
        "heading": "Mania e hipomania não são apenas “estar feliz”",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Na hipomania, a mudança é clara, mas costuma ser menos intensa. Na mania, o prejuízo pode ser grave, com perda de julgamento, necessidade de atendimento urgente ou sintomas psicóticos."
          },
          {
            "kind": "paragraph",
            "text": "A elevação também pode aparecer como:"
          },
          {
            "kind": "bullets",
            "items": [
              "irritabilidade;",
              "agitação;",
              "produtividade difícil de interromper;",
              "sensação de urgência;",
              "conflitos;",
              "perda de julgamento."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Por isso, observar apenas se a pessoa parecia animada não é suficiente."
          }
        ]
      },
      {
        "heading": "É preciso olhar o padrão ao longo do tempo",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "TDAH, uso de substâncias, privação de sono, ansiedade e outros quadros podem produzir sinais parecidos."
          },
          {
            "kind": "paragraph",
            "text": "Por isso, é necessário olhar para:"
          },
          {
            "kind": "bullets",
            "items": [
              "períodos;",
              "mudanças;",
              "sono;",
              "energia;",
              "funcionamento;",
              "histórico ao longo do tempo."
            ]
          }
        ]
      },
      {
        "heading": "O cuidado costuma ser combinado",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Avaliação e acompanhamento médico, geralmente psiquiátrico, são parte central do cuidado. A psicoterapia pode ajudar a reconhecer padrões, proteger o sono, organizar a rotina e lidar com consequências."
          }
        ]
      },
      {
        "heading": "Quando procurar ajuda rapidamente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Redução acentuada da necessidade de sono, aceleração intensa, perda de julgamento, psicose, riscos fora do padrão ou autoagressão exigem avaliação rápida."
          },
          {
            "kind": "paragraph",
            "text": "O portal não é monitorado em tempo real."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Seu sono mudou?",
          "Sua energia está diferente do habitual?",
          "Houve aumento de impulsividade?",
          "Outras pessoas perceberam uma mudança?",
          "Você está assumindo riscos que normalmente não assumiria?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_CG185",
      "BR_PCDT_BIPOLAR_I",
      "NIMH_TOPICS"
    ],
    "safety": ""
  },
  {
    "slug": "trauma-e-tept",
    "title": "Trauma e transtorno de estresse pós-traumático — TEPT",
    "summary": "Depois de uma experiência traumática, algumas reações são esperadas. No TEPT, elas persistem e passam a afetar de forma importante a vida.",
    "category": "Condições e transtornos",
    "keywords": [
      "trauma",
      "TEPT",
      "memória",
      "pesadelo",
      "hipervigilância",
      "evitação"
    ],
    "sections": [
      {
        "heading": "O perigo pode ter passado e o corpo continuar reagindo",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Depois de uma experiência ameaçadora ou muito perturbadora, podem aparecer:"
          },
          {
            "kind": "bullets",
            "items": [
              "medo;",
              "imagens;",
              "sonhos;",
              "irritabilidade;",
              "alerta aumentado;",
              "dificuldade para dormir;",
              "vontade de evitar lembranças."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Em muitas pessoas, essas reações diminuem com tempo e apoio."
          }
        ]
      },
      {
        "heading": "Quando as lembranças parecem acontecer no presente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Um cheiro, som, lugar ou situação pode ativar a sensação de que o perigo voltou."
          },
          {
            "kind": "paragraph",
            "text": "A pessoa pode saber racionalmente onde está e, ainda assim, sentir o corpo reagir como se estivesse novamente na situação."
          }
        ]
      },
      {
        "heading": "TEPT não é qualquer sofrimento após uma experiência difícil",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A avaliação considera:"
          },
          {
            "kind": "bullets",
            "items": [
              "tipo de evento;",
              "sintomas;",
              "duração;",
              "impacto;",
              "evitação;",
              "outras condições."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Não é necessário contar todos os detalhes para que uma experiência seja levada a sério."
          }
        ]
      },
      {
        "heading": "Tratamentos focados em trauma precisam de segurança",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Trabalhar memórias traumáticas pode ajudar, mas isso precisa acontecer com planejamento."
          },
          {
            "kind": "paragraph",
            "text": "Este conteúdo não orienta a pessoa a se expor sozinha a lembranças intensas."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Quais situações ativam alerta?",
          "O que você evita?",
          "Como percebe que está no presente?",
          "O que ajuda você a perceber que está aqui e agora?",
          "Que nível de detalhe você consegue levar para a sessão sem se sobrecarregar?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_NG116",
      "NIMH_TOPICS"
    ],
    "relatedSlugs": [
      "dissociacao-despersonalizacao-e-desrealizacao"
    ]
  },
  {
    "slug": "dissociacao-despersonalizacao-e-desrealizacao",
    "title": "Dissociação, despersonalização e desrealização",
    "summary": "Algumas pessoas sentem distância de si, do corpo, das lembranças ou do ambiente. Essas experiências podem ser assustadoras e têm diferentes possíveis causas.",
    "category": "Condições e transtornos",
    "keywords": [
      "dissociação",
      "despersonalização",
      "desrealização",
      "irrealidade",
      "memória",
      "desligamento",
      "trauma"
    ],
    "sections": [
      {
        "heading": "O que pode ser sentido",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Na despersonalização, a pessoa pode sentir distância de si, do corpo ou das próprias ações."
          },
          {
            "kind": "paragraph",
            "text": "Na desrealização, o ambiente pode parecer estranho, distante, artificial ou “como um sonho”."
          },
          {
            "kind": "paragraph",
            "text": "Também podem ocorrer:"
          },
          {
            "kind": "bullets",
            "items": [
              "sensação de funcionar no automático;",
              "dificuldade de se conectar ao que está sentindo;",
              "partes da experiência parecerem borradas;",
              "falhas de memória maiores do que um esquecimento comum;",
              "percepção diferente da passagem do tempo."
            ]
          }
        ]
      },
      {
        "heading": "Uma experiência breve não define um transtorno",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Muitas pessoas já ficaram tão absorvidas em uma atividade que perderam a noção do tempo."
          },
          {
            "kind": "paragraph",
            "text": "Experiências dissociativas clinicamente relevantes tendem a ser mais intensas, recorrentes ou acompanhadas de sofrimento e prejuízo."
          },
          {
            "kind": "paragraph",
            "text": "Elas podem aparecer junto de:"
          },
          {
            "kind": "bullets",
            "items": [
              "trauma;",
              "ansiedade intensa;",
              "ataques de pânico;",
              "sobrecarga;",
              "privação de sono;",
              "uso de substâncias;",
              "algumas condições físicas ou neurológicas."
            ]
          }
        ]
      },
      {
        "heading": "Isso é o mesmo que psicose?",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Não necessariamente."
          },
          {
            "kind": "paragraph",
            "text": "Na despersonalização e na desrealização, muitas pessoas reconhecem que a experiência parece estranha, mesmo sem conseguir fazê-la parar. Na psicose, podem existir alterações diferentes na percepção, nas crenças e na organização do pensamento."
          },
          {
            "kind": "paragraph",
            "text": "Essa distinção não deve ser feita sozinho quando os sinais são intensos ou novos."
          }
        ]
      },
      {
        "heading": "Voltar ao presente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Em momentos leves, pode ajudar:"
          },
          {
            "kind": "bullets",
            "items": [
              "dizer em voz baixa onde você está e a data;",
              "sentir os pés apoiados;",
              "observar objetos e descrevê-los;",
              "notar temperatura, sons e texturas;",
              "reduzir estímulos;",
              "procurar uma pessoa de confiança."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Isso não substitui avaliação e não deve ser usado para forçar contato com lembranças traumáticas."
          }
        ]
      },
      {
        "heading": "Quando procurar avaliação rápida",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Confusão súbita, perda de consciência, sinais neurológicos, episódio após ferimento na cabeça, intoxicação, perda extensa de memória ou risco exigem avaliação médica."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "O que estava acontecendo antes da sensação?",
          "Quanto tempo durou?",
          "Você reconhecia onde estava?",
          "Houve mudança no sono, no uso de substâncias ou no estresse?",
          "O que ajudou a recuperar presença?",
          "Existem lacunas de memória que afetam sua segurança ou rotina?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_NG116"
    ],
    "relatedSlugs": [
      "trauma-e-tept",
      "panico",
      "psicose-e-esquizofrenia"
    ]
  },
  {
    "slug": "fobias-especificas-e-agorafobia",
    "title": "Fobias específicas e agorafobia",
    "summary": "Algumas situações ou objetos despertam medo intenso e passam a ser evitados. Na agorafobia, o medo costuma envolver dificuldade de escapar ou receber ajuda.",
    "category": "Condições e transtornos",
    "keywords": [
      "fobia",
      "agorafobia",
      "medo",
      "evitação",
      "transporte",
      "multidão",
      "sair sozinho"
    ],
    "sections": [
      {
        "heading": "Medo e fobia não são a mesma coisa",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Medo ajuda a evitar perigos."
          },
          {
            "kind": "paragraph",
            "text": "Em uma fobia específica, um objeto ou situação provoca medo intenso e persistente, mesmo quando o risco real não explica toda a reação."
          },
          {
            "kind": "paragraph",
            "text": "Exemplos podem envolver:"
          },
          {
            "kind": "bullets",
            "items": [
              "animais;",
              "sangue ou procedimentos;",
              "altura;",
              "avião;",
              "tempestade;",
              "dirigir;",
              "ambientes fechados."
            ]
          }
        ]
      },
      {
        "heading": "Na agorafobia, a preocupação costuma ser outra",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "O medo pode aparecer em situações nas quais escapar ou receber ajuda parece difícil."
          },
          {
            "kind": "paragraph",
            "text": "Isso pode incluir:"
          },
          {
            "kind": "bullets",
            "items": [
              "transporte público;",
              "filas;",
              "multidões;",
              "espaços abertos;",
              "lugares fechados;",
              "sair de casa sozinho;",
              "permanecer longe de um local considerado seguro."
            ]
          },
          {
            "kind": "paragraph",
            "text": "A pessoa pode temer pânico, desmaio, perda de controle ou não conseguir voltar para casa."
          }
        ]
      },
      {
        "heading": "A vida pode ficar cada vez menor",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Evitar traz alívio rápido."
          },
          {
            "kind": "paragraph",
            "text": "Com o tempo, podem surgir regras:"
          },
          {
            "kind": "bullets",
            "items": [
              "sair apenas acompanhado;",
              "permanecer perto de portas;",
              "levar objetos de segurança;",
              "escolher sempre rotas de fuga;",
              "cancelar;",
              "restringir distâncias;",
              "não permanecer em lugares sem banheiro ou atendimento próximo."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Pânico e agorafobia podem aparecer juntos, mas não são a mesma coisa."
          }
        ]
      },
      {
        "heading": "Enfrentamento não significa exposição brusca",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "O trabalho costuma ser gradual e planejado."
          },
          {
            "kind": "paragraph",
            "text": "Forçar uma situação muito intensa pode aumentar medo e abandono da tentativa. O objetivo é reduzir evitação e testar previsões em passos possíveis."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "O que você evita?",
          "O que teme que aconteça?",
          "O medo está ligado ao objeto ou à dificuldade de escapar?",
          "Quais condições de segurança você exige para conseguir permanecer?",
          "Até onde sua rotina foi reduzida?",
          "Qual seria um primeiro passo pequeno e planejado?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "WHO_ANXIETY_DISORDERS",
      "NICE_CG113"
    ]
  },
  {
    "slug": "transtornos-alimentares",
    "title": "Transtornos alimentares",
    "summary": "Transtornos alimentares envolvem padrões persistentes de alimentação, imagem corporal e controle que podem causar sofrimento e risco físico.",
    "category": "Condições e transtornos",
    "keywords": [
      "transtorno alimentar",
      "anorexia",
      "bulimia",
      "compulsão alimentar",
      "imagem corporal",
      "restrição"
    ],
    "sections": [
      {
        "heading": "A aparência não mostra sozinha a gravidade",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Transtornos alimentares podem ocorrer em pessoas de diferentes:"
          },
          {
            "kind": "bullets",
            "items": [
              "corpos;",
              "pesos;",
              "idades;",
              "gêneros."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Podem envolver:"
          },
          {
            "kind": "bullets",
            "items": [
              "restrição;",
              "compulsões;",
              "comportamentos compensatórios;",
              "medo de ganhar peso;",
              "regras rígidas;",
              "preocupação intensa com o corpo;",
              "culpa após comer."
            ]
          }
        ]
      },
      {
        "heading": "Não é falta de disciplina",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "O comportamento alimentar pode se relacionar a:"
          },
          {
            "kind": "bullets",
            "items": [
              "ansiedade;",
              "vergonha;",
              "necessidade de controle;",
              "perfeccionismo;",
              "regulação emocional;",
              "fatores biológicos e sociais."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Segredo e culpa costumam dificultar a busca de ajuda."
          }
        ]
      },
      {
        "heading": "A saúde física também precisa ser observada",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Desmaios, fraqueza intensa, desidratação, vômitos frequentes, dor no peito ou outros sinais físicos precisam de avaliação médica."
          },
          {
            "kind": "paragraph",
            "text": "O cuidado pode envolver psicoterapia, acompanhamento médico, nutricional e psiquiátrico, conforme a necessidade."
          }
        ]
      },
      {
        "heading": "O registro não deve virar punição",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Anotar pode ajudar a entender situações e emoções."
          },
          {
            "kind": "paragraph",
            "text": "Não use o portal como sistema de vigilância de:"
          },
          {
            "kind": "bullets",
            "items": [
              "calorias;",
              "peso;",
              "compensações;",
              "metas punitivas."
            ]
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Que regras aparecem antes de comer?",
          "O que acontece emocionalmente antes e depois?",
          "Existe medo de perder o controle?",
          "O que você tenta evitar ou corrigir?",
          "O comportamento fica escondido de outras pessoas?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_NG69",
      "NIMH_EATING"
    ],
    "safety": "Desmaio, confusão, fraqueza intensa, desidratação, dor no peito, vômitos frequentes ou incapacidade de manter alimentação e hidratação exigem avaliação médica rápida."
  },
  {
    "slug": "uso-problematico-de-substancias",
    "title": "Uso problemático de álcool e outras substâncias",
    "summary": "O uso se torna problemático quando aumenta riscos, causa prejuízos ou fica difícil reduzir, apesar das consequências.",
    "category": "Condições e transtornos",
    "keywords": [
      "álcool",
      "maconha",
      "droga",
      "substância",
      "dependência",
      "uso problemático",
      "abstinência"
    ],
    "sections": [
      {
        "heading": "O problema não é definido apenas pela quantidade",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Alguns sinais de atenção:"
          },
          {
            "kind": "bullets",
            "items": [
              "usar mais do que pretendia;",
              "tentar reduzir e não conseguir;",
              "assumir riscos;",
              "abandonar responsabilidades;",
              "esconder o uso;",
              "continuar apesar dos danos;",
              "sentir fissura;",
              "precisar de mais para obter o mesmo efeito;",
              "apresentar abstinência."
            ]
          },
          {
            "kind": "paragraph",
            "text": "O contexto e as consequências são fundamentais."
          }
        ]
      },
      {
        "heading": "A substância costuma cumprir uma função",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Pode ser usada para:"
          },
          {
            "kind": "bullets",
            "items": [
              "dormir;",
              "socializar;",
              "reduzir ansiedade;",
              "fugir de emoções;",
              "aumentar energia;",
              "diminuir vergonha;",
              "interromper pensamentos."
            ]
          },
          {
            "kind": "paragraph",
            "text": "O alívio imediato pode esconder o custo posterior."
          }
        ]
      },
      {
        "heading": "Não é uma questão moral",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Uso problemático envolve aprendizagem, contexto, corpo, disponibilidade e saúde mental."
          },
          {
            "kind": "paragraph",
            "text": "Vergonha e julgamento costumam afastar a pessoa do cuidado."
          }
        ]
      },
      {
        "heading": "Cuidado com retirada abrupta",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A interrupção de algumas substâncias, principalmente após uso frequente ou intenso, pode exigir acompanhamento médico."
          },
          {
            "kind": "paragraph",
            "text": "Este conteúdo não orienta redução, dose ou interrupção específica."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "O que você espera sentir ou deixar de sentir ao usar?",
          "O que acontece antes?",
          "O que acontece depois?",
          "Houve consequência que você minimizou?",
          "Você está escondendo alguma parte do padrão?",
          "O uso aumentou em situações específicas?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NIMH_SUBSTANCE",
      "WHO_MENTAL_DISORDERS_2025"
    ],
    "safety": "Perda de consciência, dificuldade para respirar, convulsão, confusão intensa, suspeita de overdose, intoxicação ou abstinência grave exigem atendimento imediato.",
    "relatedSlugs": [
      "sono-e-saude-mental",
      "ansiedade-generalizada-e-preocupacao-excessiva",
      "psicose-e-esquizofrenia"
    ]
  },
  {
    "slug": "psicose-e-esquizofrenia",
    "title": "Psicose e esquizofrenia",
    "summary": "Psicose pode envolver mudanças na percepção, nas crenças e na organização do pensamento. Avaliação precoce pode reduzir sofrimento e prejuízo.",
    "category": "Condições e transtornos",
    "keywords": [
      "psicose",
      "esquizofrenia",
      "alucinação",
      "delírio",
      "pensamento desorganizado",
      "percepção"
    ],
    "sections": [
      {
        "heading": "Psicose não é um diagnóstico único",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Durante uma psicose, a pessoa pode:"
          },
          {
            "kind": "bullets",
            "items": [
              "ouvir ou perceber coisas que outras pessoas não percebem;",
              "formar convicções muito difíceis de revisar;",
              "apresentar pensamento desorganizado;",
              "agir de maneira incomum ou difícil de compreender;",
              "ter dificuldade para distinguir certas experiências internas do que está acontecendo ao redor."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Na esquizofrenia, além dessas experiências, também podem aparecer redução da iniciativa, expressão emocional mais limitada, isolamento e dificuldades de atenção ou organização."
          },
          {
            "kind": "paragraph",
            "text": "Sintomas psicóticos podem ocorrer em:"
          },
          {
            "kind": "bullets",
            "items": [
              "esquizofrenia;",
              "transtornos do humor;",
              "uso de substâncias;",
              "algumas condições médicas;",
              "outros quadros."
            ]
          }
        ]
      },
      {
        "heading": "Psicose não significa violência",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "A associação automática entre psicose e perigo aumenta estigma."
          },
          {
            "kind": "paragraph",
            "text": "Muitas pessoas com sintomas psicóticos estão mais vulneráveis a sofrer violência do que a praticá-la."
          }
        ]
      },
      {
        "heading": "Como conversar sem aumentar o conflito",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Ridicularizar ou confrontar de forma agressiva pode aumentar distância e medo."
          },
          {
            "kind": "paragraph",
            "text": "É possível reconhecer o sofrimento sem confirmar uma explicação:"
          },
          {
            "kind": "quote",
            "text": "“Percebo que isso está sendo assustador para você.”"
          }
        ]
      },
      {
        "heading": "Avaliação e cuidado",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Avaliação médica e psiquiátrica é necessária."
          },
          {
            "kind": "paragraph",
            "text": "Psicoterapia, apoio familiar, rotina e acompanhamento multiprofissional podem fazer parte do cuidado."
          }
        ]
      },
      {
        "heading": "Quando procurar ajuda rapidamente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Confusão intensa, incapacidade de manter cuidados básicos, comportamento muito desorganizado, risco, agitação grave ou comandos para se ferir exigem ajuda imediata."
          },
          {
            "kind": "paragraph",
            "text": "O portal não é monitorado em tempo real."
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Quando os sinais começaram?",
          "Houve mudança no sono?",
          "Houve uso de substâncias?",
          "A pessoa está mais isolada?",
          "O funcionamento mudou?",
          "Existe medo intenso ou dificuldade de cuidar de si?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NICE_CG178",
      "BR_PCDT_ESQUIZOFRENIA",
      "NIMH_TOPICS"
    ],
    "safety": ""
  },
  {
    "slug": "transtorno-personalidade-borderline",
    "title": "Padrões de personalidade e padrão borderline",
    "summary": "Alguns padrões de sentir, interpretar e se relacionar podem ficar rígidos e trazer sofrimento. O padrão borderline costuma envolver intensidade emocional, medo de abandono e impulsividade.",
    "category": "Condições e transtornos",
    "keywords": [
      "borderline",
      "personalidade",
      "abandono",
      "instabilidade emocional",
      "impulsividade",
      "autoagressão"
    ],
    "sections": [
      {
        "heading": "O que são padrões de personalidade",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Todas as pessoas desenvolvem formas habituais de perceber situações, lidar com emoções e se relacionar."
          },
          {
            "kind": "paragraph",
            "text": "Esses padrões podem se tornar um problema quando ficam muito rígidos, aparecem em vários contextos e dificultam relações, decisões, identidade ou segurança."
          },
          {
            "kind": "paragraph",
            "text": "A avaliação não procura apenas uma lista de características. Ela observa a história, a intensidade, o funcionamento e o que se repete ao longo do tempo."
          }
        ]
      },
      {
        "heading": "No padrão borderline, as relações podem ativar emoções rapidamente",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Uma demora, mudança de tom, discordância ou afastamento pode ser vivido como sinal de rejeição ou abandono."
          },
          {
            "kind": "paragraph",
            "text": "Podem aparecer:"
          },
          {
            "kind": "bullets",
            "items": [
              "medo intenso de perder a relação;",
              "raiva;",
              "desespero;",
              "sensação de vazio;",
              "impulsividade;",
              "mudança rápida na forma de perceber a si ou a outra pessoa;",
              "tentativas urgentes de recuperar proximidade;",
              "afastamento antes de ser abandonado;",
              "autoagressão em algumas situações."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Nem todas as pessoas apresentam as mesmas características."
          }
        ]
      },
      {
        "heading": "Não é sinônimo de manipulação",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Uma reação intensa pode tentar reduzir dor, impedir afastamento ou recuperar conexão."
          },
          {
            "kind": "paragraph",
            "text": "Compreender a função de um comportamento não significa concordar com ele nem retirar a responsabilidade pelas consequências. Significa olhar para o que aconteceu sem reduzir a pessoa a um rótulo."
          }
        ]
      },
      {
        "heading": "Outros quadros podem se parecer",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Trauma, TDAH, transtorno bipolar, autismo, depressão e outras condições podem produzir dificuldades semelhantes em alguns momentos."
          },
          {
            "kind": "paragraph",
            "text": "Por isso, o diagnóstico exige cuidado e não deve ser concluído por um texto educativo."
          }
        ]
      },
      {
        "heading": "O cuidado precisa de estrutura",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Psicoterapias estruturadas podem trabalhar:"
          },
          {
            "kind": "bullets",
            "items": [
              "reconhecimento e regulação das emoções;",
              "impulsividade;",
              "relações;",
              "identidade;",
              "tolerância à frustração;",
              "comunicação;",
              "prevenção de autoagressão;",
              "construção de maior estabilidade."
            ]
          }
        ]
      }
    ],
    "observe": [
      {
        "kind": "bullets",
        "items": [
          "Que situações relacionais aumentam a intensidade?",
          "Qual interpretação aparece primeiro?",
          "O que você faz para reduzir a dor?",
          "O alívio dura?",
          "O que acontece com a relação depois?",
          "Existe um padrão de aproximação, urgência e afastamento?"
        ]
      }
    ],
    "references": [
      "CID11_CDDR",
      "NIMH_BORDERLINE",
      "WHO_MENTAL_DISORDERS_2025"
    ],
    "safety": "Ferimento, intenção ou plano de se machucar, tentativa recente ou incapacidade de permanecer em segurança exigem ajuda imediata. Não use o registro esperando resposta.",
    "relatedSlugs": [
      "regulacao-emocional",
      "comunicacao-assertiva-e-limites"
    ]
  }
];

export const educationArticleAliases = {
  "transtornos-de-ansiedade":
    "ansiedade-generalizada-e-preocupacao-excessiva",
} as const;

export function findEducationArticle(
  slug: string | null,
): EducationArticle | null {
  if (!slug) return null;
  const canonicalSlug =
    educationArticleAliases[
      slug as keyof typeof educationArticleAliases
    ] ?? slug;
  return (
    educationArticles.find((article) => article.slug === canonicalSlug) ?? null
  );
}
