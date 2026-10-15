# Refinamento inclusivo — 15 de outubro de 2026

## Estado e escopo

Este lote é continuação do trabalho existente, não reconstrução do produto. Branch `agent/refinos-inclusivos-20261014`, iniciada em `59b129f`. **Preparado localmente; não publicado, sem push ou merge.** A aprovação da publicação anterior não foi reaproveitada para publicar este lote novo.

`origin/main` foi consultado novamente em 15/10 e permanece em `f62ce6b1755b0f6890f916f045e2ac31d46757c8`. O estado publicado de site/Guia e dos dois Workers está registrado em `publicacao-refinamento-2026-10-14.md`; ele substitui os estados intermediários de “não publicado” no relatório anterior.

Arquitetura mantida: site e Guia estáticos no GitHub Pages; portal React/Vinext em Workers; principal em modo proxy para o Worker legado/API, ambos com o mesmo D1. Sem nova migração, serviço, dependência, pagamento, domínio, segredo ou alteração de autenticação. Não foram usados contas ou registros reais para testar.

## Problemas concretos e alterações

| Arquivos | Problema e solução | Impacto e risco |
|---|---|---|
| `assets/js/main.js` | O fechamento do menu não participava integralmente do ciclo de teclado; navegação de âncora e redimensionamento podiam perder o foco. O ciclo inclui o botão, o fundo é isolado sem esconder o próprio menu e o destino recebe foco. Atributos anteriores são restaurados. | Acesso por teclado mais previsível. Risco baixo, coberto em três projetos de navegador e fallback sem `inert`. |
| `assets/js/guide-navigation.js` | O fundo do modal continuava acessível ao teclado/tecnologias assistivas. Isolamento dos irmãos em cada nível, foco dentro do modal e restauração ao fechar, sem ocultar seus ancestrais. | Menos navegação acidental fora do modal. Risco baixo; rascunho, seis etapas e ações do Guia preservados. |
| HTML público e `guia-emocoes/sw.js` | Novos scripts poderiam ficar atrás do cache anterior. URLs versionadas e cache do Guia v32; testes verificam atualização a partir dos caches anteriores, offline e preservação do rascunho. | Entrega da correção sem limpar localStorage ou dados de outros recursos. Risco baixo, sem alteração de esquema. |
| `PatientEducation.tsx`, `PatientToolsShell.tsx` | Retorno de leituras relacionadas podia perder o cartão de origem; callbacks de foco pendentes podiam executar depois da saída. Origem preservada, `requestAnimationFrame` cancelado ao sair e retorno imediato. Ferramentas recebem também retorno ao final da leitura. | Menos rolagem e foco inesperados. Risco baixo; navegação e catálogo existentes mantidos. |
| `education-search.ts`, `patient-dashboard-data.ts`, `PortalApp.tsx` | Busca dependia de uma frase contínua. Agora aceita palavras lembradas em campos diferentes e ordem diferente, tolerando acentos e espaçamento. Mantém filtros e ordenação; a busca clínica fica somente na tela. Histórico usa memoização por instância, sem cache global de conteúdo. | Encontrar conteúdo sem lembrar a frase exata; menos processamento desnecessário. Risco baixo, com testes de pureza, filtros e dados intactos. |
| `patient-resources.css`, `globals.css` | Textos auxiliares pequenos, linhas extensas e algumas ações pouco confortáveis no mobile; conteúdo podia transparecer sob o cabeçalho. Texto auxiliar de 16px, linhas até 70ch, retorno de pelo menos 48px, CTAs responsivos e cabeçalho creme opaco. | Leitura e uso em texto 200% mais claros, sem trocar paleta ou criar efeitos. Risco visual baixo; capturas e axe nos dois motores. |
| `lib/portal.ts`, API e `ProfessionalDashboard.tsx` | Uma confirmação de leitura podia corresponder a uma versão anterior ou terminar depois da troca de paciente/atualização. A escrita verifica acesso e versão atomicamente; cliente ignora resultado de seleção antiga; edição avança além da confirmação existente. | Evita marcar como lida uma versão nova que não foi lida. Risco moderado por tocar confirmação/edição; testes SQL, API, concorrência e UI. Sem mudanças no login ou banco. |

Na confirmação de leitura, clientes novos enviam `expected_updated_at`. Versão obsoleta autorizada recebe 409 e orientação para atualizar; registro indisponível/privado/fora do vínculo recebe 404 uniforme. Nenhum conteúdo clínico é revelado. Clientes antigos sem versão continuam compatíveis e mantêm verificação atômica de acesso; a garantia de corresponder à versão aberta depende do cliente atualizado. Confirmações e timestamps não retrocedem, inclusive no mesmo milissegundo e na virada do ano.

## Verificação

