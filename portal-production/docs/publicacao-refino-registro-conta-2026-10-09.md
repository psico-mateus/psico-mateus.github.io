# Publicação aprovada — refinamento da Área do paciente

## Estado publicado

- Autorização: usuário pediu “poste” após a apresentação do lote completo.
- Branch: `agent/refino-area-inteira-20261009`.
- Implementações: `fc5587e` (avisos, histórico e recursos) e `cf56fea` (registro e conta); documentação anterior `42c2b96`.
- Worker: `area-do-paciente`, https://area-do-paciente.psico-mateus.workers.dev/.
- Versão: `c9ef866b-e181-4f5c-98e9-78218183298a`.
- Deployment: `e25be096-3dff-4699-8370-b7dc1aa610e6`, criado em `2026-10-09T22:09:28.974841Z`, recebendo 100% do tráfego.
- Fingerprint do cliente/service worker: `e68cb034f802bbe6`.
- Não houve push, merge, publicação do site/Guia ou deploy do Worker antigo.

## Proteções mantidas

A versão anterior foi conferida imediatamente antes da publicação: `f3bc1cd2-f7bd-4806-9996-a54fdea1e944`, então recebendo 100% do tráfego. O retorno rápido está documentado fora do Git, com permissão 0600, em `/Users/mateus/.codex/backups/psico-mateus/2026-10-09/retorno-refino-registro-conta.md`.

`pnpm build:worker` executado com sucesso. O artefato sanitizado foi inspecionado e o dry-run aprovado antes de enviar: mesmo D1 `f2c23652-0c2d-49f0-ad25-99fc61c2ac6a`, API em `proxy`, serviço `LEGACY_PORTAL=registros`, sem arquivos de ambiente no build. Após publicar, os bindings e a presença dos mesmos nomes de segredos foram novamente conferidos, sem consultar seus valores.

O Worker antigo permanece na versão `0478b052-cd09-4b42-bab7-71c710616e72`, fingerprint `04a2d900c21a088a`. Não foram executadas migrações, operações no banco, trocas de segredos, mudanças de regras de login/MFA ou alterações de contas/registros de produção.

## Verificações após publicar

- `pnpm test:smoke-public`: aprovado. Site, Guia, dois portais e dois endpoints de saúde responderam 200; redirecionamentos HTTP→HTTPS responderam 308. Cabeçalhos de proteção e ausência de criação de sessão nas consultas públicas confirmados.
- Service worker público contém exatamente o novo fingerprint.
- Configuração pública indica serviço configurado; consulta anônima de sessão retorna `user: null`, sem criar cookie.
- Entrada e alternância para cadastro conferidas em Chromium desktop 1366 px e WebKit mobile 390 px. Campo profissional pode abrir, senha pode ser mostrada e autocomplete permanece correto.
- Formulário servido pelo novo bundle conferido nos mesmos dois navegadores com toda a API interceptada e dados sintéticos: quatro seções visíveis, campos complementares presentes, fonte de entrada de ao menos 16 px e erro de título contendo só espaços sem perder a situação escrita.
- Seis estados renderizados conferidos: sem overflow horizontal, erros inesperados de console ou violações automáticas axe A/AA nos estados testados. Capturas em `/tmp/registro-refino-20261009-public-ui/`.
- Verificações não enviaram dados, não usaram credenciais reais e não acessaram conteúdo de pacientes. Não foi criado cadastro de teste em produção.

As suítes locais completas já haviam passado antes da publicação: lint, typecheck, build, 227 testes gerais, 158 casos de interface nos dois navegadores e sete cenários de revisão visual. Não repetir essas etapas sem mudança relevante de código.

### Limites

As verificações públicas de entrada/cadastro exercitaram a interface sem submeter credenciais. A revisão privada do bundle publicado usou API simulada, portanto não comprova um login autenticado real em produção. As regras do servidor não foram alteradas neste lote. WebKit não substitui teste em iPhone físico; não houve VoiceOver humano ou Firefox. Browser plugin indisponível; utilizada a alternativa Playwright existente. Nenhuma verificação garante ausência absoluta de falhas.

## Retorno e atualização do app

Se necessário, executar na pasta `portal-production`:

```sh
pnpm exec wrangler rollback f3bc1cd2-f7bd-4806-9996-a54fdea1e944 --config wrangler.jsonc --message "Retorno ao estado anterior ao refinamento de registro e conta" --yes
```

O retorno afeta somente código e assets, não restaura nem apaga dados. Nenhum backup de dados foi criado nesta atualização exclusivamente de interface.

Para um app já aberto: salvar antes qualquer texto pendente; abrir “Atualizações do aplicativo”, usar “Verificar atualização” e depois “Atualizar agora” quando disponível. Uma página aberta anteriormente pode continuar com o bundle antigo até aplicar a atualização.
