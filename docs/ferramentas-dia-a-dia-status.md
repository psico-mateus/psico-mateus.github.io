# Ferramentas do dia a dia — estado do módulo

Atualizado em 08/08/2026. O catálogo funcional está implementado localmente e ainda não depende de persistência nova, API ou migration.

## Estado atual

- Entrada própria dentro de `Recursos`, separada da `Leitura complementar`.
- Catálogo estático e versionado (`patientToolsCatalogVersion = 1`).
- Oito ferramentas disponíveis:
  1. Voltar ao presente;
  2. Diminuir a aceleração;
  3. Pausa antes de agir;
  4. Separar fato, interpretação e ação;
  5. Começar uma tarefa travada;
  6. Preparar uma conversa difícil;
  7. Rotina mínima para um dia pesado;
  8. Nomear o que estou sentindo.
- Seis filtros por necessidade, sem diagnóstico:
  - estou acelerado;
  - estou travado;
  - não sei o que estou sentindo;
  - preciso organizar uma conversa;
  - estou em um dia pesado;
  - quero pensar antes de agir.
- Cada ferramenta possui:
  - ID estável e versão;
  - situação em que pode ajudar;
  - duração aproximada;
  - passos objetivos;
  - formas de adaptar;
  - orientação sobre quando parar;
  - nota de segurança;
  - pergunta opcional para iniciar um registro;
  - referências editoriais no código.
- Tela de detalhe com retorno para o catálogo e restauração do foco ao botão que abriu a ferramenta.
- Filtros com `aria-pressed`, contagem anunciada por `aria-live`, títulos focáveis e rótulos específicos nos botões de abertura.
- Linguagem adulta, direta e sem promessa de resultado, pontuação, gamificação ou interpretação automática.

## Registro opcional

- A ferramenta pode oferecer `Criar registro sobre isso` somente por ação explícita do paciente.
- O callback recebe apenas o ID estável da ferramenta.
- O formulário existente abre vazio e mostra a pergunta da ferramenta apenas como orientação opcional.
- O registro continua privado ao salvar.
- O paciente decide separadamente se deseja compartilhá-lo com Mateus.
- Abrir ou utilizar uma ferramenta não cria registro automaticamente.

## Privacidade e limites técnicos

- Nenhum histórico de uso é criado.
- Nenhum dado de ferramenta é salvo em `localStorage`, `sessionStorage` ou `IndexedDB`.
- Nenhuma ferramenta chama `fetch`, `portalRequest`, API ou Worker.
- Não há endpoint, tabela, migration, cookie, telemetria ou analytics do módulo.
- Mateus não recebe informação sobre ferramenta aberta, filtro escolhido ou uso realizado.
- O catálogo e suas referências permanecem como conteúdo estático no código.
- Não existem favoritos ou `Meu kit` nesta fase.

## Segurança clínica

- Todas as ferramentas permitem adaptar ou interromper.
- Respiração é apresentada sem esforço, retenção obrigatória ou promessa de interromper crise.
- Sintomas físicos importantes não são presumidos como ansiedade.
- Situações com ameaça, violência ou risco imediato orientam a priorizar segurança e ajuda adequada.
- A rotina mínima não é apresentada como tratamento para depressão.
- Medicação aparece somente como lembrete para seguir uma prescrição já recebida.
- Não foram incluídas técnicas com frio intenso, exercício intenso, hiperventilação, retenções longas ou automanejo de risco suicida.
- O módulo informa que não substitui atendimento e não é acompanhado em tempo real.

## Fontes clínicas e editoriais principais

- Organização Mundial da Saúde. *Doing What Matters in Times of Stress: An Illustrated Guide*. Inclui orientação sobre grounding, notar e nomear experiências e ações coerentes com valores:  
  https://tdr.who.int/home/our-work/global-engagement/9789240003927
- NHS. *Breathing exercises for stress*. Base para respiração confortável e sem esforço:  
  https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/
- NHS Every Mind Matters. *Tackling your to-do list*. Base editorial para começar tarefas por passos pequenos:  
  https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/tackling-your-to-do-list/
- NHS Every Mind Matters. *How to talk about your mental health*. Referência para organização e preparação de conversas:  
  https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-talk-about-your-mental-health/

As fontes orientam a revisão editorial, mas os textos exibidos foram adaptados ao contexto do portal e não reproduzem protocolos completos.

## Arquivos

- `portal-production/content/patient-tools-catalog.ts`: catálogo, filtros, metadados e referências.
- `portal-production/app/PatientToolsShell.tsx`: catálogo, filtros, detalhe, retorno de foco e CTA opcional.
- `portal-production/app/PatientResources.tsx`: integração dentro de Recursos e callback para o fluxo de registro.
- `portal-production/tests/patient-tools.test.mjs`: integridade, segurança de conteúdo, filtros, referências e ausência de persistência.

## Testes já cobertos

- exatamente oito ferramentas com IDs únicos e versão estável;
- todos os campos obrigatórios preenchidos;
- todas as necessidades com ao menos uma ferramenta;
- filtros determinísticos;
- referências HTTPS completas;
- ausência de técnicas de maior risco na primeira versão;
- ausência de pontuação, gamificação e promessas clínicas;
- presença de mensagens de segurança;
- sem API, persistência, cookie ou telemetria;
- callback de registro condicionado à ação explícita;
- estrutura acessível básica do catálogo e dos filtros.

## Próximos passos

1. Concluir a revisão visual integrada em celular pequeno, celular comum, tablet e desktop.
2. Testar fisicamente teclado, leitor de tela, Safari/iPhone, zoom de 200% e 400% e redução de movimento.
3. Executar regressão completa de login, cadastro, sessão, registros, compartilhamento, Leitura complementar e painel profissional.
4. Confirmar que criar e cancelar um registro retorna à mesma ferramenta e restaura contexto e foco.
5. Manter favoritos e `Meu kit` fora do escopo até existir evidência de que o catálogo é compreendido e utilizado.
6. Não adicionar histórico de uso, recomendação automática, notificações de produtividade ou visão profissional sem nova decisão explícita de produto e privacidade.
7. Fazer deploy somente após aprovação da versão integrada e dos testes, sem migration remota.
