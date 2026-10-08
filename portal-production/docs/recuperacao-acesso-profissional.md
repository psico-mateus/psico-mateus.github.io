# Recuperação do acesso profissional

Este documento descreve como reduzir o risco de Mateus perder o acesso ao painel
profissional da Área do paciente. Ele não contém credenciais, não substitui testes
e não autoriza alterações no banco de produção.

## O que protege o acesso

O acesso profissional combina quatro elementos diferentes:

1. **Senha ou frase-senha:** primeiro fator de autenticação.
2. **Aplicativo autenticador (MFA):** gera um código temporário de seis dígitos a
   partir de uma chave TOTP. Ele continua obrigatório mesmo depois de redefinir a
   senha.
3. **Códigos emergenciais do autenticador:** uma lista com oito códigos de uso
   único. Um deles, junto do e-mail e da senha, permite cadastrar um novo
   autenticador quando nenhum dos antigos está disponível.
4. **Código para recuperar a senha:** serve para criar uma nova senha quando a
   anterior foi esquecida. Ele **não substitui o autenticador e não recupera o
   MFA**.

A chave TOTP aparece durante a configuração inicial e permanece cifrada no banco
com `APP_SECRET`. Em uma sessão profissional já autenticada, a opção **Preparar
um segundo autenticador** pode reexibi-la temporariamente depois de confirmar a
senha e um código MFA atual. Isso não desativa nem substitui o MFA.

Os códigos emergenciais são o caminho principal de recuperação quando Mateus
perde todos os autenticadores. Eles não dependem do Mac, da Conta Apple, de
e-mail, de um segundo celular ou de suporte técnico. Essa independência exige
uma preparação simples: gerar a lista enquanto o acesso normal ainda funciona e
guardar pelo menos uma cópia em local privado, separada da senha.

## Preparar a recuperação independente

Faça isto uma vez assim que a função estiver disponível:

1. No painel profissional, abra **Segurança e conta**.
2. Em **Códigos emergenciais do autenticador**, confira o status da lista.
3. Informe a senha atual e um código do autenticador.
4. Escolha **Criar 8 novos códigos** e confirme que a lista anterior será
   invalidada.
5. Guarde a nova lista. É possível copiar todos, baixar um arquivo TXT em um
   dispositivo particular ou imprimir em uma impressora particular.
6. Mantenha a lista separada da senha. Não envie por mensagem, e-mail ou conversa
   com IA e não salve em pasta compartilhada.
7. Feche a janela somente depois de conferir a cópia: os códigos aparecem uma
   única vez.

Cada código funciona uma única vez. O painel mostra apenas quantos ainda estão
disponíveis, nunca os valores antigos. Criar uma lista nova invalida toda lista
anterior sem alterar a senha, o autenticador atual, pacientes ou registros.

## Recuperar sem o celular antigo nem o Mac

Se todos os autenticadores forem perdidos, mas ainda houver a senha e um código
emergencial:

1. Abra o login da Área do paciente e expanda **Acesso profissional**.
2. Escolha **Não tenho mais acesso ao autenticador**.
3. Informe o e-mail profissional, a senha e um código emergencial guardado.
4. O portal mostrará uma nova chave por tempo limitado. Nesse ponto você ainda
   não entrou e a recuperação ainda não terminou.
5. Abra qualquer aplicativo autenticador TOTP em um aparelho confiável, escolha
   adicionar uma conta manualmente e cole a chave.
6. Digite no portal um código novo de seis dígitos gerado pelo aplicativo.
7. Somente depois dessa confirmação a sessão profissional será aberta.
8. Guarde a nova lista de oito códigos emergenciais exibida uma única vez. A lista
   anterior deixa de funcionar.

O código emergencial não entra sozinho: e-mail e senha válidos continuam
obrigatórios, e o novo autenticador precisa gerar um código correto antes de o
portal liberar o painel.

## Segundo autenticador opcional

Um segundo autenticador é uma prevenção adicional, não o único caminho de
recuperação. Ele pode estar em outro celular, tablet, computador ou gerenciador
de senhas compatível com TOTP. O Mac é apenas uma dessas opções:

1. No painel profissional, abra **Segurança e conta**.
2. Em **Quer preparar um segundo autenticador?**, escolha **Preparar segundo
   autenticador**.
