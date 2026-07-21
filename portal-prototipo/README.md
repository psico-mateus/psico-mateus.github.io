# Portal — protótipo local

Este protótipo testa autenticação, cadastro, persistência e compartilhamento controlado. A branch local também integra entradas para o portal no site profissional e no Guia, sem publicar essas mudanças.

## Limites

- use somente os usuários e conteúdos fictícios incluídos;
- não é uma aplicação de produção;
- não use dados reais de pacientes;
- não é canal clínico ou de emergência;
- o banco SQLite permanece apenas nesta máquina e está ignorado pelo Git.

## Executar

Na raiz do repositório:

```sh
npm run portal
```

Depois abra:

- site profissional integrado: `http://127.0.0.1:4310/`;
- Notas para a sessão: `http://127.0.0.1:4310/espaco/`;
- Guia integrado: `http://127.0.0.1:4310/guia-emocoes/`.

## Contas fictícias

- paciente: `ana@exemplo.local` / `TestePaciente!2026`
- outro paciente, para testes de isolamento: `bruno@exemplo.local` / `TestePaciente2!2026`
- profissional: `psico.mateus@outlook.com` / `TesteProfissional!2026`

A senha profissional acima existe somente para iniciar o banco local. Depois de entrar, Mateus pode abrir **Conta e segurança** e definir outra senha. Ela permanece apenas no banco ignorado pelo Git.

## O que já é real no protótipo

- senhas derivadas com `scrypt` e sal individual;
- sessão por cookie `HttpOnly` e token armazenado somente como hash;
- proteção CSRF para alterações;
- autorização no servidor;
- cadastro público limitado ao perfil de paciente;
- vínculo automático do novo paciente com a única conta profissional local, sem liberar registros;
- troca de senha com encerramento das outras sessões da conta;
- banco SQLite persistente;
- registro privado por padrão;
- compartilhamento e revogação explícitos;
- isolamento entre pacientes;
- painel profissional somente para registros compartilhados;
- exportação e exclusão;
- logs técnicos sem conteúdo clínico.

Antes de qualquer publicação com usuários reais ainda seriam necessários fornecedor de autenticação, HTTPS, banco gerenciado, política de privacidade específica, revisão de segurança e avaliação jurídica/LGPD.
