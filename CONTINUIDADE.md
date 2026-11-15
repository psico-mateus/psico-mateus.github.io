# Continuidade — Psico Mateus

Atualizado em **13/11/2026** (America/Sao_Paulo). Ler inteiro antes de trabalhar
em qualquer computador ou com qualquer assistente, e atualizar ao concluir cada
etapa, conforme `AGENTS.md`. O código é a fonte principal.

Este arquivo foi reorganizado em 13/11/2026 para mostrar primeiro o estado
atual. **Nada foi apagado:** o texto anterior, com todas as sessões de 27/10 a
13/11, está inteiro em
[`docs/historico-continuidade-ate-2026-11-13.md`](docs/historico-continuidade-ate-2026-11-13.md).
Relatórios detalhados de cada etapa ficam em `portal-production/docs/`.

## 1. Comece aqui

### O projeto em poucas linhas

Três sites do psicólogo Mateus Ribeiro Marcos (Matt), CRP 08/38930:

| Site | Onde está no repositório | Como vai ao ar |
| --- | --- | --- |
| Site profissional | raiz: `index.html`, `assets/`, `cuidados/`, `privacidade/` | GitHub Pages, branch `main` |
| Guia de Emoções | `guia-emocoes/` e `assets/` | GitHub Pages, branch `main` |
| Área do paciente | `portal-production/` | dois Cloudflare Workers e um banco D1 |

- Repositório: `https://github.com/psico-mateus/psico-mateus.github.io.git`.
- **Branch compartilhada de trabalho: `trabalho/continuidade-mac-windows`.**
  `main` é só a publicação do site e do Guia; não usá-la para transportar o portal.
- Cada tarefa usa branch própria, `tarefa/<mac|windows|nuvem>-<descricao>-<AAAAMMDD>`,
  integrada por fast-forward na branch compartilhada.
- Commit e push na branch de trabalho servem à continuidade. **Publicar é outra
  ação** e exige aprovação explícita do Matt (seção 9).

### Estado em 14/11/2026: tudo o que estava pronto foi publicado

- **Área do paciente:** no ar com o lote acumulado (dependências de 28/10,
  refinos de foco de 04/11, `c1a1243`/`cbe3c43`, React 19.2.9) e com o aviso de
  crise 192/CVV 188. Desde 14/11, também com o aviso de privacidade de
  14/11/2026, o comunicado da mudança aos pacientes e a exclusão de conta pelo
  profissional. Build `f6067844ef8da627`, fonte `3aaae45`. Versões e rollback na
  seção 2.
- **Site profissional:** `main` em `0d17335`, com a cópia acessível do link do
  Guia (`main.js?v=20261113-guide-copy`) e a imagem de prévia da Área do paciente
  reduzida para 323 KB.
- **Guia de Emoções:** sem mudança pendente; o que está no ar é a versão atual.
- O Matt abriu o portal no próprio celular após a publicação e relatou que "a
  princípio" funciona. Não houve teste autenticado em produção por assistente.

### Decisões do Matt que valem daqui em diante

- **Nenhum gasto:** sem domínio próprio, serviço pago ou plano pago.
- **Sem valor da sessão no site.**
- **Manter o histórico** do projeto, para poder trocar de assistente. Pode ser
  reescrito com mais clareza; conteúdo relevante não se apaga, vai para `docs/`.
- As confirmações de publicação em `.claude/settings.json` ficam como estão.
- O incidente de senhas de 10–11/11 no PC Windows (depois formatado) foi
  resolvido: em 13/11 o Matt informou que revisou todas as contas, sem problemas.
- Tratar por "Matt". Linguagem simples e direta: ele é psicólogo, não programador.
  Fazer o que as permissões permitem em vez de devolver tarefas; perguntar só o
  indispensável. Dizer sempre o que foi alterado, testado, enviado e publicado.

### Pendências

Dependem do Matt:

1. **iPhone testado pelo Matt em 14/11**, depois da publicação do aviso de
   privacidade, da nota de crise e da exclusão de conta. Ele não tem Android:
   essa plataforma fica sem teste físico.
2. **Plano de revisão do mês:** [`docs/plano-revisao-2026-11.md`](docs/plano-revisao-2026-11.md).
   Itens 1, 2, 3 e 4 feitos e publicados. O próximo grande é a criptografia dos
   registros no banco (prioridade 2); cada item espera o "sim" do Matt.

Técnicas, sem urgência:

3. Cadeia de lint: 1 alerta moderado só de desenvolvimento (minimatch 10.2.5 via
   ESLint/typescript-estree). A correção 11.0.1 é major; fazer em lote próprio,
   sem `audit fix --force` nem override major.
4. Windows: o PC foi formatado; refazer clone e ambiente pela seção 5. A suíte
   completa lá depende de WSL2, bloqueado pela virtualização desligada no
   firmware (seção 10).
5. Diff editorial arquivado `6cb6ac0` (branch `arquivo/site-local-mac-20261027`):
   revisar e integrar só se útil, comparando com a redação atual.
6. Idempotência do POST de novo registro após perda de resposta: projeto próprio
   (servidor, esquema e concorrência), não ajuste visual.
7. Sugestões da avaliação de 13/11, sem decisão: enxugar a repetição Guia/Área
   na página inicial; dividir `PortalApp.tsx` (4.180 linhas),
   `ProfessionalDashboard.tsx` (2.716) e `app/api/portal/[...segments]/route.ts`
   (2.436) quando houver motivo para mexer neles.
8. As actions do workflow (`actions/checkout@v4`, `setup-node@v4`,
   `pnpm/action-setup@v4`) usam Node 20, que o GitHub já força para Node 24 com
   aviso. Atualizar as versões quando houver releases estáveis com Node 24.

