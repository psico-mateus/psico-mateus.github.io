---
paths:
  - "portal-production/**"
---

# Área do paciente (`portal-production/`)

Portal com dados de saúde de pessoas reais em produção (LGPD). Aqui, um erro
pequeno pode expor ou apagar registro de paciente.

## Invariantes

- Registro nasce privado. O profissional só lê o que o paciente compartilhou,
  com vínculo ativo. A autorização é decidida no servidor, nunca só na interface.
- Manter consultas parametrizadas, proteção CSRF nas mutações e
  `Cache-Control: no-store` nas respostas autenticadas.
- Nada de conteúdo autenticado em `localStorage`, `sessionStorage`, Cache API ou
  service worker. Nada de analytics nem de log com título, texto, emoção, nome,
  e-mail, código, cookie ou credencial.
- Não mexer em login, sessão, MFA, convites ou recuperação para resolver problema
  de ambiente ou de teste.

## Banco

- Tabela ou coluna nova nasce em `drizzle/` como migração versionada.
  `db/runtime.ts` não antecipa migração.
- Migração remota, `wrangler d1 ... --remote`, exportação ou restauração do D1:
  só com aprovação explícita do Mateus para aquele passo.

## Os dois Workers

- `wrangler.jsonc`: `area-do-paciente`, API em modo `proxy`, binding
  `LEGACY_PORTAL=registros`.
- `wrangler.legacy.jsonc`: `registros`, API em modo `local`.
- Mesmo D1 nos dois. Não alterar nomes, bindings, `database_id` nem modos.
- Publicação segue a seção 9 de `CONTINUIDADE.md`: snapshot fora do checkout,
  dry-run dos dois, legado primeiro. Nunca `pnpm deploy:worker`.

## Dependências

- Versões exatas, sem `^`. Não atualizar por hábito.
- `react`, `react-dom` e `react-server-dom-webpack` ficam sempre na mesma versão.
  `next` e `eslint-config-next` também.
- `tests/dependency-security.test.mjs` fixa os pisos corrigidos. Ao corrigir um
  alerta, subir o piso no mesmo commit.
- Sem `audit fix --force` e sem override de versão major.

## Interface

- Linguagem direta e literal, baixa carga cognitiva, uso por teclado, leitor de
  tela, zoom e toque. Sem gamificação, pontuação, diagnóstico ou IA clínica.
- Correção de foco ou de fluxo: primeiro um teste que falha, depois a correção.
- Testes de interface usam `*_BASE_URL` local e API simulada. Nunca URL de produção.

## Aviso de privacidade

- `app/privacidade/page.tsx` é um texto datado que o paciente aceita no cadastro
  (`privacy_version`). Não mudar a redação nem a data sem pedido explícito do Mateus.

## Comandos (dentro de `portal-production/`)

```sh
pnpm lint
pnpm test                      # tipos, build sanitizado e testes gerais
pnpm test:integration:isolated # HTTP + D1 local, só dados sintéticos
pnpm test:restore-local
pnpm build:worker              # build público; não faz deploy
pnpm dev --host 127.0.0.1 --port 4440
```
