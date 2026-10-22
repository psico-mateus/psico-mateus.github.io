# Publicações do refinamento inclusivo — outubro de 2026

> Última publicação: **22/10/2026**, fonte `7f7f7c2`, build `3293a66cfef38d7a`. Estado e retorno atuais estão na seção **Continuação de 22/10 — avisos, atualizações e respostas de conta** ao final. As seções anteriores são históricas; seus alvos de rollback não devem ser confundidos com os deste último lote.

> Houve uma segunda publicação do portal nesta data, aprovada com “poste”. O estado mais recente e os pontos de retorno desse lote estão na seção **Continuação publicada — foco, avisos e compartilhamento conferido** ao final. O registro abaixo do primeiro lote permanece histórico; Pages/Guia não foram modificados no segundo lote.

O usuário respondeu “pode mudar” à pergunta explícita “Posso publicar o conjunto preparado?”. O escopo aprovado é o conjunto descrito em `refinamento-inclusivo-2026-10-15.md`. Nenhuma migração, troca de segredo, mudança de permissões, serviço pago ou manipulação de dados reais foi incluída.

## Antes do envio

- Fonte do portal: `34fa215`, branch `agent/refinos-inclusivos-20261014`, checkout limpo. Build já testado: **`7205d2d2645a1d72`**.
- Snapshot persistente e sanitizado: `/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/publicacao-20261015/worker-34fa215-8VEU1f`. Comparação recursiva confirmou 129 arquivos de build idênticos, sem symlinks ou arquivos de ambiente. Configurações copiadas são as existentes, sem alterações.
- Os dois dry-runs passaram fora da pasta de desenvolvimento, evitando o redirecionamento do Vite para sua configuração gerada. Legado continua em modo `local`; principal em `proxy` com `LEGACY_PORTAL=registros`; mesmo D1 `f2c23652-0c2d-49f0-ad25-99fc61c2ac6a`.
- Versões atuais consultadas por Wrangler antes do envio: principal **`8d4538bf-3cba-49da-abe8-8a1bebb0cb63`**, legado **`ea2910f9-449f-4f0c-87ab-27f9cbc9877b`**. São os alvos de retorno deste lote, não os alvos mais antigos dos relatórios de 14/10.
- GitHub Pages: `origin/main` novamente consultado e mantido em `f62ce6b1755b0f6890f916f045e2ac31d46757c8`. Branch pública local `publicacao/refinamento-inclusivo-20261015`, HEAD `c708a7ef8ab4b28e51b5a61a0359b7d8768be6e6`, árvore `b55b5f9c03b4282053ce9134d0819d11028f8010`.
- O checkout público existente foi reutilizado. Cherry-pick de `6e76813` contém somente 11 paths públicos/testes; revisão independente confirmou todos os blobs iguais à fonte testada, sem portal, env, banco ou configuração de hospedagem. Dry-run do push normal em fast-forward aprovado; não será usado force-push.
- A suíte pública não foi repetida no transporte porque os blobs públicos/testes são idênticos aos já validados (136 aprovados, 59 skips intencionais). O complemento de interface não mudou esses arquivos.

## Retorno rápido de código, sem restaurar/apagar banco

Somente se uma regressão exigir retorno, usando o mesmo Wrangler já autenticado e os arquivos de configuração existentes:

```sh
pnpm exec wrangler rollback 8d4538bf-3cba-49da-abe8-8a1bebb0cb63 --config wrangler.jsonc --message "Retorno anterior ao refinamento inclusivo 2026-10-15" --yes
pnpm exec wrangler rollback ea2910f9-449f-4f0c-87ab-27f9cbc9877b --config wrangler.legacy.jsonc --message "Retorno anterior ao refinamento inclusivo 2026-10-15" --yes
```

Isso retorna código/assets, não reverte dados clínicos. Para Pages, reverter normalmente o commit público `c708a7e`, preservando mudanças posteriores e sem force-push. Base anterior registrada acima. Não executar estas ações apenas por este documento existir.

## Execução e verificações

Publicação concluída após os dry-runs. Foi usado `--keep-vars`; segredos não foram enviados, alterados ou removidos.

| Ambiente | Versão publicada |
|---|---|
| Legado/API `registros` | `4ec8a8ca-4a39-4406-a387-214b0c09cc32` |
| Principal `area-do-paciente` | `7457e7e9-8fd7-4c11-a790-72ca21303f87` |
| Pages `main` | `c708a7ef8ab4b28e51b5a61a0359b7d8768be6e6` |

