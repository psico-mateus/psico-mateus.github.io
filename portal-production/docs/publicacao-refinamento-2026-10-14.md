# Publicação aprovada do refinamento — 14 de outubro de 2026

O usuário aprovou o segundo lote com “pode” e pediu continuidade. O escopo é o refinamento e as correções já testados, descritos em `refinamento-coerente-2026-10-14.md`. Não há migração, troca de segredo, alteração de papel ou escrita em dados reais durante a publicação.

## Antes da publicação

- Fonte do portal: `2d355fa`, branch `agent/correcoes-refino-20261014`.
- Build público já validado: `f23a557108ad3d72`. Configurações e mesmo D1 mantidos: principal proxy com `LEGACY_PORTAL=registros`; legado local.
- Últimas versões publicadas conferidas antes do envio: principal `82cdb92c-85e7-4ed4-b653-bdf573ad1e5f`; legado `5e2ac2d5-cb24-4ea0-8bba-0e786f4d04bb`.
- Snapshot anterior em /tmp não existia mais ao retomar. Uma nova cópia do mesmo artefato validado, com mesmo fingerprint, foi preparada em `/tmp/psico-refino-publicacao-20261014-jpvhRE`. Não contém ambiente ou banco.
- GitHub Pages: base `f08f26f08f974069e2658e197a454acf6993caba`. Checkout isolado em `/tmp/psico-publicacao-guia-20261014-fjFP1V/checkout`, branch `publicacao/refinamento-20261014`.
- Commits públicos isolados: `24b44b3` e `f62ce6b`, transportando somente 15 paths públicos/testes. Nenhuma diferença em portal-production, protótipo, banco, credenciais ou configuração de hospedagem.
- A ferramenta de worktree do app não reconhece o diretório pai do projeto como Git. Usado checkout Git temporário separado; nenhum arquivo do checkout principal antigo foi alterado.

## Retorno de código e assets

Somente se necessário, na pasta portal-production:

```sh
pnpm exec wrangler rollback 5e2ac2d5-cb24-4ea0-8bba-0e786f4d04bb --config wrangler.legacy.jsonc --message "Retorno anterior ao refinamento 2026-10-14" --yes
pnpm exec wrangler rollback 82cdb92c-85e7-4ed4-b653-bdf573ad1e5f --config wrangler.jsonc --message "Retorno anterior ao refinamento 2026-10-14" --yes
```

Isso não apaga ou restaura dados. Para o público, reverter os dois commits publicados de forma normal, sem force-push, mantendo qualquer alteração posterior feita por outra pessoa. A base anterior está registrada acima.

## Portal publicado

- Legado/API: versão `ea2910f9-449f-4f0c-87ab-27f9cbc9877b`.
- Principal: versão `8d4538bf-3cba-49da-abe8-8a1bebb0cb63`.
- Dois dry-runs passaram antes de enviar. Nenhuma migração ou troca de credencial realizada.
- Smoke público passou: páginas e saúde retornaram 200; HTTP→HTTPS retornou 308; cabeçalhos de proteção confirmados.
- Os dois service workers publicados têm fingerprint `f23a557108ad3d72`.
- Consulta anônima de sessão nos dois retornou `user: null`, sem criar cookie.
- Logs de envio: `/tmp/psico-refino-deploy-{legacy,main}-20261014.log`.
- Interface publicada conferida em contextos novos Chromium 1366×900 e WebKit 390×844: entrada/cadastro anônimos e Conta e privacidade com API inteiramente simulada. Quatro estados passaram, sem tela vazia, overlay, erros de execução ou overflow; nenhuma escrita de produção. Alternância para cadastro, convite/18+/privacidade e abrir formulário da conta verificados. Capturas e resumo: `/tmp/psico-refino-public-qa-20261014/`; captura da conta publicada aberta e inspecionada.

## Site e Guia — publicação bloqueada por autenticação

O checkout público isolado passou novamente em 118 testes, com 59 skips intencionais por projeto, zero falhas. Conteúdo dos 15 paths é idêntico ao lote aprovado no checkout de desenvolvimento. Branch local pública `publicacao/refinamento-20261014`, HEAD `f62ce6b1755b0f6890f916f045e2ac31d46757c8`, preservada no Git mesmo se o worktree temporário desaparecer.

O dry-run do push não conseguiu autenticar no GitHub. A integração GitHub foi consultada: instalada/ativada, conta conectada `spacegl1de`, sem permissão de escrita (`push: false`) no repositório `psico-mateus/psico-mateus.github.io`. Não houve tentativa de ampliar permissões, uso de token de outra conta ou force-push. Nenhum commit deste lote foi enviado ao GitHub; o site/Guia público continuam no estado anterior.

É necessária ação do usuário: reconectar o GitHub na conta que tem escrita nesse repositório (conta proprietária `psico-mateus`, ou colaborador autorizado). Não enviar senha ou token na conversa. Depois da reconexão, conferir novamente `origin/main`; se continuar na base registrada, enviar somente a branch pública em fast-forward. Se mudou, revisar a diferença antes de prosseguir.

As verificações de interface pós-deploy do portal usam navegador novo e dados fictícios apenas no cliente. Não comprovam login autenticado real em produção. Contas, registros e credenciais reais não foram usados nos testes.
