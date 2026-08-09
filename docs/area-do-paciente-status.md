# Área do paciente — estado local de continuidade

Atualizado em 08/08/2026. Este documento descreve o trabalho local ainda não publicado.

## Estado do repositório

- Branch: `agent/refina-p1-limites-exportacao`.
- Commit-base: `a1b476454b149ef000f887ce0de71200c5a84d63`.
- A branch e `origin/main` partiam do mesmo commit antes deste trabalho.
- As alterações dos Lotes 0 a 3 permanecem locais e não commitadas.
- Portal: Next.js/React/Vinext em Cloudflare Worker, com D1/Drizzle já existentes.
- Worker oficial: `area-do-paciente`; Worker antigo `registros` preservado por compatibilidade.

## Lote 0 — continuidade

- O trabalho local anterior foi identificado e preservado.
- Cadastro, login, sessão, MFA profissional, convites, registros, compartilhamento, revogação e visualização não foram redesenhados.
- A regressão estrutural e visual foi executada sobre a implementação atual.
- A documentação de continuidade foi atualizada para refletir o código local.

## Lote 1 — arquitetura de informação

- A navegação do paciente apresenta `Início`, `Meus registros`, `Meu mapa` e `Recursos`.
- A página inicial diferencia os quatro caminhos sem metas, pontos, sequência de uso ou obrigação de preenchimento.
- `Recursos` reúne, sem confundir, `Ferramentas do dia a dia`, `Leitura complementar` e o Guia de Emoções público.
- `Leitura complementar` preserva o nome, o conteúdo e o fluxo de criação de registro privado.
- O Guia continua externo à conta e nenhum uso dos recursos é informado automaticamente a Mateus.

## Lote 2 — Ferramentas do dia a dia

- Catálogo local e versionado com 8 ferramentas.
- Filtros por necessidade, página individual, orientações de adaptação, limites de uso e aviso de segurança.
- Cada ferramenta pode abrir o formulário existente de registro, vazio e privado por padrão.
- Abrir ou usar uma ferramenta não cria histórico, não chama API, não persiste no navegador e não aparece no painel profissional.

## Lote 3 — Meu mapa, interface

- Catálogo tipado e versionado a partir da planilha revisada.
- 5 mapas, 25 seções, 150 itens e 6 respostas editoriais preservados.
- Interface com respostas, observações opcionais, navegação entre itens, contagens descritivas e síntese livre.
- Não existe pontuação, diagnóstico, interpretação automática ou obrigação de concluir.
- O conteúdo nunca é mostrado a Mateus nem usado como prontuário.

## Lote 4 — persistência privada do Meu mapa

- Migration, tabela e endpoints foram preparados somente no ambiente local.
- O rascunho é salvo por campo, com versão editorial, geração, revisão e chave
  idempotente; o mapa completo não é enviado em um único corpo.
- O paciente não consegue editar até o carregamento inicial terminar, evitando
  sobrescrever um rascunho que não chegou a ser carregado.
- Rádio, observação, síntese e posição têm atrasos próprios e fila serial por
  campo. Uma edição nova aguarda a resposta da anterior.
- A interface informa salvando, salvo, falta de conexão, erro e conflito. O
  conteúdo permanece visível em falhas e conflitos nunca são resolvidos em
  silêncio.
- `Salvar e voltar ao início` aguarda a fila; limpar o mapa incrementa a geração
  para impedir que uma aba antiga recrie conteúdo apagado.
- Não há endpoint profissional, contagem, compartilhamento, analytics ou log de
  conteúdo do Meu mapa.

## Navegação, endereços e foco

- A navegação usa fragmentos públicos e sem conteúdo clínico:
  - `#inicio`;
  - `#registros`;
  - `#meu-mapa`;
  - `#recursos`;
  - `#recursos/ferramentas` e `#recursos/ferramentas/{id-publico}`;
  - `#recursos/leituras` e `#recursos/leituras/{slug-publico}`.
- Voltar e Avançar do navegador restauram as áreas e os detalhes públicos.
- Recarregar preserva o endereço de ferramentas e leituras; identificadores inexistentes são normalizados para a biblioteca correspondente.
- A troca de tela move o foco para o título correto. Ao voltar de uma ferramenta, leitura ou mapa, o foco retorna a um ponto útil da tela anterior.
- Nenhum identificador de paciente, registro ou dado sensível é colocado no endereço.

