# Avisos e recuperação profissional — 8 de outubro de 2026

## Estado e limites

Trabalho na branch `agent/prepara-troca-celular-20260824`, a partir de `7df9599`.
O remoto `origin/main`, conferido com fetch nesta revisão, permanece em `5aa12ae`.
O lote foi aprovado e publicado em 8 de outubro de 2026, incluindo os commits
anteriores de preparação do autenticador. O ajuste final do service worker está
em `bf16711`. IDs dos deployments, backup e comandos de retorno estão em
`rollback-avisos-recuperacao-2026-10-08.md`. Não houve merge em `main`.

Não há serviço novo pago, envio de e-mail, chat, push, IA clínica ou alteração de
domínio. Os recursos usam o Worker/D1 já existentes. Os limites gratuitos da
infraestrutura continuam aplicáveis; não existe garantia de disponibilidade ou
preço eterno de terceiros.

## O que foi concluído

- Atualização do aplicativo em um painel recolhido no fim da página, sem cobrir
  conteúdo. “Depois” persiste apenas o identificador técnico da versão, não
  conteúdo do paciente. Outra versão pode apresentar novo indicador discreto.
- Atualizar exige confirmação se há rascunho de registro, mapa ou aviso ainda não
  salvo. Cancelar não ativa a atualização nem apaga o texto.
- “Avisos de Mateus” no início da área do paciente. A leitura só é registrada por
  “Marcar como lido”; abrir a página ou o aviso não faz isso automaticamente.
- Botão “Avisos” em cada acesso ativo de paciente, mesmo sem registros
  compartilhados. Título e texto simples, envio protegido contra duplicação,
  remoção com confirmação, paginação, erros e nova tentativa.
- Avisos só podem ser consultados pelas partes do vínculo ativo. Retirar o aviso
  apaga título e texto, conservando somente metadados mínimos contra reenvio
  atrasado. Excluir a conta remove todas as linhas por chave estrangeira.
- Recuperação profissional pelo próprio site, sem Mac: oito códigos emergenciais
  gerados mediante senha + MFA atual. E-mail + senha + um código permitem
  configurar um autenticador novo, que deve ser confirmado antes de liberar a
  conta. A conclusão revoga sessões antigas e substitui os códigos.
- Recuperação incompleta não altera autenticador, senha, sessões nem registros.
  O código de recuperação da senha continua separado desses códigos emergenciais.
- Correção de concorrência na reautenticação profissional: a confirmação está
  vinculada ao hash da senha e à chave MFA que foram realmente verificados.
- Correção do foco no modal em WebKit, que podia deslocar o botão durante o toque.
  O fallback de cópia agora mantém a seleção dentro da janela protegida; uma cópia
  recusada mostra erro e não uma confirmação falsa.
- Envio de avisos compatível também com navegadores que têm aleatoriedade segura
  mas ainda não oferecem `randomUUID`.
- Navegações de documentos ficam com o navegador, sem encaminhamento pelo
  service worker. A checagem pública reproduziu um travamento no WebKit com o
  handler de navegação pré-existente, mesmo sem interceptação do Playwright.
  A guarda de `request.mode === "navigate"` preserva mensagens, GETs da API,
  instalação, ausência de cache clínico e ativação somente por escolha do usuário.
- O identificador da versão agora inclui também o corpo normalizado do service
  worker. Assim, uma correção só no worker é reconhecida como nova versão mesmo
  quando o usuário dispensou uma atualização anterior.
- Exportação do paciente versão 4 inclui avisos disponíveis por lista explícita
  de campos. Aviso de privacidade atualizado; aceites anteriores não são forjados
  nem sobrescritos.

## Verificação local

Todos os dados usados são sintéticos. Nenhuma conta ou registro real de paciente
foi adicionado ao repositório ou usado nos testes.

- `pnpm test`: typecheck, build sanitizado e **193 testes aprovados**; lint limpo.
- HTTP Worker + D1 isolado: **309 verificações aprovadas**, todos os nove arquivos
  de migração, integridade SQLite `ok`, nenhuma violação de FK, zero requisições a
  produção. Cadastro, login, sessão, MFA, convites, registros, mapa, exportação,
  exclusão e avisos foram exercitados.
- MFA: 60 testes focados, incluindo 29 testes atômicos com SQL real, concorrência,
  rollback e regressão de login do paciente.
