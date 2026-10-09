# Meu mapa repensado e revisão da Área do paciente

Data: 09/10/2026. Trabalho local, **ainda não publicado**.

## Estado e limites desta entrega

- Branch: `agent/refino-paciente-inclusivo-20261008`.
- Base inicial: `b298073`, com as melhorias anteriores já presentes. Não se
  reconstruiu o sistema a partir dos prompts antigos.
- Commits locais de implementação: `41f6ad2` (funções puras e testes),
  `d52dcc9` (mapa repensado) e `1fcd275` (recuperação e foco).
- Arquitetura preservada: React/Vinext, Worker e autenticação existentes,
  persistência D1, API legada atendida pela configuração atual.
- Sem alteração de API, banco, migrations, papéis, autenticação, cookies,
  configurações de Worker, dependências ou catálogo editorial.
- Nenhum push, merge, deploy ou acesso de escrita à produção nesta revisão.
- Todos os dados das capturas e dos testes são sintéticos.

## O que mudou no mapa

1. **Explorar:** cinco temas em uma lista clara, com descrição curta. Não há
   sequência obrigatória, metas, porcentagem de conclusão ou cobrança para
   preencher os 150 itens.
2. **Escolher um item:** cada assunto reúne suas perguntas. É possível abrir
   diretamente qualquer item ou retomar a posição anterior.
3. **Responder:** uma pergunta por tela; opções e observação opcional visíveis;
   próximo item logo após o campo de escrita. Digitar ou marcar uma escolha
   não avança nem muda a rolagem automaticamente.
4. **Minhas respostas:** filtro por tema ou todos os temas, gráfico de contagem
   e respostas guardadas organizadas por assunto. Pode abrir o item exato para
   editar. Observações sem opção marcada são apresentadas separadamente.
5. **Compartilhar:** continua sendo uma ação explícita por tema. Editar não
   reenvia automaticamente a cópia compartilhada.

O gráfico usa as seis opções reais. A largura de cada barra corresponde à
quantidade indicada, na escala escrita abaixo dele. Não é diagnóstico,
perfil, evolução clínica, desempenho ou recomendação automática. Ausência de
resposta não é contada como “Ainda não sei”.

Preservados: catálogo `mapa-pessoal-refinado-ouro-v1`, 5 temas, 25 assuntos,
150 itens, IDs, perguntas, exemplos, seis opções, notas de até 600 caracteres,
síntese opcional, salvamento por campo, revisão, conflitos, retomada e controles
de compartilhamento/revogação.

## Revisão por fluxo

| Etapa | Resultado observado e decisão |
| --- | --- |
| 1. Entrada, login, recuperação | Layout local conferido em 320, 390, 640 e desktop. Protocolos de login/MFA não alterados. Integração real de API em banco local isolado. |
| 2. Início e avisos | Conteúdo e navegação preservados. Corrigida resposta atrasada de “Marcar como lido” que podia tirar o foco escolhido pelo paciente. Remoção de aviso mantém um destino útil para teclado. |
| 3. Criar e editar registro | Perguntas opcionais e ação antecipada de salvar continuam visíveis. Corrigida perda do rascunho em memória quando atualização de histórico recebe sessão expirada. Foco inicial não interrompe quem já começou a usar um campo. |
| 4. Histórico | Privado/compartilhado e confirmação de visualização mantidos no cartão. Contorno de foco passa a ficar dentro do cartão, sem corte. Exclusão não rouba foco movido para a busca enquanto a resposta estava pendente. Corrigida disputa entre foco pós-save e navegação que às vezes levava o Safari de volta ao título. |
| 5. Meu mapa | Exploração, pergunta, revisão, gráfico, síntese e compartilhamento reorganizados. Conteúdo e contratos de persistência preservados. |
| 6. Recursos e leituras | Telas, links e navegação local conferidos; não foram criados materiais redundantes nem novas funções clínicas. |
| 7. Conta e privacidade | Área existente conferida no roteiro local. Sem mudança na recuperação de MFA, sessões, exclusão ou exportação. |

### Recuperação de texto não salvo após sessão expirar

O problema encontrado não era perda de contas ou de registros já salvos.
O formulário e a revisão de pensamento guardavam alterações ainda não salvas
no componente desmontado quando um carregamento de histórico retornava 401.

A correção preserva esse rascunho **somente em memória, na mesma aba**, e o
mostra apenas depois de autenticar novamente como o mesmo paciente. Antes disso,
a tela de entrada não contém o texto clínico. Trocar de conta ou sair
explicitamente descarta a recuperação.

- Nada é salvo, enviado ou compartilhado automaticamente pela recuperação.
- Uma edição usa os metadados atuais da conta, não o estado antigo de
  compartilhamento.
- Se o original mudou ou foi excluído, o texto fica separado e não sobrescreve
  nem recria o registro. O paciente decide se quer aproveitá-lo em um novo
  registro privado ou descartá-lo.
- Revisão de pensamento mantém rascunho, revisão esperada, conflito e cópia
  anterior. Se o registro não existe mais, há leitura/cópia explícita e descarte
  com confirmação, sem escrita no registro antigo.
- Falha ao carregar o histórico não é interpretada como lista vazia para
  decidir uma recuperação.
- Fechar ou recarregar a aba ainda pode apagar texto não salvo. Há aviso de
  saída e essa limitação é escrita na interface. Não foi criado armazenamento
  clínico em localStorage, sessionStorage ou IndexedDB.

## Arquivos e riscos