### Registro das sessões

Novas entradas datadas entram aqui, a mais recente primeiro. Se o estado, as
decisões ou as pendências acima mudarem, atualize-os também. Sessões anteriores
a 13/11 estão no arquivo de histórico.

#### 15/11/2026 — Mac, Claude Code: foco do menu em aparelho lento

- Os avisos de falha do GitHub Actions (commits `87728dd` e `97cbf13`, só
  documentação) eram de `tests/public-focus.spec.mjs` em mobile-webkit: o foco
  não chegava ao primeiro link do menu. Lidos pelas anotações do relator
  `github`, sem login.
- **Causa real:** `openMenu` em `assets/js/main.js` tentava mover o foco uma
  única vez, 180 ms depois de abrir. Em aparelho lento o menu ainda não estava
  visível e o foco ficava no botão. Agora tenta de novo a cada 50 ms por até
  1,5 s, sem roubar foco de quem já navegou. `main.js?v=20261115-menu-focus` em
  `index.html`, `cuidados/` e `privacidade/`.
- Teste novo "em aparelho lento, o foco chega ao menu..." (atrasa a visibilidade
  do menu em 450 ms): falhava nos 3 projetos antes; depois, `public-focus` 10×
  com 210 aprovados.
- `tests/guide-resilience.spec.mjs:183` clicava antes de o Guia terminar de
  recarregar; passou a esperar `.guide-filter-label`, como `openSummary`.
- Branch `tarefa/mac-foco-menu-lento-20261115`. Suíte do site 8×: **1.344
  aprovados, 0 falhas**.
- **Publicado na `main` com o "sim" do Matt:** `749501d..5e19372`, só
  `assets/js/main.js` e o `?v=` nas três páginas; árvore da `main` testada 2×
  (272 aprovados, 0 falhas). No ar: as três páginas servem
  `main.js?v=20261115-menu-focus` com a nova lógica.
- O `git push` para a `main` não mostrou mais o aviso de alertas de
  dependências: os 45 alertas fecharam depois da limpeza de `749501d`.

#### 15/11/2026 — Mac, Claude Code: limpeza da `main`

- A `main` carregava `portal-production/` (93 arquivos, cópia de outubro do
  portal) e `portal-prototipo/` (11). Nenhuma página usava; os arquivos ficavam
  acessíveis pelo endereço público (ex.: `portal-production/README.md` respondia
  200) e eram a fonte dos 45 alertas de dependências da `main`.
- `749501d` na `main`: removidos os 103 arquivos; mantido só
  `portal-prototipo/public/index.html`, que redireciona links antigos para a Área
  do paciente (conferido no `tests/site-audit.spec.mjs`). `package.json` da
  `main` perdeu os scripts `portal`/`test:portal` e ganhou `packageManager`.
  Lockfile da raiz igual ao da branch de trabalho (audit 0).
- Testes da árvore da `main` 3×: 408 aprovados, 0 falhas. No ar: arquivos antigos
  404; site, Guia, cuidados, privacidade, `curriculo.pdf` e `main.js` 200;
  redirecionamento do protótipo intacto.
- A contagem de alertas do GitHub só é vista com login ou no aviso do próximo
  `git push`; o aviso deste envio ainda mostrava 45, calculado antes da
  reanálise. Conferir no próximo envio.
- O portal continua inteiro na branch de trabalho e no Cloudflare; nada nele mudou.

#### 14/11/2026 — Mac, Claude Code: testes estáveis do Guia e pulo da barra no celular

- Branch `tarefa/mac-testes-guia-estaveis-20261114`. Antes: suíte do site 8×
  com 3 falhas (`guide-flow.spec.mjs:117` duas vezes, `guide-scroll.spec.mjs:85`
  uma), e a parte "Site e Guia" do GitHub Actions caiu por isso.
- **Problema real achado:** em telas até 980 px, `guide-navigation.js` insere
  a barra de atalhos (57 px) só depois da hidratação + 250 ms, empurrando os
  botões do topo. Um toque nesse intervalo caía no vazio. Teste novo em
  `guide-scroll.spec.mjs` mede a posição do botão do carregamento até a barra
  existir: falhava com 57 px nos dois projetos móveis.
- **Correção só de CSS** (`assets/css/guide-brand.css`): enquanto a barra não
  existe, `main .site-header:not(:has(+ .guide-mobile-nav))` reserva a mesma
  altura. Navegadores sem `:has` ficam como antes. `?v=20261114-guide-nav-space`
  em `guia-emocoes/index.html` e `CORE_ASSETS`; `CACHE_NAME` v33; testes que
  conferem esses valores atualizados.
- `guide-flow.spec.mjs:117`: o teste media antes de a janela de detalhes terminar
  de rolar. Agora leva a leitura até o fim e espera 5 quadros estáveis antes de
  medir. Sem aumento de timeout e sem pular teste.
- Depois: teste do pulo 20/20; suíte do site 8× com **1.320 aprovados e 0
  falhas**. O workflow passou a usar `--reporter=github,line` no site, para cada
  falha virar anotação legível sem login (`b808ce0`); a rodada seguinte na
  branch de trabalho passou nos dois trabalhos.
- **Publicado na `main` com o "sim" do Matt:** `3e4860d..f5c478c`, somente
  `guide-brand.css`, `guia-emocoes/index.html`, `guia-emocoes/sw.js` e as
  versões nos três testes que as conferem. Árvore da `main` testada 3×: 408
  aprovados, 0 falhas. No ar: CSS `?v=20261114-guide-nav-space`, SW
  `guia-emocoes-scoped-v33`; pulo do botão medido no Guia publicado: **0 px** em
  WebKit e Chromium móveis.