- Wrangler confirmou as duas versões em 100% do tráfego; deploy legado às 21:30 UTC e principal às 21:31 UTC. Principal mantém o vínculo com o legado; mesmo banco e modos existentes.
- SW de ambos os portais retornou 200 com fingerprint **`7205d2d2645a1d72`**. Sessão anônima dos dois retornou `user: null` sem criar cookie.
- `scripts/smoke-public.mjs` aprovado: site, Guia, portais e health retornaram 200; HTTP dos dois portais redirecionou com 308 para HTTPS; cabeçalhos de proteção conferidos. Zero requisições autenticadas ou escritas.
- Push público normal, em fast-forward, de `f62ce6b` para `c708a7e`. `git ls-remote` confirmou o novo `main`; sete arquivos públicos publicados tiveram SHA-256 idêntico aos blobs aprovados, incluindo os dois JS, quatro HTMLs e SW v32. Nenhum arquivo do portal foi levado junto para Pages.
- QA renderizada dos portais: **8/8 cenários**, principal e legado, Chromium 1366×900 e WebKit 390×844, contextos novos. Login/cadastro anônimos, alternância, convite, 18+/privacidade, requisitos de senha, manifesto e ícones conferidos sem submit real. Com API inteiramente interceptada: registro privado salvo volta à lista antes filtrada, foco e anúncio de Atualizar, divergência de senha junto do formulário e descrição vinculada. Sem overlay, overflow, erro inesperado de console ou violação axe nos estados verificados; zero escrita em produção.
- QA pública de site/Guia: dois motores nas mesmas larguras; identidade/tela não vazia, FAQ, menu móvel por teclado e foco de destino, busca Ansiedade, modal, isolamento do fundo, Escape e retorno de foco passaram. Sem requisições estrangeiras, escritas, overflow ou erro inesperado. Contextos descartáveis não acessam o rascunho do usuário.
- Capturas públicas e dos portais foram abertas e inspecionadas, não somente geradas. A verificação visual não substitui teste em iPhone físico ou leitura humana com VoiceOver/NVDA.

Evidências persistentes, fora do Git:

- Snapshot sanitizado, script/JSON/capturas públicas: `publicacao-20261015/` sob a mesma raiz de visualizações deste lote.
- Script, JSON e capturas dos oito cenários do portal: `refinos-publicacao-20261015/` sob essa raiz. Browser plugin indisponível; usado Playwright existente em contexto separado, não a sessão do usuário.

O GitHub voltou a informar 15 alertas de dependências na árvore remota durante o push (4 críticos, 8 altos, 2 moderados, 1 baixo). A publicação isolada pública não mudou manifestos/locks antigos remotos; o Worker foi construído com as dependências corrigidas já registradas em 14/10. Não foi feita nova análise individual nem declarado que os alertas estão resolvidos. Reconciliação remota e alerta upstream de desenvolvimento/build continuam pendências separadas.

Não haverá criação de conta, submit de login/MFA real ou leitura de registros de pacientes em produção. Verificação pública é anônima; verificação de telas autenticadas usa contextos novos e API completamente simulada, com requisições estrangeiras bloqueadas. O teste isolado de cadastro/login/sessão/D1 do primeiro lote permanece registrado no relatório de preparação, não deve ser apresentado como teste autenticado real em produção.

Para carregar a atualização no app já aberto, salvar qualquer texto em edição antes de atualizar a página. Não limpar armazenamento do navegador ou reinstalar para forçar a atualização.

## Continuação publicada — foco, avisos e compartilhamento conferido

Publicação aprovada pelo usuário com **“poste”**, após o resumo das melhorias e dos testes. Fonte `96fcbc4`, branch `agent/refinos-inclusivos-20261014`, árvore limpa antes do envio. Commits do lote: `71c4f4d`, `6897429` e `96fcbc4`.

Escopo exato: três componentes de interface e quatro arquivos de testes. No profissional, confirmação atrasada de leitura respeita a navegação e “Mostrar menos” mantém um destino de teclado. Avisos mantêm foco e anunciam a conclusão de atualização manual, sem duplicar consulta. No mapa, respostas lentas respeitam foco/navegação; uma resposta perdida após compartilhar/revogar deixa o estado não confirmado até consulta explícita, sem repetir a alteração ou afirmar que nada mudou. O caso em que o salvamento falha antes de enviar compartilhamento continua descrito como sem alteração.

