# Continuidade — clareza e foco nos registros do paciente

## Estado

Lote **local, não publicado**, posterior a `b05dd02`, na branch
`agent/refino-paciente-inclusivo-20261008`. O refinamento anterior do início e
dos avisos (`4dec3c4`) está publicado nos dois endereços; versões e retorno
registrados em `rollback-refino-paciente-2026-10-08.md`.

Não houve merge, push, deploy, migração remota ou alteração de secrets neste lote.

## Revisão e correções confirmadas

1. **Histórico pendente/indisponível (P1).** As capturas locais mostravam
   “0 registros” durante o carregamento. O cabeçalho agora informa “Carregando…”
   ou “Contagem indisponível”; zero só aparece após uma consulta vazia bem-sucedida.
2. **Foco ao compartilhar (P1).** No filtro de privados/compartilhados, a ação
   pode retirar o cartão da lista. O foco volta ao título do histórico quando
   cai no documento; se o cartão permanece, seu resumo é a alternativa útil.
   Não há mudança de foco caso a pessoa já tenha escolhido outro controle.
   Confirmar/cancelar, CSRF, permissões e requisição existentes são preservados.
3. **Privacidade antes de escrever (P1 editorial).** O início do editor informa
   se o registro começa/continua privado ou se está compartilhado e alterações
   salvas também ficarão visíveis. Texto simples, sem modal ou caixa extra.

Arquivos: `app/PortalApp.tsx` (apresentação/foco), `app/globals.css` (duas regras
exclusivas da nova linha) e `tests/patient-records-ui.test.mjs` (13 casos locais).
Risco baixo de regressão: não há mudança de payload, persistência, API ou banco.

Fluxo conferido: histórico → novo/editar → campos com privacidade visível;
histórico filtrado → compartilhar/retirar → confirmação → foco útil;
salvamento com erro → alerta focado e rascunho preservado.

## Testes

- `pnpm lint`, `pnpm test` e `pnpm build:worker`: aprovados; 194 testes de
  unidade/estrutura, typecheck e build sanitizado. Suítes de navegador são
  executadas separadamente e puladas sem suas variáveis de URL.
- Registros: 13/13 por engine, Chromium e WebKit; inclui pendente, erro, vazio,
  carregado, três modos de editor, filtros, confirmação/cancelamento, falha,
  CSRF, foco e resposta adiada sem interrupção da navegação voluntária.
- `pnpm test:integration`: 309 verificações HTTP/D1 aprovadas em localhost:4394,
  banco novo temporário e segredos sintéticos, nove migrações **locais**, integridade
  válida e zero violações FK. Nenhuma requisição de produção.
- `pnpm test:visual`: matriz 320/390/640/1366 px aprovada, com interações de
  registro, mapa e recursos. Axe sem violações automáticas nos estados examinados.
- Capturas novas antes/depois em Chromium 1366×900 e WebKit 390×844 examinadas;
  sem cortes ou sobreposição. Fontes e paleta existentes preservadas.

Browser plugin indisponível; foi usado Playwright instalado, com APIs simuladas
e bloqueio de origens externas. Nenhuma informação real de paciente foi lida ou
adicionada ao repositório. WebKit não equivale a iPhone físico; VoiceOver,
instalação PWA física e compreensão com pessoas reais não foram testados.

Capturas ficam fora do Git, na pasta de visualizações desta conversa,
`record-refinement-20261008/before` e `record-refinement-20261008/after`.

## Preservação e próximo passo

Autenticação, recuperação/MFA, contas, convites, API, Worker, SW, D1, migrações,
bindings e dependências não mudaram. Registros continuam privados por padrão,
compartilhamento opcional, profissional somente leitura e cadastro 18+.
Site profissional e Guia não foram editados; Guia sem conta e rascunho local.
Nenhum serviço novo ou custo novo foi ativado.

A hipótese de erro de salvamento sem foco foi descartada: o `Notice` existente
foca o alerta, e a regressão visual confirma preservação do texto. Campos
obrigatórios contendo só espaços ainda são rejeitados pelo servidor; uma
validação local mais contextual pode ser tratada em outro lote, sem relaxar a
validação existente. Não reconstruir o formulário por esse motivo.

O documento clínico de continuidade anteriormente citado não estava disponível
no caminho de Downloads nesta retomada. Nenhum conteúdo clínico foi reescrito;
foram usados código atual, continuidade do repositório e princípios do prompt
mestre disponível, sem reaplicar decisões antigas já superadas.

Antes de publicar: aprovação do responsável, novo build público sanitizado,
conferência das versões ativas e registro do retorno para a versão atualmente
publicada — não para versões anteriores ao refinamento do início.
