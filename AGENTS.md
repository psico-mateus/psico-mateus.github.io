# Instruções para os dois computadores

## Antes de trabalhar

1. Leia `CONTINUIDADE.md` por inteiro, tanto no Mac quanto no Windows.
2. Confira diretório, branch, `git status`, commits locais e remoto com `git fetch origin`.
3. A branch de integração de trabalho é `trabalho/continuidade-mac-windows`, não `main`.
4. Se houver alterações locais, preserve-as antes de trocar branch ou atualizar. Nunca use reset/checkout destrutivo, force-push ou limpeza de worktrees como rotina de sincronização.
5. O código atual é a fonte principal. Documentos antigos são históricos; não repetir recursos já concluídos nem tratar um build local como publicado.

## Enquanto trabalha

- Preserve contas, sessões, registros, rascunhos, compartilhamentos, MFA, convites, exportação e exclusão. Não simplifique autenticação para resolver problemas de ambiente.
- Use apenas dados sintéticos. Nunca copie produção para teste; não leia dados reais de pacientes para QA.
- Nunca envie `.env*` reais, `.dev.vars*`, tokens, códigos, cookies, bancos, dumps, exports, logs clínicos ou capturas reais ao GitHub. Só `.env.example` com nomes/exemplos não secretos é compartilhado.
- Não introduza custo obrigatório, serviço pago ou coleta clínica/analytics. Não crie chat, diagnóstico ou IA clínica.
- Mantenha linguagem simples, baixa carga cognitiva, acessibilidade, cores discretas e toda função existente. Evite mudanças por preferência sem problema concreto.
- Instale dependências separadamente em cada sistema; nunca transporte `node_modules`, `.wrangler`, credenciais ou bancos entre computadores.
- No Windows, observe as limitações nativas e o caminho WSL2 descritos em `CONTINUIDADE.md`. Não desative guardas de isolamento ou esconda testes que falham para contornar portabilidade.

## Ao concluir cada etapa

1. Atualize `CONTINUIDADE.md`: realizado/pendente, branch e commits relevantes, testes realmente executados e limitações, próximos passos e qualquer mudança de configuração.
2. Revise `git diff --check`, arquivos novos, nomes sensíveis e diff completo antes de `git add`. Prefira staging explícito.
3. Faça commits pequenos. Quando houver autorização para sincronizar/trocar de computador, envie à branch de trabalho e confirme igualdade do SHA local/remoto. Se o envio falhar, informe que o trabalho ainda não está disponível no outro computador.
4. Ao iniciar no destino, use `git pull --ff-only` com árvore limpa. Se as branches divergirem, pare o pull automático, preserve ambos os lados e combine em branch separada. Não rebaseie trabalho compartilhado à força.
5. Trabalho simultâneo usa branches separadas por tarefa/computador; combine com revisão e testes na branch de integração antes de qualquer publicação.

## Publicação é uma ação separada

- Enviar uma branch ao GitHub **não autoriza deploy, merge em `main`, migração remota ou alteração de segredos**.
- Só publique após aprovação explícita do usuário para o lote final. Não use `pnpm deploy:worker` como atalho: o procedimento preserva dois Workers e está em `CONTINUIDADE.md`.
- GitHub Pages usa `main`; não mescle toda a história do portal nessa branch para transportar trabalho.
- Preserve `area-do-paciente` em modo `proxy`, `LEGACY_PORTAL=registros`, legado em modo `local`, mesmo D1 e segredos existentes. Não transforme o Worker antigo em redirecionamento simples.
- Antes de um deploy aprovado, obtenha versões atuais dos dois Workers, valide o artefato sanitizado e prepare rollback de código/assets, nunca restauração automática de banco.