3. Confirme a senha e um código atual do autenticador do iPhone antigo.
4. No autenticador secundário, escolha adicionar uma conta por chave de
   configuração e cole a chave exibida pelo portal.
5. Espere o código mudar e confirme esse novo número no portal.
6. Antes de entregar o iPhone, saia e entre novamente usando um código gerado pelo
   segundo autenticador. Só considere a preparação concluída depois desse teste.
7. Se quiser uma segunda contingência, use a opção de cópia em papel apenas em uma
   impressora particular. A folha permite gerar os códigos: não a salve em PDF
   compartilhado e mantenha-a separada da senha.

A chave fica visível por no máximo 15 minutos, somente na memória da página. O
ticket que liga as duas etapas é cifrado, expira, vale apenas para a mesma sessão e
deixa de ser válido se a chave TOTP for alterada. O fluxo não altera contas,
sessões, pacientes ou registros.

Se o segundo autenticador sincronizar com o aparelho novo, o código pode aparecer
automaticamente. Se não aparecer, ainda é possível usar um código emergencial para
cadastrar um novo autenticador. Portanto, a recuperação não depende da
sincronização.

## Prevenção imediata

Faça esta preparação enquanto o autenticador atual ainda está disponível:

- gere e guarde os oito códigos emergenciais do autenticador;
- use **Preparar segundo autenticador** se também quiser manter o TOTP em outro
  aparelho confiável;
- teste o segundo autenticador com um código novo, sem reutilizar o mesmo código
  que acabou de ser aceito;
- se guardar a chave TOTP em papel ou arquivo cifrado, mantenha-a em local físico
  controlado e separado dos códigos emergenciais e do código para recuperar a senha;
- não salve captura do QR code no aplicativo Fotos, em pasta compartilhada ou em
  serviço sem proteção adequada;
- conserve uma cópia offline e segura do `APP_SECRET`. A Cloudflare oculta o valor
  depois que ele é configurado, portanto ele não pode ser simplesmente consultado
  no painel ou no Wrangler;
- confirme que a própria conta da Cloudflare também possui um caminho independente
  de recuperação. Não deixe o único acesso à Cloudflare preso ao mesmo celular;
- registre apenas a data em que o conjunto de recuperação foi conferido. Não
  registre chaves, códigos ou senhas neste repositório.

O conjunto mínimo recomendado para o uso cotidiano é: autenticador principal,
senha e lista de códigos emergenciais guardada separadamente. Um autenticador
secundário testado e uma cópia offline do `APP_SECRET` adicionam contingência
administrativa, mas não são pré-requisitos para o fluxo de recuperação do portal.

## Se o celular for perdido ou roubado

### Há um código emergencial

Use o fluxo **Não tenho mais acesso ao autenticador** descrito acima. Depois de
confirmar o novo autenticador, guarde a lista substituta e encerre as demais
sessões se o aparelho perdido puder ter permanecido conectado.

### Há um segundo autenticador ou uma cópia segura da chave TOTP

1. Em um aparelho confiável, restaure ou abra o autenticador secundário.
2. Entre na Área do paciente com a senha e um código MFA novo.
3. Em **Conta**, encerre todas as sessões. A ação invalida os acessos abertos sem
   apagar pacientes, vínculos ou registros.
4. Se o aparelho puder ter revelado a senha, altere-a depois de encerrar as sessões.
5. Confira o login novamente em uma janela privada.
6. Se houver possibilidade de a chave TOTP ter sido exposta, programe uma rotação
   controlada do MFA; apenas recuperar a mesma chave não elimina essa exposição.

### Não há autenticador, chave TOTP nem código emergencial

O código para recuperar a senha não resolve esse caso. Também não é seguro criar
um botão que aceite apenas e-mail e senha, pois isso transformaria a recuperação
em um bypass do MFA.

1. Não apague nem recrie a conta profissional.
2. Não altere `APP_SECRET` ou `SETUP_SECRET`.
3. Preserve o banco e interrompa qualquer publicação não relacionada.
4. Se o aparelho perdido ainda puder ter uma sessão aberta, trate a revogação das
   sessões profissionais como a primeira ação da manutenção controlada.
5. Não tente alterar o D1 manualmente. O procedimento de escrita remota continua
   indisponível nesta versão.
