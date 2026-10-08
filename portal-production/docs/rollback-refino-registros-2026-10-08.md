# Publicação e retorno — clareza e foco nos registros

## Escopo aprovado

- Código: `9a8cf2af641ab5749f115819df67688a3ab55a17`.
- Branch: `agent/refino-paciente-inclusivo-20261008`.
- Fingerprint público: `a3ddfce297d7e10c`.
- Destino: somente `area-do-paciente`, conforme regra do documento mestre para
  refinamentos exclusivos de interface. O Worker `registros`, que atende a API
  original, permanece na versão anterior e não recebe este deploy.
- Sem alteração de API, autenticação, sessões, secrets, bindings, D1 ou migrações.
  Sem merge ou push Git. Nenhum serviço novo foi ativado.

## Antes da publicação

Principal, tráfego 100%:

- Versão: `a7c38197-bf77-4c6c-8e9e-e57f11df50ee`.
- Deployment: `8a2c4af1-4ad8-433b-8f74-40a7ebe8cd31`.
- Criado: `2026-10-08T20:22:40.859796Z`.

Legado, tráfego 100%, deve permanecer inalterado:

- Versão: `0478b052-cd09-4b42-bab7-71c710616e72`.
- Deployment: `e04dee39-5c0b-43b8-8e3d-f4bb65329f8e`.
- Criado: `2026-10-08T20:21:13.120407Z`.
- Fingerprint: `04a2d900c21a088a`.

Backup privado do código e histórico, permissão 0600, verificado com
`git bundle verify`:
`/Users/mateus/.codex/backups/psico-mateus/2026-10-08/source-refino-registros-9a8cf2a.bundle`.
Não contém exportação de banco ou dados de pacientes.

## Retorno rápido, somente se necessário

Executar em `portal-production`, com o runtime Node/pnpm existente no PATH:

```sh
pnpm exec wrangler rollback a7c38197-bf77-4c6c-8e9e-e57f11df50ee --config wrangler.jsonc --env-file /dev/null --message "Retorno do refinamento de registros" --yes
pnpm test:smoke-public
```

Não restaurar banco, revogar sessões, alterar secrets ou fazer rollback do
legado por causa deste lote de interface. O retorno usa a versão imediatamente
anterior, já com o refinamento do início e dos avisos.

## Publicação confirmada

Principal, tráfego 100%, confirmado pela API do Cloudflare após o deploy:

- Versão: `db6c7213-dfb0-42d1-8418-a213772a561a`.
- Deployment: `7f6e8547-ca54-4f3d-9389-3e60277a949d`.
- Criado: `2026-10-08T20:37:06.474748Z`.
- Endereço: `https://area-do-paciente.psico-mateus.workers.dev/`.

Legado conferido depois do deploy: mesma versão e mesmo deployment anteriores,
100% do tráfego. Não há novo redirecionamento; o endereço antigo continua
funcionando com a interface anterior e a API original.

## Verificações

Preflight público somente leitura: oito endpoints
aprovados, nenhum acesso autenticado ou escrita em produção. Build sanitizado
e dry-run aprovados; bindings continuam DB existente, `LEGACY_PORTAL=registros`
e `PORTAL_API_MODE=proxy`. Nenhum arquivo `.env`/`.dev.vars` no artefato.

Testes locais completos constam em `refino-registros-paciente-2026-10-08.md`.
Pós-publicação aprovado:

- Smoke HTTP: oito endpoints aprovados.
- Fingerprints conferidos: principal `a3ddfce297d7e10c`, legado preservado
  `04a2d900c21a088a`.
- Health, manifest, dois ícones e sete assets: HTTP 200 em cada endereço.
- Quatro cenários públicos: dois endereços × Chromium 1366×900 e WebKit
  390×844, com SW ativo e controlador confirmado.
- Login → cadastro → login → recuperação → login → privacidade → login:
  abertura/navegação aprovadas, sem console/warnings, falhas HTTP,
  transbordamento horizontal ou travamento.
- Somente GET, zero acesso autenticado e zero escrita em produção.

Ressalva de execução: a primeira tentativa excedeu os 15 segundos para o
formulário, e outra conexão apresentou `UND_ERR_CONNECT_TIMEOUT` para a borda
do Cloudflare. Novo contexto abriu corretamente; uma repetição integral passou
sem alteração de código. O resultado indica intermitência de transporte do
executor, não uma regressão funcional confirmada.

Capturas públicas sem dados de pacientes:
`/tmp/patient-records-public-release-20261008-retry`.
WebKit automatizado não equivale a iPhone físico. Não foram enviados formulários
nem testados logins com credenciais reais em produção; os fluxos autenticados
foram cobertos pelas suítes locais isoladas do lote.