- A `main` tinha recebido antes `3e4860d` ("Adiciona currículo em PDF"), feito
  por outra sessão do Claude na nuvem: só `curriculo.pdf`, preservado.
- Notas: a API do GitHub sem login aceita 60 consultas por hora; esperar o
  Actions consultando no máximo uma vez por minuto.

#### 14/11/2026 — Mac, Claude Code: testes no GitHub, aviso de privacidade e exclusão de conta

- **Decisões do Matt no chat:** aprova a atualização do aviso de privacidade;
  contas desativadas ficam guardadas sem prazo, "a não ser que eu decida
  apagar"; pediu a exclusão pelo profissional e a publicação.
- **Testes automáticos** (`.github/workflows/testes.yml`): a cada envio a
  `trabalho/**` ou `tarefa/**`, roda site e Guia (Chromium e WebKit) e o portal
  (lint, `pnpm test`, integração isolada, restauração e build sanitizado). Só
  testa; sem segredos, sem Cloudflare, sem publicação. Gratuito (repositório
  público). Sem login do GitHub no Mac, o registro de falhas não é legível por
  aqui: a página pede login.
- **Aviso de privacidade 2026-11-14** (`app/privacidade/page.tsx`,
  `PRIVACY_VERSION`): nomeia o responsável (CRP), a Cloudflare, o texto legível
  no banco e o acesso técnico do administrador com compromisso de não ler o que
  não foi compartilhado, contas desativadas guardadas sem prazo, cópias
  automáticas por até 30 dias (Time Travel do D1; 30 dias no plano pago, 7 no
  gratuito: o texto usa o máximo) e a seção "Mudanças neste aviso".
- **Comunicado da mudança** (`app/PrivacyNoticeUpdate.tsx`,
  `lib/privacy-notice.ts`, `POST /account/privacy-notice`): pacientes com versão
  anterior veem um aviso no topo do início, com link e "Entendi". A ciência grava
  a versão em `users.privacy_version`, com auditoria; nada no aparelho.
  `/session` e o login informam `privacy_notice_pending`.
- **Exclusão definitiva pelo profissional** (`POST
  /professional/patients/:id/delete-account`, `deletePatientAccount`,
  `app/ProfessionalDeletePatientDialog.tsx`): só para conta já revogada e
  vinculada, com senha, autenticador consumido e marcação "Entendo que a
  exclusão é definitiva". Auditoria e `DELETE` na mesma transação; as chaves
  estrangeiras apagam registros, revisões, mapa, avisos, visualizações e sessões;
  convite usado fica com `patient_id` nulo.
- **Testes:** primeiro falhando, depois aprovados. `tests/professional-delete-patient.test.mjs`
  (6, com SQL e migrações reais), dois em `portal.test.mjs`, telas novas em
  `patient-home-ui` e `patient-notices-ui`, 9 verificações novas na integração.
  Final: lint ok; **336/336**; integração **318**; restauração 15 tabelas;
  telas **258/258 Chromium e 258/258 WebKit**; MFA 4/4; site 163/59 skips em três
  repetições. GitHub Actions no commit combinado: portal aprovado; "Site e Guia"
  falhou por um dos dois testes instáveis do Guia (estabilizados no mesmo dia).
- **PUBLICADO** com o "sim" do Matt: seção 9, versões anteriores anotadas,
  snapshot limpo, dry-runs, legado primeiro. Build `f6067844ef8da627`, fonte
  `3aaae45`. Os dois links: HTTP 200, sessão anônima, SW novo, `/config` com
  `privacy_version` 2026-11-14, `/privacidade` com a nova data e
  `delete-account` sem sessão responde 401. `smoke-public` ok. Sem migração.

#### 13/11/2026 — Mac, Claude Code: aviso de crise no portal (item 1 do plano)

- Branch `tarefa/mac-aviso-crise-portal-20261113`. Rodapé do portal passa a
  dizer "ligue 192 (SAMU)" e a citar o CVV 188, com link "Cuidados e ajuda
  imediata" para a página `cuidados/` do site. No editor de registro, uma nota
  fixa logo abaixo de "Para salvar, bastam dois campos". Redação aprovada pelo
  Matt no chat. Sem mudança de API, banco ou sessão.
- Teste novo em `tests/portal.test.mjs`, que falhava antes. As telas pegaram
  dois erros da primeira versão, corrigidos sem alterar teste: link sem
  sublinhado (axe `link-in-text-block`) e nota entre o erro de salvar e os
  botões finais (o erro precisa ficar colado em `.form-finish`).
- Depois: lint ok; **328/328**; telas **253/253 Chromium e 253/253 WebKit**;
  recuperação MFA 4/4. Captura em 390 px conferida.
- **PUBLICADO no mesmo dia, com o "sim" do Matt:** integração isolada 309 antes;
  procedimento da seção 9 (versões anotadas, snapshot limpo, dry-runs, legado
  primeiro). Build `9b070ada831f7784`, fonte `e6e52e4`. Os dois links com HTTP
  200, sessão anônima e SW novo; `smoke-public` ok; texto novo conferido nos
  arquivos servidos. Foi junto a declaração 1200×675 de `layout.tsx`. Uma
  primeira tentativa do deploy do legado falhou antes de enviar (Node fora do
  PATH no comando) e não alterou nada.

#### 13/11/2026 — Mac, Claude Code: revisão do núcleo do portal e plano do mês

- A pedido do Matt, leitura do núcleo de segurança do portal e do aviso de
  privacidade. Conclusão: a base de autenticação e autorização é sólida e não
  precisa mudar. Lacunas e proposta por prioridade em
  `docs/plano-revisao-2026-11.md`. Só leitura e documentação; nada publicado.

