# Registro de continuidade — psico.mateus

Atualizado em 21 de julho de 2026.

Este documento registra o que já foi decidido, construído, testado e o que ainda merece atenção. Ele deve ser usado como fonte de continuidade antes de qualquer nova alteração.

> Segurança: nunca adicionar a este arquivo senhas, códigos de convite, segredo de configuração, chaves MFA, códigos de recuperação, tokens, variáveis secretas ou informações reais de pacientes.

## Endereços e repositório

- Site profissional: https://psico-mateus.github.io/
- Guia de Emoções: https://psico-mateus.github.io/guia-emocoes/
- Registros entre sessões: https://registros.psico-mateus.workers.dev/
- Repositório: https://github.com/psico-mateus/psico-mateus.github.io
- Branch local de trabalho: `auditoria-final-portal`
- Branch pública atual: `main`

## O que existe hoje

### Site profissional

- Site institucional estático publicado no GitHub Pages.
- Psicoterapia continua sendo o centro da apresentação profissional.
- O Guia e os Registros aparecem como recursos de apoio ao acompanhamento.
- A seção “Sobre mim” foi removida e não deve voltar.
- Crianças podem ser atendidas, principalmente por convênio, mas não são o foco do posicionamento.

### Guia de Emoções

- É público e não exige conta.
- Funciona como PWA e pode continuar disponível off-line depois de carregado.
- O rascunho fica somente no aparelho, em `localStorage`.
- Os dados não são enviados automaticamente ao portal.
- Deve permanecer claramente diferente do histórico de Registros.

### Registros entre sessões

- É um portal funcional, não um protótipo.
- Pacientes entram com e-mail e senha.
- Cadastro de paciente ocorre somente por convite.
- Convites duram 7 dias, são de uso único e podem ser revogados.
- O uso é restrito a maiores de 18 anos e exige aceite do aviso de privacidade.
- Registros são privados por padrão.
- O compartilhamento com o psicólogo é opcional e pode ser revogado.
- O profissional vê somente registros compartilhados e não pode editar o texto do paciente.
- O sistema não é prontuário automático, não é acompanhado em tempo real e não é canal de emergência.

## Decisões que não devem ser reabertas sem um pedido explícito

- Não recolocar a seção “Sobre mim”.
- Não transformar o Guia ou os Registros no centro da marca.
- Não exigir conta no Guia.
- Não enviar automaticamente o conteúdo local do Guia ao portal.
- Não transformar automaticamente um registro em prontuário.
- Não criar chat, IA clínica, diagnóstico automático, agenda, pagamentos ou integração com Tasy.
- Não reescrever todo o site nem reconstruir o design do zero.
- Não fazer merge, push ou publicação sem autorização expressa.
- Não adicionar custos recorrentes ou serviços pagos.

## Arquitetura técnica

- Site e Guia: aplicação estática hospedada no GitHub Pages.
- Portal: React/Vinext executado em Cloudflare Workers.
- Banco: Cloudflare D1.
- Tabelas principais: `users`, `patient_links`, `invitations`, `entries`, `sessions`, `access_logs`, `auth_windows` e `system_config`.
- Autenticação própria com e-mail e senha.
- Senhas derivadas com PBKDF2 em 100.000 iterações, o máximo aceito pelo ambiente atual do Worker.
- E-mails protegidos por hash HMAC quando usados para identificação interna.
- Segredo TOTP profissional protegido com AES-GCM.
- MFA é obrigatório para acesso profissional e validado no servidor.
- Sessões guardam apenas o hash do token e usam proteção CSRF.
- Permissões são aplicadas no servidor e no banco, não apenas na interface.

## Estado do Git em 21/07/2026

A branch local `auditoria-final-portal` estava limpa antes da criação deste registro. Ela contém três commits ainda não publicados sobre a base de `origin/main`:

1. `9a2954f` — Atualiza cache e links do Guia instalado.
2. `28b8082` — Corrige compatibilidade e cabeçalhos do portal.
3. `2da8ee1` — Refina acessibilidade e convites do portal.

Base pública observada: `70e5872` — Migra registros para endereço psico-mateus.

Não foi feito merge, push nem publicação desses refinamentos.

## Melhorias que já estão na branch local

- Guia: atualização do cache/PWA para evitar que uma instalação antiga continue abrindo o endereço do ChatGPT.
- Portal: cabeçalhos e compatibilidade revisados.
- Portal: `X-Robots-Tag: noindex` preparado localmente.
- Foco visível e áreas de toque de checkboxes ampliadas.
- Alternâncias acessíveis com `aria-pressed` correto.
- Campo TOTP com teclado numérico adequado.
- Convites reorganizados como “Convites recentes”.
- Validade do convite mais clara.
- Feedback acessível ao copiar um convite.
- Códigos já usados não voltam a ser expostos integralmente.

## Testes já executados

### Site e Guia

- 54 testes Playwright executados.
- 37 aprovados, 17 ignorados intencionalmente e 0 falhas.
- Cobertura em Chromium desktop, Chromium móvel e WebKit simulando iPhone 13.
- Verificados: âncoras e rolagem, menu, links, foco, PWA, uso off-line/PDF e estouro horizontal.

### Portal

- Build aprovado.
- Lint aprovado.
- 4 testes unitários aprovados.
- Suíte isolada de segurança com banco D1 temporário: 32 verificações aprovadas.

Entre as verificações aprovadas estão:

