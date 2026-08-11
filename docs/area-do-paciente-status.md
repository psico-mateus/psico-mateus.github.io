# Área do paciente — estado local de continuidade

Atualizado em 11/08/2026. Este documento descreve o trabalho local ainda não publicado.

## Estado do repositório

- Branch: `agent/refina-p1-limites-exportacao`.
- Último commit local antes do refinamento atual: `bfb0d60`.
- A branch está um commit à frente de `origin/main`; o refinamento de 11/08
  permanece local até a validação e o commit final.
- Os Lotes 0 a 5 estão preservados no histórico local.
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
- O conteúdo é privado por padrão e nunca é usado como prontuário.

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
- Não há analytics nem log de conteúdo do rascunho do Meu mapa.

## Lote 5 — compartilhamento opcional do Meu mapa

- Implementado localmente, ainda não publicado.
- O paciente compartilha separadamente uma ou mais das cinco partes do mapa.
- O servidor cria uma cópia somente das respostas e observações da parte
  escolhida; síntese, posições e demais partes permanecem privadas.
- O paciente pode atualizar ou retirar a cópia. Retirar apaga imediatamente a
  cópia compartilhada.
- Limpar o mapa, encerrar o vínculo ou excluir a conta também apaga as cópias.
- O profissional lê somente com vínculo ativo, não edita e confirma a
  visualização deliberadamente; a confirmação aparece ao paciente.

## Refinamento de 11/08 — clareza e adaptação

- Ações de compartilhar, atualizar e retirar identificam a parte do mapa para
  leitores de tela, evitando cinco botões com o mesmo nome acessível.
- Partes ainda vazias oferecem `Explorar esta parte` em vez de um botão de
  compartilhamento desativado e sem caminho de continuidade.
- O bloco de compartilhamento diferencia visualmente áreas privadas, prontas e
  compartilhadas sem depender apenas de cor.
- Se a consulta de compartilhamentos falhar, o estado não é presumido como
  privado: as ações ficam pausadas, o erro aparece na tela e há uma tentativa
  explícita de reconexão.
- Campos em telas pequenas usam tamanho que evita o zoom automático do Safari.
- Contraste aumentado, cores forçadas e redução de movimento seguem as
  preferências configuradas no aparelho.

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

- A migration 0003 dos campos privados já está em produção. A migration 0004
  de compartilhamento existe somente localmente e não foi aplicada remotamente.
- Endpoints locais `GET`, `PATCH` e `DELETE /api/portal/map-draft`.
- Leitura e escrita derivam o paciente exclusivamente da sessão. Mutação exige
  CSRF; profissional não tem rota de acesso.
- Cookies, MFA, convites, papéis e regras dos registros existentes não foram
  relaxados.
- Nenhum conteúdo real de paciente foi usado nos testes ou adicionado ao repositório.

## Testes confirmados

- `pnpm lint`: aprovado.
- `pnpm test`: build aprovado e 86/86 testes estruturais e unitários aprovados.
- Integração autenticada local: aprovada com contas e conteúdo apenas sintéticos,
  cobrindo compartilhamento, revogação, leitura, isolamento e cascata.
- Ensaio local de restauração: 12 tabelas verificadas, somente dados sintéticos e zero requisições a produção.
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

- Os Lotes 0 a 5 estão implementados e validados localmente.
- Ferramentas não guardam uso. O rascunho integral do Meu mapa continua privado;
  somente cópias escolhidas podem ser compartilhadas.
- O aviso de privacidade local descreve o fluxo e conserva a versão vigente de
  8 de agosto de 2026.
- Uma checagem física final em iPhone/Safari continua recomendada após a publicação.
- A publicação exige aplicar a migration 0004 antes do Worker que expõe as
  novas rotas e executar smoke tests imediatamente depois.

## Ações remotas não realizadas

- O Lote 5 foi commitado localmente em `bfb0d60`, mas ainda não teve push,
  deploy ou migration remota.
- Não houve escrita remota em D1, alteração de secrets, mudança de autenticação ou criação de conta real nesta etapa.
