@AGENTS.md

# Claude Code neste repositório

As regras acima (`AGENTS.md`) valem igualmente para o Claude Code, no Mac, no
Windows e em sessões na nuvem. Esta parte só acrescenta o que é próprio dele.

## Os três sites

| Site | Onde está | Como vai ao ar |
| --- | --- | --- |
| Site profissional | raiz: `index.html`, `assets/`, `cuidados/`, `privacidade/` | GitHub Pages, branch `main` |
| Guia de Emoções | `guia-emocoes/` e `assets/` | GitHub Pages, branch `main` |
| Área do paciente | `portal-production/` | dois Cloudflare Workers e um banco D1 |

`portal-prototipo/` é histórico. Não é o portal de produção.

## Início de cada sessão

1. Ler `CONTINUIDADE.md` por inteiro. Ele não é importado aqui de propósito:
   é longo e ocuparia contexto em toda sessão.
2. Rodar `/retomar` (confere branch, remoto e árvore antes de mexer em algo).
3. Trabalhar em branch própria, criada a partir de
   `trabalho/continuidade-mac-windows`: `tarefa/<mac|windows|nuvem>-<descricao>-<AAAAMMDD>`.
   Nunca commitar direto em `main`.

## Ambiente

- Node `24.22.1` (`.nvmrc`) e pnpm `11.25.0` (`packageManager`).
- Instalar na raiz e no portal, sempre com `--frozen-lockfile`.
- Site e Guia: `pnpm test` na raiz. Servidor local: `node tests/static-server.mjs` (porta 4173).
- Portal, dentro de `portal-production/`: `pnpm lint`, `pnpm test`,
  `pnpm test:integration:isolated`, `pnpm test:restore-local`, `pnpm build:worker`.
- `/validar` roda a sequência completa e monta o relato.

## Comandos do projeto

- `/retomar`: chegada em um computador ou sessão nova.
- `/validar`: validação local completa, só com dados sintéticos.
- `/encerrar`: registro em `CONTINUIDADE.md`, commit e envio à branch de trabalho.

## Travas em `.claude/settings.json`

- Bloqueados: `pnpm deploy:worker`, force-push, `audit fix --force` e leitura de
  `.env*` (exceto `.env.example`), `.dev.vars*`, pastas locais privadas, dumps e chaves.
- Pedem confirmação a cada vez: `wrangler deploy`, `rollback`, `versions`, `d1`,
  `secret`, `delete`; `git push` para `main`; `git reset --hard`; `git clean`.
- A confirmação na tela não substitui a aprovação do Mateus no chat para o lote
  final. Sem essa aprovação, não iniciar deploy, migração remota nem envio a `main`.
- Regras de Bash cobrem a forma usual do comando, não todas. Não contornar uma
  trava escrevendo o comando de outro jeito.

## Como relatar

- Responder em português do Brasil, com linguagem simples. O Mateus é psicólogo,
  não programador: dizer o que mudou, para quem muda e o que ele precisa decidir.
- Separar sempre: alterado no código, testado (com números reais), enviado ao
  GitHub, publicado. Build local não é publicação.
- Se o ambiente não tiver WebKit, navegador, push ou login do Cloudflare, dizer
  isso e o que ficou sem verificar. Não trocar verificação por suposição.
- Dados de pacientes: nunca ler, copiar, exportar ou usar em teste. Nenhuma
  tarefa de código precisa deles.
