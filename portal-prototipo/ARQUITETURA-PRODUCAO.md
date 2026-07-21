# Evolução para uso real

O **Espaço entre sessões** foi construído como uma aplicação separada. O site profissional e o Guia de Emoções continuam íntegros e não dependem do portal.

## Proposta de valor

O diferencial não é vigiar o paciente nem automatizar a clínica. É oferecer um espaço em que:

- o registro nasce privado;
- o paciente escolhe o que levar para a sessão;
- o compartilhamento pode ser revogado;
- o profissional vê somente pacientes vinculados e conteúdos compartilhados;
- o texto do paciente não pode ser alterado pelo profissional;
- não há chat, promessa de leitura imediata, diagnóstico ou interpretação por IA.

## O que esta versão valida

- experiência de paciente e profissional;
- autenticação e sessão reais no ambiente local;
- persistência em banco SQLite;
- separação de perfis;
- isolamento entre pacientes;
- autorização no servidor;
- registro privado, compartilhamento e revogação;
- exportação, exclusão e logs técnicos sem conteúdo clínico.

## Arquitetura futura

```text
Site e Guia públicos (GitHub Pages)
           │
           └── acesso opcional ao Portal
                         │
              aplicação com servidor HTTPS
                         │
        autenticação gerenciada + banco PostgreSQL
                         │
           políticas de acesso no próprio banco
```

O portal deve ficar em um serviço separado do GitHub Pages, porque páginas estáticas não fornecem autenticação, banco, controle de acesso ou backups.

## Migração prevista

1. Manter a interface e os fluxos já testados.
2. Substituir o banco SQLite local por PostgreSQL gerenciado.
3. Substituir as contas de demonstração por autenticação gerenciada.
4. Aplicar políticas de acesso por linha no banco.
5. Adicionar confirmação de e-mail, recuperação de conta, expiração e revogação de sessões.
6. Exigir MFA para a conta profissional.
7. Criar ambiente de homologação separado da produção.
8. Validar backups e restauração.
9. Fazer revisão especializada de segurança, privacidade e LGPD.
10. Realizar piloto limitado somente com adultos e consentimento adequado.

Nenhum registro local de demonstração será enviado automaticamente ao futuro banco.

## Antes de pacientes reais

- escolher o fornecedor de autenticação e banco;
- definir região de armazenamento e contratos aplicáveis;
- revisar finalidade, base legal, transparência, retenção e exclusão;
- criar política de privacidade específica para o portal;
- implementar HTTPS, MFA, limitação de tentativas e recuperação segura;
- testar acessos negados e isolamento entre contas;
- revisar logs, backups, restauração e plano de incidentes;
- definir regras próprias antes de incluir menores de idade;
- deixar claro que o portal não é canal de emergência e não garante leitura imediata.

## Custo

O protótipo local tem custo zero. Um teste futuro em ambiente gerenciado pode começar em uma faixa gratuita, mas uso clínico real não deve depender da promessa de gratuidade permanente. Segurança, backups, disponibilidade e suporte precisam ser avaliados antes da produção.