- `pnpm lint` e `pnpm typecheck`: aprovados.
- Suíte Node integral: **313/313**, zero falhas. Suítes de UI condicionais não são executadas por esse comando; seus resultados são separados abaixo.
- Integração HTTP/D1 isolada: aprovada; runner reporta 309 verificações, 9 migrações, reinício com contas/registros/sessões preservados e novo login. Zero requisições de produção; ambiente descartado ao terminar. O número reportado é o contador do runner, não uma soma dinâmica de todos os asserts novos.
- Confirmação de versão: 28 testes novos de SQLite, incluídos na suíte integral; mais os testes existentes da API. Revisão independente não identificou falha concreta.
- Histórico/editor do paciente: **60/60 Chromium e 60/60 WebKit**. Inclui busca combinada, edição em conflito, privacidade, foco, compartilhamento, erro de rede e recuperação após sessão expirada, sem salvar automaticamente.
- Recursos/leitura/ferramentas: **13/13 Chromium e 13/13 WebKit**; 320/390/1366px e texto 200%, foco/retorno, busca, fontes e cabeçalho opaco.
- Painel profissional: **21/21 Chromium e 21/21 WebKit** (17 de histórico e 4 de confirmação por versão em cada motor). As novas verificações cobrem filtros normais/hover/foco em 390/1366px: 54 auditorias de contraste por motor, seis textos medidos a pelo menos 4,5:1 e nenhum resultado incompleto. Filtros não marcam registros como vistos.
- Suíte pública completa: **136 aprovados e 59 skips intencionais por projeto**, zero falhas; Chromium desktop/móvel e WebKit móvel. Inclui menu/modal/teclado, reset com confirmação, armazenamento recusado, fallback de cópia, PDF e offline/cache v32.
- Build de produção local (`pnpm build:worker`): aprovado; fingerprint `61982407fd0b9562`. Sanitização removeu o arquivo de variáveis gerado do artefato. Há avisos não bloqueantes existentes do Vinext sobre opções Vite ignoradas, imports e classificação estática de rotas; não foram tratados como erros nem ocultados.
- `git diff --check`: aprovado.

O apontamento anterior de contraste do painel profissional não reapareceu. O diagnóstico observou o DOM atualizado com leitura de cores do filtro anterior, sugerindo temporização da captura. O teste agora aguarda correspondência entre estado e estilo antes da auditoria; axe não ganhou retries, exclusões ou regras enfraquecidas. CSS do histórico profissional não foi alterado. Isso não prova definitivamente a causa da falha anterior.

### Commits locais

- `6e76813`: continuidade de foco, isolamento dos diálogos públicos e cache v32.
- `7b09722`: leitura, busca e retorno aos recursos, cabeçalho opaco e testes renderizados.
- `37d7c57`: busca combinada e memoização local do histórico.
- `675a04a`: confirmação atômica de leitura por versão, proteção de respostas atrasadas e regressões do painel.

Relatório de continuidade salvo em commit documental separado. Nenhum destes commits foi enviado ao remoto.

Nos testes renderizados cobertos não houve overflow, overlay, erros inesperados de console ou violações axe. APIs de UI foram integralmente simuladas e origens externas bloqueadas. O Browser plugin não está disponível; foi usado Playwright já existente, em contextos isolados de localhost. Nenhuma dependência nova de navegador foi instalada.

Capturas novas persistentes, fora do Git e com dados somente sintéticos:

`/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/refinos-20261015/`

Foram inspecionadas capturas do histórico, painel profissional, modal do Guia em 320px e leitura com texto 200%. Os relatórios antigos apontavam para `/tmp`; esses arquivos antigos desapareceram após reinício e não são evidência disponível neste lote.

### Limites

Não foi feito login real em produção, acesso a prontuário/dados reais, teste em aparelho físico ou avaliação humana com VoiceOver/NVDA. WebKit automatizado não equivale a Safari em iPhone físico. Axe não certifica acessibilidade. As corridas são reproduzidas de forma determinística e não comprovam ausência absoluta de bugs em produção.

## Preservação

Guia continua público, sem conta, com a mesma chave/serialização de localStorage; não envia rascunhos ao portal. Catálogos clínicos, referências e PDF intactos. Registros continuam privados por padrão, compartilhamento opcional/revogável, profissional sem editar texto do paciente, MFA profissional obrigatório, convites de uso único e cadastro 18+. Nenhuma informação real de paciente foi adicionada ao repositório. Sem chat, respostas, diagnóstico automático ou novas métricas de adesão.

## Continuidade, sem repetir este lote

**Necessário antes de publicar:** aprovação única do usuário; consultar versões atuais dos Workers e preservar seus IDs de retorno; publicar o mesmo artefato nos dois modos existentes, sem migrações/segredos. Para Pages, transportar apenas arquivos públicos e seus testes para checkout separado a partir do `origin/main` consultado novamente. Não enviar todo o histórico local do portal para `main`.

**Importante em lote próprio:** idempotência na criação de registro se a gravação ocorrer e a resposta se perder; teste com aparelhos/leitores de tela reais; reconciliar os manifestos/locks remotos com as dependências corrigidas usadas pelo Worker. Os 15 alertas observados no GitHub em 14/10 são históricos e não foram recontados neste lote. O alerta upstream de `braces` em desenvolvimento/build continua documentado, não ocultado.

**Opcional:** refinamentos orientados por dificuldade real de uso relatada por pacientes, mantendo funções encontráveis e sem adicionar blocos explicativos concorrentes.

**Não fazer:** mudar login/sessões para refino cosmético, reduzir MFA, limpar armazenamento para forçar atualização, alterar conteúdo escrito, adicionar cobrança/serviços pagos, reinventar mapa/catálogos ou declarar “sem chance de erro”.

Depois de autorização e publicação: verificar endpoints, build, assets, sessão anônima e interface dos dois endereços; não apagar conteúdo pendente para atualizar o aplicativo.
