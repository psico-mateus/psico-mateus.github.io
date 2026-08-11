# Meu mapa — estado do módulo

Atualizado em 11/08/2026. O módulo está funcional no código local com
persistência privada e compartilhamento opcional por parte. O trabalho foi
commitado localmente, mas as migrations e o código ainda não foram enviados ou
aplicados em produção.

## Fonte editorial e catálogo

Fonte: `Mapa_Pessoal_Gostos_Limites_e_Possibilidades_REFINADO_OURO.xlsx`.

- Catálogo TypeScript estático e versionado em
  `portal-production/content/patient-map-catalog.ts`.
- Versão editorial: `mapa-pessoal-refinado-ouro-v1`.
- 5 mapas: Meu jeito, Interesses, Vínculos, Limites e Futuro.
- 5 seções por mapa, 6 pistas por seção e 150 pistas no total.
- 6 respostas canônicas: `Combina comigo`, `Tenho curiosidade`,
  `Depende do contexto`, `Só tolero`, `Não combina` e `Ainda não sei`.
- 5 mapas, 25 seções e 150 itens têm ID global único, ordem explícita e estado
  ativo. Os IDs locais da planilha foram preservados separadamente.
- Abertura, mapas e síntese foram transpostos sem remover textos, exemplos ou
  duplicatas editoriais intencionais.
- Testes de catálogo verificam contagens, IDs, ordem, estado ativo, respostas,
  website, abertura, síntese e fidelidade editorial por digest.
- O catálogo não contém pesos, pontos, nota final, resultado ou diagnóstico.
  As contagens servem apenas para organizar o que foi marcado.

## Interface funcional

O paciente já consegue usar o módulo dentro da navegação da Área do paciente:

- abrir qualquer um dos cinco mapas sem seguir uma sequência obrigatória;
- percorrer as cinco partes de cada mapa e avançar ou voltar entre os 30 itens;
- seguir adiante sem responder;
- marcar uma das seis respostas em cada item;
- adicionar uma observação opcional de até 600 caracteres;
- apagar a resposta, a observação ou ambas em um item;
- abrir um exemplo preenchido sem que ele entre nas contagens;
- voltar à visão geral e continuar da última posição lembrada em cada mapa;
- limpar todo o mapa de forma permanente mediante confirmação;
- consultar um resumo do mapa a qualquer momento;
- responder às seis perguntas opcionais da síntese pessoal, com até 1.000
  caracteres por pergunta.

O rascunho versionado guarda na conta do paciente:

- a versão editorial do catálogo;
- respostas por ID global de item;
- observações por ID global de item;
- última seção e último item visitados em cada mapa;
- textos da síntese por ID de pergunta.

O carregamento precisa terminar antes que a interface permita editar. Cada
campo é salvo separadamente, com revisão e geração, para que uma resposta longa
não dependa de enviar o mapa inteiro.

## Contadores, barras e síntese

- A visão geral mostra o total de itens explorados. Um item é
  considerado explorado quando tem resposta ou observação.
- Cada cartão de mapa mostra quantos itens foram explorados naquele mapa.
- A navegação entre seções mostra a quantidade explorada em cada parte.
- O cabeçalho do mapa informa o total explorado nele.
- O resumo informa quantos dos 30 itens do mapa têm resposta marcada.
- As seis barras do resumo mostram a distribuição das respostas marcadas. Elas
  são proporcionais ao total respondido e não representam desempenho.
- O resumo por seção mostra quantos dos 6 itens foram explorados e permite abrir
  diretamente cada parte.
- A orientação editorial de leitura sem teste e as seis perguntas da síntese
  estão disponíveis no resumo.
- A síntese é opcional, geral aos cinco mapas e não exige preenchimento completo.

## Baixa pressão e acessibilidade já presentes

- A interface afirma que não é teste, não há resposta certa e não é necessário
  responder tudo.
- Não há meta, sequência de dias, percentual de conclusão, recompensa ou
  obrigação de finalizar os 150 itens.
- Resposta e observação usam controles HTML nativos (`fieldset`, rádio,
  `details`, `textarea` e botões).
- Mudanças de tela reposicionam rolagem e foco; ao voltar, o foco retorna ao
  cartão do mapa aberto.
- Ações de limpeza têm confirmação e anúncios em região `aria-live`.
- Campos da síntese e de observação têm limites explícitos; a observação exibe
  contagem de caracteres.
- Salvamentos pendentes registram um aviso de saída para reduzir perdas
  acidentais. Conteúdo já salvo não gera um aviso falso.
- A interface mostra `Salvando…`, `Salvo na sua conta`, falta de conexão, erro e
  conflito com outra aba. Falhas nunca apagam o texto que permanece na tela.
- Conflitos de conteúdo oferecem escolhas explícitas entre manter a alteração
  desta tela ou usar a versão já salva; não há sobrescrita silenciosa.
- `Salvar e voltar ao início` aguarda a fila de alterações antes de sair.

## Persistência e privacidade

- O rascunho é salvo no D1 por campo, sempre vinculado ao ID da sessão do
  paciente. Não existe `patient_id` controlado pelo navegador.
- A API aceita somente pacientes autenticados; mutações exigem CSRF e usam
  revisão por campo, geração do rascunho e `request_id` idempotente.
- Rádio usa atraso breve; observações e síntese esperam a pausa da digitação. Há
  uma fila serial por campo, então uma resposta lenta não sobrescreve uma edição
  mais nova.
- Não há uso de `localStorage`, `sessionStorage`, IndexedDB, cookie de conteúdo
  ou cache do service worker para respostas.
- Uma perda inesperada de sessão mantém somente em memória as alterações ainda
  pendentes, ligadas ao mesmo ID de paciente. Entrar com outra conta elimina
  esse buffer sem exibi-lo ou enviá-lo.
- Nada é compartilhado automaticamente. O paciente escolhe uma parte e envia
  somente uma cópia das respostas e observações dessa parte.
- Posição, síntese e partes não escolhidas permanecem privadas. Não existem
  comentário, chat, interpretação automática ou uso como prontuário.
- A visão profissional é somente leitura e permite confirmar a visualização;
  retirar o compartilhamento apaga a cópia e interrompe o acesso.
- `Ainda não sei` é uma resposta deliberada; ausência de resposta continua
  representada separadamente.
- A interface atual resume um mapa por vez. Ainda não existe uma síntese visual
  conjunta dos cinco mapas.
- Exportação e importação do Meu mapa ainda não fazem parte deste lote.
- A validação final precisa incluir Safari/iPhone, Android, teclado, leitor de
  tela, zoom de 200%, duas abas, perda de conexão, sessão expirada e retorno.

## Próximos lotes seguros

1. **Publicação controlada:** conferir o backup remoto, aplicar a migration 0004
   antes do Worker antigo e então atualizar o Worker oficial que faz o proxy.
2. **Smoke test imediato:** confirmar login, MFA, cadastro por convite,
   registros, salvamento do mapa, compartilhamento, retirada e visualização com
   dados sintéticos ou contas de teste já autorizadas.
3. **Retorno rápido:** se a interface ou as rotas apresentarem regressão, voltar
   os Workers ao commit publicado anterior; a migration é apenas aditiva e não
   altera as tabelas já usadas por contas e registros.
4. **Avaliar exportação em lote próprio:** o mapa não deve ser incluído ou
   omitido da cópia de dados sem decisão explícita e documentação consistente.