#### 13/11/2026 — Mac, Claude Code: reorganização deste arquivo

- O arquivo anterior (886 linhas) foi copiado inteiro para
  `docs/historico-continuidade-ate-2026-11-13.md`. As seções 1, 2, 3, 8 e 10
  foram reescritas com o estado atual; as seções 4 a 7 e 9 (rotinas, instalação,
  configuração, testes e publicação) foram mantidas. A numeração das seções não
  mudou. `/encerrar` passou a apontar para este registro.
- Só documentação: nenhum código, teste ou publicação.

#### 13/11/2026 — Mac, Claude Code: validação, publicação e avaliação

- Primeira sessão do Claude Code no Mac; o Matt migrou do ChatGPT (modo Work).
  Node 24.22.1 instalado sem sudo, do tarball oficial com checksum conferido, em
  `~/.local/opt/node-v24.22.1-darwin-arm64`, com pnpm 11.25.0. O Matt adicionou
  esse caminho ao `~/.zprofile`. O Mac tem push ao GitHub e login no Cloudflare.
- **Validação em `ff1cede`:** números na seção 8. Zero falhas, incluindo WebKit
  e todas as telas do portal, que a sessão na nuvem não tinha executado.
- **Publicação aprovada pelo Matt no chat:** portal pelo procedimento da seção 9
  (versões anteriores anotadas, snapshot limpo, dry-runs, legado primeiro, depois
  o oficial, conferência dos dois). Sem migração, segredo ou mudança de banco.
  Site: `c708a7e..d62ebb0` com `assets/js/main.js` e o `?v=` em `index.html`,
  `cuidados/` e `privacidade/` (136 aprovados/59 skips/0 falhas na árvore da
  `main`). `404.html` não carrega `main.js`.
- **Avaliação pedida pelo Matt:** geral 8,5; site 8, Guia 9, Área do paciente 8,5.
- **Retratado:** o botão flutuante do WhatsApp parecia cobrir texto no topo do
  celular. Era defeito do painel de navegador do app; Chromium e WebKit, local e
  no ar, mostram o botão escondido no topo e visível ao rolar. Sem mudança.
- **Imagem de prévia:** `assets/images/social-preview-registros.png` de 2,1 MB
  (1672×941) para 323 KB (1200×675, PNG com paleta, mesmo nome), em `2cd6e22`;
  enviada à `main` em `0d17335` e conferida no ar. Testes depois: raiz
  163/59 skips/0 falhas; portal lint ok e 327/327.

#### 13/11/2026 — nuvem, Claude Code: configuração e correção do React

- `6b07505`: `CLAUDE.md`, regras em `.claude/rules/`, comandos `/retomar`,
  `/validar` e `/encerrar`, travas em `.claude/settings.json`.
