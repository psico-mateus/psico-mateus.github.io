export const patientToolNeeds = [
  { id: "accelerated", label: "Estou acelerado" },
  { id: "blocked", label: "Estou travado" },
  { id: "unnamed-emotion", label: "Não sei o que estou sentindo" },
  { id: "difficult-conversation", label: "Preciso organizar uma conversa" },
  { id: "heavy-day", label: "Estou em um dia pesado" },
  { id: "pause-before-action", label: "Quero pensar antes de agir" },
] as const;

export type PatientToolNeedId = (typeof patientToolNeeds)[number]["id"];

export type PatientTool = {
  id: string;
  version: 1;
  title: string;
  summary: string;
  needIds: readonly PatientToolNeedId[];
  mayHelpWhen: string;
  duration: string;
  steps: readonly string[];
  adaptations: readonly string[];
  stopWhen: string;
  safetyNote: string;
  recordPrompt: string;
  referenceIds: readonly PatientToolReferenceId[];
};

export const patientToolReferences = {
  "who-stress-guide": {
    institution: "Organização Mundial da Saúde",
    title: "Doing What Matters in Times of Stress: An Illustrated Guide",
    url: "https://tdr.who.int/home/our-work/global-engagement/9789240003927",
  },
  "nhs-breathing": {
    institution: "NHS",
    title: "Breathing exercises for stress",
    url: "https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/",
  },
  "nhs-small-steps": {
    institution: "NHS Every Mind Matters",
    title: "Tackling your to-do list",
    url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/tackling-your-to-do-list/",
  },
  "nhs-difficult-conversations": {
    institution: "NHS Every Mind Matters",
    title: "How to talk about your mental health",
    url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-talk-about-your-mental-health/",
  },
} as const;

export type PatientToolReferenceId = keyof typeof patientToolReferences;

export const patientToolsCatalogVersion = 1 as const;
export const patientToolsLastReviewed = "2026-08-08" as const;

