# Refinamento coerente e preservação de escrita — 14 de outubro de 2026

> Registro histórico de preparação. A publicação deste lote já foi concluída e está documentada em `publicacao-refinamento-2026-10-14.md`. A continuação local de 15/10 está em `refinamento-inclusivo-2026-10-15.md`; as pendências de foco/modal e confirmação de versão listadas abaixo foram tratadas nessa continuação, ainda sujeita à própria aprovação de publicação.

## Publicado versus preparado

A manutenção de dependências de `681b944` foi publicada com autorização, nos dois portais, sem migrações, alteração de credenciais ou escrita de dados de produção. IDs e retorno rápido estão em `publicacao-manutencao-2026-10-14.md`.

O segundo lote descrito aqui está preparado e testado, **ainda não publicado**. Não foi feito push ou merge. Branch: `agent/correcoes-refino-20261014`.

### Commits

- `0c75ce1`: guarda atômica da versão do registro, preservando autorização e compatibilidade de clientes antigos.
- `0fbca23`: exclusões do mapa permanecem exclusões durante conflitos e recuperação.
- `f8d0b49`: confirmação assíncrona vinculada à seleção do paciente e proteção de avisos ao recolher a lista.
- `aa4a7d0`: Conta e privacidade organizada, envio da versão aberta e escrita preservada quando ocorre conflito.
- `230c31a`: restauração/salvamento/cópia do Guia, resiliência offline e controles dentro da paleta existente.
- `5aba316`: navegação pública, largura e contraste em páginas auxiliares; URLs do CSS atualizadas para impedir apresentação antiga em cache.

## O que muda para as pessoas

### Site profissional e Guia

- Mantém identidade, foto, tipografia, paleta e todo conteúdo clínico/PDF.
- Botões e contornos mais consistentes, sem deslocamento ao passar o mouse e sem novos efeitos ou gradientes.
- Menos espaço vazio antes da exploração do Guia no celular.
- Cabeçalhos auxiliares cabem no celular sem esconder atalhos; data e notas auxiliares têm contraste corrigido.
- Resumo com texto longo quebra linhas, sem cortar o conteúdo.
- Link de privacidade encontrável no Guia e nomenclatura “Exploração guiada” consistente.
- Guia continua sem conta, sem upload do rascunho e com a chave local existente. Rascunho válido preserva espaços, textos, nomes antigos e campos extras.
- Rascunho incompatível é normalizado somente depois de preservar o original no próprio navegador; se não puder preservar, não substitui o original.
- “Rascunho salvo” só aparece depois de sucesso real. Armazenamento recusado informa o problema; cópia tem fallback e feedback acessível.
- Limpeza explícita do rascunho remove também suas cópias recuperáveis, sem limpar dados de outros recursos.
- SW v31 usa cache em falhas HTTP 5xx sem mascarar 404. Atualização do worker não limpa localStorage.

### Área do paciente

- Conta e privacidade apresenta três grupos: Acesso e recuperação / Seus dados / Ações da conta.
- Cinco recursos permanecem disponíveis: senha, código de recuperação, sessões, cópia dos dados e exclusão.
- Formulários só aparecem ao escolher a ação. Nenhum campo de senha exposto inicialmente; os campos preenchidos continuam ao fechar/reabrir a própria ação.
- Explicação do código informa seu uso em “Esqueci minha senha”. Não altera MFA nem recuperação profissional.
- Exclusão continua separada e claramente identificada, com confirmação/senha e os mesmos handlers.
- Ao editar registro, cliente novo envia a versão aberta. O servidor verifica ID, proprietário e versão em uma única atualização; conflito não apaga escrita local nem fecha editor.
- O PATCH não altera compartilhamento, papel, conta ou revisão de pensamento. Sem migração de banco.

### Profissional e mapa

- `null` no mapa continua representando exclusão; não é substituído por texto antigo em conflito ou recuperação.
- Confirmação atrasada de um tema do mapa de A não marca o mesmo tema de B na interface. Bloqueio usa paciente + mapa e a resposta verifica seleção atual.
- “Mostrar menos” confirma descarte somente quando ocultaria um aviso não enviado. Cancelar preserva o texto; avisos que continuarão visíveis não são descartados.
- Não criou chat, diagnóstico, IA clínica, prontuário automático ou nova análise de adesão.

## Verificação e fidelidade visual

Referência: design existente, não uma repaginação. Exceção de pequenas correções dentro do sistema atual; não foi necessário gerar imagens. O trabalho seguiu os critérios de frontend/testing e React: mudanças localizadas, estado vinculado à identidade, HTML nativo e validação renderizada.

Comparação de antes/depois inspecionada: (1) cores creme/terra e semântica de perigo preservadas; (2) tipografia e identidade preservadas; (3) geometria e contornos de controles alinhados; (4) menos formulários/cartões concorrentes; (5) legibilidade e espaçamento móveis; (6) setas nativas, foco e estados previsíveis. Não adicionou texto promocional no hero nem alterou as chamadas principais. Texto de orientação e nomenclatura mudaram apenas onde documentado.

### Resultados

