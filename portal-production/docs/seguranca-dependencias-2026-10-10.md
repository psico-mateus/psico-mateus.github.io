# Manutenção de segurança das dependências — 10/10/2026

## Escopo e estado

Branch: `agent/correcao-seguranca-dependencias-20261010`, criada a partir de
`774fa85`. Esta manutenção não está publicada. Não fazer merge, push ou deploy
sem autorização para a versão final do portal.

Commit das dependências e guardas offline: `791c156`. A integração isolada e
seus testes são salvos num commit separado, sem alteração do código do aplicativo.

O site profissional e o Guia público não foram alterados neste lote. Nenhuma
regra de autenticação/autorização, algoritmo de senha, cookie, segredo, binding
D1, migração, conta, convite ou registro de produção foi alterado. O Worker
principal continua configurado para encaminhar a API ao serviço `registros`.
Nenhum serviço pago ou integração externa foi adicionado.

## Correções

- Next e seu ESLint config: `16.2.12` → `16.3.8`.
- Vinext: `0.0.50` → `1.0.1`; plugin RSC: `0.5.30` → `0.5.34`.
- Vinext e React Server DOM passaram para `dependencies`, pois o Worker importa
  esses módulos em runtime. React, React DOM e RSC permanecem em `19.2.8`.
- O adaptador atualizado usa `@vercel/og 1.0.3`, com Satori `0.33.5` realmente
  incorporado em seus bundles. Um override isolado de Satori no adaptador antigo
  não substituiria a biblioteca já compilada.
- Overrides direcionados corrigem esbuild, sharp, fflate, browserslist,
  baseline-browser-mapping, image-size, fast-uri, js-yaml, source-map-js,
  brace-expansion e undici. Versões não afetadas não foram atualizadas por hábito.
- Foi removida a exceção de idade de lançamento do brace-expansion antigo. A
  verificação de supply chain continuou ativa. Apenas o build nativo de esbuild,
  necessário ao pacote instalado, foi autorizado; outros scripts não receberam
  autorização geral.

