---
name: validar
description: Roda a validação local dos três sites (site profissional, Guia de Emoções e Área do paciente) só com dados sintéticos e relata o que passou, falhou ou não pôde ser executado. Usar antes de sincronizar, antes de pedir aprovação de publicação ou quando o Mateus pedir para testar tudo.
argument-hint: "[site | portal | tudo]"
---

Escopo pedido: `$ARGUMENTS`. Sem argumento, valide tudo.

Regras:

- Somente ambiente local e dados sintéticos. Nenhum comando daqui publica,
  migra banco remoto ou lê dados de pacientes.
- Não remover asserção, não aumentar timeout e não marcar skip para fazer passar.
- Se um passo não puder rodar neste ambiente (falta WebKit, navegador, WSL),
  registre "não executado" com o motivo. Não substitua por suposição.

## Site e Guia (raiz)

```sh
pnpm install --frozen-lockfile
pnpm test
```

Se os navegadores do Playwright faltarem:
`pnpm exec playwright install chromium webkit`.

## Área do paciente (`portal-production/`)

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm lint
pnpm test
pnpm test:integration:isolated
pnpm test:restore-local
pnpm build:worker
```

Depois do `build:worker`, confirme que `dist/server/.dev.vars` não existe e anote
o `APP_BUILD_ID` de `dist/client/sw.js`.

## Alertas de dependências

```sh
pnpm audit --json
pnpm --dir portal-production audit --json
pnpm --dir portal-production audit --prod --json
```

Para cada alerta: pacote, versão instalada, versão corrigida e se está na cadeia
de produção ou só de desenvolvimento. Audit não é pentest: não declare o portal
"sem vulnerabilidades".

## Interface do portal (opcional, quando a mudança foi de tela)

Suba `pnpm dev --host 127.0.0.1 --port 4440` e rode as famílias `PORTAL_*_UI_*`
descritas na seção 7 de `CONTINUIDADE.md`, um motor por vez, com saída no TMP.

## Relato

Uma tabela curta: passo, resultado com os números reais (aprovados, falhas,
skips), e o que não foi executado. Em seguida, uma frase dizendo se a árvore
está em condição de ser sincronizada. Publicação continua sendo decisão do Mateus.
