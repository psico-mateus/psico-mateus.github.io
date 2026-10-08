# Publicação e retorno — avisos e recuperação profissional

## Referência anterior à publicação de 8 de outubro de 2026

Publicação aprovada pelo responsável. Lote inicial revisado em `88d4fe7`, na branch
`agent/prepara-troca-celular-20260824`; fingerprint inicial
`45e3248b31e62d05`. O ajuste final de navegação está em `bf16711`, com fingerprint
`1c5ec9a877be3ea5`. Não houve troca de domínio, banco, vínculos ou segredos.

Versões anteriores ativas, conferidas pela API da Cloudflare:

| Worker | Versão anterior (100% do tráfego) |
| --- | --- |
| `registros` — API local e endereço antigo | `8b702ccb-9888-4fb6-8b21-8ba7fd78edee` |
| `area-do-paciente` — portal principal e proxy | `8380170a-c409-4dfa-9660-fbd8d1749ca6` |

## Backup protegido

- D1 existente: `psico-mateus-registros`.
- Arquivo privado: `/Users/mateus/.codex/backups/psico-mateus/2026-10-08/pre-avisos-recuperacao.sql`.
- SHA-256: `056e832d7ff8ae292391fd7601bce75b73657baeacfc9ee2cb961460c8a47a3f`.
- Diretório `0700`, arquivo `0600`; nenhum conteúdo do backup foi incluído no Git.
- Importação SQLite em memória validada: integridade `ok`, zero violações de FK.
  O importador desativa FK durante a carga, pois o export pode listar tabelas
  filhas antes das tabelas referenciadas, e volta a ativar/verificar ao terminar.
- `APP_SECRET` existente deve ser preservado. Este arquivo não guarda segredos,
  tokens, senhas, códigos MFA, links temporários de download ou dados clínicos.

As únicas migrações pendentes conferidas foram
`0007_professional_mfa_recovery.sql` e `0008_patient_notices.sql`. São aditivas:
não reconstroem tabelas de contas ou registros.

## Retorno rápido do aplicativo

Executar dentro de `portal-production`, com o runtime Node no PATH e autenticação
Cloudflare válida. Conferir antes a versão que se pretende substituir. Para
voltar todo o lote, retornar primeiro a interface/proxy, depois a API:

```sh
pnpm exec wrangler rollback 8380170a-c409-4dfa-9660-fbd8d1749ca6 --config wrangler.jsonc --env-file /dev/null --message "Retorno do lote de avisos e recuperacao" --yes
pnpm exec wrangler rollback 8b702ccb-9888-4fb6-8b21-8ba7fd78edee --config wrangler.legacy.jsonc --env-file /dev/null --message "Retorno do lote de avisos e recuperacao" --yes
pnpm test:smoke-public
```

Não remover as tabelas/coluna aditivas. **Não restaurar o banco indiscriminadamente**
após novas escritas: isso apagaria contas, registros ou alterações posteriores
ao backup. Se uma recuperação MFA já tiver sido concluída, continuar usando a
nova chave; não ressuscitar chave antiga ou sessões revogadas. O backup é uma
contingência de dados, não o mecanismo normal para desfazer uma mudança de UI/API.

## Resultado da publicação

Concluída em 8 de outubro de 2026. As migrações `0007` e `0008` foram aplicadas
com sucesso. O banco remoto passou em `quick_check`, não tem violações de FK e
as contagens de contas e registros conferidas permaneceram iguais às do backup.
Nenhum segredo foi rotacionado; os bindings de `APP_SECRET` e `SETUP_SECRET`
continuam presentes nos dois Workers. Nenhum convite real foi usado em testes.

| Worker | Versão final publicada |
| --- | --- |
| `registros` | `b3beb4c5-f737-485c-9d22-ddf87da85c74` |
| `area-do-paciente` | `5b4c42eb-ce6b-4aba-8638-c56f1231e8da` |

A primeira publicação do lote gerou `c25859de-ca46-458e-b775-0c57b3e6725b`
(`registros`) e `76035ed1-e4f7-455c-8700-09593c7a669c` (`area-do-paciente`).
Na checagem pública, o encaminhamento de navegações pelo service worker
pré-existente travou no WebKit, mesmo sem interceptação de rede do teste. O
ajuste final deixa documentos e redirecionamentos com o navegador, sem alterar
GETs de API, cookies, mensagens ou a ativação explícita de atualizações. Quando
`respondWith` não é chamado, o navegador executa a requisição original; ver
[documentação do evento fetch](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event).

Validações finais:

- 194 testes automatizados aprovados, lint limpo e ambos os empacotamentos
  `--dry-run` aprovados; artefato sem arquivos de ambiente ou valores de segredos.
- Fluxo público completo: login → cadastro → login → recuperação de senha → login
  → privacidade → login, nos dois endereços, em Chromium 1366×900 e WebKit 390×844.
  Controlador do service worker ativo, sem interceptação de rede, somente GETs,
  console limpo, sem respostas de erro ou overflow horizontal.
- Mais três ciclos privacidade/retorno por engine e por endereço: 12 aprovados.
- Atualização real local de service workers, em Chromium e WebKit: versão
  dispensada → hotfix com ID diferente → ativação escolhida → uma recarga →
  privacidade funcionando. Nenhum dado real foi usado nesse ensaio.
- Smoke público de site, Guia, ambos os portais e healths aprovado; HTTP→HTTPS,
  cabeçalhos de proteção, manifesto e privacidade verificados. Site e Guia não
  foram republicados neste lote.

O smoke público não envia senhas, MFA, cadastros nem conteúdo clínico. Os fluxos
autenticados foram testados no Worker/D1 isolado com identidades sintéticas (309
verificações). Login real, instalação física e clipboard de iPhone devem ser
conferidos pelo responsável; WebKit automatizado não equivale a um iPhone físico.

Antes de trocar de celular, o profissional deve abrir **Segurança e conta →
Códigos emergenciais do autenticador**, gerar a lista com senha + MFA atual e
guardá-la em local seguro separado do aparelho. A lista aparece uma única vez.
O recurso não dispensa a senha nem recupera retroativamente códigos perdidos.
