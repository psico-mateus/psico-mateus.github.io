---
name: retomar
description: Rotina de chegada em um computador ou sessão nova deste repositório. Confere branch, remoto e árvore, atualiza a branch de trabalho sem sobrescrever nada e resume o estado atual. Usar no começo de uma sessão ou quando o Mateus disser que trocou de computador.
---

Objetivo: começar do ponto certo, sem perder trabalho local e sem refazer o que
já está pronto.

1. Rode e leia o resultado:

   ```sh
   git status --short --branch
   git fetch origin
   git log -3 --oneline
   ```

2. Se houver alteração local não commitada, pare. Não troque de branch, não use
   `reset`, `checkout` destrutivo, `stash drop` nem `clean`. Mostre o que existe
   e proponha salvar em uma branch própria.

3. Com a árvore limpa:

   ```sh
   git switch trabalho/continuidade-mac-windows
   git pull --ff-only origin trabalho/continuidade-mac-windows
   ```

   Se a branch ainda não existir neste computador, use
   `git switch --track origin/trabalho/continuidade-mac-windows`.
   Se o `pull --ff-only` recusar por divergência, pare e relate os dois lados.
   Não faça rebase nem force.

4. Leia `CONTINUIDADE.md` por inteiro.

5. Confira o ambiente: `node --version` deve bater com `.nvmrc`, e
   `pnpm --version` com o `packageManager`. Se as dependências não estiverem
   instaladas: `pnpm install --frozen-lockfile` na raiz e em `portal-production/`,
   depois `pnpm --dir portal-production setup:local`.

6. Responda ao Mateus em poucas linhas:
   - em que commit a branch de trabalho está, e se veio algo novo do outro computador;
   - o que está pronto e ainda não publicado;
   - o que está pendente e depende dele;
   - qualquer limitação deste ambiente (sem WebKit, sem push, sem login do Cloudflare).

7. Antes de editar, crie a branch da tarefa:
   `git switch -c tarefa/<mac|windows|nuvem>-<descricao>-<AAAAMMDD>`.
