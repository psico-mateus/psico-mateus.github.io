# Continuidade — Psico Mateus

Atualizado em **27/10/2026** (America/Sao_Paulo). Ler inteiro antes de trabalhar
no Mac ou Windows e atualizar ao concluir cada etapa, conforme `AGENTS.md`.
O código é a fonte principal; documentos antigos não substituem esta conferência.

## 1. Comece aqui

- Repositório: `https://github.com/psico-mateus/psico-mateus.github.io.git`.
- **Branch compartilhada de trabalho: `trabalho/continuidade-mac-windows`.**
- `main` é a publicação do site/Guia; não usá-la para transportar o portal.
- Esta etapa autoriza commit/push para continuidade, **não publicação**.
- Não há necessidade de deixar o Mac ligado depois de confirmar o push.
- Arquivos Git vão entre computadores; contas/registro de produção continuam no
  Cloudflare. `node_modules`, sessões do navegador, bancos locais, configurações
  secretas, capturas e serviços locais **não** são sincronizados por Git.
- Não limpar cookies/localStorage nem recriar contas para trocar de computador.

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
- Ajustes publicados de foco/avisos/atualização e descarte de respostas antigas
  de exportação/recuperação após sair/trocar conta (`7f7f7c2`).

### Preparado, mas NÃO publicado

- `c1a1243`: nova tentativa de carregar registros mantém foco estável, filtros e
  rascunhos; editor ativo preserva respostas e uma nova escolha de foco.
- `cbe3c43`: foco agendado de abrir/voltar entre pacientes respeita interação
  mais recente, retorno rápido e modo privacidade; cancelamento/limpeza de RAF.
- Preparação Mac/Windows desta etapa: documentação/instruções, scripts básicos
  sem atribuição POSIX de ambiente, setup sintético local, versão conhecida de
  Node/pnpm, normalização LF e proteção adicional de arquivos privados.
  A parte de ferramentas foi salva em **`7be86b9`**; o commit seguinte registra
  estas instruções. Usar `git log`/`git status` para obter o tip recebido no destino.
- Estas mudanças são código compartilhado para continuar, não uma atualização
  silenciosa em produção. O build local de 22/10 tinha ID `283cfd1d7c906474`;
  um build local posterior não prova o estado público.

### Produção conferida em 27/10/2026, sem alteração nesta etapa

| Ambiente | Estado / versão |
| --- | --- |
| Site | `https://psico-mateus.github.io/` |
| Guia | `https://psico-mateus.github.io/guia-emocoes/` |
| Área oficial | `https://area-do-paciente.psico-mateus.workers.dev/` |
| Link antigo compatível | `https://registros.psico-mateus.workers.dev/` |
| GitHub Pages | fonte remota confirmada: `main`, `/`, build `legacy` |
| `origin/main` | `c708a7ef8ab4b28e51b5a61a0359b7d8768be6e6` |
| Worker oficial | `149496d9-421d-42cd-878a-1b758cae545b`, 100% |
| Worker legado/API | `4f4b37f6-0108-4a72-8fe9-e97426511417`, 100% |
| SW dos dois portais | HTTP 200, ID `3293a66cfef38d7a` |

As versões Worker são do envio de 22/10; consultar novamente antes de qualquer
publicação/retorno. O workflow remoto dinâmico `pages-build-deployment` pertence
ao Pages e executa em `main`; não há workflow de deploy versionado nesta branch.
Não configurar CI que publique todas as branches.

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

## 3. Auditoria de branches, commits e outros checkouts

Base desta retomada: `cbe3c43`, branch local antiga
`agent/refinos-inclusivos-20261014`, árvore limpa. Após `git fetch --prune origin`,
essa base tinha 67 commits próprios e 5 commits de publicação ausentes de seu
ancestral, em relação a `origin/main`. Os cinco já estão no GitHub; não fazer
merge cego de `main` nem enviar a branch do portal para `main`.

Inventário inicial: 27 branches locais; oito com commits ausentes de todos os
refs `origin/*`, total **72 commits distintos**. A contagem por branch se sobrepõe:

| Branch local anterior | Tip | Inéditos no remoto à auditoria inicial | Preservação |
| --- | --- | ---: | --- |
| `agent/refinos-inclusivos-20261014` | `cbe3c43` | 67 | base da branch compartilhada |
| `agent/correcoes-refino-20261014` | `59b129f` | 48 | ancestral da base, incluído |
| `agent/correcao-seguranca-dependencias-20261010` | `681b944` | 38 | ancestral da base, incluído |
| `agent/refino-area-inteira-20261009` | `774fa85` | 36 | ancestral da base, incluído |
| `agent/refino-paciente-inclusivo-20261008` | `c9e5210` | 25 | ancestral da base, incluído |
| `agent/prepara-troca-celular-20260824` | `6b9e199` | 9 | ancestral da base, incluído |
| `auditoria-final-portal` | `bf8583d` | 4 | `arquivo/auditoria-final-portal` |
| `sites-portal-release` | `34b3b84` | 1 | `arquivo/sites-portal-release` |

**Não mesclar as branches `arquivo/*` automaticamente.** `sites-portal-release`
tem uma raiz independente, sem ancestral comum. São preservação histórica, não
código recomendado nem builds para publicar.

O checkout Mac `work/psico-mateus.github.io`, antes em `refino-final-site`
(`f9375c5`), tinha três alterações não commitadas: `index.html`,
`cuidados/index.html`, `privacidade/index.html` (18 inserções/19 exclusões).
Foram preservadas no commit **`6cb6ac0`**, branch
**`arquivo/site-local-mac-20261027`**, sem merge/publicação: mudanças de redação
institucional/contato/disponibilidade. Revisar somente o diff desse commit antes
de integrar na versão atual; copiar os HTML antigos inteiros perderia refinos.