- `5d88ad4`: React, React DOM e `react-server-dom-webpack` de 19.2.8 para 19.2.9,
  pelo aviso crítico
  [GHSA-xqc2-xf4c-x3h3](https://github.com/advisories/GHSA-xqc2-xf4c-x3h3).
  Publicado no mesmo dia pelo Mac.
- Sem WebKit e sem Cloudflare naquele ambiente; detalhes no histórico.

## 2. Estado consolidado

### Concluído e preservado

- Site profissional estático e Guia de Emoções público, independente, sem conta,
  com PWA/off-line e rascunho somente no aparelho. Guia não envia dados ao portal.
- Área do paciente real, com convite único de sete dias, confirmação 18+ e
  privacidade, login/sessões, MFA profissional obrigatório e recuperação assistida.
- Registros privados por padrão; compartilhamento individual opcional e revogável;
  histórico/filtros; edição/exclusão/exportação pelo paciente; confirmação explícita
  de visualização; profissional não edita o texto nem consulta conteúdo privado.
- Meu mapa privado, cópias de partes compartilhadas por escolha do paciente,
  avisos individuais sem chat, recursos e Leitura complementar sem rastrear leitura.
- Revogação de vínculo, encerramento de sessões, modo privacidade profissional,
  recuperação/transferência do autenticador e códigos emergenciais existentes.
- Foco estável por teclado e leitor de tela em exportação, exclusão,
  compartilhamento, recarga de registros, resumo do mapa e navegação entre
  pacientes; descarte de respostas antigas após sair ou trocar de conta.
- Ferramentas Mac/Windows: scripts sem atribuição POSIX de ambiente, setup
  sintético local, versões fixas de Node/pnpm, normalização LF e proteção de
  arquivos privados (`7be86b9`).

### Preparado, mas NÃO publicado

Nada. Tudo o que está na branch de trabalho está no ar.

### Produção conferida em 14/11/2026

| Ambiente | Estado / versão |
| --- | --- |
| Site | `https://psico-mateus.github.io/` |
| Guia | `https://psico-mateus.github.io/guia-emocoes/` |
| Área oficial | `https://area-do-paciente.psico-mateus.workers.dev/` |
| Link antigo compatível | `https://registros.psico-mateus.workers.dev/` |
| GitHub Pages | fonte `main`, `/`, build `legacy` (conferido em 27/10) |
| `origin/main` | `5e19372` (só site, Guia, testes, `curriculo.pdf` e o redirecionamento do protótipo) |
| Worker oficial `area-do-paciente` | `336934a6-674c-49b5-a8dc-f1ab85362a89`, 100% |
| Worker legado/API `registros` | `67451734-6987-417b-9a3e-9e44bdfbb85c`, 100% |
| SW dos dois portais | HTTP 200, ID `f6067844ef8da627` |

Versões anteriores, para rollback de código/assets: oficial
`b4d5f0e5-13ee-48ce-bade-b0700ff2d139`, legado
`810130e2-0c03-42a5-ad3f-49e65456e506` (aviso de crise, 13/11, build
`9b070ada831f7784`, fonte `e6e52e4`). Antes delas: `816bc297-…`/`96f8e168-…`
(13/11, `ff1cede`) e `149496d9-…`/`4f4b37f6-…` (22/10, `7f7f7c2`). Um retorno
de código não desfaz a ciência do aviso já gravada nem devolve conta excluída.
Consultar de novo as versões ativas antes de qualquer publicação ou retorno.
O workflow remoto `pages-build-deployment` pertence ao Pages e executa em
`main`; não há workflow de deploy versionado. Não configurar CI que publique
todas as branches.

### Arquitetura que NÃO deve mudar como efeito da troca de computador

- Raiz + `guia-emocoes/`: GitHub Pages, sem build de framework.
- `portal-production/`: React/Next/Vinext, Cloudflare Worker + D1 + Drizzle.
- `wrangler.jsonc`: `area-do-paciente`, API em modo `proxy`, service binding
  `LEGACY_PORTAL=registros`.
- `wrangler.legacy.jsonc`: `registros`, API em modo `local`; mantém os segredos
  necessários às contas existentes e o mesmo D1 `psico-mateus-registros`.
- Mesmo conjunto de contas nos dois links, mas cookies/sessões de navegador
  separados por domínio. Não transformar o legado em redirecionamento simples.
- `portal-prototipo/` é histórico, não o aplicativo de produção nem a primeira
  opção para desenvolver; não confundir seu servidor com `portal-production/`.

## 3. Branches e materiais preservados

- A branch compartilhada nasceu de `cbe3c43` (antiga
  `agent/refinos-inclusivos-20261014`) e contém todo o trabalho do portal.
  Não fazer merge cego de `main` nela, nem enviá-la a `main`.
- Branches `arquivo/*` no GitHub são preservação histórica, **não mesclar
  automaticamente**: `arquivo/auditoria-final-portal` (`bf8583d`),
  `arquivo/sites-portal-release` (`34b3b84`, raiz independente) e
  `arquivo/site-local-mac-20261027` (`6cb6ac0`, três alterações editoriais em
  `index.html`, `cuidados/` e `privacidade/`; ver pendência 5).
- O inventário completo de 27/10 (27 branches locais, 72 commits inéditos,
  checkouts antigos do Mac) está na seção 3 do arquivo de histórico.
- O código e os históricos arquivados foram verificados por caminhos e padrões
  de credenciais antes do envio; nada foi identificado. Não é garantia absoluta
  nem pentest.

## 4. Alternar entre Mac e Windows — rotina obrigatória

### Antes de começar no destino (árvore limpa)

```sh
git status --short --branch
git fetch origin
git switch trabalho/continuidade-mac-windows
git pull --ff-only origin trabalho/continuidade-mac-windows
git log -3 --oneline
```

Se a branch ainda não existir localmente, em vez do `switch` acima:

```sh
git switch --track origin/trabalho/continuidade-mac-windows
```

Se `status` mostrar trabalho local ou `pull --ff-only` recusar divergência,
**não usar reset, force-push ou sobrescrita**. Salvar o lado local em uma branch
própria/commit seguro, conferir os dois históricos e combinar com revisão.
Não executar `git clean` para "resolver" ambiente.

### Antes de desligar/sair do computador de origem

1. Atualizar este arquivo com realizado, pendente e testes/limitações.
2. Revisar alterações e arquivos novos, sem adicionar ambientes/exports/logs.
3. Fazer staging explícito dos arquivos seguros e commit descritivo.
4. Executar na branch de trabalho:

```sh
git diff --check
git status --short --branch
git push origin trabalho/continuidade-mac-windows
git rev-parse HEAD
git ls-remote origin refs/heads/trabalho/continuidade-mac-windows
```

O SHA local deve coincidir com o remoto, e a árvore deve estar limpa. **Commit
local ou stash não basta**: sem push bem-sucedido, o Windows não recebe o trabalho.
Depois dessa confirmação, o Mac pode ser desligado. Não depende de localhost,
sessão do Safari, processo aberto ou acesso remoto ao Mac.

### Trabalho simultâneo

Cada computador/tarefa cria branch própria a partir da compartilhada atualizada:

```sh
git switch -c tarefa/windows-descricao
# No Mac, usar outro nome: tarefa/mac-descricao
# editar, testar, atualizar CONTINUIDADE.md, staging explícito e commit
git push -u origin tarefa/windows-descricao
```

Depois, um responsável atualiza a branch compartilhada com árvore limpa,
faz merge normal da branch revisada, resolve conflitos preservando ambos os
trabalhos, testa e envia. Se preferir PR, a base é a branch compartilhada, **não
`main`**. Não fazer rebase/force de branches já compartilhadas. Combinar código
não autoriza publicar; o lote combinado precisa de validação e aprovação final.

## 5. Instalação em uma máquina nova

Versões conferidas nesta etapa: **Node 24.22.1**, **pnpm 11.25.0**, Git.
`.nvmrc` registra Node; `packageManager` nos dois manifestos registra pnpm.
Não atualizar dependências/lockfiles por hábito. O mínimo antigo declarado pelo
portal não substitui o ambiente conhecido, especialmente para `node:sqlite` e TS.

Instalar Git e Node no sistema escolhido. Se pnpm ainda não estiver disponível:

```sh
npm install --global pnpm@11.25.0
node --version
pnpm --version
git --version
```

Autenticar GitHub separadamente em cada computador, usando o acesso que permite
escrita neste repositório. Login no Safari não equivale necessariamente ao Git
do terminal. Não copiar tokens/cookies nem colocá-los na URL do remoto.
Se Git ainda não tiver identidade de commit, configurar `user.name` e
`user.email` nessa máquina (pode usar o endereço noreply do GitHub); esses campos
não são senha/token. Não copiar o arquivo global de credenciais do Mac.

### Clone — comandos iguais em terminal Mac e PowerShell

Escolher uma pasta própria para código, sem sincronizar `node_modules` por
OneDrive/iCloud. Não usar os caminhos absolutos do Mac no Windows.

```sh
git clone --branch trabalho/continuidade-mac-windows https://github.com/psico-mateus/psico-mateus.github.io.git
cd psico-mateus.github.io
pnpm install --frozen-lockfile
pnpm --dir portal-production install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm --dir portal-production setup:local
```

Instalar **na raiz e no portal**: testes do portal usam Playwright instalado na
raiz. Não copiar `node_modules`, `.wrangler`, builds ou bancos do outro sistema.
Os lockfiles e `portal-production/pnpm-workspace.yaml`/overrides/`allowBuilds`
devem ser preservados. O setup local cria segredos novos e sintéticos só quando
`.env.local` não existe; não imprime valores nem sobrescreve ambiente existente.
Se o PowerShell bloquear o shim `pnpm.ps1`, usar `pnpm.cmd` no lugar de `pnpm`,
sem desativar a política global de segurança.

### Windows: escolha recomendada e limitação honesta

- Os atalhos `dev`, `start`, `build`, `build:worker` usam Node sem sintaxe
  `VAR=valor comando`, compatíveis em desenho com o shell nativo do Windows.
- Na preparação original do Mac não houve execução física no Windows. A
  validação parcial nativa de 27/10 e 30/10 está no arquivo de histórico; não ampliá-la para suíte
  completa, WSL2 ou dependências atualizadas em 28/10 ainda sem teste físico lá.
- A suíte completa inclui testes/runner de integração isolada ainda dependentes
  de caminhos, symlinks e gerenciamento de processos Unix. **Para a validação
  completa, usar WSL2**, em vez de remover guardas ou mascarar falhas nativas.
- No Windows nativo, desenvolvimento, lint, tipos e build são os atalhos
  básicos preparados; verificar seu resultado real nessa máquina. Não considerar
  aprovação Mac ou simulação de argumentos Windows como teste físico.

Com WSL2 já instalado, abrir `wsl.exe` e fazer **um clone dentro de `~/projetos/`**
com Git/Node/pnpm Linux, executando os comandos de instalação acima nesse shell.
Usar esse checkout como o ambiente Windows de trabalho/testes. Se também houver
um clone nativo, são duas cópias: não compartilhar `node_modules` e sincronizar
código por Git. O caminho pode ser visto com `wslpath -w "$PWD"`; comandos Linux
devem rodar no WSL, não em Node do Windows sobre dependências Linux.
Instalação/ativação de WSL2 pode exigir administrador/reinício; não executada aqui.
Se faltarem bibliotecas de navegador no Linux/WSL, o comando
`pnpm exec playwright install --with-deps chromium webkit` instala também
dependências de sistema e pode exigir permissão de administrador. Não foi
executado aqui nem é necessário copiá-las do Mac.

## 6. Configuração local — nomes, nunca valores reais

| Item ignorado/configuração | Uso |
| --- | --- |
| `portal-production/.env.local` | desenvolvimento sintético de cada computador |
| `APP_SECRET` | segredo local sintético independente; NÃO reutilizar o de produção |
| `SETUP_SECRET` | setup local sintético; NÃO copiar o administrativo |
| `PUBLIC_SITE_URL`, `GUIDE_URL` | URLs públicas, presentes no exemplo |
| `.env.production.local` existente no Mac | privado/ignorado; não transportar por Git |
| `PORTAL_TEST_PERSIST_PATH` | estado local descartável separado, nunca banco de produção |
| `WRANGLER_LOG_PATH`, `WRANGLER_WRITE_LOGS`, `MINIFLARE_REGISTRY_PATH` | caminhos/controle local de ferramentas, não credenciais |
| `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` | somente servidor sintético isolado, conforme runner |
| `CLOUDFLARE_PUBLIC_DEPLOY=1` | build público via script, não executa deploy |
| autenticação GitHub/Cloudflare | própria de cada máquina; não versionar armazenamento OAuth |

O ambiente novo não terá as contas locais do Mac; **credenciais de produção não
devem ser usadas em localhost**. Os testes HTTP/D1 criam suas próprias contas.
O D1 real e seus segredos continuam no Cloudflare e não precisam ser copiados
para desenvolver. Não rotacionar `APP_SECRET` de produção por trocar de PC.
Não exportar/copiar o D1 nem credenciais como parte deste fluxo.

Usar `.local/`, `backups-locais/`, `exportacoes-locais/` somente para materiais
privados que precisem permanecer locais; essas pastas são ignoradas. Não tratar
GitHub como backup clínico. Chaves/certificados, HARs, dumps, logs, arquivos de
ambiente, SQLite e artefatos estão protegidos pelo ignore; ainda revisar staging.

## 7. Desenvolvimento e testes

### Site e Guia — raiz, Mac/PowerShell/WSL

```sh
node tests/static-server.mjs
```

Abrir `http://127.0.0.1:4173/` e `/guia-emocoes/`. Outra janela de terminal:

```sh
pnpm test
pnpm test:guide-scroll
```

O Playwright pode reutilizar a porta 4173; conferir que é o projeto certo, não
outro servidor antigo. Não abrir por `file://` para testar PWA/links.

### Portal — dentro de `portal-production`

```sh
pnpm dev --host 127.0.0.1 --port 4440
```

Abrir `http://127.0.0.1:4440/`. Servidor/cookies/banco são locais. Outra janela:

```sh
pnpm lint
pnpm typecheck
pnpm build:worker
pnpm test
pnpm test:integration:isolated
pnpm test:restore-local
pnpm test:smoke-public
```

`test` inclui tipos, build sanitizado e testes gerais. Integração HTTP/D1 e ensaio
de restauração usam dados sintéticos em TMP; usar Mac/WSL2 enquanto as limitações
nativas não forem corrigidas/testadas. Não executar `test:integration` manual
com banco ou credenciais habituais: preferir o runner `:isolated`, que não herda
ambientes privados e recusa produção. `smoke-public` só faz GETs públicos; não
prova login real nem autoriza criação de conta de teste no banco real.

### Interface com API totalmente simulada, servidor 4440 já aberto

Mac/zsh ou WSL, a partir do portal:

```sh
PORTAL_RECORDS_UI_BASE_URL=http://127.0.0.1:4440 PORTAL_RECORDS_UI_BROWSER=webkit PORTAL_RECORDS_UI_OUTPUT="$TMPDIR/psico-records-webkit" node --test tests/patient-records-ui.test.mjs
PORTAL_PROFESSIONAL_HISTORY_UI_BASE_URL=http://127.0.0.1:4440 PORTAL_PROFESSIONAL_HISTORY_UI_BROWSER=webkit PORTAL_PROFESSIONAL_HISTORY_UI_OUTPUT="$TMPDIR/psico-professional-webkit" node --test tests/professional-history-ui.test.mjs
```

No WSL, se `TMPDIR` não estiver definido, definir antes `export TMPDIR=/tmp`.
Para Chromium, trocar motor e pasta de saída. PowerShell nativo, se validando UI:

```powershell
$env:PORTAL_RECORDS_UI_BASE_URL = "http://127.0.0.1:4440"
$env:PORTAL_RECORDS_UI_BROWSER = "webkit"
$env:PORTAL_RECORDS_UI_OUTPUT = Join-Path $env:TEMP "psico-records-webkit"
node --test tests/patient-records-ui.test.mjs
Remove-Item Env:PORTAL_RECORDS_UI_BASE_URL, Env:PORTAL_RECORDS_UI_BROWSER, Env:PORTAL_RECORDS_UI_OUTPUT
```

Demais famílias: `PORTAL_HOME_UI_*`, `PORTAL_ACCOUNT_UI_*`, `PORTAL_MAP_UI_*`,
`PORTAL_NOTICES_UI_*`, `PORTAL_RESOURCES_UI_*`, `PORTAL_PROFESSIONAL_HISTORY_UI_*`.
Confirmar os nomes no topo de cada teste. Visualizações versionadas usam origem/
motor profissional, mas saída `PORTAL_ENTRY_VIEW_UI_OUTPUT`. Definir saídas no
TMP do sistema; não copiar caminhos `/Users/mateus/...` nem usar `/tmp` nativo
como se fosse Linux. Testes UI não aceitam URL de produção.

## 8. Últimos testes e limitações conhecidas

### Validação mais recente — 13/11/2026, Mac, commit `ff1cede`

Só dados sintéticos, APIs simuladas nas telas e zero acesso à produção.

| Etapa | Resultado |
| --- | --- |
| Site e Guia, `pnpm test` (Chromium desktop e mobile, WebKit mobile) | 163 aprovados, 59 skips condicionais, 0 falhas |
| Portal, `pnpm lint` | aprovado |
| Portal, `pnpm test` (tipos, build sanitizado, testes gerais) | 327/327 |
| Portal, `pnpm test:integration:isolated` | 309 verificações, 9 migrações só locais, restart e relogin preservados |
| Portal, `pnpm test:restore-local` | 15 tabelas |
| Portal, `pnpm build:worker` | aprovado, sem `dist/server/.dev.vars` |
| Telas do portal, Chromium | 253/253 |
| Telas do portal, WebKit | 253/253 |
| Recuperação do autenticador (`mfa-recovery-ui`) | 4/4 |
| `pnpm test:smoke-public`, depois da publicação | site, Guia, portais e health HTTP 200; HTTP→HTTPS 308; zero login ou escrita |

Telas por família, em cada motor: conta 28, início 21, mapa 38, avisos 38,
registros 73, recursos 13, histórico profissional 38, visualizações versionadas 4.

Audit de 13/11: raiz 0; portal `--prod` 0; portal completo 1 moderado de
desenvolvimento (pendência 3 da seção 1). Audit não é pentest: não declarar o
portal "sem vulnerabilidades".

Resultados anteriores (22/10, 27/10, 28/10, 30/10, 04/11 e a sessão na nuvem de
13/11), com as falhas reproduzidas antes de cada correção, estão no arquivo de
histórico e em `portal-production/docs/`.

### Limitações reais

1. Nenhum teste automatizado substitui iPhone/Safari, Android, VoiceOver/NVDA,
   zoom e PWA instalada em aparelho físico.
2. Windows nativo (30/10, antes de o PC ser formatado): lint, tipos, build e
   smoke HTTP aprovados; testes selecionados 20 aprovados/1 skip (symlink exige
   permissão). Suíte completa, integração e telas nunca rodaram lá.
3. Sessões na nuvem não têm WebKit nem login do Cloudflare; o download de
   navegadores do Playwright é bloqueado nesse ambiente.
4. O painel de navegador do app do Claude não dispara de forma confiável o
   `IntersectionObserver` em viewport emulado. Para comportamento visual, confiar
   no Playwright, não em captura desse painel.
5. Skips condicionais da suíte pública escolhem o projeto certo para cada
   cenário; não são falhas escondidas. Não somar retestes ao total de casos.
6. GitHub não é cópia do estado do navegador, de bancos de teste ou de dossiês
   privados. Capturas e logs sintéticos ficam só em TMP.
7. Relatórios antigos de dependências são históricos; o resultado atual é o
   descrito acima.

## 9. Publicação futura — requer aprovação, não executar para sincronizar

**Não usar o atalho `pnpm deploy:worker`**: ele não descreve o envio validado dos
dois Workers. Não executar migrações, troca de segredos ou restauração de D1
para publicar refinos de interface. Nada disso foi solicitado nesta etapa.

Antes de enviar: branch limpa/revisada, testes relevantes, autorização explícita,
consulta nova das versões ativas de ambos os Workers e confirmação dos modos/
bindings. Autenticar Cloudflare nesta máquina, sem copiar login do Mac:

```sh
pnpm exec wrangler login
pnpm exec wrangler deployments list --config wrangler.jsonc --json
pnpm exec wrangler deployments list --config wrangler.legacy.jsonc --json
pnpm build:worker
```

Publicar a partir de **snapshot fora do checkout** contendo somente `dist/` e
as duas configurações originais. Comparar recursivamente os arquivos e conferir
ausência de `.env`, bancos, credenciais e symlinks antes de qualquer upload.
Não usar a configuração gerada em `.wrangler/deploy/config.json` pelo Vite.

Mac/zsh, dentro de `portal-production`, exemplo de preparação (sem deploy):

```sh
PORTAL="$PWD"
SNAPSHOT=$(mktemp -d "${TMPDIR:-/tmp}/psico-publicacao.XXXXXX")
cp -R dist "$SNAPSHOT/dist"
cp wrangler.jsonc wrangler.legacy.jsonc "$SNAPSHOT/"
WRANGLER="$PORTAL/node_modules/.bin/wrangler"
cd "$SNAPSHOT"
"$WRANGLER" deploy --config wrangler.legacy.jsonc --dry-run --keep-vars
"$WRANGLER" deploy --config wrangler.jsonc --dry-run --keep-vars
```

PowerShell, dentro de `portal-production`, equivalente (sem deploy):

```powershell
$Portal = (Get-Location).Path
$Snapshot = Join-Path $env:TEMP ("psico-publicacao-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Snapshot | Out-Null
Copy-Item -Recurse dist (Join-Path $Snapshot "dist")
Copy-Item wrangler.jsonc, wrangler.legacy.jsonc $Snapshot
$Wrangler = Join-Path $Portal "node_modules\.bin\wrangler.cmd"
Set-Location $Snapshot
& $Wrangler deploy --config wrangler.legacy.jsonc --dry-run --keep-vars
& $Wrangler deploy --config wrangler.jsonc --dry-run --keep-vars
```

Após aprovar snapshot/dry-runs e autorização de publicação, remover `--dry-run`
dos dois comandos correspondentes: **legado primeiro**, conferir saúde/sessão/SW,
depois principal. Preservar `--keep-vars` e segredos já cadastrados; não enviar
segredos locais sintéticos. Não copiar toda a pasta de desenvolvimento ao snapshot.

Registrar novos IDs, SHA da fonte, fingerprint e versões anteriores. Retorno
apenas se necessário: mesmo executável/config, `rollback ID_ANTERIOR --config
ARQUIVO --yes --message "motivo"`, principal e legado conforme o problema.
**Retorno de código/assets não é restauração de banco**; nunca apagar dados novos.
Voltar ao portal e executar `pnpm test:smoke-public`, GET de `/api/portal/session`
anônimo e `/sw.js` dos dois links. Testes autenticados devem usar ambiente local
sintético, não pacientes reais. Atualizar este documento e o registro de release.

Site/Guia têm fluxo separado: rever diff/testes públicos e enviar somente os
arquivos públicos aprovados para `main`. Não fazer merge integral desta branch
na `main` para publicar ou transportar os scripts do portal.


## 10. Próximo início em cada ambiente

Em qualquer um: abrir o repositório, ler este arquivo e `AGENTS.md`, e seguir a
seção 4 (no Claude Code, `/retomar`). Não reimplementar o que já está publicado.

- **Mac:** pronto. Node em `~/.local/opt/node-v24.22.1-darwin-arm64` (já no
  `~/.zprofile`), dependências, navegadores do Playwright, ambiente sintético e
  login do Cloudflare. É o computador indicado para validar tudo e publicar.
- **Windows:** o PC foi formatado em novembro; começar pela seção 5 como máquina
  nova. Equipamento: ASUS PRIME B450M-GAMING/BR, Ryzen 5 3600. O WSL2 recusou
  instalar o Ubuntu com `HCS_E_HYPERV_NOT_INSTALLED` porque a virtualização
  estava desligada no firmware. Passo físico do Matt, se quiser a suíte completa
  lá: reiniciar, entrar no BIOS com **Del** (F7 para o modo avançado),
  **Advanced → CPU Configuration → SVM Mode → Enabled**, salvar com **F10**
  ([guia ASUS](https://www.asus.com/pt/support/faq/1045141/),
  [diagnóstico Microsoft](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting)).
  Depois, `wsl --install -d Ubuntu-24.04` e clone dentro do Linux. Não usar
  WSL1 nem desativar guardas. Enquanto isso, usar o Mac.
- **Nuvem (Claude Code):** serve para editar e rodar lint, testes gerais e
  integração isolada. Sem WebKit e sem Cloudflare: não valida telas no Safari e
  não publica.

Ao terminar em qualquer ambiente: registrar a sessão na seção 1, commit e push
na branch de trabalho, e confirmar que o SHA local é igual ao remoto.
