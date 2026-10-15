# Publicação do refinamento inclusivo — 15 de outubro de 2026

O usuário respondeu “pode mudar” à pergunta explícita “Posso publicar o conjunto preparado?”. O escopo aprovado é o conjunto descrito em `refinamento-inclusivo-2026-10-15.md`. Nenhuma migração, troca de segredo, mudança de permissões, serviço pago ou manipulação de dados reais foi incluída.

## Antes do envio

- Fonte do portal: `34fa215`, branch `agent/refinos-inclusivos-20261014`, checkout limpo. Build já testado: **`7205d2d2645a1d72`**.
- Snapshot persistente e sanitizado: `/Users/mateus/.codex/visualizations/2026/07/16/019f6c30-8c73-7f00-8e04-df9350c76276/publicacao-20261015/worker-34fa215-8VEU1f`. Comparação recursiva confirmou 129 arquivos de build idênticos, sem symlinks ou arquivos de ambiente. Configurações copiadas são as existentes, sem alterações.
- Os dois dry-runs passaram fora da pasta de desenvolvimento, evitando o redirecionamento do Vite para sua configuração gerada. Legado continua em modo `local`; principal em `proxy` com `LEGACY_PORTAL=registros`; mesmo D1 `f2c23652-0c2d-49f0-ad25-99fc61c2ac6a`.
- Versões atuais consultadas por Wrangler antes do envio: principal **`8d4538bf-3cba-49da-abe8-8a1bebb0cb63`**, legado **`ea2910f9-449f-4f0c-87ab-27f9cbc9877b`**. São os alvos de retorno deste lote, não os alvos mais antigos dos relatórios de 14/10.
- GitHub Pages: `origin/main` novamente consultado e mantido em `f62ce6b1755b0f6890f916f045e2ac31d46757c8`. Branch pública local `publicacao/refinamento-inclusivo-20261015`, HEAD `c708a7ef8ab4b28e51b5a61a0359b7d8768be6e6`, árvore `b55b5f9c03b4282053ce9134d0819d11028f8010`.
- O checkout público existente foi reutilizado. Cherry-pick de `6e76813` contém somente 11 paths públicos/testes; revisão independente confirmou todos os blobs iguais à fonte testada, sem portal, env, banco ou configuração de hospedagem. Dry-run do push normal em fast-forward aprovado; não será usado force-push.
- A suíte pública não foi repetida no transporte porque os blobs públicos/testes são idênticos aos já validados (136 aprovados, 59 skips intencionais). O complemento de interface não mudou esses arquivos.

## Retorno rápido de código, sem restaurar/apagar banco

Somente se uma regressão exigir retorno, usando o mesmo Wrangler já autenticado e os arquivos de configuração existentes:

```sh
pnpm exec wrangler rollback 8d4538bf-3cba-49da-abe8-8a1bebb0cb63 --config wrangler.jsonc --message "Retorno anterior ao refinamento inclusivo 2026-10-15" --yes
pnpm exec wrangler rollback ea2910f9-449f-4f0c-87ab-27f9cbc9877b --config wrangler.legacy.jsonc --message "Retorno anterior ao refinamento inclusivo 2026-10-15" --yes
```

Isso retorna código/assets, não reverte dados clínicos. Para Pages, reverter normalmente o commit público `c708a7e`, preservando mudanças posteriores e sem force-push. Base anterior registrada acima. Não executar estas ações apenas por este documento existir.

## Execução e verificações

Publicação concluída após os dry-runs. Foi usado `--keep-vars`; segredos não foram enviados, alterados ou removidos.

| Ambiente | Versão publicada |
|---|---|
| Legado/API `registros` | `4ec8a8ca-4a39-4406-a387-214b0c09cc32` |
| Principal `area-do-paciente` | `7457e7e9-8fd7-4c11-a790-72ca21303f87` |
| Pages `main` | `c708a7ef8ab4b28e51b5a61a0359b7d8768be6e6` |

- Wrangler confirmou as duas versões em 100% do tráfego; deploy legado às 21:30 UTC e principal às 21:31 UTC. Principal mantém o vínculo com o legado; mesmo banco e modos existentes.
- SW de ambos os portais retornou 200 com fingerprint **`7205d2d2645a1d72`**. Sessão anônima dos dois retornou `user: null` sem criar cookie.
- `scripts/smoke-public.mjs` aprovado: site, Guia, portais e health retornaram 200; HTTP dos dois portais redirecionou com 308 para HTTPS; cabeçalhos de proteção conferidos. Zero requisições autenticadas ou escritas.
- Push público normal, em fast-forward, de `f62ce6b` para `c708a7e`. `git ls-remote` confirmou o novo `main`; sete arquivos públicos publicados tiveram SHA-256 idêntico aos blobs aprovados, incluindo os dois JS, quatro HTMLs e SW v32. Nenhum arquivo do portal foi levado junto para Pages.
- QA renderizada dos portais: **8/8 cenários**, principal e legado, Chromium 1366×900 e WebKit 390×844, contextos novos. Login/cadastro anônimos, alternância, convite, 18+/privacidade, requisitos de senha, manifesto e ícones conferidos sem submit real. Com API inteiramente interceptada: registro privado salvo volta à lista antes filtrada, foco e anúncio de Atualizar, divergência de senha junto do formulário e descrição vinculada. Sem overlay, overflow, erro inesperado de console ou violação axe nos estados verificados; zero escrita em produção.
- QA pública de site/Guia: dois motores nas mesmas larguras; identidade/tela não vazia, FAQ, menu móvel por teclado e foco de destino, busca Ansiedade, modal, isolamento do fundo, Escape e retorno de foco passaram. Sem requisições estrangeiras, escritas, overflow ou erro inesperado. Contextos descartáveis não acessam o rascunho do usuário.
- Capturas públicas e dos portais foram abertas e inspecionadas, não somente geradas. A verificação visual não substitui teste em iPhone físico ou leitura humana com VoiceOver/NVDA.

Evidências persistentes, fora do Git:

- Snapshot sanitizado, script/JSON/capturas públicas: `publicacao-20261015/` sob a mesma raiz de visualizações deste lote.
- Script, JSON e capturas dos oito cenários do portal: `refinos-publicacao-20261015/` sob essa raiz. Browser plugin indisponível; usado Playwright existente em contexto separado, não a sessão do usuário.

O GitHub voltou a informar 15 alertas de dependências na árvore remota durante o push (4 críticos, 8 altos, 2 moderados, 1 baixo). A publicação isolada pública não mudou manifestos/locks antigos remotos; o Worker foi construído com as dependências corrigidas já registradas em 14/10. Não foi feita nova análise individual nem declarado que os alertas estão resolvidos. Reconciliação remota e alerta upstream de desenvolvimento/build continuam pendências separadas.

Não haverá criação de conta, submit de login/MFA real ou leitura de registros de pacientes em produção. Verificação pública é anônima; verificação de telas autenticadas usa contextos novos e API completamente simulada, com requisições estrangeiras bloqueadas. O teste isolado de cadastro/login/sessão/D1 do primeiro lote permanece registrado no relatório de preparação, não deve ser apresentado como teste autenticado real em produção.

Para carregar a atualização no app já aberto, salvar qualquer texto em edição antes de atualizar a página. Não limpar armazenamento do navegador ou reinstalar para forçar a atualização.