6. Preserve o estado para uma manutenção técnica controlada, sem apagar a conta ou
   recriar o banco.

Sem autenticador, chave TOTP ou código emergencial, não existe um bypass público
do MFA. Guardar a lista emergencial é o que torna a recuperação simples sem
enfraquecer o login profissional.

## O que não fazer

- Não flexibilizar os endpoints de configuração inicial para aceitar uma conta
  profissional já ativa.
- Não transformar `SETUP_SECRET` em um código público de redefinição do MFA.
- Não permitir que apenas o código para recuperar a senha desative ou substitua o
  autenticador.
- Não criar endpoint público, link por e-mail ou “pergunta de segurança” para
  recuperar o acesso profissional.
- Não apagar a linha da conta profissional: pacientes, convites e vínculos dependem
  dessa identidade.
- Não trocar `APP_SECRET`: ele participa da proteção de e-mails, códigos e do TOTP
  armazenado, e sua troca improvisada pode inutilizar contas existentes.
- Não executar SQL manual copiado de mensagens ou documentos sem validações,
  bookmark, ensaio e conferência do alvo.
- Não enviar senha, `APP_SECRET`, chave TOTP, QR code, código MFA, código
  emergencial ou código para recuperar a senha por e-mail, mensageiro, issue,
  commit, log ou conversa com IA.
- Não restaurar o banco inteiro por Time Travel para corrigir somente o MFA. A
  restauração sobrescreve o D1 e pode remover registros legítimos criados depois do
  ponto escolhido; ela é último recurso para um incidente de banco, não o fluxo
  normal de recuperação.

## Checklist preventivo

- [ ] O autenticador principal funciona.
- [ ] Existem códigos emergenciais disponíveis e uma cópia segura foi conferida.
- [ ] O segundo autenticador, se usado, foi configurado pela opção **Preparar
      segundo autenticador** e testado com um código novo.
- [ ] A chave TOTP, se mantida, está protegida e separada dos demais fatores.
- [ ] O código para recuperar a senha está guardado em local seguro.
- [ ] Existe uma cópia offline e segura do `APP_SECRET`.
- [ ] A conta da Cloudflare tem recuperação independente do celular principal.
- [ ] Nenhum segredo foi colocado no Git, nas fotos, em logs ou em mensagens.
- [ ] A data da última conferência foi registrada sem incluir valores secretos.

## Checklist de incidente

- [ ] Classificar o aparelho como perdido ou possivelmente roubado.
- [ ] Usar um código emergencial ou o autenticador secundário, se disponível.
- [ ] Encerrar todas as sessões profissionais.
- [ ] Alterar a senha se ela puder ter sido exposta.
- [ ] Confirmar que o login exige e aceita o MFA.
- [ ] Verificar se pacientes, vínculos e registros permaneceram inalterados.
- [ ] Registrar somente o evento técnico e a data, nunca os segredos.
- [ ] Se a chave TOTP puder ter sido exposta, rotacioná-la pelo procedimento local
      revisado.

## Estado atual do procedimento técnico

Existe um núcleo isolado em
`scripts/professional-mfa-rotation-core.mjs` e um ensaio inteiramente sintético em
`tests/professional-mfa-rotation.test.mjs`. O núcleo não importa Wrangler, não lê
variáveis de ambiente, não processa argumentos, não escreve arquivos, não imprime
segredos e não cria rota, botão ou bypass no portal.

**Ainda não existe CLI remoto nem opção `--apply`. Portanto, a escrita no D1 remoto
está fisicamente indisponível pelo procedimento suportado.** O núcleo não deve ser
importado manualmente em um script improvisado contra produção. Ele só será
considerado operacional depois de o caminho completo ser ensaiado em um D1 remoto
descartável, com dados exclusivamente sintéticos e falha deliberada dentro do lote.

### Ensaio local disponível

No diretório `portal-production`, execute:

```sh
pnpm test:mfa-rotation-local
```

O ensaio usa SQLite apenas em memória e executa o SQL real do núcleo por meio de um
adaptador D1 sintético. Ele confirma:

- aborto antes da escrita para `APP_SECRET` ou código TOTP inválidos;
- aborto com zero ou duas contas profissionais;
- validação de formato e troca efetiva da chave cifrada;
- um único lote com `UPDATE`, auditoria guardada e exclusão somente das sessões do
  profissional;