O checkout de publicação `work/psico-mateus-publicacao-20261014` estava limpo em
`c708a7e`. Um registro antigo em `/private/tmp/.../checkout` aponta para diretório
ausente; foi deixado intacto. Não executar limpeza/prune como parte da troca.
Não havia arquivos novos não ignorados nesses checkouts; ambientes, caches e
artefatos ignorados não entram no envio.

O código foi verificado por caminhos e padrões de credenciais antes do envio,
incluindo os históricos arquivados. Nenhum segredo/dado de paciente foi
identificado nos materiais enviados. Isso não é garantia absoluta nem pentest.

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
- Não houve execução física em Windows nesta etapa. Não afirmar validação nativa.
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

## 8. Testes já realizados e problemas conhecidos

### Validação de 22/10, antes do transporte

- Lint, tipos, build público e 313 testes gerais aprovados.
- Histórico paciente: 69 Chromium + 69 WebKit.
- Histórico profissional: 38 Chromium + 38 WebKit.
- Visualizações versionadas: 4 Chromium + 4 WebKit.
- Total: **222 casos de interface aprovados**, dados sintéticos e APIs simuladas;
  foco, console, axe, ausência de overflow e capturas conferidos.
- O mecanismo de foco antigo foi reproduzido com fila de RAF controlada e
  corrigido. Isso não prova a causa exata da intermitência histórica sem trace.

### Validação desta preparação de 27/10

- Mac, Node 24.22.1 / pnpm 11.25.0: `pnpm test` aprovou tipos, build sanitizado
  pelo novo wrapper e 320 testes; após concluir o setup, `node --test
  tests/*.test.mjs` aprovou o conjunto final de **326 testes**, sem falhas/skips.
- Os 13 testes novos cobrem o wrapper portátil e setup local somente em TMP:
  argumentos literais/caminhos Windows simulados, ausência de shell, ordem do
  sanitizer, falhas/sinais, criação exclusiva e preservação de ambiente existente.
  Não foi executado setup sobre o `.env.local` real do Mac.
- `pnpm build:worker` pelo wrapper novo: aprovado, sem deploy. Avisos existentes
  do Vinext sobre classificação estática/imports não foram ocultados.
- `pnpm test:integration:isolated`: **309 verificações**, nove migrações somente
  locais, reinício com contas/registros/sessões preservados e novo login aprovado;
  zero requisições a produção. Nenhuma migração remota/credencial foi usada.
- `pnpm test:restore-local`: ensaio sintético aprovado, 15 tabelas verificadas;
  não é restauração de produção nem ensaio de Time Travel remoto.
- `pnpm test:smoke-public`: site/Guia/portais/health HTTP 200, HTTP→HTTPS 308,
  cabeçalhos conferidos, zero login/escrita real. Produção permaneceu intacta.
- Lint e `git diff --check` aprovados; regra LF não renormalizou o projeto inteiro.
- Revisão independente dos novos arquivos, guardas, comandos e materiais de
  arquivo não identificou bloqueador de conteúdo para o envio ao GitHub.
- Windows nativo/WSL2 físico e instalação em uma máquina Windows nova **não foram
  executados**. Os 222 testes de interface de 22/10 não foram repetidos aqui:
  nenhum componente React, CSS ou fluxo clínico mudou nesta etapa de ferramentas.

### Pendências/limitações reais

1. Publicar o lote `c1a1243`/`cbe3c43` somente após nova aprovação final. Esta
   solicitação é de sincronização, não de deploy.
2. Conferir setup/dev/lint/tipos/build na máquina Windows real; usar WSL2 para
   suíte completa. Portabilidade completa de isolamento/processos é trabalho
   futuro, não motivo para relaxar segurança.
3. Revisar e, se útil, integrar apenas o diff editorial `6cb6ac0` arquivado,
   após comparar a redação atual; não mesclar o checkout antigo inteiro.
4. Validação humana/física com iPhone/Safari, Android, VoiceOver/NVDA, zoom e PWA
   instalada continua sem cobertura universal. WebKit automatizado não é iPhone.
5. Idempotência do POST de novo registro após perda de resposta requer projeto
   próprio (servidor/esquema/concorrência); não implementar como ajuste visual.
6. Dependências: último relatório registra alerta upstream de `braces 3.0.3` e
   manifestos remotos de `main` antigos. Não foi feita nova auditoria nesta etapa;
   não declarar zero vulnerabilidades nem usar `audit fix --force`.
7. GitHub não é cópia do estado do navegador, bancos de teste ou dossiês privados
   externos. Capturas/logs sintéticos externos do Mac não aparecem no clone;
   resultados relevantes ficam aqui/commits e podem ser reproduzidos pelos testes.

Referências históricas versionadas: `portal-production/docs/` (publicação de
outubro, segurança das dependências e recuperação profissional). Datas/IDs antigos
devem ser lidos como histórico; não executar seus rollbacks automaticamente.

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

## 10. Próximo início no Windows

1. Clonar/atualizar `trabalho/continuidade-mac-windows`, ler este arquivo e `AGENTS.md`.
2. Instalar raiz e portal com os lockfiles; criar ambiente **local sintético**.
3. Confirmar Node/pnpm, dev, lint, tipos e build; registrar resultados Windows.
4. Para validar o conjunto HTTP/D1/testes Unix, usar o checkout WSL2 separado.
5. Não reimplementar os dois refinos prontos nem publicar por presumir aprovação
   anterior. Pedir aprovação somente para o lote final de publicação.
6. Atualizar continuidade, commit e push antes da próxima troca de computador.
