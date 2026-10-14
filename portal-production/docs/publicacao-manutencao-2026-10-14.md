# Publicação da manutenção — 14 de outubro de 2026

Autorização: usuário pediu “pode postar e logo em seguida refine visualmente os sites, mas sem parecer carnaval entre eles”. A primeira publicação é somente o lote de dependências já verificado nos commits `791c156` e `681b944`. Refinamento visual e correções encontradas na auditoria são um lote separado.

## Artefato e estado anterior

- Fonte da manutenção: `681b944`, branch anterior `agent/correcao-seguranca-dependencias-20261010`.
- Build público sanitizado: fingerprint `ea93e270c4a59568`.
- Snapshot de publicação isolado: `/tmp/psico-security-release-20261014-YTQbIp`; somente dist, configurações públicas e vínculo de ferramentas existentes. Não contém ambiente, segredos ou banco.
- Antes do envio, listas de deployment novamente consultadas: `area-do-paciente` em `1f829a4e-953a-4088-a0f7-3e932f8ce44a`; `registros` em `0478b052-cd09-4b42-bab7-71c710616e72`.
- Dry-run dos dois configs concluído. Mesmo D1 existente `f2c23652-0c2d-49f0-ad25-99fc61c2ac6a`; principal em proxy com LEGACY_PORTAL=registros; antigo em local.
- Não executar migrações, alterar segredos, criar contas reais ou fazer login de paciente para este lote.

## Retorno rápido de código e assets

Os comandos abaixo devem ser usados somente se for necessário desfazer esta manutenção, não executados automaticamente como parte da publicação normal. Eles não restauram nem apagam dados.

```sh
pnpm exec wrangler rollback 0478b052-cd09-4b42-bab7-71c710616e72 --config wrangler.legacy.jsonc --message "Retorno anterior a manutencao de dependencias 2026-10-14" --yes
pnpm exec wrangler rollback 1f829a4e-953a-4088-a0f7-3e932f8ce44a --config wrangler.jsonc --message "Retorno anterior a manutencao de dependencias 2026-10-14" --yes
```

## Verificações

As suítes completas, fluxos de cadastro/login/MFA e preservação de dados sintéticos passaram no lote anterior, documentado em `seguranca-dependencias-2026-10-10.md`. O artefato usado nesta publicação é exatamente o artefato público validado naquele lote, sem incluir edições posteriores da auditoria ou do refinamento. Após envio, verificar saúde anônima, assets, fingerprint e cabeçalhos dos dois portais, sem credenciais de pacientes.

## Publicação confirmada

- Legado/API `registros`: versão `5e2ac2d5-cb24-4ea0-8bba-0e786f4d04bb`.
- Principal `area-do-paciente`: versão `82cdb92c-85e7-4ed4-b653-bdf573ad1e5f`.
- Dois endpoints públicos de saúde, duas páginas do portal, site e Guia retornaram 200. Redirecionamentos HTTP→HTTPS retornaram 308. Cabeçalhos de proteção passaram no smoke público.
- Fingerprint `ea93e270c4a59568` verificado nos dois service workers publicados.
- Consulta anônima de sessão retornou `user: null` nos dois, sem gerar cookie.
- Nenhuma escrita de produção, credencial, migração, troca de segredo, push ou merge de GitHub realizado.
- Logs de publicação: `/tmp/psico-security-deploy-legacy-20261014.log` e `/tmp/psico-security-deploy-main-20261014.log`.

Os refinamentos/correções da auditoria preparados após essa publicação não estão incluídos nesses IDs. Esta verificação é pública e anônima; os testes autenticados permanecem locais e sintéticos.
