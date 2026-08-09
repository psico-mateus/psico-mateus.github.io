/**
 * Catálogo editorial estático do “Meu mapa”.
 *
 * Fonte: Mapa_Pessoal_Gostos_Limites_e_Possibilidades_REFINADO_OURO.xlsx
 * O conteúdo é versionado para manter cada resposta vinculada ao texto que o
 * paciente efetivamente recebeu.
 */

export const PATIENT_MAP_CONTENT_VERSION =
  "mapa-pessoal-refinado-ouro-v1" as const;

export const PATIENT_MAP_RESPONSES = [
  { key: "fits", label: "Combina comigo" },
  { key: "curious", label: "Tenho curiosidade" },
  { key: "contextual", label: "Depende do contexto" },
  { key: "tolerate", label: "Só tolero" },
  { key: "not_fit", label: "Não combina" },
  { key: "unknown", label: "Ainda não sei" },
] as const;

export type PatientMapResponseKey =
  (typeof PATIENT_MAP_RESPONSES)[number]["key"];

export interface PatientMapItem {
  readonly id: string;
  readonly order: number;
  readonly active: boolean;
  readonly localId: string;
  readonly title: string;
  readonly examples: string;
}

export interface PatientMapSection {
  readonly id: string;
  readonly order: number;
  readonly active: boolean;
  readonly localId: string;
  readonly heading: string;
  readonly title: string;
  readonly question: string;
  readonly items: readonly PatientMapItem[];
}

export interface PatientMapDefinition {
  readonly id: string;
  readonly order: number;
  readonly active: boolean;
  readonly number: string;
  readonly navigationTitle: string;
  readonly landingCard: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly modeGuidance: string;
  readonly demonstration: {
    readonly label: string;
    readonly title: string;
    readonly examples: string;
    readonly responseKey: PatientMapResponseKey;
    readonly note: string;
  };
  readonly columnLabels: {
    readonly item: string;
    readonly examples: string;
    readonly response: string;
    readonly note: string;
  };
  readonly sections: readonly PatientMapSection[];
}

export interface PatientMapCatalog {
  readonly contentVersion: typeof PATIENT_MAP_CONTENT_VERSION;
  readonly responses: typeof PATIENT_MAP_RESPONSES;
  readonly landing: {
    readonly eyebrow: string;
    readonly brandMark: string;
    readonly contentsHeading: string;
    readonly guideLabel: string;
    readonly title: string;
    readonly highlights: readonly string[];
    readonly lead: string;
    readonly guidance: string;
    readonly practicalRule: string;
    readonly startHeading: string;
    readonly author: string;
    readonly website: string;
  };
  readonly maps: readonly PatientMapDefinition[];
  readonly summary: {
    readonly eyebrow: string;
    readonly title: string;
    readonly disclaimer: string;
    readonly readingGuide: string;
    readonly areaHeading: string;
    readonly areaColumns: readonly (string | null)[];
    readonly areaLabels: readonly string[];
    readonly selectionGuidance: string;
    readonly prompts: readonly {
      readonly id: string;
      readonly title: string;
    }[];
    readonly closing: string;
  };
}

