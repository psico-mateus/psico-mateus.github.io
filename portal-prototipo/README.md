# Portal — protótipo local

Este protótipo testa autenticação, persistência e compartilhamento controlado sem alterar o site público.

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

Depois abra `http://127.0.0.1:4310`.

## Contas fictícias

- paciente: `ana@exemplo.local` / `TestePaciente!2026`
- outro paciente, para testes de isolamento: `bruno@exemplo.local` / `TestePaciente2!2026`
- profissional: `profissional@exemplo.local` / `TesteProfissional!2026`

## O que já é real no protótipo

- senhas derivadas com `scrypt` e sal individual;
- sessão por cookie `HttpOnly` e token armazenado somente como hash;
- proteção CSRF para alterações;
- autorização no servidor;
- banco SQLite persistente;
- registro privado por padrão;
- compartilhamento e revogação explícitos;
- isolamento entre pacientes;
- painel profissional somente para registros compartilhados;
- exportação e exclusão;
- logs técnicos sem conteúdo clínico.

Antes de qualquer publicação com usuários reais ainda seriam necessários fornecedor de autenticação, HTTPS, banco gerenciado, política de privacidade específica, revisão de segurança e avaliação jurídica/LGPD.