Não houve alteração de autenticação, MFA, sessões, API, esquema, migrações, segredos, dependências, catálogo ou conteúdo clínico. Nenhum serviço novo foi configurado. Mesmo D1 e mesmos modos `proxy`/`local`; site profissional e Guia permanecem na publicação anterior, sem push ou merge neste lote.

### Artefato e validação anterior

- Build sanitizado **`9ee10b1041674e18`**, já aprovado no lote de implementação; não foi reconstruído durante o envio.
- Snapshot persistente: `/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/publicacao-next-20261015-96fcbc4-SqDnHb`. Comparação recursiva confirmou 129 arquivos idênticos ao build validado, configurações existentes idênticas, nenhum symlink ou arquivo de ambiente. Dry-runs dos dois modos passaram fora do checkout de desenvolvimento.
- Lint, tipos e build aprovados; **313/313** testes gerais. Interface local: avisos **27/27**, profissional/recibos **26/26**, mapa **37/37**, em cada um de Chromium e WebKit: **180 casos aprovados**, sem falhas/skips. Casos novos foram reproduzidos antes das correções; APIs simuladas e origens externas bloqueadas.
- Evidências locais: `refinos-20261015-next/notices-{chromium,webkit}`, `refinos-20261015-next-history/{chromium,webkit}` e `refinos-20261015-next-map/verified-{chromium,webkit}`, sob a mesma raiz persistente de visualizações.

### Versões efetivamente publicadas

As versões anteriores foram consultadas imediatamente antes do envio. Legado publicado primeiro, com saúde/sessão anônima/build conferidos antes da conclusão do principal. Ambos enviados com `--keep-vars`, sem envio/troca de segredos.

| Ambiente | Versão atual | Versão anterior para retorno deste lote |
|---|---|---|
| Principal `area-do-paciente` | `166726e0-03ad-4fee-892c-fd2187882d64` | `7457e7e9-8fd7-4c11-a790-72ca21303f87` |
| Legado/API `registros` | `734273fc-631b-4766-80d3-7e13bde89fd3` | `4ec8a8ca-4a39-4406-a387-214b0c09cc32` |

Wrangler confirmou 100% do tráfego nas versões atuais: deployment principal `830c47d0-3cfc-4089-96ca-48bd2d046bac`, legado `817fbb27-76ad-4295-b441-c7cb4d4cdfd1`, ambos em 15/10/2026.

Somente se necessário por regressão deste lote, usar os pontos de retorno acima, não os alvos mais antigos do primeiro lote:

```sh
pnpm exec wrangler rollback 7457e7e9-8fd7-4c11-a790-72ca21303f87 --config wrangler.jsonc --message "Retorno anterior ao lote 96fcbc4" --yes
pnpm exec wrangler rollback 4ec8a8ca-4a39-4406-a387-214b0c09cc32 --config wrangler.legacy.jsonc --message "Retorno anterior ao lote 96fcbc4" --yes
```

Isso retorna código/assets, não apaga nem restaura o banco. Não executar retorno somente porque os comandos estão documentados.

### Conferência após publicação

- Smoke público existente aprovado: páginas/health 200, HTTP→HTTPS 308, cabeçalhos de proteção e ausência de cookie público. SW dos dois endereços corresponde ao build **`9ee10b1041674e18`**; sessão anônima retorna `user: null`.
- Browser plugin não disponível; Playwright existente, contextos novos, Chromium 1366×900 e WebKit 390×844. **8/8 cenários aprovados**: dois endereços × dois motores × anônimo/API inteiramente simulada. Identidade/conteúdo, console, ausência de overlay/overflow, acessibilidade automatizada e imagens conferidos.
- Anônimo: alternância login/cadastro, convite, 18+, privacidade, senha, manifest e ícones, sem submit real. Simulado: atualização de avisos por teclado com deduplicação; perda de resposta após compartilhar e após revogar o mapa, estado não confirmado e recuperação explícita por GET, exatamente um PATCH por ação.
- Zero escritas reais, APIs autenticadas reais ou requisições estrangeiras nesses testes. Script/JSON/32 capturas em `qa/` dentro do snapshot; capturas representativas mobile/desktop abertas e inspecionadas.
- Sem teste em iPhone físico, VoiceOver/NVDA ou login/cadastro autenticado real em produção. Esses resultados não são garantia de ausência absoluta de erro nem uma nova auditoria de dependências.