- Portal: lint, tipos e build passaram; suíte geral 280/280 sem skips.
- Integração HTTP/D1 isolada passou, incluindo cadastro, convite, login, MFA, permissões, concorrência de edição, reinício, preservação de contas/registros/sessões e novo login. O contador histórico do runner permanece 309; os novos casos são adicionais e não se deve apresentar esse número como contagem dinâmica de cada assert.
- Registros: 58/58 Chromium + 58/58 WebKit, incluindo versão obsoleta, escrita preservada, compartilhamento, sessão e recuperação.
- Conta e privacidade: 10/10 Chromium + 10/10 WebKit; 320/390/1366px, texto 200%, teclado, foco, abrir/fechar e cancelamento de ações críticas.
- Mapa/histórico/avisos: 67/67 casos relacionados Chromium; oito novos cenários WebKit; 58/58 unitários relacionados.
- Público: 118 passaram e 59 skips intencionais por projeto; Chromium desktop/móvel e WebKit móvel. Guia/PDF offline, atualização v30→v31, rascunho e fallback de cópia testados.
- QA visual pública: zero erros de execução/console e zero violações axe nas oito superfícies capturadas; geometria verificada de 320 a 1920px nos casos cobertos.
- QA conta/registros/lógica: nenhum erro inesperado, overlay ou overflow nos estados cobertos. Axe automático não equivale a certificação de acessibilidade.
- IAB: navegação site→Guia, busca por Ansiedade, abrir detalhes, Escape e retorno do foco verificados sem alterar o rascunho do usuário. Busca removida ao concluir.
- Inspeção independente do contrato de edição não identificou regressão bloqueante.
- Build público do portal preparado: fingerprint `f23a557108ad3d72`. Não foi enviado aos Workers.

Browser plugin não estava disponível. Playwright existente foi usado para contextos isolados com APIs mockadas e testes negativos; IAB foi usado para navegação e inspeção pública. Sem instalar novas dependências de navegador ou serviço pago.

### Limites

Sem login de produção, leitura de dados reais, teste em iPhone físico ou leitura humana com VoiceOver/NVDA. As verificações de produção deste turno foram públicas/anônimas. Nenhum teste novo criou conta real ou registro de paciente no sistema público.

Clientes antigos sem `expected_updated_at` continuam funcionando; ainda não protegem a versão que a pessoa abriu horas antes. Há proteção atômica da corrida no servidor, mas a proteção completa da edição depende de aplicar a atualização do aplicativo. Não apresentar como garantia universal nem como impossibilidade de erro.

## Preservação e próximas decisões

Mantidos: Guia sem conta/local, registros privados por padrão, compartilhamento opcional, profissional somente leitura, MFA obrigatório, convites de uso único, idade mínima de 18 para cadastro, sessões/contas/dados existentes, conteúdos e PDF. Nenhum dado real de paciente adicionado ao Git.

Ainda fora deste lote:

- confirmação de leitura vinculada à versão efetivamente lida, para impedir confirmação de conteúdo atualizado durante a leitura;
- idempotência de criação de registro quando o servidor salva e a resposta se perde;
- isolamento adicional do fundo dos modais e continuidade de foco do menu público, após confirmação com leitores de tela;
- teste em aparelhos e leitores de tela reais;
- alerta upstream residual de `braces`, já documentado na manutenção; não foi ocultado.

## Publicação segura do segundo lote

Não enviar todo o histórico desta branch para `main`. Portal e GitHub Pages são fluxos distintos.

1. Confirmar aprovação do resultado final deste lote e consultar novamente versões de ambos os Workers.
2. Publicar o artefato validado nos dois modos existentes: legado local, principal proxy. Sem migrações ou troca de segredos. Manter retorno rápido aos IDs atualmente publicados da manutenção.
3. Para site/Guia, partir do `origin/main` atual em checkout separado e transportar somente mudanças públicas e testes correspondentes. Nunca incluir `portal-production`, protótipo, bancos ou arquivos de ambiente no site publicado.
4. Depois, conferir endpoints, fingerprint, manifesto, assets e respostas anônimas; preservar texto pendente ao orientar atualização do app.

## Evidências temporárias, sem dados reais

- Público antes: `/tmp/guide-public-before-20261014/`.
- Público depois: `/tmp/guide-public-after-20261014/`; `qa.json` e log `/tmp/guide-public-final-20261014.log`.
- Conta antes: `/tmp/psico-account-qa-20261014/`; depois `/tmp/psico-account-refine-20261014/screens/`.
- Registros: `/tmp/psico-records-refine-20261014-{chromium,webkit}/` e logs correspondentes.
- Lógica: `/tmp/portal-logic-regression-20261014/`.
- Integração: `/tmp/psico-refino-integration-20261014.log`.
- Suíte geral: `/tmp/psico-refino-suite-20261014.log`.
- Build: `/tmp/psico-refino-build-final-20261014.log`.

As referências e capturas foram abertas e inspecionadas, não usadas somente como arquivos existentes. Preview público local em `http://127.0.0.1:4173/`; espelho do portal em `http://127.0.0.1:58902/` é vazio sem os mocks do navegador e não representa uma conta de produção.
