# Plano de revisão — novembro/dezembro de 2026

Escrito em 13/11/2026 pelo Claude Code, a pedido do Matt, depois de ler o núcleo
do portal (`lib/crypto.ts`, `lib/portal.ts`, `db/schema.ts`, `db/runtime.ts`,
`worker/security.ts`, o aviso de privacidade e as partes de login, recuperação,
listagem e exclusão de `app/api/portal/[...segments]/route.ts`). Ainda não foi
lida linha a linha a interface (`PortalApp.tsx`, `ProfessionalDashboard.tsx`).
Nada aqui foi implementado. Cada item precisa do "sim" do Matt antes de começar.

## O que não precisa mudar

- Autorização decidida no servidor, com consultas parametrizadas; o profissional
  só lê registro compartilhado, com vínculo ativo e paciente ativo.
- Sessão em cookie `HttpOnly`, `SameSite=Strict`, 8 horas; token guardado só como
  hash; CSRF e conferência de origem em toda mutação.
- Senha com PBKDF2-SHA256 em 100.000 iterações (o teto do Cloudflare Workers),
  mínimo de 12 caracteres, comparação em tempo constante e erro genérico no login.
- Limite de tentativas por conta e por IP; e-mail guardado só como HMAC.
- MFA obrigatório do profissional, com consumo do código na mesma transação da
  sessão. Cabeçalhos de segurança e `no-store` nas respostas.
- Exclusão de conta apaga em cascata; logs técnicos sem conteúdo, por 180 dias.
- Arquitetura dos dois Workers, GitHub Pages e custo zero.

## Prioridade 1 — segurança do paciente e transparência

1. **FEITO e publicado em 13/11/2026** (build `9b070ada831f7784`; a nota do
   editor ficou no início do formulário). Texto original do item:
   **Aviso de crise incompleto no portal.** O rodapé diz para ligar 192 em risco
   imediato, mas não cita o CVV 188 nem leva à página "Cuidados" do site, que já
   tem a orientação completa. O aviso também só aparece no rodapé. Proposta:
   citar 188 e 192, ligar à página "Cuidados" e repetir uma linha curta perto do
   botão de salvar registro. O texto é clínico: o Matt aprova a redação.
2. **FEITO e publicado em 14/11/2026** (build `f6067844ef8da627`): aviso de
   14/11/2026 e comunicado aos pacientes. Texto original do item:
   **Aviso de privacidade.** Pontos que hoje não estão ditos:
   - os registros ficam em texto legível no banco, e quem administra a conta do
     Cloudflare (o próprio Matt) tem acesso técnico a ele;
   - o fornecedor de nuvem é a Cloudflare;
   - depois de excluir, cópias automáticas do banco podem existir por até 30 dias
     (Time Travel do D1; confirmar o prazo no plano atual antes de escrever);
   - conta desativada fica guardada sem prazo.
   Hoje a versão aceita fica gravada só no cadastro; não existe tela de "o aviso
   mudou". Publicar versão nova pede também esse aviso simples ao entrar.
3. **DECIDIDO e publicado em 14/11/2026:** contas desativadas ficam sem prazo;
   o Matt pode excluí-las pelo painel (botão "Excluir conta" em acesso
   revogado). Texto original do item: **Prazo para conta desativada.** Decisão do Matt: por quanto tempo guardar os
   registros de quem encerrou o acompanhamento (por exemplo, 6 meses) e se a
   exclusão é automática. Hoje ficam para sempre, e a pessoa não consegue entrar
   para apagar.

## Prioridade 2 — criptografar os registros no banco

O portal já tem `encrypt`/`decrypt` (AES-GCM), usados no segredo do autenticador.
Aplicar o mesmo a registros, revisões, Meu mapa e avisos faria um vazamento ou
cópia do banco não expor o texto. Limite honesto: quem controla a conta do
Cloudflare ainda consegue decifrar, porque a chave fica lá. É o item de maior
risco técnico: migração dos dados existentes, ensaio completo local, rollback e
aprovação específica do Matt para a migração remota. Sem custo.

## Prioridade 3 — rede de proteção automática

4. **FEITO em 14/11/2026** (`.github/workflows/testes.yml`). Texto original:
   **Testes automáticos no GitHub a cada envio** (GitHub Actions, gratuito para
   repositório público). Só testa; nunca publica. Protege contra erro de qualquer
   assistente ou computador.
5. Tirar da `main` os manifestos antigos que geram os 45 alertas.
6. Atualizar a cadeia de lint (alerta moderado do minimatch).
7. Avaliar tirar `'unsafe-inline'` de `script-src` na política de segurança
   (depende do que o Vinext exige; pode não ser viável sem custo de complexidade).

## Prioridade 4 — simplificar para o futuro

8. Dividir `PortalApp.tsx` (4.180 linhas), `ProfessionalDashboard.tsx` (2.716) e
   `route.ts` (2.436) em partes menores, sem mudar comportamento, usando os
   testes existentes como rede.
9. Enxugar a repetição Guia/Área na página inicial do site, com o Matt aprovando
   o texto.
10. Roteiro curto (10 minutos) para o Matt testar no iPhone. Android fica sem
    teste físico: ele não tem aparelho.

## Para decidir, sem proposta fechada

- **Cópia de segurança fora do Cloudflare.** Hoje a única proteção contra perda
  é a do próprio D1. Uma cópia externa envolveria exportar dados de pacientes,
  o que as regras do projeto proíbem sem aprovação. Como o portal declara não ser
  prontuário, pode ser aceitável não ter. Decisão do Matt.
- O código do portal é público no GitHub (exigência do GitHub Pages gratuito).
  Não há segredo nele, e isso não expõe dados.
