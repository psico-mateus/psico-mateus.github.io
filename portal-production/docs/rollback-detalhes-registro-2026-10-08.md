# Publicação e retorno — detalhes visíveis do registro

## Lote aprovado

- Código: `a352d082f0bd9aa4bb2a59a8210b06783206fbe5`.
- Branch: `agent/refino-paciente-inclusivo-20261008`.
- Fingerprint público: `3538e0b1c4027443`.
- Alterações: corpo/pensamentos/vontade diretamente visíveis na seção 03,
  antes da nota para a sessão 04; atalho de salvar depois de título/situação;
  orientação de opcionalidade e quebra de linha do link do Guia.
- Nenhum campo foi removido. Mesmos valores, limites, payload, trava de envio,
  rascunhos e privacidade. API/auth/D1/migrações/Worker/SW/configs/bindings e
  dependências idênticos ao lote anterior.
- Publicar somente `area-do-paciente`. O Worker legado `registros`, responsável
  pela API original, permanece intocado. Sem merge, push, migração remota,
  alteração de secrets ou novo serviço.

## Estado antes do deploy, conferido no Cloudflare

Principal, tráfego 100%, retorno deste lote:

- Versão: `db6c7213-dfb0-42d1-8418-a213772a561a`.
- Deployment: `7f6e8547-ca54-4f3d-9389-3e60277a949d`.
- Criado: `2026-10-08T20:37:06.474748Z`.
- Fingerprint: `a3ddfce297d7e10c`.

Legado, tráfego 100%, deve permanecer igual:

- Versão: `0478b052-cd09-4b42-bab7-71c710616e72`.
- Deployment: `e04dee39-5c0b-43b8-8e3d-f4bb65329f8e`.
- Fingerprint: `04a2d900c21a088a`.

Backup privado 0600 do código e histórico, verificado com `git bundle verify`:
`/Users/mateus/.codex/backups/psico-mateus/2026-10-08/source-detalhes-registro-a352d08.bundle`.
Não é um backup de banco e não contém exportação de pacientes.

## Retorno rápido, se necessário

Em `portal-production`, com o runtime Node/pnpm existente no PATH:

```sh
pnpm exec wrangler rollback db6c7213-dfb0-42d1-8418-a213772a561a --config wrangler.jsonc --env-file /dev/null --message "Retorno dos detalhes visíveis do registro" --yes
pnpm test:smoke-public
```

Não restaurar banco, revogar sessões, trocar secrets ou reverter o legado por
causa deste lote de interface. Esse retorno preserva o refinamento anterior de
histórico, privacidade e foco ao compartilhar.

## Evidências locais antes da publicação

- Lint, typecheck, build sanitizado e 194 testes aprovados.
- 24 cenários por engine Chromium/WebKit: campos visíveis, ordem, teclado,
  áreas de toque, 320/390/640/1366 px, texto a 200%, mínimo válido, opcionais
  preservados no POST, edição privada/compartilhada no PATCH, erro sem perda de
  texto e alerta focado. Somente localhost com APIs sintéticas e rede externa
  bloqueada. Axe sem violações automáticas nos estados testados.
- Matriz visual geral aprovada; imagens aceitas fora do Git em
  `/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/entry-details-refinement-20261008/`.
- Duas repetições intermediárias WebKit oscilaram no foco exato do resumo após
  salvar o mínimo, sem falha de dados/salvamento. Caso isolado e últimas duas
  suítes completas passaram. Causa/destino final nas falhas não confirmados;
  nenhuma asserção foi relaxada e o código de foco/save não foi alterado.
- iPhone físico, VoiceOver e logins com credenciais reais não foram testados.

## Publicação

Deploy confirmado, com 100% do tráfego principal:

- Versão: `b5e7f029-1b0e-4541-8de5-bd69c3e9d574`.
- Deployment: `7bfaa3e7-7658-40a1-9d13-5a5f09fb978c`.
- Criado: `2026-10-08T20:57:32.978688Z`.
- Endereço: `https://area-do-paciente.psico-mateus.workers.dev/`.
- Legado: mesma versão/deployment e 100% do tráfego anteriores, sem novo
  redirecionamento. Continua funcionando com a interface anterior e a API.

Preflight público passou nos oito endpoints, somente leitura, zero acesso
autenticado e zero escrita em produção. Novo build público sanitizado e dry-run
aprovados; nenhum arquivo `.env`/`.dev.vars` no artefato. Bindings continuam DB
existente, `LEGACY_PORTAL=registros` e `PORTAL_API_MODE=proxy`.

O asset público `/assets/PortalApp-C-4Tx_lj.js` respondeu HTTP 200 e é idêntico
ao arquivo local aprovado (SHA-256
`0aaabc5b663301feb7d772eeb5cdcdef6d6c2ef8529d6784ffbb3b2a9c4d0144`).
Contém a nova seção e o atalho; não contém o texto antigo “Quer parar por aqui?”.
Conferência somente GET, sem credenciais ou dados de pacientes.

## Pós-check confirmado

- Smoke público: oito endpoints aprovados na primeira execução.
- Fingerprints SW: principal `3538e0b1c4027443`, legado preservado
  `04a2d900c21a088a`.
- Quatro cenários: principal e legado em Chromium 1366×900 e WebKit 390×844,
  com SW ativo e controlador confirmado.
- Entrada → cadastro → entrada → recuperação → entrada → privacidade →
  entrada: navegação aprovada sem travamentos, erros/warnings de console,
  respostas HTTP com falha ou overflow horizontal.
- Somente GET: nenhum formulário enviado, acesso autenticado, credencial,
  consulta D1, segredo ou escrita em produção.
- Uma captura desktop ocorreu antes de decodificar o logo; a checagem adicional
  confirmou `complete=true`, dimensões 192×192 e renderização correta. Não foi
  necessária alteração ou repetição ampla.

Capturas públicas sem dados de pacientes:
`/tmp/patient-details-public-release-20261008`.
Os detalhes do editor autenticado foram validados localmente com APIs sintéticas,
não com contas reais de produção. Nenhum novo redirecionamento foi adicionado.
O site profissional e o Guia continuam sem alterações neste lote.
