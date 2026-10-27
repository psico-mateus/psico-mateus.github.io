# Triagem de segurança — retomada no Windows, 27/10/2026

Base: `c6b814e`, recebida de `trabalho/continuidade-mac-windows` em clone novo.
Triagem feita em `tarefa/windows-triagem-seguranca-20261027`. Nenhuma versão de
dependência foi atualizada; nenhum deploy, acesso autenticado de produção,
migração ou alteração de conta/segredo remoto foi executado.

## Auditoria reproduzida

`pnpm audit --json`: retorno 1, **16 advisories**: 2 críticos, 4 altos,
7 moderados e 3 baixos. `pnpm audit --prod --json`: retorno 1, **12 advisories**:
2 críticos, 2 altos, 5 moderados e 3 baixos. São contagens do registro npm
consultado nesta data, não número de incidentes nem prova de exploração.
O audit de produção inclui ferramentas pelo grafo de peers do Vinext/RSC;
isso não comprova a inclusão ou execução de cada pacote no Worker.

Inventário completo abaixo. Os pisos corrigidos são os informados pelo audit
atual; não significam compatibilidade já testada de uma atualização.

| Pacote instalado | Advisory | Gravidade | Piso informado | Escopo observado / triagem |
| --- | --- | --- | --- | --- |
| next 16.3.8 | [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) | Crítica | 16.4.1 | Imagens em Linux/glibc; mitigação upstream sharp >=0.35.5 já fixada no lockfile. Worker usa Vinext/IMAGES. |
| next 16.3.8 | [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) | Crítica | 16.4.1 | Depende de `use cache` retornando múltiplos typed arrays; diretiva não encontrada no código do aplicativo. |
| next 16.3.8 | [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) | Alta | 16.4.1 | Depende de Server Action; nenhuma diretiva `use server` encontrada no aplicativo. API atual é Route Handler. |
| vite 8.0.16 | [GHSA-587h-7wmj-h5pm](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm) | Alta | 8.1.6 | Ferramenta de abertura de editor no Windows; relevante para este ambiente de desenvolvimento. |
| vite 8.0.16 | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | Moderada | 8.1.6 | Escape de argumento do editor no Windows; tratar junto com o anterior. |
| vite 8.0.16 | [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | Moderada | 8.1.6 | Interpretação de flags de editor; ferramenta local, não fluxo clínico. |
| vite 8.0.16 | [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | Baixa | 8.1.6 | Middleware Vite; revisar servidor dev, não equiparar ao handler Worker publicado. |
| vite 8.0.16 | [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | Moderada | 8.1.6 | Acesso a arquivos fora de fs.allow em sistemas não Windows; também relevante ao Mac/WSL. |
| zod 4.4.3 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Alta | 4.6.6 | Apenas grafo de lint: eslint-config-next → react-hooks → zod / zod-validation-error. Sem import no aplicativo. |
| undici 7.29.1 | [GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) | Alta | 7.30.1 | Miniflare/Wrangler, desenvolvimento; não confundir com fetch nativo de Workers. |
| undici 7.29.1 | [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685) | Moderada | 7.30.1 | Parser EventSource no mesmo grafo de ferramentas. |
| undici 7.29.1 | [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472) | Moderada | 7.30.1 | Validação SRI no mesmo grafo de ferramentas. |
| fast-uri 3.1.8 | [GHSA-w74x-v6f9-j3xg](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg) | Moderada | 3.1.9 | webpack → schema-utils → ajv; sem uso direto no aplicativo. |
| fast-uri 3.1.8 | [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | Baixa | 3.1.9 | Normalização de caminho; mesmo grafo webpack/ajv. |
| fast-uri 3.1.8 | [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) | Moderada | 3.1.9 | Canonicalização de host; mesmo grafo webpack/ajv. |
| fast-uri 3.1.8 | [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | Baixa | 3.1.9 | Esquema em referência relativa; mesmo grafo webpack/ajv. |

Os três advisories do mantenedor Next foram consultados diretamente. Também
foram consultados os avisos dos mantenedores launch-editor, Undici e fast-uri
indicados acima. Os demais IDs/pisos são inventário do audit, sem afirmar
reprodução individual de exploração. O aviso Zod no repositório do mantenedor
retornou 404; sua confirmação primária ainda está pendente.

## Evidência de aplicabilidade e limites

- `worker/index.ts` importa `vinext/server/app-router-entry` e o otimizador
  `vinext/server/image-optimization`. A transformação usa `env.IMAGES`, não
  invoca o otimizador Next com sharp. `next.config.ts` não habilita SVG perigoso.
- Não foram encontrados `use cache`, `use server`, imports `next/image`,
  `next/server` ou `next/dist` em `app/`, `lib/` e `worker/`. O aplicativo usa
  requisições HTTP à API, sem Server Actions próprias.
- A implementação instalada de `vinext/server/image-optimization` não importa
  sharp/Next. O build desta branch foi concluído e sanitizado. Isso não é uma
  análise completa de alcançabilidade de todos os chunks nem prova sobre o
  artefato atualmente publicado.
- `sharp 0.35.5` é override global e resolução efetiva no lockfile. O workaround
  oficial de GHSA-2464-fhr4-w9xw é satisfeito nesta árvore. Não declarar que
  atualizar só Next corrige o runtime independente do Vinext.
- Não há import direto de Zod, Undici, fast-uri ou webpack nos diretórios do
  aplicativo inspecionados. A exclusão definitiva de módulos transitivos do
  artefato requer rastrear o build, não apenas buscar nomes no código-fonte.
- Não houve pentest, requisição maliciosa, inspeção de pacientes ou leitura de
  banco remoto. Os alertas permanecem abertos e não foram suprimidos.

## Ordem de correção para a próxima etapa

1. Branch própria de correção a partir da integração atualizada. Atualizar o par
   Next/eslint-config-next para versão estável corrigida >=16.4.1, preservando
   peers React/RSC/Vinext e verificando changelog e disponibilidade no registro.
2. Vite: escolher linha corrigida compatível com Vinext e os plugins Cloudflare,
   React e RSC (8.1.6 é o piso da linha 8.1, não autorização para escolher uma
   versão posterior ainda vulnerável de outra linha). Prioridade prática no
   Windows por causa do launch-editor. Até corrigir, usar apenas loopback e não
   expor o servidor dev à rede.
3. Corrigir fast-uri >=3.1.9 e Undici >=7.30.1 com seletores direcionados que
   atinjam as resoluções antigas reais; alterar só o override de uma versão que
   já não aparece não resolve. Confirmar Zod upstream e compatibilidade do lint.
4. Revisar o diff de lockfile, pares e scripts, sem `audit fix --force` e sem
   atualizar outros pacotes por hábito. Elevar guardas offline somente junto
   com versões resolvidas e validação efetiva.
5. Repetir audit completo/prod, lint, tipos, build sanitizado, testes e integração
   HTTP/D1/restauração sintéticos em Mac ou clone Linux no WSL2. Conferir os dois
   modos Worker e fluxo de sessão/MFA. Deploy continua sendo ação separada.

## Instalação e validação física Windows

Node 24.22.1, pnpm 11.25.0. Raiz instalada com lockfile congelado. A instalação
inicial do portal falhou com `ERR_PNPM_IGNORED_BUILDS`: unrs-resolver/workerd
não tinham decisão explícita em `allowBuilds`; pnpm inseriu placeholders no YAML.
Foram substituídos por **false**, mantendo apenas esbuild autorizado. Os scripts
inspecionados são instaladores de fallback de binários; os binários opcionais
travados por plataforma já estavam presentes. Nenhuma permissão geral a scripts
foi adicionada. Reinstalação congelada passou; lint, tipos e build comprovaram
o funcionamento neste Windows sem esses dois postinstalls. Validar também no
próximo install Mac/WSL antes de considerar cobertura entre plataformas.

Uma tentativa de `pnpm setup:local` durante a recuperação da instalação acionou
instalação automática e falhou com EPERM de rename de esbuild. Após encerrar
essa tentativa, a reinstalação passou. Evitar comandos pnpm concorrentes sobre
o mesmo node_modules. O setup foi executado diretamente pelo script Node:
`.env.local` sintético novo, confirmado ignorado, nenhum segredo exibido.

- Chromium e WebKit instalados localmente; nenhuma suíte UI completa executada.
- `pnpm lint`: aprovado.
- `pnpm typecheck`: aprovado, incluindo geração local dos tipos Wrangler.
- `pnpm build:worker`: aprovado; sanitizer removeu `dist/server/.dev.vars`.
  Avisos existentes de imports dinâmicos/classificação de rotas preservados.
- `pnpm dev --host 127.0.0.1 --port 4440`: iniciou; GET `/` respondeu 200.
- `node --test tests/run-vinext.test.mjs tests/setup-local.test.mjs
  tests/dependency-security.test.mjs`: 19 aprovados, zero falhas, 1 skip por
  falta de permissão para fixture symlink Windows. Não chamar isso de suíte
  completa nem ocultar o skip; guardas antigas de versão não cobrem pisos novos.
- WSL2 é a versão padrão do host, mas **nenhuma distribuição Linux instalada**.
  Integração isolada/restauração e suíte completa seguem pendentes em Mac/WSL2.
- Nenhuma credencial, banco ou node_modules do Mac foi copiado.
