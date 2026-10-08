# Refinamento da experiência do paciente — 8 de outubro de 2026

## Estado e escopo

Branch `agent/refino-paciente-inclusivo-20261008`, criada a partir de `6b9e199`.
Lote **local, ainda não publicado**. A versão ativa e os caminhos de retorno
anteriores estão em `rollback-avisos-recuperacao-2026-10-08.md`.

Objetivo: tornar o início mais legível, previsível e simples para adultos de
diferentes idades, familiaridades digitais e necessidades de leitura, atenção,
visão ou movimento. Não há modos por diagnóstico, personalização clínica,
promessa de acessibilidade universal ou mudança da restrição de cadastro 18+.

Os avisos individuais continuam sendo comunicados do profissional. Não foi criada
uma caixa de perguntas, respostas ou chat: o registro já contém “Levar para a
próxima sessão”, e os canais de contato existentes não foram substituídos.

## Problemas confirmados e mudanças

- Avisos exigiam abrir duas camadas de detalhes. Agora os dois primeiros títulos
  aparecem no início, com estado textual de leitura, data e ação “Ler aviso”.
  Outros avisos continuam acessíveis por expansão e paginação. `N+` significa
  quantidade já carregada com mais páginas, não um total inventado.
- Falhas e carregamento dos avisos ficavam escondidos na primeira camada. Agora
  ficam visíveis, com nova tentativa. Abrir ou expandir não confirma leitura;
  “Marcar como lido” continua sendo uma ação explícita protegida no servidor.
- O início tinha um bloco de boas-vindas muito alto, várias etiquetas e quatro
  cartões coloridos dentro de outro cartão. O novo desenho usa uma abertura
  compacta, uma ação principal e linhas simples para histórico, mapa e recursos.
- No celular, a ação de registrar fica antes dos avisos. Só existe um botão de
  registro visível em cada largura; a variante de computador é ocultada no mobile.
- O resumo podia combinar números de carregamento/erro com frases de zero
  registros. Agora essas frases também respeitam o estado da consulta. Dados
  anteriores mantidos após falha recebem uma explicação de desatualização.
- Navegação, ações e textos importantes de formulário/mapa/leitura ganharam
  tamanho e espaçamento mais confortáveis. Estados privados/compartilhados e
  visualizados continuam descritos em texto, não apenas por cor.
- Na conferência visual com texto a 200%, duas colunas continuavam estreitas,
  apesar de não haver overflow. Container queries proporcionais ao tamanho da
  fonte agora organizam o início e o resumo em uma coluna nessa situação.

## Arquivos e risco

| Arquivo | Responsabilidade | Risco e contenção |
| --- | --- | --- |
| `app/PatientNotices.tsx` | Exposição da lista, expansão e foco | Baixo/moderado: preservados requests, cancelamento, CSRF, tratamento de sessão e confirmação explícita; testes de falha e paginação |
| `app/notices.css` | Estilo exclusivo dos avisos do paciente | Baixo: seletores restritos; testes profissionais repetidos |
| `app/PatientHomeActions.tsx` | Ações de apresentação sem estado clínico | Baixo: usa callbacks existentes; sem API, armazenamento ou efeitos |
| `app/patient-home.css` | Layout, leitura, foco, contraste e reflow | Baixo/moderado: isolado no painel do paciente; matriz de larguras e estados |
| `app/PortalApp.tsx` | Composição e estados corretos do resumo | Baixo: não altera gravação, sessão, hash de navegação ou edição |
| Testes de início, avisos e arquitetura | Regressões funcionais e visuais | Fixtures totalmente sintéticas, bloqueio de origens externas e de APIs não simuladas |

## Referência visual e conferência

Foram usados conceitos desktop/mobile gerados pela ferramenta integrada de
imagem, somente como referência visual. A interface final é HTML/React/CSS real;
não há imagem estática substituindo controles nem nova imagem enviada ao produto.

Conceitos locais: `exec-9f74006f-7fab-450e-93da-89969baa7aff.png` (desktop) e
`exec-3168392e-fdd1-49f5-b2eb-fd138833fd6b.png` (mobile).

Comparação direta com capturas do navegador, incluindo desktop 1402×1122:

| Ponto conferido | Resultado / decisão |
| --- | --- |
| Paleta | Fundo creme, superfícies claras, texto carvão e ocre preservados; cores planas para reduzir ruído |
| Estrutura | Ações e avisos lado a lado no computador, avisos diretamente visíveis no celular |
| Texto | Nomes das quatro áreas preservados; instruções curtas junto às ações |
| Tipografia | Georgia nas chamadas, sans do sistema nos controles e texto; tamanhos reais verificados |
| Ícones | SVGs de contorno alinhados; logo existente preservado, sem marca nova |
| Espaçamento | Menos caixas aninhadas, raios e margens consistentes; sem cortes horizontais nas larguras testadas |
| Movimento | Sem deslocamento/animação dos novos cartões; preferências do sistema preservadas |

Adaptações deliberadas em relação aos conceitos: sem menu hambúrguer inventado,
sem ícones desnecessários na navegação/contagens, logo original, texto “Ler aviso”
junto à seta, resumo em uma coluna no celular e ação principal acima dos avisos.
O rodapé de ajuda e a área de conta existentes foram mantidos. Contagens e nomes
das capturas são sintéticos e não representam uso real.

## Testes desta revisão

Todos os dados são inventados. Nenhum dado de paciente real ou secret foi lido,
adicionado ao Git, enviado à geração de imagens ou usado nas capturas.