Para receber a atualização em uma aba/app já aberto, salvar textos pendentes antes de atualizar. Não limpar cookies/armazenamento nem reinstalar para forçar a versão.

## Continuação de 22/10 — avisos, atualizações e respostas de conta

Publicação já aprovada pelo usuário com **“sim”** à pergunta de publicação deste conjunto, retomada após a interrupção com **“continue”**. Fonte `7f7f7c2a9ebf27665bc1f4085ae63cacc0ff1ec3`, branch `agent/refinos-inclusivos-20261014`, checkout limpo antes do envio. Commits preparados: `8e56d07`, `0d1f294`, `7f7f7c2`. Não houve nova implementação durante esta etapa de transporte.

### Escopo publicado

- `app/PatientNotices.tsx`: retry de avisos tem destino de foco estável; paginação conserva a navegação, deduplica consultas e move o foco para o primeiro aviso novo somente quando a pessoa não mudou de destino. Página final/vazia e erros têm fallback apropriado, com limpeza dos observadores.
- `app/ProfessionalDashboard.tsx`: atualização manual da lista e dos conteúdos preserva o botão focado, evita consultas repetidas e anuncia apenas a conclusão da área correspondente. Retentativa não perde o foco; respostas antigas respeitam seleção e desmontagem.
- `app/PortalApp.tsx`: exportação e emissão de código de recuperação ignoram respostas antigas após saída/troca da conta, inclusive no intervalo anterior à desmontagem da tela. Cancelamento e guardas não alteram payloads, permissões ou funcionamento do servidor. Cancelar uma consulta não desfaz uma operação já aceita pelo servidor.
- Três arquivos de testes acompanham essas correções: `tests/patient-notices-ui.test.mjs`, `tests/professional-history-ui.test.mjs`, `tests/patient-account-ui.test.mjs`.

Revisão independente confirmou exatamente esses seis paths desde `a28f08d`. Worker/API, autenticação, MFA, sessões, banco, schema/migrações, segredos, dependências, configurações de hospedagem e conteúdo clínico não mudaram. Não há novo serviço ou plano pago. Nenhum dado real de paciente foi acrescentado ao repositório. Os casos tardios de conta foram reproduções sintéticas controladas, não evidência de incidente em produção.

### Artefato e validação anterior ao envio

- Build sanitizado **`3293a66cfef38d7a`**, reutilizado sem reconstrução. Snapshot persistente: `/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/publicacao-20261021-7f7f7c2-AaW8k2`. O nome da pasta preserva a preparação de 21/10; o envio efetivo foi em 22/10.
- Comparação recursiva confirmou os 129 arquivos de build e as duas configurações idênticos à fonte validada, sem symlinks ou arquivos de ambiente. Revisão independente recalculou e confirmou o fingerprint. Os dois dry-runs passaram no snapshot externo, sem redirecionamento de configuração de desenvolvimento.
- Lint, tipos, build e **313/313 testes gerais** aprovados na preparação. Interface: avisos **38/38**, profissional/recibos **35/35**, conta **26/26**, em cada motor Chromium e WebKit (**198 casos**). Nove casos direcionados de atualização profissional foram repetidos após a organização final exigida pelo lint. Testes locais usam APIs simuladas, sem dados reais.
- Evidências locais preservadas sob a mesma raiz: `refinos-20261021/notices-final-{chromium,webkit}`, `refino-20261021-professional/final-{chromium,webkit}`, `refino-20261021-professional/final-version-{chromium,webkit}`, `refino-20261021-professional/lint-verified` e `refino-20261021-export/final-{chromium,webkit}`.
- Site profissional e Guia não tiveram arquivos publicados neste lote. `git ls-remote` confirmou `main` ainda em `c708a7ef8ab4b28e51b5a61a0359b7d8768be6e6`. Não houve push nem merge.

### Versões atuais e retorno deste lote

Versões anteriores consultadas novamente imediatamente antes do envio. Legado publicado primeiro, com saúde/sessão anônima/build verificados antes da publicação principal. Ambos enviados com `--keep-vars`, sem envio/troca de segredos. Mesmo D1 `f2c23652-0c2d-49f0-ad25-99fc61c2ac6a`, modo `local` no legado e `proxy`/`LEGACY_PORTAL=registros` no principal.

