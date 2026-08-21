# Recuperação do acesso profissional

Este documento descreve como reduzir o risco de Mateus perder o acesso ao painel
profissional da Área do paciente. Ele não contém credenciais, não substitui testes
e não autoriza alterações no banco de produção.

## O que protege o acesso

O acesso profissional combina três elementos diferentes:

1. **Senha ou frase-senha:** primeiro fator de autenticação.
2. **Aplicativo autenticador (MFA):** gera um código temporário de seis dígitos a
   partir de uma chave TOTP. Ele continua obrigatório mesmo depois de redefinir a
   senha.
3. **Código de recuperação da conta:** serve para criar uma nova senha quando a
   anterior foi esquecida. Ele **não substitui o autenticador e não recupera o
   MFA**.

A chave TOTP apareceu durante a configuração inicial. Depois da confirmação, o
portal não oferece uma tela para exibi-la novamente. No banco ela permanece
cifrada com `APP_SECRET`.

## Prevenção imediata

Faça esta preparação enquanto o autenticador atual ainda está disponível:

- mantenha o TOTP em um segundo autenticador confiável, por exportação ou
  sincronização segura oferecida pelo próprio aplicativo;
- teste o segundo autenticador com um código novo, sem reutilizar o mesmo código
  que acabou de ser aceito;
- se guardar a chave TOTP em papel ou arquivo cifrado, mantenha-a em local físico
  controlado e separado do código de recuperação da conta;
- não salve captura do QR code no aplicativo Fotos, em pasta compartilhada ou em
  serviço sem proteção adequada;
- conserve uma cópia offline e segura do `APP_SECRET`. A Cloudflare oculta o valor
  depois que ele é configurado, portanto ele não pode ser simplesmente consultado
  no painel ou no Wrangler;
- confirme que a própria conta da Cloudflare também possui um caminho independente
  de recuperação. Não deixe o único acesso à Cloudflare preso ao mesmo celular;
- registre apenas a data em que o conjunto de recuperação foi conferido. Não
  registre chaves, códigos ou senhas neste repositório.

O conjunto mínimo recomendado é: autenticador principal, autenticador secundário
testado, código de recuperação da conta guardado separadamente e cópia offline do
`APP_SECRET`.

## Se o celular for perdido ou roubado

### Há um segundo autenticador ou uma cópia segura da chave TOTP

1. Em um aparelho confiável, restaure ou abra o autenticador secundário.
2. Entre na Área do paciente com a senha e um código MFA novo.
3. Em **Conta**, encerre todas as sessões. A ação invalida os acessos abertos sem
   apagar pacientes, vínculos ou registros.
4. Se o aparelho puder ter revelado a senha, altere-a depois de encerrar as sessões.
5. Confira o login novamente em uma janela privada.
6. Se houver possibilidade de a chave TOTP ter sido exposta, programe uma rotação
   controlada do MFA; apenas recuperar a mesma chave não elimina essa exposição.

### Não há segundo autenticador nem cópia da chave TOTP

O código de recuperação da conta não resolve esse caso. Não há atualmente um
fluxo automático no portal para substituir o MFA de uma conta profissional ativa.

1. Não apague nem recrie a conta profissional.
2. Não altere `APP_SECRET` ou `SETUP_SECRET`.
3. Preserve o banco e interrompa qualquer publicação não relacionada.
4. Se o aparelho perdido ainda puder ter uma sessão aberta, trate a revogação das
   sessões profissionais como a primeira ação da manutenção controlada.
5. Antes de qualquer escrita remota, obtenha um bookmark do D1 Time Travel e
   confirme a identidade da única conta profissional.
6. Use somente o futuro procedimento local descrito adiante, depois de ele ter sido
   implementado, revisado e ensaiado com dados sintéticos.

Enquanto esse procedimento local ainda não existir, a prevenção com um segundo
autenticador é a proteção operacional indispensável.

## O que não fazer

- Não flexibilizar os endpoints de configuração inicial para aceitar uma conta
  profissional já ativa.
- Não transformar `SETUP_SECRET` em um código público de redefinição do MFA.
- Não permitir que apenas o código de recuperação de senha desative ou substitua o
  autenticador.
- Não criar endpoint público, link por e-mail ou “pergunta de segurança” para
  recuperar o acesso profissional.
- Não apagar a linha da conta profissional: pacientes, convites e vínculos dependem
  dessa identidade.
- Não trocar `APP_SECRET`: ele participa da proteção de e-mails, códigos e do TOTP
  armazenado, e sua troca improvisada pode inutilizar contas existentes.
- Não executar SQL manual copiado de mensagens ou documentos sem validações,
  bookmark, ensaio e conferência do alvo.
- Não enviar senha, `APP_SECRET`, chave TOTP, QR code, código MFA ou código de
  recuperação por e-mail, mensageiro, issue, commit, log ou conversa com IA.