Fontes primárias: [Next 16.3.8](https://github.com/vercel/next.js/releases/tag/v16.3.8),
[Vinext 1.0.1](https://github.com/cloudflare/vinext/releases/tag/vinext@1.0.1),
[correção Satori](https://github.com/vercel/satori/security/advisories/GHSA-wx4j-mvgx-mqwp).

## Resultado da auditoria e alerta residual

`pnpm audit --json` antes: 43 alertas (3 críticos, 21 altos, 14 moderados, 5 baixos).
Depois: 1 alto, sem críticos, moderados ou baixos. O subconjunto `--prod` passou
de 14 para 1. Contagens são referentes à resposta do registro npm em 10/10/2026;
podem mudar quando novas vulnerabilidades forem divulgadas.

Na retomada de **14/10/2026**, os dois audits foram consultados novamente:
o resultado permaneceu em 1 alerta alto de `braces`, sem críticos, moderados ou
baixos. `origin/main` continua em `f08f26f`, a publicação isolada do Guia; a branch
de segurança permanece separada e ainda não foi enviada ou publicada.

O restante é `braces 3.0.3`,
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), sem versão
oficial corrigida. As cadeias são:

```text
Vinext → vite-plugin-commonjs → vite-plugin-dynamic-import → fast-glob → micromatch → braces
eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces
```

Essas cadeias processam padrões de arquivos durante desenvolvimento/compilação,
não textos escritos pelos pacientes. A categoria `--prod` inclui Vinext por sua
dependência de runtime, mas isso não prova que todo pacote do seu grafo esteja no
Worker final. Não ocultar o alerta, não falsificar uma versão, não trocar APIs
incompatíveis nem declarar a auditoria zerada. Reavaliar quando houver correção
ou uma alternativa compatível dos pacotes pais. A exploração é contestada pelo
mantenedor, mas isso não substitui uma correção oficial:
[discussão upstream](https://github.com/micromatch/braces/issues/70).

Os sourcemaps do OG novo ainda contêm fontes antigas de fflate, mas os bundles
emitidos não incluem a função `unzipSync` afetada pelo advisory. O pacote
transitivo efetivamente instalado foi corrigido para `0.7.5`. Não alegar que um
override reescreve bibliotecas já compiladas.

## Verificação reproduzível

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm test:integration:isolated
pnpm test:restore-local
pnpm audit --json
pnpm audit --prod --json
```

O audit continua retornando código não zero enquanto o alerta residual existir.
Não suprimir isso para obter um resultado verde. Testes de dependências são
offline e verificam os pisos corrigidos; não substituem uma auditoria atual.

O runner isolado usa somente seu próprio SQLite temporário, segredos sintéticos
em memória, origem loopback e uma porta estrita. Não herda credenciais
administrativas, encerra seus processos em `finally` e não imprime cookies,
senhas, códigos MFA ou valores das linhas do banco. `--keep-temp` é opcional e
retém apenas o estado sintético, não os segredos gerados em memória.

Vite/Vinext/Wrangler podem ler arquivos locais de ambiente mesmo quando o
processo recebe segredos de teste. Por isso, o runner executa num espelho TMP
por allowlist, sem `.env*`, `.dev.vars*`, arquivos de banco ou estado antigo.
O único symlink aponta para dependências já instaladas; a configuração Wrangler
gerada nesse espelho não possui bindings remotos. O wrapper avalia a configuração
async durante seu carregamento e usa cache temporário, evitando a incompatibilidade
do config loader com um import dinâmico após o encerramento do importer.

As revisões visuais interceptam a API com dados fictícios. Seus resultados não
comprovam login real; a suíte HTTP/D1 é responsável pelos testes reais em
ambiente local. WebKit não equivale a um iPhone físico. Nenhum teste garante
ausência absoluta de bugs ou incidentes futuros.

## Validação concluída em 14/10/2026

| Verificação | Resultado |
| --- | --- |
| Lint, tipos de aplicação/Worker, build local e sanitização | Aprovados |
| Testes gerais/offline | 278 aprovados; 0 falhas ou skips |
| Integração real HTTP/D1, somente em TMP sintético | 309 verificações aprovadas |
| Reinício do servidor | Hashes de contas, registros, sessões e demais tabelas verificadas preservados; sessão existente continuou válida |
| Logout e novo login após reinício | Logout recusou a sessão anterior; novo login recuperou os mesmos registros |
| Ensaio local de restauração | Integridade e chaves estrangeiras de 15 tabelas aprovadas |
| Interface com API simulada | 272 testes, em Chromium e WebKit, aprovados; 0 skips |
| Revisão visual de acesso/paciente/profissional | 10 cenários aprovados, sem overflow, overlay ou erros inesperados de execução |
| Cadastro/login reais pelo navegador | Chromium 1366×900 e WebKit 390×844: convite, cadastro, registro privado, reload de sessão, logout e novo login aprovados |
| Cookies dos fluxos reais locais | `HttpOnly` e `SameSite=Strict` confirmados |
| Acessibilidade automática nos estados testados | 0 violações axe WCAG A/AA |
| Build público e dry-run dos dois Workers | Aprovados, sem publicação |

O runner precisou de ajustes exclusivamente de testes: remover ANSI antes de
reconhecer a URL do Vite, distinguir o SQLite de metadados do Miniflare, reconhecer
os dois UNIQUE inline equivalentes do bootstrap e aguardar o encerramento dos
processos. No Mac, uma sondagem do grupo pode retornar `EPERM` brevemente enquanto
ele está saindo; isso é tratado como “ainda pode estar vivo”, nunca como permissão
para apagar o TMP. A limpeza exige ausência efetiva do grupo, espera `close`,
tem prazo limitado e retém apenas o TMP sintético se não puder confirmar parada.
Os 28 testes do runner incluem casos inválidos e as guardas de isolamento.

Nenhum arquivo de aplicação, Worker, banco, migração ou configuração pública foi
modificado para contornar uma falha de teste. Dois seletores do script temporário
de navegador foram corrigidos para refletir a interface existente: “Necessário”
faz parte do label da situação, e o login preserva a rota do histórico. Não eram
falhas do aplicativo e não exigiram mudança de fluxo.

O artefato público validado tem fingerprint `ea93e270c4a59568`. Configuração
gerada: um único D1 existente, modo `proxy`, `LEGACY_PORTAL=registros`, sem arquivos
de ambiente ou SQLite no artefato. O dry-run legado confirmou modo `local` e o
mesmo D1, sem o binding de proxy. Esses comandos não publicaram nenhuma versão.

Evidências temporárias, fora do repositório:

- Verificação geral e dry-runs: `/tmp/portal-security-verification-20261014.log`.
- Integração e reinício: `/tmp/portal-security-integration-final-20261014.log`.
- Audit atual: `/tmp/portal-security-audit-resumed-20261014.json` e sua variante `-prod`.
- QA simulada: `/private/var/folders/9f/q35wnrqn5gx18q_yntl2gzh00000gn/T/portal-security-ui-evidence-20261014-Dlze0I`.
- QA real e capturas sintéticas: `/private/var/folders/9f/q35wnrqn5gx18q_yntl2gzh00000gn/T/portal-security-ui-evidence-20261014-AsrbrA/summary.json`.

Limites: não houve login de produção, leitura de dados reais de pacientes,
teste em iPhone físico, Firefox ou VoiceOver humano. O MFA profissional real foi
exercitado na integração HTTP/D1 sintética; o painel profissional no navegador
usou API simulada. Browser plugin indisponível; foi usado o Playwright já
instalado, sem instalar outro serviço. Os processos e bancos de teste foram
encerrados/removidos; somente logs e capturas sintéticas foram conservados.

## Publicação futura

Antes de publicar, confirmar o build público com os bindings existentes e fazer
um dry-run. Guardar a versão Cloudflare anterior para rollback apenas de código
e assets. Não executar migrações ou alterar segredos neste lote. Verificar após
deploy os dois endereços, headers, saúde pública, manifesto, assets e fingerprint
do service worker, sem usar contas reais de pacientes nos testes.

A manutenção precisa alcançar **os dois Workers**: `area-do-paciente` continua
em modo `proxy`, com `LEGACY_PORTAL=registros`; `registros` continua em modo
`local`, atendendo a API e o link antigo no mesmo D1. Publicar apenas o Worker
principal deixaria o runtime antigo da API sem esta atualização. O mesmo artefato
é validado com `wrangler.jsonc` e `wrangler.legacy.jsonc`, preservando seus modos e
bindings distintos. Não unificar a arquitetura ou mudar redirecionamentos como
efeito colateral deste lote. Guardar IDs de retorno de ambos antes de publicar.

Esta branch contém trabalho anterior do portal que não pertence à publicação
isolada do Guia em `origin/main`. Não publicar todo o histórico em `main` por
engano. O deploy do portal e a publicação GitHub Pages são fluxos separados.

## Continuidade registrada, sem implementar neste lote

O usuário pediu uma revisão futura de **Conta e privacidade**: as opções ainda
parecem dispersas e pouco organizadas. Avaliar agrupamento claro de dados da
conta, senha/recuperação, sessões e controles de privacidade, com ações de risco
separadas das rotineiras. Preservar todas as funções e confirmações existentes,
sem reduzir a proteção do acesso profissional. Pedido explicitamente adiado;
não alterar essa tela durante a manutenção de dependências.