## Rascunhos e prevenção de perda

- O rascunho de registro foi elevado para o painel do paciente e permanece intacto ao trocar de área durante a mesma sessão da página.
- `Meus registros` pode mostrar o rascunho pausado, com ações explícitas para continuar ou descartar.
- Voltar e Avançar preservam o texto do rascunho enquanto a página permanece aberta.
- Alterações ainda não enviadas ativam o aviso nativo antes de recarregar,
  fechar a página ou sair; conteúdo já salvo não gera aviso falso.
- Por decisão de privacidade, registros e respostas do Meu mapa não são
  persistidos em `localStorage`, `sessionStorage`, Cache API ou service worker.
- Se uma sessão expira inesperadamente durante uma alteração, um buffer apenas
  em memória e vinculado ao mesmo paciente evita apagar o texto antes do novo
  login. Entrar com outra conta descarta o buffer sem exibi-lo.

## Banco, API e autenticação

- Migration local nova para os campos privados do Meu mapa; nenhuma migration
  foi aplicada em produção.
- Endpoints locais `GET`, `PATCH` e `DELETE /api/portal/map-draft`.
- Leitura e escrita derivam o paciente exclusivamente da sessão. Mutação exige
  CSRF; profissional não tem rota de acesso.
- Cookies, MFA, convites, papéis e regras dos registros existentes não foram
  relaxados.
- Nenhum conteúdo real de paciente foi usado nos testes ou adicionado ao repositório.

## Testes confirmados

- `pnpm lint`: aprovado.
- `pnpm test`: build aprovado e 76/76 testes estruturais e unitários aprovados.
- Ensaio local de restauração: 10 tabelas verificadas, somente dados sintéticos e zero requisições a produção.
- Revisão visual: aprovada em 7 configurações.
- Navegadores e larguras: WebKit em 320, 390 e 640 px; Chromium desktop; fluxos autenticados e de visitante incluídos.
- Acessibilidade automática: Axe WCAG A/AA sem violações nas telas verificadas.
- Responsividade: nenhum estouro horizontal nas larguras testadas.
- Fluxos visuais cobertos: rascunho pausado e retomado, Meu mapa, Ferramentas, Leitura complementar, deep link, reload, Voltar, foco restaurado e salvamento privado sintético.

## Arquivos principais deste trabalho

- `portal-production/app/PortalApp.tsx`
- `portal-production/app/PatientEducation.tsx`
- `portal-production/app/PatientResources.tsx`
- `portal-production/app/PatientToolsShell.tsx`
- `portal-production/app/PatientMapShell.tsx`
- `portal-production/app/patient-navigation.ts`
- `portal-production/app/globals.css`
- `portal-production/content/patient-tools-catalog.ts`
- `portal-production/content/patient-map-catalog.ts`
- `portal-production/tests/patient-information-architecture.test.mjs`
- `portal-production/tests/patient-navigation.test.mjs`
- `portal-production/tests/patient-tools.test.mjs`
- `portal-production/tests/patient-map-catalog.test.mjs`
- `portal-production/tests/manual-visual-review.mjs`

## Limites e próximos passos

- Os Lotes 0 a 4 estão implementados localmente; a validação integral do Lote 4
  ainda precisa terminar antes de qualquer publicação.
- Ferramentas não guardam uso. Meu mapa guarda somente o rascunho privado da
  conta, sem analytics, favoritos, compartilhamento ou visão profissional.
- O aviso de privacidade local descreve o Meu mapa, mas a versão oficial de
  privacidade continua `2026-07-29`; atualização e eventual ciência dos usuários
  são um bloqueio de publicação a decidir, sem mudança silenciosa de login.
- Uma checagem física final em iPhone/Safari continua recomendada antes de futura publicação.
- Qualquer persistência, migration, endpoint ou acesso profissional ao Meu mapa exige lote separado e nova revisão de autorização.

## Ações remotas não realizadas

- Não houve commit, push, merge, PR ou deploy.
- Não houve escrita remota em D1, alteração de secrets, mudança de autenticação ou criação de conta real.