- Não restaurar o banco inteiro por Time Travel para corrigir somente o MFA. A
  restauração sobrescreve o D1 e pode remover registros legítimos criados depois do
  ponto escolhido; ela é último recurso para um incidente de banco, não o fluxo
  normal de recuperação.

## Checklist preventivo

- [ ] O autenticador principal funciona.
- [ ] Um segundo autenticador foi configurado e testado.
- [ ] A chave TOTP, se mantida, está protegida e separada do código de recuperação.
- [ ] O código de recuperação da conta está guardado em local seguro.
- [ ] Existe uma cópia offline e segura do `APP_SECRET`.
- [ ] A conta da Cloudflare tem recuperação independente do celular principal.
- [ ] Nenhum segredo foi colocado no Git, nas fotos, em logs ou em mensagens.
- [ ] A data da última conferência foi registrada sem incluir valores secretos.

## Checklist de incidente

- [ ] Classificar o aparelho como perdido ou possivelmente roubado.
- [ ] Usar o autenticador secundário, se disponível.
- [ ] Encerrar todas as sessões profissionais.
- [ ] Alterar a senha se ela puder ter sido exposta.
- [ ] Confirmar que o login exige e aceita o MFA.
- [ ] Verificar se pacientes, vínculos e registros permaneceram inalterados.
- [ ] Registrar somente o evento técnico e a data, nunca os segredos.
- [ ] Se a chave TOTP puder ter sido exposta, rotacioná-la pelo procedimento local
      revisado.

## Desenho do futuro script local

Um eventual `scripts/rotate-professional-mfa.mjs` deve ser uma ferramenta de
manutenção executada localmente. Ele não deve criar rota, botão ou bypass no portal.

### Pré-condições

- Wrangler autenticado na conta correta da Cloudflare;
- `APP_SECRET` fornecido por entrada oculta, nunca por argumento de linha de comando;
- banco e Worker selecionados explicitamente;
- testes locais aprovados com banco inteiramente sintético;
- operador diante do novo autenticador para confirmar o código gerado.

### Fluxo obrigatório

1. Ler somente `id`, `role`, `status` e `totp_secret` da conta profissional.
2. Exigir exatamente uma conta com `role = 'therapist'` e abortar em qualquer
   divergência.
3. Validar o `APP_SECRET` tentando decifrar o TOTP existente. Um segredo incorreto
   deve causar aborto antes de qualquer escrita.
4. Obter e apresentar o bookmark atual do D1 Time Travel.
5. Gerar uma nova chave TOTP com Web Crypto.
6. Exibir a chave ou QR apenas na execução local e exigir um código válido do novo
   autenticador antes de continuar.
7. Mostrar um resumo sem segredos: identificador profissional, banco selecionado e
   operações que serão executadas.
8. Após confirmação explícita, limitar a escrita a:
   - substituir o `totp_secret` pelo novo valor cifrado;
   - manter `totp_enabled = 1`;
   - definir `last_totp_counter = NULL`;
   - excluir somente as sessões da conta profissional;
   - inserir um evento técnico de auditoria, sem material secreto.
9. Exigir que exatamente uma conta tenha sido alterada. Qualquer outra contagem é
   falha.
10. Confirmar que não restaram sessões profissionais e que nenhuma sessão de
    paciente foi removida.
11. Validar login com senha e novo TOTP; confirmar também que o TOTP anterior e a
    reutilização de um código já aceito são rejeitados.
12. Limpar valores e arquivos temporários, sem registrar a chave, URI, QR ou códigos.

O script deve abortar com segurança em qualquer etapa anterior à escrita. A forma
de executar as operações remotas e sua atomicidade precisam ser comprovadas em um
ensaio antes de serem consideradas prontas.

### Testes necessários

- `APP_SECRET` incorreto: nenhuma escrita;
- código de confirmação TOTP incorreto: nenhuma escrita;
- ausência, duplicidade ou perfil inesperado da conta profissional: nenhuma escrita;
- caminho válido: somente os três campos de MFA da conta profissional mudam;
- somente sessões profissionais são excluídas;
- pacientes, vínculos, convites, registros, mapas e compartilhamentos conservam as
  mesmas contagens e conteúdos;
- novo TOTP aceito, antigo rejeitado, repetição do mesmo contador rejeitada;
- login profissional sem MFA continua rejeitado;
- recuperação de senha continua sem remover a exigência de MFA;
- auditoria existe e não contém segredo;
- saída, processos, arquivos temporários e logs não contêm `APP_SECRET`, TOTP ou
  códigos.

## Referências operacionais

- [Segredos em Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [D1 Time Travel e restauração](https://developers.cloudflare.com/d1/reference/time-travel/)

Revisado em 13/08/2026. Revalidar os comandos oficiais e o comportamento do D1
antes de implementar ou executar qualquer procedimento de recuperação.