export const patientTools = [
  {
    id: "voltar-ao-presente",
    version: 1,
    title: "Voltar ao presente",
    summary: "Use os sentidos para voltar a atenção ao lugar em que você está.",
    needIds: ["accelerated", "unnamed-emotion", "heavy-day"],
    mayHelpWhen:
      "Os pensamentos estão ocupando muito espaço ou está difícil perceber o que acontece ao redor.",
    duration: "1 a 3 minutos",
    steps: [
      "Olhe ao redor e note três coisas que consegue ver.",
      "Perceba dois sons, próximos ou distantes.",
      "Se for confortável, note um ponto de contato do corpo com a cadeira, o chão ou outro apoio.",
      "Diga para si onde está e o que está fazendo agora.",
    ],
    adaptations: [
      "Mantenha os olhos abertos se isso for melhor para você.",
      "Se prestar atenção ao corpo aumentar o desconforto, use apenas elementos do ambiente.",
      "Não precisa seguir uma contagem exata.",
    ],
    stopWhen:
      "Pare se ficar mais desconfortável, confuso ou distante do ambiente. Volte a uma atividade conhecida ou procure apoio.",
    safetyNote:
      "Esta orientação serve apenas para ajudar a organizar o momento. Ela não substitui atendimento nem ajuda imediata.",
    recordPrompt: "O que você percebeu antes e depois de voltar a atenção ao ambiente?",
    referenceIds: ["who-stress-guide"],
  },
  {
    id: "diminuir-a-aceleracao",
    version: 1,
    title: "Diminuir a aceleração",
    summary: "Experimente uma respiração confortável, sem prender ou forçar o ar.",
    needIds: ["accelerated"],
    mayHelpWhen:
      "Você percebe tensão ou pressa e respirar de forma consciente costuma ser confortável para você.",
    duration: "1 a 3 minutos",
    steps: [
      "Encontre uma posição em que o corpo esteja apoiado.",
      "Deixe o ar entrar no seu ritmo, sem tentar encher totalmente os pulmões.",
      "Solte o ar de forma confortável, um pouco mais devagar do que entrou.",
      "Repita poucas vezes e depois deixe a respiração seguir naturalmente.",
    ],
    adaptations: [
      "Não precisa contar o tempo.",
      "Se for melhor, apenas observe a respiração sem tentar mudá-la.",
      "Escolha outra ferramenta se prestar atenção à respiração aumentar a ansiedade.",
    ],
    stopWhen:
      "Pare se sentir tontura, falta de ar, dor, formigamento ou piora do desconforto.",
    safetyNote:
      "Não force a respiração. Sintomas físicos importantes não devem ser presumidos como ansiedade; procure avaliação adequada quando necessário.",
    recordPrompt: "O que mudou — ou não mudou — enquanto você respirava desse jeito?",
    referenceIds: ["nhs-breathing"],
  },
  {
    id: "pausa-antes-de-agir",
    version: 1,
    title: "Pausa antes de agir",
    summary: "Crie um pequeno intervalo entre o impulso e a próxima ação.",
    needIds: ["pause-before-action", "accelerated", "difficult-conversation"],
    mayHelpWhen:
      "Há vontade de responder, decidir ou fazer algo imediatamente, mas existe espaço para uma breve pausa.",
    duration: "1 a 2 minutos",
    steps: [
      "Pare por alguns segundos, se isso for seguro no momento.",
      "Dê um nome aproximado à emoção e à vontade de agir.",
      "Pense no que pode acontecer depois das opções que estão disponíveis.",
      "Escolha a menor ação que combine com o que importa para você agora.",
    ],
    adaptations: [
      "Se não souber nomear a emoção, descreva apenas a vontade de agir.",
      "A menor ação pode ser adiar a resposta, mudar de ambiente ou pedir tempo.",
    ],
    stopWhen:
      "Não permaneça na situação para completar a ferramenta se houver ameaça, violência ou risco imediato.",
    safetyNote:
      "Em risco imediato, priorize sair da situação quando possível e procure ajuda de emergência ou uma pessoa de confiança.",
    recordPrompt: "Qual era o impulso e qual ação você escolheu depois da pausa?",
    referenceIds: ["who-stress-guide"],
  },
  {
    id: "separar-fato-interpretacao-acao",
    version: 1,
    title: "Separar fato, interpretação e ação",
    summary: "Organize o que aconteceu, o que sua mente concluiu e o que você pode fazer.",
    needIds: ["pause-before-action", "difficult-conversation", "unnamed-emotion"],
    mayHelpWhen:
      "Uma situação ficou confusa ou fatos e conclusões parecem misturados.",
    duration: "5 a 10 minutos",
    steps: [
      "Descreva o que aconteceu de modo observável, como uma câmera registraria.",
      "Anote o que passou pela sua cabeça sobre a situação.",
      "Perceba quais emoções apareceram e o que teve vontade de fazer.",
      "Escolha uma ação possível agora, mesmo que seja esperar ou buscar mais informação.",
    ],
    adaptations: [
      "Use palavras soltas em vez de frases completas.",
      "Pode haver mais de uma interpretação; não é preciso decidir qual está certa agora.",
    ],
    stopWhen:
      "Pare se escrever estiver aumentando muito a repetição ou o desconforto. Retome em outro momento ou leve o assunto para a sessão.",
    safetyNote:
      "A ferramenta ajuda a organizar a situação, mas não determina o que é verdade nem substitui uma avaliação profissional.",
    recordPrompt: "O que foi fato, o que foi interpretação e qual ação parece possível?",
    referenceIds: ["who-stress-guide"],
  },
  {
    id: "comecar-uma-tarefa-travada",
    version: 1,
    title: "Começar uma tarefa travada",
    summary: "Reduza a tarefa à menor ação que pode ser feita agora.",
    needIds: ["blocked", "heavy-day"],
    mayHelpWhen:
      "Você quer iniciar algo, mas a tarefa parece grande, confusa ou difícil de começar.",
    duration: "Cerca de 5 minutos",
    steps: [
      "Escolha uma única tarefa.",
      "Defina a menor ação visível, como abrir o arquivo ou separar um objeto.",
      "Prepare somente o que essa ação exige.",
      "Teste por poucos minutos e depois decida se continua, muda ou para.",
    ],
    adaptations: [
      "A menor ação pode durar menos de um minuto.",
      "Se houver muitas opções, escolha uma sem tentar organizar todo o restante.",
      "Parar depois do teste continua sendo uma decisão válida.",
    ],
    stopWhen:
      "Pare se a tarefa ultrapassar seus limites físicos, aumentar muito o desconforto ou deixar de ser necessária agora.",
    safetyNote:
      "Isto não mede esforço, produtividade ou melhora. Em um dia difícil, cuidar de uma necessidade básica pode ser a prioridade.",
    recordPrompt: "Qual foi a menor ação possível e o que dificultou ou ajudou o começo?",
    referenceIds: ["nhs-small-steps"],
  },
  {
    id: "preparar-uma-conversa-dificil",
    version: 1,
    title: "Preparar uma conversa difícil",
    summary: "Organize o que precisa ser dito antes de conversar.",
    needIds: ["difficult-conversation", "pause-before-action"],
    mayHelpWhen:
      "Você pretende conversar com alguém e quer separar o assunto, o pedido e os seus limites.",
    duration: "5 a 10 minutos",
    steps: [
      "Descreva o que aconteceu sem tentar escrever a conversa inteira.",
      "Defina o ponto principal que quer comunicar.",
      "Pense em um pedido específico, se houver.",
      "Nomeie o seu limite e o que aceita negociar.",
      "Escolha um momento e um lugar que pareçam adequados e seguros.",
    ],
    adaptations: [
      "Leve tópicos breves em vez de um texto pronto.",
      "Você pode pedir tempo, escolher outro meio de comunicação ou decidir não conversar agora.",
    ],
    stopWhen:
      "Não use a ferramenta para se manter em uma conversa com ameaça, coerção ou violência.",
    safetyNote:
      "Revise qualquer mensagem antes de enviar. Quando a conversa não for segura, procure apoio para pensar nos próximos passos.",
    recordPrompt: "O que você quer comunicar, pedir e preservar como limite?",
    referenceIds: ["nhs-difficult-conversations"],
  },
  {
    id: "rotina-minima-dia-pesado",
    version: 1,
    title: "Rotina mínima para um dia pesado",
    summary: "Escolha poucas necessidades básicas para atravessar o dia de hoje.",
    needIds: ["heavy-day", "blocked"],
    mayHelpWhen:
      "O dia está exigindo mais do que você consegue organizar e é preciso reduzir o que fica para agora.",
    duration: "3 a 5 minutos para escolher",
    steps: [
      "Observe o que é realmente necessário nas próximas horas.",
      "Escolha até três itens: água, alimentação, medicação prescrita, higiene, luz e ambiente, descanso, contato necessário ou compromisso essencial.",
      "Reduza cada item à forma possível para hoje.",
      "Deixe o restante fora desta lista por enquanto.",
    ],
    adaptations: [
      "Escolha somente um item se três ainda forem demais.",
      "Medicação aparece apenas como lembrete para seguir a prescrição que você já recebeu.",
      "A lista pode mudar durante o dia.",
    ],
    stopWhen:
      "Se montar a lista aumentar a cobrança, deixe-a de lado e volte à necessidade mais imediata.",
    safetyNote:
      "Esta organização não é tratamento para depressão ou outra condição. Se não estiver conseguindo cuidar de necessidades básicas ou houver risco, procure apoio adequado.",
    recordPrompt: "O que era essencial hoje e qual adaptação tornou isso mais possível?",
    referenceIds: ["who-stress-guide"],
  },
  {
    id: "nomear-o-que-estou-sentindo",
    version: 1,
    title: "Nomear o que estou sentindo",
    summary: "Procure palavras aproximadas para a experiência deste momento.",
    needIds: ["unnamed-emotion", "accelerated", "heavy-day"],
    mayHelpWhen:
      "Você percebe que algo está acontecendo, mas ainda não encontrou uma palavra para isso.",
    duration: "3 a 5 minutos",
    steps: [
      "Se for confortável, note sensações ou mudanças no corpo.",
      "Escolha uma ou mais palavras aproximadas para o que sente.",
      "Perceba a intensidade sem precisar encontrar um número exato.",
      "Observe se a emoção muda conforme a situação, a pessoa ou o momento.",
      "Se ajudar, consulte o Guia de Emoções na área de Recursos.",
    ],
    adaptations: [
      "Comece por palavras amplas, como agradável, desagradável, intenso ou confuso.",
      "Ignore o corpo e descreva pensamentos ou vontades se isso for mais confortável.",
      "Pode ser que você ainda não saiba. Não é necessário escolher uma palavra.",
    ],
    stopWhen:
      "Pare se observar a experiência aumentar muito o desconforto. Você pode voltar ao ambiente ou conversar sobre isso na sessão.",
    safetyNote:
      "Nomear uma emoção não confirma diagnóstico e não precisa explicar tudo o que está acontecendo.",
    recordPrompt: "Quais palavras chegaram mais perto do que você sentiu e o que mudou conforme o contexto?",
    referenceIds: ["who-stress-guide"],
  },
] as const satisfies readonly PatientTool[];

export function filterPatientTools(
  needId: PatientToolNeedId | "all",
): readonly PatientTool[] {
  if (needId === "all") return patientTools;
  return patientTools.filter((tool) =>
    (tool.needIds as readonly PatientToolNeedId[]).includes(needId),
  );
}

export function findPatientTool(toolId: string | null): PatientTool | null {
  if (!toolId) return null;
  return patientTools.find((tool) => tool.id === toolId) ?? null;
}
