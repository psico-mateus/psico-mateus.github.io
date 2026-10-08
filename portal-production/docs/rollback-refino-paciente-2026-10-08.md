# Publicação e retorno — refinamento da Área do paciente

Publicação autorizada pelo responsável após revisão da prévia. Código aprovado:
`4dec3c4`, branch `agent/refino-paciente-inclusivo-20261008`.
Fingerprint do build público sanitizado: `04a2d900c21a088a`.

## Estado anterior confirmado

Conferido na API da Cloudflare imediatamente antes de publicar. Ambos recebiam
100% do tráfego:

| Worker | Versão a preservar para retorno |
| --- | --- |
| `registros` | `b3beb4c5-f737-485c-9d22-ddf87da85c74` |
| `area-do-paciente` | `5b4c42eb-ce6b-4aba-8638-c56f1231e8da` |

Não há migração nem operação de banco neste lote. API, autenticação, cookies,
MFA, service worker e configurações não foram alterados. O Worker principal
continua encaminhando a API ao Worker `registros`, com o mesmo D1 existente.
Os segredos remotos são preservados; não há comando de criação/rotação neste lote.

O código-fonte aprovado também está protegido em bundle Git privado, fora do
repositório: `source-refino-paciente-polido.bundle`, na pasta de backups de
8 de outubro de 2026. O arquivo tem permissão `0600` e passou em `git bundle verify`.

## Retorno rápido, se houver regressão

Executar dentro de `portal-production`, usando o runtime Node e a autenticação
Cloudflare existentes. Conferir primeiro qual deployment está ativo. Retornar
primeiro o portal principal/proxy, depois o endereço antigo/API:

```sh
pnpm exec wrangler rollback 5b4c42eb-ce6b-4aba-8638-c56f1231e8da --config wrangler.jsonc --env-file /dev/null --message "Retorno do refinamento visual do paciente" --yes
pnpm exec wrangler rollback b3beb4c5-f737-485c-9d22-ddf87da85c74 --config wrangler.legacy.jsonc --env-file /dev/null --message "Retorno do refinamento visual do paciente" --yes
pnpm test:smoke-public
```

**Não restaurar o banco, não apagar contas ou registros e não trocar segredos**
para desfazer este lote visual. O retorno do deployment preserva os dados novos
criados depois da publicação. Não usar os IDs de retorno do lote anterior de
MFA/avisos: os IDs acima preservam essas funções já ativas.

## Resultado

Publicação concluída e versões confirmadas na API da Cloudflare, ambas com 100%
do tráfego:

| Worker | Nova versão ativa | Deployment | Horário UTC |
| --- | --- | --- | --- |
| `registros` | `0478b052-cd09-4b42-bab7-71c710616e72` | `e04dee39-5c0b-43b8-8e3d-f4bb65329f8e` | 2026-10-08 20:21:13 |
| `area-do-paciente` | `a7c38197-bf77-4c6c-8e9e-e57f11df50ee` | `8a2c4af1-4ad8-433b-8f74-40a7ebe8cd31` | 2026-10-08 20:22:40 |

Checagens públicas pós-publicação aprovadas:

- `pnpm test:smoke-public`: oito endpoints e redirecionamentos HTTP/HTTPS
  conferidos, com cabeçalhos esperados e sem criação de cookies.
- Os dois `/sw.js` expõem o fingerprint `04a2d900c21a088a`; a guarda de navegação
  WebKit continua presente. Manifest, dois ícones, sete assets referenciados e
  saúde responderam 200 nos dois endereços.
- Chromium 1366×900 e WebKit 390×844: entrada, cadastro, recuperação,
  privacidade e retorno à entrada, com service worker ativo e controlador
  confirmado. Sem travamento, overflow horizontal, overlay de erro, erros de
  console ou respostas de rede falhas. Aviso de atualização não persistente.
- Somente requisições GET; nenhum formulário enviado, acesso autenticado,
  consulta de pacientes ou escrita em produção. Não foi repetido um login ou
  cadastro real em produção. As regressões autenticadas são os testes locais
  isolados documentados em `refino-paciente-inclusivo-2026-10-08.md`.

Nenhuma operação de banco foi executada. Não houve merge nem push Git. WebKit
automatizado não substitui teste em iPhone físico; VoiceOver e instalação PWA
física não foram avaliados nesta publicação.