export const PATIENT_MAP_CATALOG = {
  contentVersion: PATIENT_MAP_CONTENT_VERSION,
  responses: PATIENT_MAP_RESPONSES,

  "landing": {
    "eyebrow": "MAPA PESSOAL  •  AUTOCONHECIMENTO NA PRÁTICA",
    "brandMark": "MRM",
    "contentsHeading": "O QUE VOCÊ\nENCONTRA AQUI",
    "guideLabel": "GUIA DE AUTOCONHECIMENTO",
    "title": "Gostos, limites\ne possibilidades",
    "highlights": [
      "5\nmapas de exploração",
      "150\npistas com exemplos",
      "1\nsíntese pessoal"
    ],
    "lead": "Um guia prático para perceber o que faz bem, o que pesa e o que ainda pode ser descoberto.",
    "guidance": "Este material não é um teste e não existe resultado certo.\n\nUse os exemplos como pistas. Você pode perceber que algo combina, depende do contexto, é apenas tolerado ou ainda não foi descoberto.\n\nAs respostas podem mudar com o tempo.",
    "practicalRule": "REGRA PRÁTICA  •  Não tente completar tudo. Comece por dois ou três itens que chamarem atenção e volte ao material quando fizer sentido.",
    "startHeading": "COMECE PELO MAPA MAIS PRÓXIMO DO SEU MOMENTO",
    "author": "Mateus Ribeiro Marcos  •  Psicólogo clínico  •  CRP 08/38930",
    "website": "psico-mateus.github.io"
  },
  "maps": [
    {
      "id": "meu-jeito",
      "order": 1,
      "active": true,
      "number": "01",
      "navigationTitle": "Meu jeito",
      "landingCard": "01  MEU JEITO\nenergia, rotina e ambientes",
      "eyebrow": "MAPA 01  •  COMO EU FUNCIONO",
      "title": "Meu jeito de funcionar",
      "description": "Pistas sobre energia, rotina, autonomia, corpo, ambientes e formas de realizar tarefas.",
      "modeGuidance": "MODO RÁPIDO  •  Escolha de 3 a 5 itens que chamarem atenção. MODO COMPLETO  •  Volte aos poucos, sem obrigação de terminar em um dia.",
      "demonstration": {
        "label": "EX.",
        "title": "Viajar ou sair da rotina",
        "examples": "planejamento, companhia, duração e quantidade de imprevistos",
        "responseKey": "contextual",
        "note": "gosto quando planejo, vou com poucas pessoas e fico poucos dias"
      },
      "columnLabels": {
        "item": "PISTA PARA OBSERVAR",
        "examples": "EXEMPLOS",
        "response": "MINHA RESPOSTA",
        "note": "O QUE MUDA ISSO? JÁ FOI DIFERENTE?  (OPCIONAL)"
      },
      "sections": [
        {
          "id": "meu-jeito.section.01",
          "order": 1,
          "active": true,
          "localId": "01",
          "heading": "ENERGIA E DESCANSO  —  O que realmente recupera você — e o que parece descanso, mas não ajuda?",
          "title": "ENERGIA E DESCANSO",
          "question": "O que realmente recupera você — e o que parece descanso, mas não ajuda?",
          "items": [
            {
              "id": "meu-jeito.01.1",
              "order": 1,
              "active": true,
              "localId": "01.1",
              "title": "Ter tempo sozinho",
              "examples": "silêncio, jogo, caminhada, organizar algo ou simplesmente não conversar"
            },
            {
              "id": "meu-jeito.01.2",
              "order": 2,
              "active": true,
              "localId": "01.2",
              "title": "Estar com alguém para recuperar energia",
              "examples": "companhia tranquila, conversa ou fazer algo junto"
            },
            {
              "id": "meu-jeito.01.3",
              "order": 3,
              "active": true,
              "localId": "01.3",
              "title": "Descansar sem precisar produzir",
              "examples": "deitar, ouvir música, olhar pela janela ou apenas parar"
            },
            {
              "id": "meu-jeito.01.4",
              "order": 4,
              "active": true,
              "localId": "01.4",
              "title": "Dormir ou cochilar durante o dia",
              "examples": "poucos minutos, bastante tempo, nunca ou apenas em alguns dias"
            },
            {
              "id": "meu-jeito.01.5",
              "order": 5,
              "active": true,
              "localId": "01.5",
              "title": "Movimentar o corpo para mudar o estado",
              "examples": "caminhar, alongar, treinar, dançar ou mudar de ambiente"
            },
            {
              "id": "meu-jeito.01.6",
              "order": 6,
              "active": true,
              "localId": "01.6",
              "title": "Usar telas para desligar a mente",
              "examples": "vídeos, redes sociais, séries, jogos ou navegação sem objetivo"
            }
          ]
        },
        {
          "id": "meu-jeito.section.02",
          "order": 2,
          "active": true,
          "localId": "02",
          "heading": "RITMO E ORGANIZAÇÃO  —  Que tipo de estrutura facilita sua vida — e o que começa a apertar demais?",
          "title": "RITMO E ORGANIZAÇÃO",
          "question": "Que tipo de estrutura facilita sua vida — e o que começa a apertar demais?",
          "items": [
            {
              "id": "meu-jeito.02.1",
              "order": 1,
              "active": true,
              "localId": "02.1",
              "title": "Ter horários previsíveis",
              "examples": "acordar, comer, dormir e cumprir compromissos em horários parecidos"
            },
            {
              "id": "meu-jeito.02.2",
              "order": 2,
              "active": true,
              "localId": "02.2",
              "title": "Improvisar e decidir na hora",
              "examples": "mudar planos, seguir a vontade do momento ou aproveitar oportunidades"
            },
            {
              "id": "meu-jeito.02.3",
              "order": 3,
              "active": true,
              "localId": "02.3",
              "title": "Planejar com listas, agenda ou calendário",
              "examples": "ver antes o que precisa ser feito e organizar prioridades"
            },
            {
              "id": "meu-jeito.02.4",
              "order": 4,
              "active": true,
              "localId": "02.4",
              "title": "Ter prazos e cobranças externas",
              "examples": "data de entrega, horário marcado ou alguém esperando"
            },
            {
              "id": "meu-jeito.02.5",
              "order": 5,
              "active": true,
              "localId": "02.5",
              "title": "Fazer uma coisa de cada vez",
              "examples": "terminar antes de trocar de tarefa ou reduzir estímulos"
            },
            {
              "id": "meu-jeito.02.6",
              "order": 6,
              "active": true,
              "localId": "02.6",
              "title": "Alternar entre várias tarefas",
              "examples": "resolver pendências, variar atividades ou sentir o dia em movimento"
            }
          ]
        },
        {
          "id": "meu-jeito.section.03",
          "order": 3,
          "active": true,
          "localId": "03",
          "heading": "AUTONOMIA E AJUDA  —  Quanto de liberdade, orientação e companhia costuma funcionar melhor?",
          "title": "AUTONOMIA E AJUDA",
          "question": "Quanto de liberdade, orientação e companhia costuma funcionar melhor?",
          "items": [
            {
              "id": "meu-jeito.03.1",
              "order": 1,
              "active": true,
              "localId": "03.1",
              "title": "Fazer as coisas do meu jeito",
              "examples": "escolher ordem, ritmo, método e quantidade de ajuda"
            },
            {
              "id": "meu-jeito.03.2",
              "order": 2,
              "active": true,
              "localId": "03.2",
              "title": "Receber instruções claras e objetivas",
              "examples": "passo a passo, exemplo pronto ou resultado esperado"
            },
            {
              "id": "meu-jeito.03.3",
              "order": 3,
              "active": true,
              "localId": "03.3",
              "title": "Ter alguém por perto enquanto faço algo",
              "examples": "companhia silenciosa, supervisão ou divisão de etapas"
            },
            {
              "id": "meu-jeito.03.4",
              "order": 4,
              "active": true,
              "localId": "03.4",
              "title": "Receber lembretes",
              "examples": "mensagens, alarmes, agenda, avisos ou alguém reforçando o combinado"
            },
            {
              "id": "meu-jeito.03.5",
              "order": 5,
              "active": true,
              "localId": "03.5",
              "title": "Pedir ajuda quando preciso",
              "examples": "dividir tarefa, admitir dificuldade ou aceitar orientação"
            },
            {
              "id": "meu-jeito.03.6",
              "order": 6,
              "active": true,
              "localId": "03.6",
              "title": "Tomar decisões sem consultar outras pessoas",
              "examples": "escolher, assumir responsabilidade e lidar com dúvida"
            }
          ]
        },
        {
          "id": "meu-jeito.section.04",
          "order": 4,
          "active": true,
          "localId": "04",
          "heading": "CORPO E ESTÍMULOS  —  Quais sensações costumam acalmar, incomodar ou passar despercebidas?",
          "title": "CORPO E ESTÍMULOS",
          "question": "Quais sensações costumam acalmar, incomodar ou passar despercebidas?",
          "items": [
            {
              "id": "meu-jeito.04.1",
              "order": 1,
              "active": true,
              "localId": "04.1",
              "title": "Ficar em ambientes silenciosos",
              "examples": "poucas vozes, sem televisão ligada ou sem ruído de fundo"
            },
            {
              "id": "meu-jeito.04.2",
              "order": 2,
              "active": true,
              "localId": "04.2",
              "title": "Ter som ou música por perto",
              "examples": "música, podcast, ventilador, televisão ou conversa ao fundo"
            },
            {
              "id": "meu-jeito.04.3",
              "order": 3,
              "active": true,
              "localId": "04.3",
              "title": "Usar luz baixa",
              "examples": "abajur, cortina, pouca claridade ou ambiente mais fechado"
            },
            {
              "id": "meu-jeito.04.4",
              "order": 4,
              "active": true,
              "localId": "04.4",
              "title": "Ficar em lugares bem iluminados",
              "examples": "sol, luz branca, janelas abertas ou muita claridade"
            },
            {
              "id": "meu-jeito.04.5",
              "order": 5,
              "active": true,
              "localId": "04.5",
              "title": "Receber contato físico",
              "examples": "abraço, carinho, toque no braço ou proximidade corporal"
            },
            {
              "id": "meu-jeito.04.6",
              "order": 6,
              "active": true,
              "localId": "04.6",
              "title": "Lidar com cheiros, texturas e temperaturas",
              "examples": "perfumes, tecidos, comida, calor, frio ou umidade"
            }
          ]
        },
        {
          "id": "meu-jeito.section.05",
          "order": 5,
          "active": true,
          "localId": "05",
          "heading": "ESPAÇOS E AMBIENTES  —  Em quais lugares você costuma funcionar melhor?",
          "title": "ESPAÇOS E AMBIENTES",
          "question": "Em quais lugares você costuma funcionar melhor?",
          "items": [
            {
              "id": "meu-jeito.05.1",
              "order": 1,
              "active": true,
              "localId": "05.1",
              "title": "Estar em um espaço organizado",
              "examples": "objetos no lugar, pouca informação visual e facilidade para encontrar coisas"
            },
            {
              "id": "meu-jeito.05.2",
              "order": 2,
              "active": true,
              "localId": "05.2",
              "title": "Ter um espaço com objetos e personalidade",
              "examples": "decoração, coleções, lembranças, cores ou coisas à vista"
            },
            {
              "id": "meu-jeito.05.3",
              "order": 3,
              "active": true,
              "localId": "05.3",
              "title": "Frequentar lugares movimentados",
              "examples": "shopping, eventos, ruas cheias, festas ou ambientes com muita gente"
            },
            {
              "id": "meu-jeito.05.4",
              "order": 4,
              "active": true,
              "localId": "05.4",
              "title": "Estar perto da natureza",
              "examples": "parque, árvores, praia, montanha, animais ou ar livre"
            },
            {
              "id": "meu-jeito.05.5",
              "order": 5,
              "active": true,
              "localId": "05.5",
              "title": "Fazer tarefas em casa",
              "examples": "estudar, trabalhar, descansar ou cuidar de coisas no próprio espaço"
            },
            {
              "id": "meu-jeito.05.6",
              "order": 6,
              "active": true,
              "localId": "05.6",
              "title": "Sair de casa para conseguir funcionar",
              "examples": "mudar de ambiente, caminhar, estudar ou trabalhar fora"
            }
          ]
        }
      ]
    },
    {
      "id": "interesses",
      "order": 2,
      "active": true,
      "number": "02",
      "navigationTitle": "Interesses",
      "landingCard": "02  INTERESSES\nprazer, curiosidade e experiências",
      "eyebrow": "MAPA 02  •  GOSTOS E CURIOSIDADES",
      "title": "O que pode despertar interesse",
      "description": "Exemplos para lembrar do que já dá prazer, do que perdeu espaço e do que talvez mereça uma tentativa.",
      "modeGuidance": "MODO RÁPIDO  •  Escolha de 3 a 5 itens que chamarem atenção. MODO COMPLETO  •  Volte aos poucos, sem obrigação de terminar em um dia.",
      "demonstration": {
        "label": "EX.",
        "title": "Cozinhar",
        "examples": "receita nova, prato simples, sozinho ou para outras pessoas",
        "responseKey": "curious",
        "note": "nunca tentei com calma; talvez goste mais de sobremesas"
      },
      "columnLabels": {
        "item": "PISTA PARA OBSERVAR",
        "examples": "EXEMPLOS",
        "response": "MINHA RESPOSTA",
        "note": "O QUE MUDA ISSO? JÁ FOI DIFERENTE?  (OPCIONAL)"
      },
      "sections": [
        {
          "id": "interesses.section.01",
          "order": 1,
          "active": true,
          "localId": "01",
          "heading": "ENTRETENIMENTO  —  Que tipos de conteúdo costumam prender sua atenção ou dar prazer?",
          "title": "ENTRETENIMENTO",
          "question": "Que tipos de conteúdo costumam prender sua atenção ou dar prazer?",
          "items": [
            {
              "id": "interesses.01.1",
              "order": 1,
              "active": true,
              "localId": "01.1",
              "title": "Filmes e séries",
              "examples": "comédia, romance, suspense, ação, documentário, animação ou episódios curtos"
            },
            {
              "id": "interesses.01.2",
              "order": 2,
              "active": true,
              "localId": "01.2",
              "title": "Jogos",
              "examples": "competitivos, cooperativos, história, estratégia, celular, tabuleiro ou cartas"
            },
            {
              "id": "interesses.01.3",
              "order": 3,
              "active": true,
              "localId": "01.3",
              "title": "Música",
              "examples": "ouvir sozinho, cantar, montar playlists, ir a shows ou descobrir artistas"
            },
            {
              "id": "interesses.01.4",
              "order": 4,
              "active": true,
              "localId": "01.4",
              "title": "Podcasts e vídeos longos",
              "examples": "entrevistas, histórias, informação, humor ou temas específicos"
            },
            {
              "id": "interesses.01.5",
              "order": 5,
              "active": true,
              "localId": "01.5",
              "title": "Leitura",
              "examples": "romance, fantasia, suspense, biografia, quadrinhos, notícias ou textos curtos"
            },
            {
              "id": "interesses.01.6",
              "order": 6,
              "active": true,
              "localId": "01.6",
              "title": "Acompanhar esportes e competições",
              "examples": "futebol, lutas, automobilismo, esports ou outros campeonatos"
            }
          ]
        },
        {
          "id": "interesses.section.02",
          "order": 2,
          "active": true,
          "localId": "02",
          "heading": "CRIAR E TRANSFORMAR  —  O que você pode gostar de criar, montar, consertar ou deixar com a sua cara?",
          "title": "CRIAR E TRANSFORMAR",
          "question": "O que você pode gostar de criar, montar, consertar ou deixar com a sua cara?",
          "items": [
            {
              "id": "interesses.02.1",
              "order": 1,
              "active": true,
              "localId": "02.1",
              "title": "Desenhar, pintar ou ilustrar",
              "examples": "papel, digital, rabiscos, pintura, design ou apenas experimentar"
            },
            {
              "id": "interesses.02.2",
              "order": 2,
              "active": true,
              "localId": "02.2",
              "title": "Escrever",
              "examples": "histórias, poemas, pensamentos, roteiros, mensagens ou textos informativos"
            },
            {
              "id": "interesses.02.3",
              "order": 3,
              "active": true,
              "localId": "02.3",
              "title": "Fotografar ou gravar",
              "examples": "pessoas, lugares, objetos, vídeos, edição ou registro do cotidiano"
            },
            {
              "id": "interesses.02.4",
              "order": 4,
              "active": true,
              "localId": "02.4",
              "title": "Cozinhar ou preparar algo",
              "examples": "receitas simples, sobremesas, refeições completas ou testar sabores"
            },
            {
              "id": "interesses.02.5",
              "order": 5,
              "active": true,
              "localId": "02.5",
              "title": "Fazer trabalhos manuais",
              "examples": "crochê, costura, madeira, colagem, miniaturas, cerâmica ou customização"
            },
            {
              "id": "interesses.02.6",
              "order": 6,
              "active": true,
              "localId": "02.6",
              "title": "Criar no computador",
              "examples": "editar, programar, desenhar, montar páginas, planilhas, jogos ou projetos digitais"
            }
          ]
        },
        {
          "id": "interesses.section.03",
          "order": 3,
          "active": true,
          "localId": "03",
          "heading": "CORPO E MOVIMENTO  —  Que formas de movimento parecem mais naturais, prazerosas ou possíveis?",
          "title": "CORPO E MOVIMENTO",
          "question": "Que formas de movimento parecem mais naturais, prazerosas ou possíveis?",
          "items": [
            {
              "id": "interesses.03.1",
              "order": 1,
              "active": true,
              "localId": "03.1",
              "title": "Caminhar",
              "examples": "na rua, no parque, com alguém, ouvindo música ou sem objetivo definido"
            },
            {
              "id": "interesses.03.2",
              "order": 2,
              "active": true,
              "localId": "03.2",
              "title": "Treinar em academia",
              "examples": "musculação, aparelhos, aulas, rotina individual ou acompanhamento"
            },
            {
              "id": "interesses.03.3",
              "order": 3,
              "active": true,
              "localId": "03.3",
              "title": "Dançar",
              "examples": "sozinho, em festas, aulas, ritmos específicos ou apenas por diversão"
            },
            {
              "id": "interesses.03.4",
              "order": 4,
              "active": true,
              "localId": "03.4",
              "title": "Praticar esportes coletivos",
              "examples": "futebol, vôlei, basquete, handebol ou atividades em equipe"
            },
            {
              "id": "interesses.03.5",
              "order": 5,
              "active": true,
              "localId": "03.5",
              "title": "Praticar esportes individuais",
              "examples": "corrida, natação, tênis, ciclismo, lutas ou escalada"
            },
            {
              "id": "interesses.03.6",
              "order": 6,
              "active": true,
              "localId": "03.6",
              "title": "Fazer práticas mais leves",
              "examples": "alongamento, yoga, pilates, mobilidade ou exercícios respiratórios"
            }
          ]
        },
        {
          "id": "interesses.section.04",
          "order": 4,
          "active": true,
          "localId": "04",
          "heading": "CONHECIMENTO E CURIOSIDADE  —  Sobre o que você sente vontade de entender mais?",
          "title": "CONHECIMENTO E CURIOSIDADE",
          "question": "Sobre o que você sente vontade de entender mais?",
          "items": [
            {
              "id": "interesses.04.1",
              "order": 1,
              "active": true,
              "localId": "04.1",
              "title": "Aprender idiomas",
              "examples": "conversação, leitura, cultura, viagem ou curiosidade pessoal"
            },
            {
              "id": "interesses.04.2",
              "order": 2,
              "active": true,
              "localId": "04.2",
              "title": "Conhecer história e culturas",
              "examples": "épocas, países, costumes, religiões, arte ou acontecimentos"
            },
            {
              "id": "interesses.04.3",
              "order": 3,
              "active": true,
              "localId": "04.3",
              "title": "Entender ciência e tecnologia",
              "examples": "corpo humano, espaço, computadores, invenções ou descobertas"
            },
            {
              "id": "interesses.04.4",
              "order": 4,
              "active": true,
              "localId": "04.4",
              "title": "Entender pessoas e comportamento",
              "examples": "psicologia, relações, emoções, sociedade ou comunicação"
            },
            {
              "id": "interesses.04.5",
              "order": 5,
              "active": true,
              "localId": "04.5",
              "title": "Fazer cursos e aulas",
              "examples": "presenciais, on-line, curtos, longos, práticos ou acadêmicos"
            },
            {
              "id": "interesses.04.6",
              "order": 6,
              "active": true,
              "localId": "04.6",
              "title": "Pesquisar sozinho",
              "examples": "abrir várias fontes, comparar informações e seguir uma curiosidade"
            }
          ]
        },
        {
          "id": "interesses.section.05",
          "order": 5,
          "active": true,
          "localId": "05",
          "heading": "LUGARES E EXPERIÊNCIAS  —  Que cenários despertam vontade, conforto ou curiosidade?",
          "title": "LUGARES E EXPERIÊNCIAS",
          "question": "Que cenários despertam vontade, conforto ou curiosidade?",
          "items": [
            {
              "id": "interesses.05.1",
              "order": 1,
              "active": true,
              "localId": "05.1",
              "title": "Praia e lugares quentes",
              "examples": "mar, areia, sol, água, descanso ou atividades ao ar livre"
            },
            {
              "id": "interesses.05.2",
              "order": 2,
              "active": true,
              "localId": "05.2",
              "title": "Montanha e clima frio",
              "examples": "serra, neve, lareira, trilhas, paisagens ou roupas de inverno"
            },
            {
              "id": "interesses.05.3",
              "order": 3,
              "active": true,
              "localId": "05.3",
              "title": "Cidade grande",
              "examples": "movimento, opções, transporte, cultura, trabalho e vida noturna"
            },
            {
              "id": "interesses.05.4",
              "order": 4,
              "active": true,
              "localId": "05.4",
              "title": "Cidade pequena ou interior",
              "examples": "ritmo mais lento, proximidade, silêncio e menos deslocamento"
            },
            {
              "id": "interesses.05.5",
              "order": 5,
              "active": true,
              "localId": "05.5",
              "title": "Museus, teatros e espaços históricos",
              "examples": "arte, arquitetura, exposições, memória e cultura"
            },
            {
              "id": "interesses.05.6",
              "order": 6,
              "active": true,
              "localId": "05.6",
              "title": "Restaurantes, cafés e lugares novos",
              "examples": "comida, ambiente, conversa e conhecer espaços diferentes"
            }
          ]
        }
      ]
    },
    {
      "id": "vinculos",
      "order": 3,
      "active": true,
      "number": "03",
      "navigationTitle": "Vínculos",
      "landingCard": "03  VÍNCULOS\nproximidade, afeto e limites",
      "eyebrow": "MAPA 03  •  PESSOAS E RELAÇÕES",
      "title": "Como eu gosto de estar com as pessoas",
      "description": "Pistas sobre proximidade, conversa, afeto, privacidade, grupos, ajuda e formas de lidar com conflitos.",
      "modeGuidance": "MODO RÁPIDO  •  Escolha de 3 a 5 itens que chamarem atenção. MODO COMPLETO  •  Volte aos poucos, sem obrigação de terminar em um dia.",
      "demonstration": {
        "label": "EX.",
        "title": "Trocar mensagens ao longo do dia",
        "examples": "contar do dia, enviar coisas, responder rápido ou manter contato frequente",
        "responseKey": "contextual",
        "note": "gosto com poucas pessoas; com muita cobrança, começo a me afastar"
      },
      "columnLabels": {
        "item": "PISTA PARA OBSERVAR",
        "examples": "EXEMPLOS",
        "response": "MINHA RESPOSTA",
        "note": "O QUE MUDA ISSO? JÁ FOI DIFERENTE?  (OPCIONAL)"
      },
      "sections": [
        {
          "id": "vinculos.section.01",
          "order": 1,
          "active": true,
          "localId": "01",
          "heading": "QUANTIDADE E RITMO DE CONTATO  —  Que frequência e formato de convivência costumam funcionar melhor?",
          "title": "QUANTIDADE E RITMO DE CONTATO",
          "question": "Que frequência e formato de convivência costumam funcionar melhor?",
          "items": [
            {
              "id": "vinculos.01.1",
              "order": 1,
              "active": true,
              "localId": "01.1",
              "title": "Encontrar poucas pessoas por vez",
              "examples": "conversa em dupla, pequenos grupos ou ambientes mais reservados"
            },
            {
              "id": "vinculos.01.2",
              "order": 2,
              "active": true,
              "localId": "01.2",
              "title": "Participar de festas e encontros maiores",
              "examples": "aniversários, eventos, confraternizações ou sair em grupo"
            },
            {
              "id": "vinculos.01.3",
              "order": 3,
              "active": true,
              "localId": "01.3",
              "title": "Trocar mensagens com frequência",
              "examples": "contar do dia, enviar coisas, responder rápido ou manter contato diário"
            },
            {
              "id": "vinculos.01.4",
              "order": 4,
              "active": true,
              "localId": "01.4",
              "title": "Passar algum tempo sem falar com ninguém",
              "examples": "ficar em silêncio, não responder ou ter espaço sem explicações"
            },
            {
              "id": "vinculos.01.5",
              "order": 5,
              "active": true,
              "localId": "01.5",
              "title": "Conhecer pessoas novas",
              "examples": "conversar, fazer amizades, criar contatos ou entrar em novos ambientes"
            },
            {
              "id": "vinculos.01.6",
              "order": 6,
              "active": true,
              "localId": "01.6",
              "title": "Manter um círculo pequeno e próximo",
              "examples": "poucos vínculos, confiança, continuidade e intimidade"
            }
          ]
        },
        {
          "id": "vinculos.section.02",
          "order": 2,
          "active": true,
          "localId": "02",
          "heading": "CONVERSA E INTIMIDADE  —  Que tipo de troca faz você se sentir mais conectado?",
          "title": "CONVERSA E INTIMIDADE",
          "question": "Que tipo de troca faz você se sentir mais conectado?",
          "items": [
            {
              "id": "vinculos.02.1",
              "order": 1,
              "active": true,
              "localId": "02.1",
              "title": "Ter conversas profundas",
              "examples": "falar com calma, trocar ideias e compartilhar algo importante"
            },
            {
              "id": "vinculos.02.2",
              "order": 2,
              "active": true,
              "localId": "02.2",
              "title": "Conversar de forma leve",
              "examples": "humor, assuntos cotidianos, memes, histórias ou interesses"
            },
            {
              "id": "vinculos.02.3",
              "order": 3,
              "active": true,
              "localId": "02.3",
              "title": "Falar sobre o que sinto",
              "examples": "nomear emoções, contar preocupações ou explicar o que aconteceu por dentro"
            },
            {
              "id": "vinculos.02.4",
              "order": 4,
              "active": true,
              "localId": "02.4",
              "title": "Ouvir mais do que falar",
              "examples": "acompanhar, fazer perguntas e dar espaço para a outra pessoa"
            },
            {
              "id": "vinculos.02.5",
              "order": 5,
              "active": true,
              "localId": "02.5",
              "title": "Compartilhar interesses",
              "examples": "jogar, assistir, cozinhar, estudar ou praticar algo junto"
            },
            {
              "id": "vinculos.02.6",
              "order": 6,
              "active": true,
              "localId": "02.6",
              "title": "Fazer atividades lado a lado sem conversar muito",
              "examples": "caminhar, dirigir, trabalhar ou descansar no mesmo lugar"
            }
          ]
        },
        {
          "id": "vinculos.section.03",
          "order": 3,
          "active": true,
          "localId": "03",
          "heading": "AFETO E CUIDADO  —  Como você costuma perceber e demonstrar que alguém é importante?",
          "title": "AFETO E CUIDADO",
          "question": "Como você costuma perceber e demonstrar que alguém é importante?",
          "items": [
            {
              "id": "vinculos.03.1",
              "order": 1,
              "active": true,
              "localId": "03.1",
              "title": "Receber palavras de carinho e reconhecimento",
              "examples": "elogios, mensagens, agradecimentos ou reafirmações"
            },
            {
              "id": "vinculos.03.2",
              "order": 2,
              "active": true,
              "localId": "03.2",
              "title": "Receber ajuda prática",
              "examples": "alguém resolver algo, acompanhar, lembrar ou dividir uma tarefa"
            },
            {
              "id": "vinculos.03.3",
              "order": 3,
              "active": true,
              "localId": "03.3",
              "title": "Receber contato físico",
              "examples": "abraço, beijo, carinho, proximidade ou toque"
            },
            {
              "id": "vinculos.03.4",
              "order": 4,
              "active": true,
              "localId": "03.4",
              "title": "Demonstrar cuidado fazendo coisas",
              "examples": "ajudar, preparar algo, resolver, acompanhar ou proteger"
            },
            {
              "id": "vinculos.03.5",
              "order": 5,
              "active": true,
              "localId": "03.5",
              "title": "Dar presentes ou lembranças",
              "examples": "algo comprado, feito, escolhido ou lembrado em uma data"
            },
            {
              "id": "vinculos.03.6",
              "order": 6,
              "active": true,
              "localId": "03.6",
              "title": "Ter tempo de qualidade",
              "examples": "presença, atenção, conversa, passeio ou atividade compartilhada"
            }
          ]
        },
        {
          "id": "vinculos.section.04",
          "order": 4,
          "active": true,
          "localId": "04",
          "heading": "PRIVACIDADE E LIMITES  —  Quanto espaço pessoal costuma ser necessário para a relação continuar saudável?",
          "title": "PRIVACIDADE E LIMITES",
          "question": "Quanto espaço pessoal costuma ser necessário para a relação continuar saudável?",
          "items": [
            {
              "id": "vinculos.04.1",
              "order": 1,
              "active": true,
              "localId": "04.1",
              "title": "Preservar partes da minha vida",
              "examples": "não contar tudo, escolher o que expor e ter assuntos só meus"
            },
            {
              "id": "vinculos.04.2",
              "order": 2,
              "active": true,
              "localId": "04.2",
              "title": "Ter tempo e atividades separados",
              "examples": "amizades, hobbies, rotina ou descanso sem a outra pessoa"
            },
            {
              "id": "vinculos.04.3",
              "order": 3,
              "active": true,
              "localId": "04.3",
              "title": "Dizer não quando algo me incomoda",
              "examples": "recusar, pedir mudança, interromper ou negociar"
            },
            {
              "id": "vinculos.04.4",
              "order": 4,
              "active": true,
              "localId": "04.4",
              "title": "Receber perguntas sobre o que estou sentindo",
              "examples": "ser convidado a falar, sem pressão para responder na hora"
            },
            {
              "id": "vinculos.04.5",
              "order": 5,
              "active": true,
              "localId": "04.5",
              "title": "Explicar minhas decisões",
              "examples": "contar motivos, justificar escolhas ou dar satisfação"
            },
            {
              "id": "vinculos.04.6",
              "order": 6,
              "active": true,
              "localId": "04.6",
              "title": "Manter contato mesmo quando estou cansado",
              "examples": "responder, encontrar, conversar ou estar disponível"
            }
          ]
        },
        {
          "id": "vinculos.section.05",
          "order": 5,
          "active": true,
          "localId": "05",
          "heading": "APOIO, GRUPOS E CONFLITOS  —  Como você lida com pertencimento, ajuda e desacordos?",
          "title": "APOIO, GRUPOS E CONFLITOS",
          "question": "Como você lida com pertencimento, ajuda e desacordos?",
          "items": [
            {
              "id": "vinculos.05.1",
              "order": 1,
              "active": true,
              "localId": "05.1",
              "title": "Fazer parte de um grupo ou comunidade",
              "examples": "amigos, esporte, profissão, cultura, fé ou interesse em comum"
            },
            {
              "id": "vinculos.05.2",
              "order": 2,
              "active": true,
              "localId": "05.2",
              "title": "Trabalhar em equipe",
              "examples": "dividir tarefas, trocar ideias e construir algo em conjunto"
            },
            {
              "id": "vinculos.05.3",
              "order": 3,
              "active": true,
              "localId": "05.3",
              "title": "Pedir apoio emocional",
              "examples": "dizer que não está bem, pedir presença, escuta ou companhia"
            },
            {
              "id": "vinculos.05.4",
              "order": 4,
              "active": true,
              "localId": "05.4",
              "title": "Ajudar outras pessoas",
              "examples": "escutar, orientar, resolver algo ou estar disponível"
            },
            {
              "id": "vinculos.05.5",
              "order": 5,
              "active": true,
              "localId": "05.5",
              "title": "Conversar sobre conflitos logo que acontecem",
              "examples": "esclarecer, negociar e buscar solução"
            },
            {
              "id": "vinculos.05.6",
              "order": 6,
              "active": true,
              "localId": "05.6",
              "title": "Precisar de tempo antes de falar sobre um conflito",
              "examples": "se acalmar, organizar ideias e voltar depois"
            }
          ]
        }
      ]
    },
    {
      "id": "limites",
      "order": 4,
      "active": true,
      "number": "04",
      "navigationTitle": "Limites",
      "landingCard": "04  LIMITES\no que pesa ou exige demais",
      "eyebrow": "MAPA 04  •  LIMITES E DESCONFORTOS",
      "title": "O que pesa, irrita ou exige demais",
      "description": "Nem tudo precisa ser evitado. A proposta é perceber o que custa energia, o que depende do contexto e o que você apenas tolera.",
      "modeGuidance": "MODO RÁPIDO  •  Escolha de 3 a 5 itens que chamarem atenção. MODO COMPLETO  •  Volte aos poucos, sem obrigação de terminar em um dia.",
      "demonstration": {
        "label": "EX.",
        "title": "Receber muitas mensagens durante o dia",
        "examples": "grupos, cobranças, áudios, assuntos diferentes e expectativa de resposta rápida",
        "responseKey": "tolerate",
        "note": "quando estou trabalhando, fico irritado e perco o foco"
      },
      "columnLabels": {
        "item": "PISTA PARA OBSERVAR",
        "examples": "EXEMPLOS",
        "response": "MINHA RESPOSTA",
        "note": "O QUE MUDA ISSO? JÁ FOI DIFERENTE?  (OPCIONAL)"
      },
      "sections": [
        {
          "id": "limites.section.01",
          "order": 1,
          "active": true,
          "localId": "01",
          "heading": "EXCESSO DE ESTÍMULO  —  Quais situações costumam deixar seu corpo ou sua mente sobrecarregados?",
          "title": "EXCESSO DE ESTÍMULO",
          "question": "Quais situações costumam deixar seu corpo ou sua mente sobrecarregados?",
          "items": [
            {
              "id": "limites.01.1",
              "order": 1,
              "active": true,
              "localId": "01.1",
              "title": "Ambientes com muitos sons ao mesmo tempo",
              "examples": "vozes, música, televisão, trânsito, crianças ou aparelhos"
            },
            {
              "id": "limites.01.2",
              "order": 2,
              "active": true,
              "localId": "01.2",
              "title": "Lugares muito cheios",
              "examples": "shopping, festas, transporte, filas, eventos ou salas lotadas"
            },
            {
              "id": "limites.01.3",
              "order": 3,
              "active": true,
              "localId": "01.3",
              "title": "Luz intensa ou piscando",
              "examples": "luz branca, telas, sol forte, letreiros ou reflexos"
            },
            {
              "id": "limites.01.4",
              "order": 4,
              "active": true,
              "localId": "01.4",
              "title": "Cheiros fortes",
              "examples": "perfumes, produtos de limpeza, comida, fumaça ou ambientes fechados"
            },
            {
              "id": "limites.01.5",
              "order": 5,
              "active": true,
              "localId": "01.5",
              "title": "Contato físico inesperado",
              "examples": "abraço, toque, esbarrão ou alguém muito próximo"
            },
            {
              "id": "limites.01.6",
              "order": 6,
              "active": true,
              "localId": "01.6",
              "title": "Receber muitas informações de uma vez",
              "examples": "instruções longas, várias perguntas ou tarefas simultâneas"
            }
          ]
        },
        {
          "id": "limites.section.02",
          "order": 2,
          "active": true,
          "localId": "02",
          "heading": "PRESSÃO E EXPOSIÇÃO  —  O que acontece quando você sente que está sendo avaliado ou precisa responder rápido?",
          "title": "PRESSÃO E EXPOSIÇÃO",
          "question": "O que acontece quando você sente que está sendo avaliado ou precisa responder rápido?",
          "items": [
            {
              "id": "limites.02.1",
              "order": 1,
              "active": true,
              "localId": "02.1",
              "title": "Falar em público",
              "examples": "apresentar, participar de reunião, gravar vídeo ou falar para um grupo"
            },
            {
              "id": "limites.02.2",
              "order": 2,
              "active": true,
              "localId": "02.2",
              "title": "Ser observado enquanto faço algo",
              "examples": "alguém acompanhando, corrigindo ou esperando resultado"
            },
            {
              "id": "limites.02.3",
              "order": 3,
              "active": true,
              "localId": "02.3",
              "title": "Receber crítica",
              "examples": "comentário direto, correção, comparação ou desaprovação"
            },
            {
              "id": "limites.02.4",
              "order": 4,
              "active": true,
              "localId": "02.4",
              "title": "Ter que decidir rapidamente",
              "examples": "dar uma resposta na hora, escolher sob pressão ou lidar com urgência"
            },
            {
              "id": "limites.02.5",
              "order": 5,
              "active": true,
              "localId": "02.5",
              "title": "Competir ou comparar desempenho",
              "examples": "notas, rankings, produtividade, aparência ou resultados"
            },
            {
              "id": "limites.02.6",
              "order": 6,
              "active": true,
              "localId": "02.6",
              "title": "Receber cobrança repetida",
              "examples": "lembretes, perguntas, mensagens ou alguém verificando o andamento"
            }
          ]
        },
        {
          "id": "limites.section.03",
          "order": 3,
          "active": true,
          "localId": "03",
          "heading": "IMPREVISTOS E CONTROLE  —  Quanto de mudança e incerteza você costuma suportar bem?",
          "title": "IMPREVISTOS E CONTROLE",
          "question": "Quanto de mudança e incerteza você costuma suportar bem?",
          "items": [
            {
              "id": "limites.03.1",
              "order": 1,
              "active": true,
              "localId": "03.1",
              "title": "Mudanças de última hora",
              "examples": "horário, local, companhia, plano ou tarefa"
            },
            {
              "id": "limites.03.2",
              "order": 2,
              "active": true,
              "localId": "03.2",
              "title": "Esperar sem saber quanto tempo vai levar",
              "examples": "fila, atraso, resposta, consulta ou resultado"
            },
            {
              "id": "limites.03.3",
              "order": 3,
              "active": true,
              "localId": "03.3",
              "title": "Não saber exatamente o que esperam de mim",
              "examples": "tarefa vaga, regra implícita ou falta de retorno"
            },
            {
              "id": "limites.03.4",
              "order": 4,
              "active": true,
              "localId": "03.4",
              "title": "Depender da decisão de outras pessoas",
              "examples": "aprovação, autorização, disponibilidade ou resposta"
            },
            {
              "id": "limites.03.5",
              "order": 5,
              "active": true,
              "localId": "03.5",
              "title": "Viajar sem planejamento detalhado",
              "examples": "reservas abertas, roteiro flexível ou decisões no caminho"
            },
            {
              "id": "limites.03.6",
              "order": 6,
              "active": true,
              "localId": "03.6",
              "title": "Começar algo sem ter certeza de que vai dar certo",
              "examples": "curso, projeto, relação, compra ou mudança"
            }
          ]
        },
        {
          "id": "limites.section.04",
          "order": 4,
          "active": true,
          "localId": "04",
          "heading": "CARGA SOCIAL E EMOCIONAL  —  Que tipos de contato costumam consumir mais energia?",
          "title": "CARGA SOCIAL E EMOCIONAL",
          "question": "Que tipos de contato costumam consumir mais energia?",
          "items": [
            {
              "id": "limites.04.1",
              "order": 1,
              "active": true,
              "localId": "04.1",
              "title": "Conversas longas quando estou cansado",
              "examples": "mensagens, ligação, encontro ou discussão"
            },
            {
              "id": "limites.04.2",
              "order": 2,
              "active": true,
              "localId": "04.2",
              "title": "Precisar demonstrar animação",
              "examples": "sorrir, conversar, participar ou parecer bem sem estar"
            },
            {
              "id": "limites.04.3",
              "order": 3,
              "active": true,
              "localId": "04.3",
              "title": "Ser procurado para resolver problemas",
              "examples": "orientar, decidir, acalmar ou assumir responsabilidade"
            },
            {
              "id": "limites.04.4",
              "order": 4,
              "active": true,
              "localId": "04.4",
              "title": "Lidar com conflitos entre outras pessoas",
              "examples": "mediar, ouvir versões ou tentar impedir uma briga"
            },
            {
              "id": "limites.04.5",
              "order": 5,
              "active": true,
              "localId": "04.5",
              "title": "Receber desabafos frequentes",
              "examples": "mensagens longas, crises repetidas ou pouca reciprocidade"
            },
            {
              "id": "limites.04.6",
              "order": 6,
              "active": true,
              "localId": "04.6",
              "title": "Manter contato por obrigação",
              "examples": "responder, visitar, conversar ou participar para não desagradar"
            }
          ]
        },
        {
          "id": "limites.section.05",
          "order": 5,
          "active": true,
          "localId": "05",
          "heading": "DEMANDAS DO DIA A DIA  —  Quais tarefas você costuma adiar, evitar ou fazer apenas porque precisa?",
          "title": "DEMANDAS DO DIA A DIA",
          "question": "Quais tarefas você costuma adiar, evitar ou fazer apenas porque precisa?",
          "items": [
            {
              "id": "limites.05.1",
              "order": 1,
              "active": true,
              "localId": "05.1",
              "title": "Resolver burocracias",
              "examples": "documentos, ligações, banco, agendamento, formulários ou atendimento"
            },
            {
              "id": "limites.05.2",
              "order": 2,
              "active": true,
              "localId": "05.2",
              "title": "Manter a casa organizada",
              "examples": "limpar, guardar, lavar, planejar compras ou cuidar de detalhes"
            },
            {
              "id": "limites.05.3",
              "order": 3,
              "active": true,
              "localId": "05.3",
              "title": "Cozinhar e planejar refeições",
              "examples": "escolher, comprar, preparar, guardar e limpar"
            },
            {
              "id": "limites.05.4",
              "order": 4,
              "active": true,
              "localId": "05.4",
              "title": "Cumprir tarefas repetitivas",
              "examples": "conferir, preencher, revisar, organizar ou seguir rotina"
            },
            {
              "id": "limites.05.5",
              "order": 5,
              "active": true,
              "localId": "05.5",
              "title": "Responder mensagens e e-mails",
              "examples": "ler, decidir, escrever e acompanhar retornos"
            },
            {
              "id": "limites.05.6",
              "order": 6,
              "active": true,
              "localId": "05.6",
              "title": "Iniciar tarefas que parecem grandes",
              "examples": "projeto, estudo, arrumação, relatório ou mudança"
            }
          ]
        }
      ]
    },
    {
      "id": "futuro",
      "order": 5,
      "active": true,
      "number": "05",
      "navigationTitle": "Futuro",
      "landingCard": "05  FUTURO\ncondições, projetos e caminhos possíveis",
      "eyebrow": "MAPA 05  •  CAMINHOS POSSÍVEIS",
      "title": "O que talvez eu queira construir",
      "description": "Não é um plano de vida definitivo. São condições, experiências e direções que podem merecer mais espaço.",
      "modeGuidance": "MODO RÁPIDO  •  Escolha de 3 a 5 itens que chamarem atenção. MODO COMPLETO  •  Volte aos poucos, sem obrigação de terminar em um dia.",
      "demonstration": {
        "label": "EX.",
        "title": "Morar em outra cidade",
        "examples": "trabalho, distância da família, custo, ritmo, segurança e rede de apoio",
        "responseKey": "unknown",
        "note": "tenho curiosidade, mas nunca pensei nas condições necessárias"
      },
      "columnLabels": {
        "item": "PISTA PARA OBSERVAR",
        "examples": "EXEMPLOS",
        "response": "MINHA RESPOSTA",
        "note": "O QUE MUDA ISSO? JÁ FOI DIFERENTE?  (OPCIONAL)"
      },
      "sections": [
        {
          "id": "futuro.section.01",
          "order": 1,
          "active": true,
          "localId": "01",
          "heading": "ROTINA E TEMPO  —  Que tipo de dia você gostaria de construir aos poucos?",
          "title": "ROTINA E TEMPO",
          "question": "Que tipo de dia você gostaria de construir aos poucos?",
          "items": [
            {
              "id": "futuro.01.1",
              "order": 1,
              "active": true,
              "localId": "01.1",
              "title": "Ter horários mais previsíveis",
              "examples": "saber quando trabalho, descanso, como e resolvo compromissos"
            },
            {
              "id": "futuro.01.2",
              "order": 2,
              "active": true,
              "localId": "01.2",
              "title": "Ter mais flexibilidade",
              "examples": "mudar horários, decidir conforme a energia e não viver sempre no relógio"
            },
            {
              "id": "futuro.01.3",
              "order": 3,
              "active": true,
              "localId": "01.3",
              "title": "Ter mais tempo de descanso",
              "examples": "menos correria, pausas reais e espaço sem produtividade"
            },
            {
              "id": "futuro.01.4",
              "order": 4,
              "active": true,
              "localId": "01.4",
              "title": "Ter mais movimento no dia",
              "examples": "sair, caminhar, treinar, encontrar pessoas ou variar ambientes"
            },
            {
              "id": "futuro.01.5",
              "order": 5,
              "active": true,
              "localId": "01.5",
              "title": "Ter mais tempo sozinho",
              "examples": "silêncio, autonomia, privacidade e recuperação de energia"
            },
            {
              "id": "futuro.01.6",
              "order": 6,
              "active": true,
              "localId": "01.6",
              "title": "Ter convivência mais frequente",
              "examples": "família, amigos, parceiro, colegas ou atividades em grupo"
            }
          ]
        },
        {
          "id": "futuro.section.02",
          "order": 2,
          "active": true,
          "localId": "02",
          "heading": "TRABALHO E APRENDIZAGEM  —  Que condições podem fazer você funcionar melhor e sentir mais sentido?",
          "title": "TRABALHO E APRENDIZAGEM",
          "question": "Que condições podem fazer você funcionar melhor e sentir mais sentido?",
          "items": [
            {
              "id": "futuro.02.1",
              "order": 1,
              "active": true,
              "localId": "02.1",
              "title": "Trabalhar ou estudar com pessoas",
              "examples": "contato, troca, atendimento, equipe ou colaboração"
            },
            {
              "id": "futuro.02.2",
              "order": 2,
              "active": true,
              "localId": "02.2",
              "title": "Trabalhar ou estudar mais concentrado sozinho",
              "examples": "autonomia, silêncio, foco e menos interrupção"
            },
            {
              "id": "futuro.02.3",
              "order": 3,
              "active": true,
              "localId": "02.3",
              "title": "Usar criatividade",
              "examples": "imaginar, escrever, criar soluções, desenhar ou desenvolver projetos"
            },
            {
              "id": "futuro.02.4",
              "order": 4,
              "active": true,
              "localId": "02.4",
              "title": "Ter tarefas objetivas e claras",
              "examples": "saber o que fazer, quando termina e como avaliar o resultado"
            },
            {
              "id": "futuro.02.5",
              "order": 5,
              "active": true,
              "localId": "02.5",
              "title": "Continuar aprendendo",
              "examples": "cursos, especialização, prática, pesquisa ou novos desafios"
            },
            {
              "id": "futuro.02.6",
              "order": 6,
              "active": true,
              "localId": "02.6",
              "title": "Ter mais autonomia",
              "examples": "escolher método, horário, projetos, ritmo ou local"
            }
          ]
        },
        {
          "id": "futuro.section.03",
          "order": 3,
          "active": true,
          "localId": "03",
          "heading": "CASA E LUGAR  —  Em que tipo de espaço sua vida poderia ficar mais parecida com você?",
          "title": "CASA E LUGAR",
          "question": "Em que tipo de espaço sua vida poderia ficar mais parecida com você?",
          "items": [
            {
              "id": "futuro.03.1",
              "order": 1,
              "active": true,
              "localId": "03.1",
              "title": "Viver em uma cidade grande",
              "examples": "mais opções, trabalho, cultura, serviços e movimento"
            },
            {
              "id": "futuro.03.2",
              "order": 2,
              "active": true,
              "localId": "03.2",
              "title": "Viver em uma cidade menor",
              "examples": "ritmo mais calmo, proximidade, menos trânsito e menos estímulo"
            },
            {
              "id": "futuro.03.3",
              "order": 3,
              "active": true,
              "localId": "03.3",
              "title": "Ficar perto de pessoas importantes",
              "examples": "família, amigos, rede de apoio ou vínculos cotidianos"
            },
            {
              "id": "futuro.03.4",
              "order": 4,
              "active": true,
              "localId": "03.4",
              "title": "Morar longe e construir uma vida nova",
              "examples": "mudança, autonomia, recomeço ou outras oportunidades"
            },
            {
              "id": "futuro.03.5",
              "order": 5,
              "active": true,
              "localId": "03.5",
              "title": "Ter mais natureza por perto",
              "examples": "parques, árvores, praia, montanha, animais ou espaço aberto"
            },
            {
              "id": "futuro.03.6",
              "order": 6,
              "active": true,
              "localId": "03.6",
              "title": "Ter uma casa com identidade",
              "examples": "decoração, objetos, conforto, memória e espaço para interesses"
            }
          ]
        },
        {
          "id": "futuro.section.04",
          "order": 4,
          "active": true,
          "localId": "04",
          "heading": "RELAÇÕES E PERTENCIMENTO  —  Que vínculos e formas de companhia podem fazer sentido para você?",
          "title": "RELAÇÕES E PERTENCIMENTO",
          "question": "Que vínculos e formas de companhia podem fazer sentido para você?",
          "items": [
            {
              "id": "futuro.04.1",
              "order": 1,
              "active": true,
              "localId": "04.1",
              "title": "Construir poucos vínculos profundos",
              "examples": "confiança, intimidade, continuidade e conversa verdadeira"
            },
            {
              "id": "futuro.04.2",
              "order": 2,
              "active": true,
              "localId": "04.2",
              "title": "Fazer parte de um grupo ou comunidade",
              "examples": "amigos, esporte, profissão, cultura, fé ou interesse em comum"
            },
            {
              "id": "futuro.04.3",
              "order": 3,
              "active": true,
              "localId": "04.3",
              "title": "Ter um relacionamento amoroso",
              "examples": "companhia, parceria, afeto, projetos e individualidade"
            },
            {
              "id": "futuro.04.4",
              "order": 4,
              "active": true,
              "localId": "04.4",
              "title": "Fortalecer relações familiares",
              "examples": "mais presença, conversa, limite, proximidade ou reparação"
            },
            {
              "id": "futuro.04.5",
              "order": 5,
              "active": true,
              "localId": "04.5",
              "title": "Morar sozinho",
              "examples": "autonomia, silêncio, privacidade e responsabilidade pelo próprio espaço"
            },
            {
              "id": "futuro.04.6",
              "order": 6,
              "active": true,
              "localId": "04.6",
              "title": "Construir família do meu jeito",
              "examples": "ter ou não ter filhos, animais, parceria ou outras formas de vínculo"
            }
          ]
        },
        {
          "id": "futuro.section.05",
          "order": 5,
          "active": true,
          "localId": "05",
          "heading": "SEGURANÇA, PROJETOS E DIREÇÃO  —  O que pode merecer uma tentativa pequena ou uma construção de longo prazo?",
          "title": "SEGURANÇA, PROJETOS E DIREÇÃO",
          "question": "O que pode merecer uma tentativa pequena ou uma construção de longo prazo?",
          "items": [
            {
              "id": "futuro.05.1",
              "order": 1,
              "active": true,
              "localId": "05.1",
              "title": "Ter renda mais estável",
              "examples": "previsibilidade, reserva e menos medo do mês seguinte"
            },
            {
              "id": "futuro.05.2",
              "order": 2,
              "active": true,
              "localId": "05.2",
              "title": "Usar dinheiro para experiências",
              "examples": "viagens, cursos, eventos, lazer ou tempo de qualidade"
            },
            {
              "id": "futuro.05.3",
              "order": 3,
              "active": true,
              "localId": "05.3",
              "title": "Aprender uma habilidade nova",
              "examples": "idioma, instrumento, tecnologia, cozinha, arte ou atividade física"
            },
            {
              "id": "futuro.05.4",
              "order": 4,
              "active": true,
              "localId": "05.4",
              "title": "Retomar algo de que eu gostava",
              "examples": "hobby, amizade, esporte, estudo, lugar ou parte de mim que ficou de lado"
            },
            {
              "id": "futuro.05.5",
              "order": 5,
              "active": true,
              "localId": "05.5",
              "title": "Criar algo meu",
              "examples": "negócio, canal, livro, site, coleção, projeto ou produção artística"
            },
            {
              "id": "futuro.05.6",
              "order": 6,
              "active": true,
              "localId": "05.6",
              "title": "Viver de forma mais coerente com meus valores",
              "examples": "aproximar escolhas do que realmente importa para mim"
            }
          ]
        }
      ]
    }
  ],
  "summary": {
    "eyebrow": "MAPA PESSOAL  •  SÍNTESE",
    "title": "O que apareceu no meu mapa",
    "disclaimer": "Os números abaixo não são pontuação nem diagnóstico. Eles apenas mostram o que foi marcado e ajudam a escolher o que merece atenção.",
    "readingGuide": "COMO LER SEM TRANSFORMAR EM TESTE\n• “Depende do contexto” mostra que companhia, ambiente, energia, tempo ou custo fazem diferença.\n• “Só tolero” pode revelar coisas mantidas por obrigação, hábito ou medo de desagradar.\n• “Ainda não sei” aponta áreas que podem ser observadas ou experimentadas aos poucos.",
    "areaHeading": "VISÃO POR ÁREA",
    "areaColumns": [
      "Mapa",
      "Combina",
      "Curiosidade",
      "Depende",
      "Só tolero",
      "Não combina",
      "Não sei",
      "Marcados"
    ],
    "areaLabels": [
      "1 MEU JEITO",
      "2 INTERESSES",
      "3 VÍNCULOS",
      "4 LIMITES",
      "5 FUTURO"
    ],
    "selectionGuidance": "Agora escolha poucas coisas que realmente chamaram atenção. Não é necessário resumir tudo.",
    "prompts": [
      {
        "id": "already-fits",
        "title": "01  •  O QUE JÁ COMBINA COMIGO"
      },
      {
        "id": "want-more",
        "title": "02  •  O QUE QUERO TER MAIS PRESENTE"
      },
      {
        "id": "want-to-try",
        "title": "03  •  O QUE QUERO EXPERIMENTAR SEM ME OBRIGAR A GOSTAR"
      },
      {
        "id": "want-to-reduce",
        "title": "04  •  O QUE QUERO DIMINUIR, RECUSAR OU COLOCAR LIMITE"
      },
      {
        "id": "want-to-observe",
        "title": "05  •  O QUE AINDA NÃO SEI E POSSO OBSERVAR"
      },
      {
        "id": "take-to-therapy",
        "title": "06  •  O QUE QUERO LEVAR PARA A TERAPIA"
      }
    ],
    "closing": "Este mapa registra pistas do momento atual. Ele pode ser retomado quando a vida, as prioridades ou os contextos mudarem.\nMateus Ribeiro Marcos  •  Psicólogo clínico  •  CRP 08/38930  •  psico-mateus.github.io"
  }

} as const satisfies PatientMapCatalog;