| Ambiente | Versão publicada em 22/10 | Versão anterior para retorno deste lote |
|---|---|---|
| Principal `area-do-paciente` | `149496d9-421d-42cd-878a-1b758cae545b` | `166726e0-03ad-4fee-892c-fd2187882d64` |
| Legado/API `registros` | `4f4b37f6-0108-4a72-8fe9-e97426511417` | `734273fc-631b-4766-80d3-7e13bde89fd3` |

Wrangler confirmou **100% do tráfego**: deployment principal `d5d88a67-af04-4602-bdbf-6aa9100b6408` às 20:24:39 UTC e legado `931e5d4c-8a33-42c2-8ba6-085230c5170c` às 20:24:09 UTC de 22/10/2026.

Somente se necessário por regressão, executar no snapshot externo para evitar a configuração gerada pelo Vite. Os comandos abaixo retornam código/assets; não apagam nem restauram o banco e não devem ser executados apenas por estarem documentados:

```sh
export PATH="/Users/mateus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
cd "/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/publicacao-20261021-7f7f7c2-AaW8k2"
WRANGLER="/Users/mateus/Documents/Codex/2026-07-16/computador-plugin-computer-use-openai-bundled/work/psico-mateus-fase-1/portal-production/node_modules/.bin/wrangler"
"$WRANGLER" rollback 166726e0-03ad-4fee-892c-fd2187882d64 --config wrangler.jsonc --message "Retorno anterior ao lote 7f7f7c2" --yes
"$WRANGLER" rollback 734273fc-631b-4766-80d3-7e13bde89fd3 --config wrangler.legacy.jsonc --message "Retorno anterior ao lote 7f7f7c2" --yes
```

### Conferência após o envio

- Saúde e SW dos dois endereços retornaram 200, com build **`3293a66cfef38d7a`**; sessão anônima retornou `user: null`, sem criar cookie. `scripts/smoke-public.mjs` aprovado: site/Guia/portais/health 200, HTTP→HTTPS 308 e cabeçalhos de proteção conferidos.
- Browser plugin indisponível; usado Playwright existente, contextos novos e descartáveis. Rodada final **12/12 cenários aprovados**: dois endereços × Chromium 1366×900/WebKit 390×844 × anônimo/avisos simulados/profissional simulado. Login/cadastro foram apenas alternados e inspecionados, sem submit; convite, 18+/privacidade, senha, manifesto e ícones conferidos.
- Com todas as APIs autenticadas inteiramente interceptadas: retry/paginação dos avisos, foco no primeiro aviso novo, atualização da lista profissional e dos conteúdos, deduplicação de GET e anúncios de conclusão passaram. Zero escritas reais, requisições autenticadas reais ou requisições estrangeiras. Sem overlay, overflow, erro inesperado de runtime/console ou violação axe nos estados finais verificados. Script/JSON/capturas em `qa/` no snapshot; capturas representativas mobile e desktop foram abertas e inspecionadas.
- Ressalva de teste: a primeira rodada parou após oito cenários aprovados por uma asserção intermitente de foco no profissional WebKit logo após navegar para um paciente. Não voltou a falhar no caso isolado (1/1), sequência WebKit (6/6) ou rodada final (12/12), mantendo as asserções. Uma disputa com o foco agendado da navegação é hipótese, não causa confirmada. Sem alteração do produto ou enfraquecimento da asserção para obter aprovação; acompanhar se houver reprodução consistente.
- Não houve teste em iPhone físico, VoiceOver/NVDA humano ou cadastro/login autenticado real em produção. As rotinas autenticadas/D1 não foram repetidas neste lote somente de frontend; não afirmar que o transporte anônimo prova o funcionamento de todo login. Não foi feita nova auditoria de dependências. Pendências upstream/remotas já registradas continuam separadas.

Salvar qualquer texto em edição antes de atualizar uma aba/app aberto. Não limpar cookies/localStorage nem reinstalar para forçar a atualização. Guia continua público, sem conta e sem alteração do armazenamento local neste lote; registros continuam privados por padrão, compartilhamento opcional, profissional sem edição do texto, MFA obrigatório e convites de uso único/18+ preservados por ausência de mudança nessas regras.
