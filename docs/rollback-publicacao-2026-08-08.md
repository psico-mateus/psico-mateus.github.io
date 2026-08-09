# Retorno rápido — publicação de 8 de agosto de 2026

Este ponto foi preparado antes da publicação do “Meu mapa” persistente.

## Referências preservadas

- código anterior: `a1b476454b149ef000f887ce0de71200c5a84d63`;
- branch remota: `rollback/pre-meu-mapa-20260808`;
- tag remota: `rollback/pre-meu-mapa-20260808-a1b4764`;
- Worker anterior: `b53d6dc5-4bed-4302-bbce-1669b4ff8b92`;
- backup D1 local: `/Users/mateus/.codex/backups/psico-mateus/2026-08-08/pre-meu-mapa.sql`;
- SHA-256 do backup: `d659c53e7b03962f606108d9c6b3a7b1defaeb3dfb35da2fc09e90e73c0bcaa7`.

O backup contém dados sensíveis reais e deve permanecer local, com permissão
restrita. Ele nunca deve ser adicionado ao Git.

## Ordem do retorno

1. Reverter o Worker para a versão registrada acima.
2. Confirmar login e cadastro no domínio oficial.
3. Reverter o commit da publicação em `main` e enviar o novo commit de reversão.
4. Não desfazer automaticamente a migração `0003`: a tabela adicional é isolada
   e o Worker anterior simplesmente a ignora. Removê-la poderia apagar respostas
   criadas depois da publicação.

## Verificação mínima depois do retorno

- `/health` responde normalmente;
- conta profissional entra com MFA;
- uma conta sintética ou já autorizada consegue entrar;
- cadastro continua aceitando convite válido;
- registros existentes continuam disponíveis.