- Antes das mudanças: 194 testes automatizados aprovados e revisão visual
  existente aprovada em Chromium e WebKit.
- `pnpm lint`: aprovado.
- `pnpm test`: typecheck, build sanitizado e 194 testes aprovados. Suítes de
  navegador são acionadas separadamente por variáveis de ambiente, não
  contabilizadas como testes executados nesta etapa.
- `PORTAL_VISUAL_BASE_URL=http://localhost:4390/ pnpm test:visual`: aprovado,
  cobrindo acesso público e paciente, rascunho/retorno, histórico, registro privado,
  mapa, compartilhamento, ferramentas e leitura; 320/390/640/1366 px.
- Avisos: 12 testes por engine, Chromium e WebKit, incluindo painel profissional,
  erros, leitura explícita, foco, paginação, texto seguro e ausência de resposta/chat.
- Início: 9 testes por engine, incluindo loading/erro/vazio/preenchido, nomes longos,
  navegação por teclado, controles visíveis com fonte ≥16 px e alvos ≥44×44 px,
  uma única ação principal visível e reflow de uma coluna com texto a 200%.
- Axe WCAG A/AA: nenhuma violação automática nos estados examinados.
- Ampliação do texto para 200%: início desktop sem overflow horizontal.
  Reflow de 320/390/640 px e cores forçadas também examinados. Isso não equivale
  a testar zoom nativo e todas as telas em todos os aparelhos.
- Integração HTTP/D1: 309 verificações aprovadas em novo ambiente local isolado,
  nove migrações locais, integridade SQLite válida, zero violações de FK e zero
  requisições de produção. Inclui cadastro, login/MFA, sessão, permissões, convites,
  registros, mapa, avisos, recuperação e exclusão.
- `git diff --check`: aprovado.

O plugin Browser não estava disponível; foi usado Playwright instalado, com
Chromium e WebKit. WebKit automatizado não equivale a iPhone físico. VoiceOver,
instalação PWA física, Firefox e testes de compreensão com pessoas reais não
foram executados. No WebKit, Option-Tab inclui botões nativos conforme a
preferência de navegação por teclado do Safari.

## Preservação e publicação futura

Não foram alterados API, banco, migrações, autenticação, segredos, cookies, URLs,
service bindings ou service worker. Conta antiga, MFA obrigatório, convites,
privacidade por padrão, compartilhamento opcional, leitura profissional sem edição,
exportação e revogação permanecem nos mesmos fluxos. Site profissional e Guia
não foram editados; o Guia segue sem conta e com rascunho local.

Nenhum serviço ou dependência foi adicionado. Não há ativação de custo novo.
As limitações gratuitas de terceiros continuam aplicáveis.

Publicar somente após aprovação final. Não há migração a executar para este lote.
Antes de publicar, reconfirmar versões ativas dos dois Workers, guardar os IDs de
retorno, gerar build público sanitizado e verificar os dois empacotamentos.
Depois, smoke público e conferência em aparelho real autorizado. O rollback
normal é do deployment, **não** restauração do banco nem revogação de contas.

Próxima melhoria só após observar necessidade: teste físico/assistivo, linguagem
ou campo que cause dúvida real. Não criar funções novas apenas para preencher
espaço, não duplicar perguntas de sessão e não redesenhar novamente sem evidência.

## Segundo refinamento visual, ainda antes da publicação

Após o pedido de mais acabamento, a revisão das capturas atuais confirmou excesso
de caixas e altura no início, metadados longos nos avisos e ações com peso visual
muito semelhante. O refinamento mantém a estrutura e os mesmos destinos:

- Boas-vindas sem cartão externo e com explicação mais curta; aviso de privacidade
  e ação de registrar preservados. A ação móvel usa o mesmo raio das outras ações.
- Ações com texto sans legível e ícones existentes sobre fundo creme discreto.
  No layout de uma coluna, o título passa a “Outras opções”, pois registrar já
  está acima dos avisos. Continua havendo exatamente uma ação principal visível.
- Avisos em linhas divisórias, sem cartões aninhados. Contador junto ao subtítulo,
  estado textual, títulos sem truncamento e área clicável preservados.
- Data curta em `time` na lista, com ano preservado; data e hora completas ao
  abrir. Não há alteração de timestamps, texto enviado ou confirmação de leitura.
- Atualização dos avisos menos dominante, mantendo nome acessível explícito;
  área de conta com superfície e espaçamento consistentes com o restante.
- Chevron muda de direção sem transição, inclusive com movimento reduzido.
  A regra global existente de duração reduzida não passa a animar esse ícone.

Este incremento não modifica requisições, sessão, rascunhos, persistência ou
permissões. Não acrescenta biblioteca, serviço, notificação ou chat. Segue local.

Repetidos neste incremento: lint, typecheck, build sanitizado, 194 testes, 9 testes
de início por engine e os 12 casos de avisos por engine; Chromium e WebKit. Novas
asserções verificam fonte principal ≥16 px, alvos de aviso ≥44×44 px, contagens e
estados realmente visíveis, título contextual e metadados completos ao abrir.
A matriz visual de 320/390/640/1366 px e as interações principais passou novamente.
Capturas adicionais de 1440×1000 e 390×844, com dados sintéticos, confirmaram
ausência de cortes/sobreposição e abertura somente de leitura. A integração HTTP
de 309 verificações não foi repetida neste incremento: é o resultado do lote
anterior, e os arquivos de backend/autenticação/banco não foram alterados.
