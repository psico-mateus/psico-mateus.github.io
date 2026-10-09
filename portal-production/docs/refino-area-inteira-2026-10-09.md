# Área do paciente — refinamento local de 9 de outubro de 2026

## Estado e limites

- Branch: `agent/refino-area-inteira-20261009`.
- Base: `c9e5210`, após a publicação aprovada do Meu mapa.
- Commit da implementação visual: `fc5587e`.
- Este lote NÃO foi publicado, enviado ao remoto ou mesclado.
- A Área do paciente publicada permanece na versão anteriormente aprovada. Não atualizar o Worker antigo, redirecionamentos, banco ou autenticação para publicar este lote visual.
- Última versão principal verificada no lote anterior: `f3bc1cd2-f7bd-4806-9996-a54fdea1e944`. Confirmar o estado remoto novamente antes de qualquer publicação; usar a versão então vigente como retorno, não copiar um identificador histórico sem conferir.

## Evidências antes da alteração

Revisão local com APIs simuladas e dados exclusivamente sintéticos. Capturas novas de início, histórico, formulário, recursos, ferramentas, leituras e mapa, em Chromium desktop e WebKit com larguras de 320 e 390 px. A entrada também foi verificada em 640 px.

Problemas de experiência observados:

1. A caixa de avisos vazia ocupava espaço excessivo no celular, empurrando as outras opções.
2. O link de divulgação do Guia aparecia antes da busca e dos registros no histórico.
3. A privacidade era repetida no cabeçalho e em ambos os cartões do índice de recursos.
4. Filtros e textos auxiliares das ferramentas eram menores que os textos principais do restante da área.
5. Cartões de leitura se deslocavam ao passar o mouse ou receber foco, embora esse movimento não tivesse utilidade para a tarefa.

Pontos preservados: quatro destinos principais claros, registro privado por padrão, leitura confirmada visível no resumo do histórico e navegação livre do mapa. Não há justificativa neste lote para substituir esses fluxos.

## Alterações locais

- `app/PatientNotices.tsx` e `app/notices.css`: atualização dos avisos junto ao título; estado vazio compacto somente depois de resposta bem-sucedida; indicação de ausência de respostas mantida quando há comunicados. Não confirmar leitura automaticamente nem esconder erros como se a caixa estivesse vazia.
- `app/PortalApp.tsx` e `app/patient-home.css`: filtros, busca e ordenação reunidos; Guia movido para depois do histórico sem perder o link em nova aba; descrição da busca vinculada ao campo; alinhamento dos contadores em telas estreitas; campos com altura adaptável ao texto ampliado.
- `app/PatientResources.tsx` e `app/patient-resources.css`: índice com menos repetição e explicação central de privacidade; cabeçalhos e cartões mais consistentes; textos e filtros mais legíveis; controles amplos; reflow por tamanho de texto; cartões de leitura sem movimento no hover/foco.
- Testes de interface existentes ampliados para cobrir avisos vazios que recebem um novo comunicado, ordem do histórico, alinhamento de contadores, leitura dos recursos, retorno do foco e ampliação de texto.

Não foram modificados: catálogos clínicos, IDs/conteúdo do mapa, respostas salvas, síntese, registros, confirmação de leitura, regras de compartilhamento, convites, MFA, login, recuperação, sessões, exportação, exclusão, SQL, migrações, bindings, segredos ou dependências. Site profissional e Guia público não foram alterados.

## Testes e pendência real

- Antes da alteração: `pnpm test` aprovado; 227 testes aprovados.
- Depois da primeira rodada de alterações: revisão visual completa aprovada nos sete cenários existentes, sem overflow horizontal ou violações automáticas axe A/AA encontradas.
- Código final: lint, typecheck, compilação e 227 testes automatizados aprovados; resultados registrados nos logs locais de `/tmp/refino-area-inteira-*`.
- Depois dessa revisão visual, houve ajustes pequenos adicionais: retirar a linha vazia dos avisos, alinhar contadores, melhorar a altura/reflow dos campos e encurtar o placeholder da busca. Esses últimos ajustes ainda precisam de rechecagem visual.
- O ambiente passou a impedir abertura de portas (`listen EPERM`) e encerrou o servidor local. Por isso os novos casos de interface e a rechecagem visual FINAL não foram executados. Não registrar como aprovados os testes apenas preparados.
- Não foram utilizados pacientes ou credenciais reais. Nenhuma alteração foi feita em produção. Não foi realizada avaliação humana com leitores de tela nem teste em iPhone físico.

## Próxima ação, sem reconstruir o trabalho

1. Retomar o servidor local na porta 4390 quando a execução de localhost estiver permitida.
2. Executar `tests/patient-home-ui.test.mjs`, `tests/patient-notices-ui.test.mjs` e `tests/patient-records-ui.test.mjs` em Chromium e WebKit, com as variáveis de URL específicas de cada suíte. As APIs devem continuar totalmente simuladas, com requisições externas bloqueadas.
3. Executar novamente `tests/manual-visual-review.mjs`. Conferir principalmente avisos vazios/com novos comunicados, 320/390 px, histórico filtrado, contadores alinhados, recursos e texto ampliado a 200%.
4. Reinspecionar as capturas. Preservar todas as funções; corrigir qualquer regressão antes de pedir aprovação.
5. Só então apresentar o resultado final e pedir uma única autorização para publicar. Usar `pnpm build:worker` antes do deploy, não o build local. Conferir bindings, preparar o retorno à versão vigente, publicar somente o Worker principal autorizado e verificar a versão pública.

As capturas de Recursos já correspondem ao código atual. Capturas de início/histórico da primeira rodada não são prova dos últimos ajustes de alinhamento.
