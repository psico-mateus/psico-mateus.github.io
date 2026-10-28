# Correção das dependências — 28/10/2026

Base recebida do Windows: `35c2642`, branch compartilhada
`trabalho/continuidade-mac-windows`. Implementação isolada em
`tarefa/mac-correcao-dependencias-20261028`. **Sem publicação.**
Correção de código/lockfile preservada em `5ee7a34`.
Os ajustes de foco encontrados na QA estão separados em `4ce3241` (navegação)
e `eb717eb` (respostas salvas do mapa), com `1f77547` para a confirmação nativa
de compartilhamento. Fonte final do aplicativo: **`1f77547`**.

## Problema confirmado e escopo

A consulta atual do portal encontrou **21 advisories**: dois críticos, sete
altos, nove moderados e três baixos. O relatório de 27/10 tinha 16; os cinco
novos avisos são de Undici e usam o mesmo piso corrigido. Não são 21 incidentes
nem evidência de acesso indevido aos pacientes.

Foi escolhido o menor lote de versões corrigidas compatíveis com os peers
declarados da stack, sem atualizar frameworks/plugins por hábito:

| Pacote | Anterior | Preparado |
| --- | --- | --- |
| Next e eslint-config-next | 16.3.8 | 16.4.1, pareados |
| Vite | 8.0.16 | 8.1.6, versão exata |
| fast-uri | 3.1.8 | 3.1.9 |
| Undici | 7.29.1 | 7.30.1 |
| Zod | 4.4.3 | 4.6.6 |

Vinext 1.0.1, React/DOM/RSC 19.2.8, Cloudflare plugin 1.37.1, plugins React
6.0.2/RSC 0.5.34, Wrangler e Drizzle permanecem nas versões anteriores. Sharp
0.35.5 e as permissões restritas de `allowBuilds` foram preservados.

Overrides são limitados às linhas vulneráveis 3.x/7.x/4.x, sem forçar outro
major. Os testes inspecionam todas as versões efetivamente resolvidas, não só
o texto dos seletores. Vite tem pin/guarda exatos: um teste genérico `>=8.1.6`
aceitaria indevidamente as faixas afetadas 8.2.0–8.2.3 e 8.3.0–8.3.2.

O lote de dependências não redesenhou componentes. Na QA, foi acrescentada uma
correção pontual ao foco agendado da navegação do paciente, descrita abaixo.
Não houve mudança de CSS, API, schema/migração, política de senha, segredo,
cookie, domínio, service binding ou banco. Nenhum dado real foi usado.

## Revisão do lockfile e fontes

- Inventário do lockfile: 646 → 648 entradas; 39 novas e 37 removidas.
- Revisão independente confirmou as 39 integridades novas no registro npm e
  ausência de alteração de integridade em pares nome/versão já existentes.
- Mudanças transitivas necessárias: família Next/SWC/ESLint e
  Vite/Rolldown/bindings/OXC/WASM. Resoluções incidentais pequenas: reutilização
  do caniuse-lite já presente e patch de emnapi no suporte WASM opcional.
- Nenhum novo hook `preinstall`/`install`/`postinstall` entre as versões novas.
  Instalação com Node 24.22.1/pnpm 11.25.0 e reinstalação congelada aprovadas.
- Peers declarados continuam compatíveis. Isso não substitui testes reais.

Fontes primárias consultadas e metadados npm conferidos:

- [Next 16.4.1](https://github.com/vercel/next.js/releases/tag/v16.4.1),
  [imagens](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
  [typed arrays](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).
- [Vite 8.1.6 e changelog](https://github.com/vitejs/vite/blob/v8.1.6/packages/vite/CHANGELOG.md),
  [launch-editor](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm).
- [Zod 4.6.6](https://github.com/colinhacks/zod/releases/tag/v4.6.6) e
  [commit corretivo](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd).
  A URL do advisory do mantenedor continuou indisponível, mas release/commit
  confirmaram a correção de limites de coleções. A nota upstream distingue
  commits Git comprometidos e revertidos de pacotes npm: segundo o mantenedor,
  aqueles commits nunca foram publicados no npm; a proveniência da release
  referencia a cópia anterior à reescrita, com conteúdo idêntico.
- [Undici 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1), cobrindo
  os oito avisos atuais da linha 7.
- [fast-uri 3.1.9](https://github.com/fastify/fast-uri/releases/tag/v3.1.9).

## Validação local já concluída

- Audit completo e `--prod` do portal: **zero advisories**, retorno 0.
  Audit da raiz: zero, sem alterar seu lockfile.
- `pnpm lint`: aprovado.
- `pnpm test`: tipos, build sanitizado e **327 testes aprovados**, sem skips.
- `pnpm build:worker`: aprovado, sem deploy. Avisos existentes de classificação
  de rotas/imports dinâmicos do Vinext e depreciações não foram suprimidos.
- `pnpm test:integration:isolated`: **309 verificações**, nove migrações somente
  em TMP, cadastro/login/MFA/permissões, reinício preservando contas, registros
  e sessões, logout e novo login. **Zero requisições de produção.**
- `pnpm test:restore-local`: 15 tabelas sintéticas verificadas; não restauração
  de produção.
- Snapshot de 124 arquivos do build comparado byte a byte, sem symlinks ou
  nomes de arquivos de ambiente/banco/chaves; configurações originais idênticas.
  Fingerprint inicial: `7167ac23c329ebb4`; após corrigir a navegação:
  `e61c58ee50efa8fa`; incluindo o resumo do mapa: `b3d68877d5dbac5c`;
  final, incluindo a confirmação nativa: **`7f798b607acbe748`**, não publicado,
  com 124 arquivos novamente comparados antes de qualquer uso de publicação.
- Wrangler `deploy --dry-run --keep-vars` aprovado separadamente para legado
  `local` e principal `proxy`/`LEGACY_PORTAL`, usando executável absoluto fora
  do checkout. **Dry-run não enviou a versão nem testou o proxy em produção.**

### Interface e correção de foco — validação encerrada

Browser plugin não disponível; usando Playwright já instalado em loopback,
APIs inteiramente simuladas e origens externas bloqueadas.
Fluxo: abrir o portal → navegar entre início, registros, mapa, recursos, avisos,
conta e histórico profissional → preservar conteúdo, privacidade, foco e ações.

- Rodada dev (`http://127.0.0.1:4440`): 240/242 por motor. As quatro falhas
  ocorreram na abertura do documento, **antes** das ações de conta: timeout de
  `page.goto` ou título vazio com erro Miniflare `Network connection lost`.
- Suíte de conta inteira repetida separadamente, sem alterar aplicação, fixture
  ou timeouts: **26/26 Chromium + 26/26 WebKit**, zero skips/falhas.
- Artefato público sanitizado executado diretamente com `wrangler dev --local`
  em `http://127.0.0.1:4441`, fora do checkout, sem arquivos de ambiente e com
  estado D1 descartável. Os oito conjuntos foram executados um motor por
  vez. Primeira rodada do artefato: **242/242 Chromium**, **241/242 WebKit**.
  A falha WebKit foi foco no resumo inicial, não autenticação ou conteúdo.
- Identidade/título/conteúdo, ausência de overlay e erros inesperados de console,
  capturas, interações, foco, axe, overflow, telas 320/390/640/1366px, texto 200%
  e movimento reduzido são cobertos pelas suítes, conforme cada cenário.

Não se confirmou a causa da instabilidade inicial do servidor dev. Não foi
atribuída definitivamente à concorrência nem à atualização, e os erros originais
não foram apagados/contados como aprovação. O resultado do artefato público
local e o reteste de conta precisam ser distinguidos dessa primeira rodada.

#### Corrida de foco reproduzida e corrigida

O efeito de navegação em `app/PortalApp.tsx` agendava foco no título sem respeitar
uma interação ocorrida depois do agendamento. Isso permite, por exemplo, retirar
o foco do botão de atualizar que a pessoa acabou de escolher.

- Quatro testes com fila RAF controlada, sem sleeps/tentativas automáticas,
  reproduziram o defeito no artefato anterior: **0/4 aprovados** em WebKit.
- A correção registra a origem, cancela o frame quando há novo foco, ponteiro,
  teclado ou saída da janela, e remove os listeners ao executar/cancelar/desmontar.
  O foco normal de destino e a prioridade de cartões salvos/avisos permanecem.
- Novo artefato: **4/4 Chromium + 4/4 WebKit**, sem alterar timeouts ou enfraquecer
  asserções. Lint, tipos, build público e os 327 testes gerais repetidos/aprovados.
- O primeiro reteste com o foco da navegação corrigido passou 245/246 em Chromium;
  surgiu uma disputa semelhante no resumo do mapa, investigada abaixo. O script
  interrompeu antes de iniciar WebKit, sem esconder o retorno 1.

#### Foco no resumo de respostas do mapa

- O título do resumo também podia substituir o foco de um grupo de respostas
  que a pessoa acabara de escolher. A repetição isolada do cenário antigo passou,
  mas uma fila RAF controlada reproduziu o problema: **0/1 Chromium** antes.
- Proteção limitada a `view === "summary"` em `PatientMapShell.tsx`: se o foco
  mudou depois do agendamento, respeitar a nova escolha. A exceção para `body`
  exige que a origem anterior tenha sido removida. Item, síntese, compartilhamento,
  gráficos e retorno à visão geral não foram refatorados.
- Artefato corrigido: **1/1 Chromium + 1/1 WebKit** no teste determinístico.
  Lint, tipos, build público e 327 testes gerais novamente aprovados.
- A regressão dos oito conjuntos sobre `b3d68877d5dbac5c` passou **247/247
  Chromium** e **246/247 WebKit**. O único erro foi o foco após confirmar
  compartilhamento, detalhado abaixo; não uma falha de login ou persistência.

#### Confirmação de compartilhamento no Safari/WebKit

- A origem do foco era lida depois de `window.confirm`. O diálogo nativo pode
  devolvê-lo a `body`; nesse caso, a interface não sabia que deveria retornar
  ao registro depois de compartilhar.
- Um teste que desfoca a ação ao confirmar reproduziu a ordem: **0/1 WebKit**
  antes, com compartilhamento concluído e foco perdido.
- Correção mínima: capturar as mesmas duas variáveis antes da confirmação.
  Cancelar continua retornando antes de qualquer alteração/requisição. O guard
  posterior continua respeitando foco escolhido em outro lugar.
- Novo teste: **1/1 Chromium + 1/1 WebKit**, verificando foco útil, um único PATCH,
  payload e CSRF. Tipos, lint, build e 327 testes gerais novamente aprovados.
- A rodada completa final WebKit teve **247/248**. O último alerta foi isolado
  como falso positivo da fixture, não um novo defeito da aplicação: o diagnóstico
  mostrou foco em `BUTTON.secondary-button`, habilitado, após compartilhar.
- A fixture antiga aceitava título, resumo, filtros e busca, mas não as próprias
  ações do registro. `733bb4a` aceita apenas essas ações específicas e fortalece
  todos os destinos: conectados, com retângulo visível, fora de ancestrais
  ocultos/inertes/aria-hidden e sem disabled/aria-disabled. `body` continua inválido.
  Erros agora incluem metadados seguros do foco; payload/CSRF continuam conferidos.
- Fechamento do histórico completo: **70/70 WebKit + 70/70 Chromium**, sem
  falhas/skips. O restante do Chromium havia passado em 247/247 no lote anterior;
  a última alteração da aplicação é limitada à captura antes da confirmação.
  Não houve outra mudança no aplicativo para satisfazer esse falso positivo.
- Lint final e 327 testes gerais novamente aprovados. Não somar os resultados
  de retestes como se fossem casos distintos ou uma única rodada 496/496.

A disputa foi demonstrada de forma determinística; isso não identifica por trace
a causa exata de toda intermitência histórica nem corrige todas as rolagens do
aplicativo. O efeito separado de rolagem inicial não foi alterado.

## Limites e próximo passo

Este resultado não é pentest nem garantia de ausência de falhas. O audit é uma
consulta datada ao registro, não prova de segurança permanente. Produção e
`main` continuam anteriores: não declarar os alertas remotos encerrados.

Código, testes e resultados preservados em commits separados para sincronização
entre computadores. A instalação destas versões ainda
precisa de repetição física no Windows; WebKit automatizado não é iPhone real
nem validação humana com leitor de tela. Antes de publicar, obter aprovação,
consultar novamente as versões dos dois Workers e preparar retorno de código
sem restauração de banco, conforme `CONTINUIDADE.md`.
Recriar um snapshot de envio limpo; os diretórios TMP usados para preview podem
conter metadados locais do Wrangler e não devem virar atalho de publicação.