| Grupo | Arquivos principais | Impacto e risco |
| --- | --- | --- |
| Mapa | `app/PatientMapShell.tsx`, `PatientMapThemeBrowser.tsx`, `PatientMapReview.tsx`, `patient-map.css` | Reorganização visual e navegação. Maior superfície de regressão do lote; coberta por testes de persistência, revisão, compartilhamento e layout nas duas engines. |
| Contagem | `lib/patient-map-summary.ts` | Função pura sobre IDs ativos do catálogo; não modifica respostas nem consulta a rede. |
| Recuperação | `app/PortalApp.tsx`, `patient-record-recovery.ts`, `PatientRecoveredDrafts.tsx` | Preserva alterações não salvas após expiração. Risco relevante de isolamento/estado, coberto por mesma conta, outra conta, logout, original alterado/excluído e carregamento com erro. |
| Foco | `app/PortalApp.tsx`, `PatientNotices.tsx`, `patient-home.css` | Ajustes pontuais de teclado e respostas assíncronas, sem mudança de permissões ou de conteúdo. |
| Proteção contra regressão | testes de mapa, registros, avisos, contagem, recuperação e roteiro visual | APIs de interface simuladas e bloqueio de URLs externas. Integração de servidor usa apenas D1 local e credenciais sintéticas. |

### Decisões visuais verificadas nas capturas

- Mantida a paleta creme, ocre, verde suave e texto escuro do portal.
- Títulos serifados e corpo legível de 16px, sem novos efeitos decorativos.
- Lista de temas e campos com espaçamento estável e alvos de toque adequados.
- Gráfico com rótulos e números; a leitura não depende só de cor.
- Duas colunas de respostas quando cabem; uma coluna em telas estreitas ou
  texto ampliado quando necessário.
- Cabeçalho e navegação reais preservados. Referências visuais não substituíram
  textos, títulos ou estados de salvamento por versões inventadas.
- Usados controles nativos e foco visível, com atenção a reduced-motion e
  forced-colors. Não se declara conformidade universal nem se presume que
  simulação WebKit substitui teste em iPhone físico.

## Testes e evidência

| Verificação | Resultado |
| --- | --- |
| ESLint | Passou |
| Typecheck da aplicação e Worker | Passou |
| Build e sanitização dos artefatos | Passou |
| Testes automatizados sem browser | 227 passaram, zero falhas |
| Integração HTTP e D1 local isolado | 309 verificações passaram; zero requisições à produção |
| Meu mapa, Chromium e WebKit | 27 por engine; 54 passaram |
| Registros, Chromium e WebKit | 34 por engine; 68 passaram |
| Avisos, Chromium e WebKit | 18 por engine; 36 passaram |
| Roteiro visual da Área do paciente | 7 cenários passaram |
| Ajuste final Abrir/Recolher assunto | Regressão específica repetida e aprovada nas duas engines |
| Diff check | Passou |

Os testes de servidor cobrem cadastro por convite, login, MFA, sessões,
recuperação, isolamento entre pacientes, permissões profissionais,
privacidade/compartilhamento/revogação, exclusão e validação. Não criaram contas
reais nem usaram o banco de produção. Testes de interface usam APIs simuladas
e bloqueiam URLs externas. Não se somam reexecuções ao número de cenários.

As capturas selecionadas ficam fora do repositório, em:

`/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/meu-mapa-repensado-20261009/`

- [Explorar no celular](/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/meu-mapa-repensado-20261009/mapa-inicio-mobile.png)
- [Escolher assunto e item](/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/meu-mapa-repensado-20261009/mapa-tema-mobile.png)
- [Gráfico e revisão no desktop](/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/meu-mapa-repensado-20261009/mapa-respostas-desktop.png)

Roteiro visual local: sete cenários em Chromium e WebKit, incluindo tela de
entrada e navegação do paciente. Não foram encontradas violações automáticas
WCAG A/AA no roteiro, overflow horizontal, erros de execução ou tráfego externo
inesperado. Isso não equivale a certificação ou garantia de ausência de erros.

Não foi testado neste lote: iPhone/Android físico, VoiceOver/NVDA humano,
Firefox, conta real de paciente ou fluxo autenticado na produção. A versão
que está no ar não recebeu estas alterações.

## Confirmações de preservação

- Guia continua público, sem conta; nenhum arquivo dele ou localStorage mudou.
- Site profissional e seu conteúdo não foram alterados nesta entrega.
- Registros e mapa continuam privados por padrão.
- Compartilhamento continua opcional; profissional não pode editar o texto.
- MFA profissional continua obrigatório no servidor.
- Convites, validade, uso único e restrição a maiores de 18 anos preservados.
- Não foram criados chat, diagnóstico, IA clínica, agenda ou pagamentos.
- Nenhum serviço pago foi ativado, nem dependência nova adicionada.
- Nenhuma informação real de paciente foi adicionada ao repositório ou captura.

## Publicação e continuidade

Aprovação para esta entrega ainda pendente. Antes de publicar, conferir a
versão efetivamente ativa e repetir os checks proporcionais à publicação.
Referência da versão principal ativa no início desta revisão:
`b5e7f029-1b0e-4541-8de5-bd69c3e9d574` (08/10/2026).
Não usar versões antigas de documentos históricos como alvo de retorno sem
conferir a configuração e a compatibilidade atuais.

Próximas verificações úteis: iPhone/Safari físico, teclado e leitor de tela
com pessoa real, e retorno dos pacientes sobre escolha de tema e gráfico.
Evitar repaginar novamente sem evidência de dificuldade; não adicionar testes
clínicos, pontuações, pressão por conclusão ou alterações de banco desnecessárias.