- rollback de todas as três operações após uma falha deliberada no meio do lote;
- rollback quando o ciphertext esperado já mudou;
- preservação linha a linha das sessões de paciente e das tabelas sintéticas de
  registros, vínculos, convites, mapa e compartilhamento;
- auditoria técnica sem `APP_SECRET`, chave TOTP ou código;
- ausência de sentinelas na saída capturada, nos argumentos e no código do núcleo,
  que também não usa APIs de arquivo.

Esse ensaio prova as invariantes do núcleo e do SQL em SQLite local. Ele **não prova**
sozinho o transporte, a autenticação, o binding nem o comportamento de uma conexão
remota Cloudflare.

### Atomicidade do núcleo

O núcleo prepara três statements e os envia em uma única chamada `DB.batch()`:

1. atualiza somente a conta profissional ativa que ainda possui o ciphertext
   esperado e exige que exista exatamente um profissional;
2. insere a auditoria somente se o novo ciphertext estiver presente; se não estiver,
   uma restrição `NOT NULL` falha e força rollback;
3. exclui sessões somente com `WHERE user_id = <id profissional>`.

A documentação do binding D1 garante que os statements de `batch()` são executados
sequencialmente como uma transação e que uma falha reverte a sequência inteira. O
teste local reproduz essa semântica, mas a integração remota ainda precisa do ensaio
descartável obrigatório.

A comparação das contagens de sessões antes e depois é uma verificação operacional,
não uma prova sob concorrência: sessões podem expirar ou ser criadas ao mesmo tempo.
A proteção contra atingir pacientes vem do predicado da exclusão dentro do lote e
dos testes de não alteração; a conferência externa serve para detectar divergências.

### Condições para uma futura CLI remota

A ferramenta remota só poderá ser adicionada depois do ensaio descartável e deverá:

- iniciar sempre em dry-run; o dry-run apenas inspeciona e não gera nem exibe uma
  chave que não será aplicada;
- exigir conta Cloudflare, nome e ID do banco e nome do binding explicitamente;
- usar `getPlatformProxy` com configuração temporária sem segredos,
  `remoteBindings` e `envFiles: []`;
- receber `APP_SECRET` e código TOTP somente em terminal interativo sem eco, nunca
  por ambiente, argumento, arquivo ou log;
- exibir a nova chave somente no terminal confiável e validar um código dela antes
  de qualquer escrita;
- exigir `--apply` e uma frase de confirmação explícita;
- obter um bookmark do D1 Time Travel imediatamente antes do único `DB.batch()`;
- usar apenas prepared statements e o lote atômico fornecido pelo núcleo;
- reutilizar as primitivas de `lib/crypto.ts`, sem criar uma segunda implementação
  criptográfica, depois de validar a compatibilidade do carregamento com o menor
  Node declarado pelo projeto;
- escolher antecipadamente um `auditId` e o ciphertext novo; se a resposta do lote
  for perdida ou ambígua, consultar esses mesmos valores antes de orientar qualquer
  repetição;
- pós-verificar a conta, a auditoria e as sessões e limpar configuração e valores
  temporários;
- nunca oferecer endpoint público ou enfraquecer o MFA obrigatório do portal.

O ensaio remoto descartável precisa verificar sucesso, falha injetada com rollback,
resposta ambígua e pós-verificação pelo mesmo `auditId`. Até isso ocorrer, não há
comando de produção documentado de propósito.

## Referências operacionais

- [Configurar códigos de verificação no app Senhas do Mac](https://support.apple.com/pt-br/guide/passwords/mchl873a6e72/mac)
- [Sincronizar senhas e códigos de verificação com o iCloud](https://support.apple.com/pt-br/guide/passwords/mchl901b1b95/mac)
- [Segredos em Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [D1: execução em lote com `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [D1 Time Travel e restauração](https://developers.cloudflare.com/d1/reference/time-travel/)
- [APIs locais do Wrangler e `getPlatformProxy`](https://developers.cloudflare.com/workers/wrangler/api/)

Revisado em 24/08/2026. Revalidar a documentação oficial e ensaiar o caminho remoto
descartável antes de implementar ou executar qualquer procedimento de recuperação.