- Avisos: 24 testes SQLite/API, incluindo IDOR, sessão, perfil, CSRF, origem,
  vínculo revogado, idempotência e limites.
- Avisos no navegador: 9 testes por engine em Chromium e WebKit, desktop/mobile;
  checks automáticos WCAG, foco, preservação do rascunho e falta de overflow.
- Área do paciente: revisão visual em 320/390/640/1366 px e checks automáticos
  WCAG sem violações nas telas cobertas.
- Painel profissional: WebKit 320/390 px e Chromium 1366 px; foco, cópia dos oito
  códigos, falha/repetição da cópia, listas longas e checks WCAG aprovados.
- Atualizações: Chromium desktop e WebKit 320/390 px; recolhimento persistente,
  nova versão, compatibilidade com worker antigo e cancelamento com rascunho.
- Ensaio de backup/restauração com 15 tabelas e verificação de preservação das
  contas/credenciais/registros pelas novas migrações.
- Build público sanitizado e empacotamento `--dry-run` dos dois Workers aprovados,
  sem upload ou execução remota de migrações.
- Após o ajuste de navegação: **194 testes automatizados aprovados**, lint limpo,
  novo build público e os dois empacotamentos `--dry-run` aprovados, sem arquivos
  de ambiente nem valores de segredos no artefato.
- Worker local isolado, sem dados reais: fluxo público completo em Chromium
  1366×900 e WebKit 390×844, com controlador de service worker ativo e sem
  interceptação de rede. Três ciclos de privacidade/retorno por engine passaram.
- Atualização real de service workers em Chromium e WebKit: versão anterior
  dispensada → hotfix com outro ID → ativação explícita → uma recarga de documento
  → navegação de privacidade funcionando. Só GETs e console limpo.
- Checagem pública final aprovada nos dois endereços: fluxo completo de telas
  anônimas nos dois engines e mais 12 ciclos de privacidade/retorno, sempre com
  controlador de SW ativo, sem interceptação de rede, erros de console ou cortes
  horizontais. Smoke HTTP de site, Guia, portais e healths aprovado.

WebKit automatizado não substitui teste em iPhone físico. Clipboard do sistema,
sincronização de autenticadores e instalação PWA física têm limites de automação.
O conjunto de testes não permite prometer ausência total de falhas.

## Publicação — somente após aprovação final

1. Conferir novamente o estado remoto e guardar os IDs dos deployments ativos de
   **ambos** os Workers, `registros` e `area-do-paciente`.
2. Fazer backup protegido do D1 atual; não salvar o backup em Git, Downloads
   compartilhado ou anexos do chat. Conservar `APP_SECRET` existente sem rotação.
3. Revisar migrações pendentes e aplicar somente `0007_professional_mfa_recovery`
   e `0008_patient_notices` que ainda não estiverem registradas. Elas são aditivas;
   não recriam tabelas de contas nem registros.
4. Build público sanitizado; conferir ausência de segredos e arquivos locais.
5. Atualizar primeiro o Worker `registros` (API local), depois `area-do-paciente`
   (proxy via service binding). Manter binding, banco, segredos, URLs e cookies.
6. Smoke público sem dados clínicos; usuário confere login profissional e um
   paciente de teste em aparelho real. Não consumir convite real de paciente.
7. Gerar e guardar os códigos emergenciais enquanto o autenticador atual ainda
   está disponível. A função não recupera retroativamente uma conta que perdeu
   senha, autenticador e todos os códigos.

## Retorno rápido sem perder dados novos

Se houver regressão, reverter **o deployment do Worker**, usando os IDs guardados,
em ambos os ambientes conforme a falha. Manter as tabelas/colunas aditivas.
**Não** restaurar indiscriminadamente o backup do banco depois de novas escritas:
isso apagaria registros/contas criados após o backup.

Se uma recuperação MFA já tiver sido concluída, o autenticador válido é o novo,
inclusive após voltar ao Worker anterior. Não restaurar a chave MFA antiga por
conveniência. As sessões revogadas devem continuar revogadas. Backup de dados é
contingência excepcional, não o mecanismo normal de rollback visual/API.

Os sites profissional e Guia não precisam ser republicados para este lote. O Guia
continua público e sem conta; nenhum dado local do Guia é movido para o portal.