- login profissional sem MFA é rejeitado;
- paciente A não acessa dados do paciente B;
- paciente não acessa o painel nem cria convites;
- profissional não vê registro privado;
- profissional não edita registro do paciente;
- compartilhamento e revogação funcionam;
- convite usado, vencido ou revogado é rejeitado;
- uso simultâneo do mesmo convite cria somente uma conta;
- sessão expirada não acessa dados;
- redefinição de senha invalida a sessão anterior;
- ações protegidas exigem CSRF;
- logs não têm colunas destinadas a conteúdo clínico, senha, MFA ou token.

### Verificações ainda não completas

- A exclusão de conta tem cascatas previstas no banco, mas o fluxo final completo ainda merece um teste automatizado de ponta a ponta.
- A apresentação com muitos registros compartilhados ainda não foi validada visualmente com uma lista longa.
- A branch local precisa ser publicada antes de confirmar em produção o novo `X-Robots-Tag` e a nova versão do cache do Guia.

## Produção versus branch local

- Os três endereços públicos estavam respondendo normalmente.
- O portal em produção já possuía CSP, `no-store`, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`.
- O `X-Robots-Tag: noindex` ainda não estava na versão pública; a correção está apenas na branch local.
- O fluxo de configuração profissional foi validado no portal real com uma conta descartável, e os dados desse teste foram removidos.
- O código aceita redirecionamento do endereço antigo, mas a publicação do redirecionamento do antigo site do ChatGPT não foi concluída.

## Custo e limites

O projeto foi planejado para custo de R$ 0 dentro dos limites gratuitos atuais:

- GitHub Pages para o site público.
- Cloudflare Workers Free, com limite diário de requisições.
- Cloudflare D1 Free, com limites diários de leitura/escrita e armazenamento.
- Nenhum domínio pago, serviço de e-mail/SMS, agenda, pagamento, análise paga ou API de IA foi adicionado.
- Visitas de pacientes não consomem a franquia do Codex/ChatGPT.
- No plano gratuito da Cloudflare, atingir o limite tende a interromper operações até a renovação da franquia, não a gerar cobrança automática. Ainda assim, qualquer mudança de plano deve ser recusada sem revisão consciente do proprietário.

Referências oficiais:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

## Antes de começar com pacientes

1. Configurar a conta profissional diretamente no portal, mantendo o segredo de configuração fora do repositório.
2. Guardar o autenticador e os códigos de recuperação em local privado.
3. Criar um convite de teste e concluir o fluxo como paciente no próprio aparelho ou em janela privada.
4. Criar um registro privado, compartilhar, confirmar a leitura profissional e revogar o compartilhamento.
5. Revisar os três commits locais e, somente com autorização expressa, fazer push/merge/publicação.
6. Após publicar, confirmar os links, o cache do Guia e os cabeçalhos do portal em produção.
7. Começar com um paciente adulto informado e manter uma alternativa temporária caso ocorra indisponibilidade.

Mensagem curta sugerida ao paciente:

> Estou começando a utilizar um recurso complementar para registros entre as sessões. Ele permite guardar anotações de forma privada e escolher quais delas compartilhar comigo. Como é uma ferramenta nova, ainda posso realizar pequenos ajustes técnicos. Ela não é acompanhada em tempo real e não deve ser usada para situações urgentes.

Em caso de falha, não pedir ao paciente que envie conteúdo clínico por WhatsApp. Orientar a guardar a anotação de modo privado até o portal voltar ou usar a alternativa profissional já combinada.

## Refinamentos futuros possíveis

Estes itens não impedem um teste controlado, mas podem melhorar a experiência:

- botão de mostrar/ocultar senha;
- ligação ainda mais precisa entre erros, campos e retorno de foco;
- avaliar MFA profissional em segunda etapa, sem enfraquecer a validação no servidor;
- resumo expansível para muitos registros compartilhados;
- filtros somente se o uso real mostrar necessidade;
- teste automatizado completo da exclusão da conta;
- concluir o redirecionamento do endereço antigo do ChatGPT;
- refinamento visual fino do portal sem alterar conteúdo ou regras.

## Prompt de continuidade

Copie o texto abaixo ao iniciar uma nova tarefa:

---

Continue o projeto `psico-mateus/psico-mateus.github.io` a partir do código mais recente e leia primeiro o arquivo `REGISTRO-DO-PROJETO.md` inteiro.

Antes de alterar qualquer arquivo, verifique pasta, remoto, branch, commits locais, sincronização e alterações não commitadas. Preserve todo o trabalho existente. A branch de continuidade esperada é `auditoria-final-portal`, que possui commits locais ainda não publicados.

O projeto inclui o site profissional, o Guia de Emoções público/off-line e o portal funcional de Registros entre sessões em Cloudflare Worker + D1. Trate o portal como sistema real, não como protótipo. Preserve todas as decisões, regras de privacidade e limites descritos no registro.

Nunca adicione ao repositório senhas, códigos de convite, segredo de configuração, chaves MFA, códigos de recuperação, tokens ou dados reais de pacientes. Não crie custos. Não faça merge, push nem publicação sem minha autorização expressa.

Execute testes proporcionais a qualquer mudança. Para mudanças maiores de fluxo, arquitetura, autenticação ou banco, apresente primeiro o problema real, a proposta, o impacto e o risco. Para correções pequenas e evidentes, implemente com cuidado e registre o que foi testado.

Ao terminar, informe claramente: estado do Git, arquivos alterados, testes, riscos, o que está apenas local e o que está efetivamente publicado.

---

## Regra de atualização deste registro

Sempre que houver mudança relevante de arquitetura, segurança, publicação, custo, regras clínicas, testes ou pendências, atualizar este arquivo no mesmo trabalho. Não registrar dados sensíveis nem informações de pacientes.
