---
name: encerrar
description: Rotina de saída antes de desligar ou trocar de computador. Atualiza CONTINUIDADE.md, revisa o diff, commita e envia à branch de trabalho, e confirma que o remoto recebeu.
disable-model-invocation: true
---

O Mateus chamou este comando: isso autoriza commit e envio à branch de trabalho.
Não autoriza deploy, migração remota, mudança de segredo nem envio a `main`.

1. Atualize `CONTINUIDADE.md`: no topo de "Registro das sessões" (seção 1),
   acrescente uma entrada datada com o que foi feito, o que ficou pendente,
   branch e commits, testes realmente executados com números, limitações do
   ambiente e próximos passos. Se mudaram, atualize também "Estado",
   "Pendências", a tabela de produção (seção 2) e os últimos testes (seção 8).
   Não apague histórico: o que sair daqui vai para `docs/`.

2. Revise antes de adicionar qualquer coisa:

   ```sh
   git diff --check
   git status --short --branch
   git diff
   ```

   Confira arquivos novos um a um. Não entram: `.env*` reais, `.dev.vars*`,
   bancos, dumps, exports, logs, capturas, `node_modules`, `.wrangler`, `dist`.

3. Faça staging explícito, arquivo por arquivo, e commits pequenos com mensagem
   descritiva em português. Nada de `git add -A` ou `git add .`.

4. Envie a branch da tarefa:

   ```sh
   git push -u origin <branch-da-tarefa>
   ```

5. Integre na branch compartilhada com merge normal, sem rebase e sem force:

   ```sh
   git switch trabalho/continuidade-mac-windows
   git pull --ff-only origin trabalho/continuidade-mac-windows
   git merge <branch-da-tarefa>
   git push origin trabalho/continuidade-mac-windows
   ```

   Se houver conflito, pare e mostre os dois lados. Não resolva descartando um deles.

6. Confirme que o outro computador vai receber:

   ```sh
   git rev-parse HEAD
   git ls-remote origin refs/heads/trabalho/continuidade-mac-windows
   ```

   Os dois SHAs precisam ser iguais e a árvore precisa estar limpa.

7. Diga ao Mateus, em uma ou duas frases: o SHA enviado, que o outro computador
   já pode continuar com `/retomar`, e que nada foi publicado. Se o envio falhou,
   diga claramente que o trabalho ainda não está disponível no outro computador.
