---
paths:
  - "index.html"
  - "404.html"
  - "sw.js"
  - "sitemap.xml"
  - "robots.txt"
  - "assets/**"
  - "guia-emocoes/**"
  - "guia/**"
  - "cuidados/**"
  - "privacidade/**"
  - "tests/**"
---

# Site profissional e Guia de Emoções

Arquivos estáticos, sem etapa de build. O GitHub Pages serve a branch `main`
como está: o que chega a `main` está publicado.

## Guia de Emoções

- `guia-emocoes/index.html` e os arquivos `assets/*-<hash>.js` e
  `assets/index-*.css` são artefatos compilados. O código-fonte deles não está
  neste repositório. Não editar nem reformatar à mão.
- Ajustes do Guia vão em `assets/css/guide-brand.css` e
  `assets/js/guide-navigation.js`.
- Ao mudar um desses dois arquivos, no mesmo commit:
  1. atualizar o `?v=` correspondente em `guia-emocoes/index.html`;
  2. atualizar o mesmo `?v=` em `CORE_ASSETS` de `guia-emocoes/sw.js`;
  3. subir `CACHE_NAME` (`guia-emocoes-scoped-vN`);
  4. ajustar `tests/guide-scroll.spec.mjs` e `tests/guide-offline.spec.mjs`,
     que conferem esses valores.
- O rascunho do usuário fica só no aparelho, na chave `guia-emocoes-rascunho-v1`
  do `localStorage`. Não apagar, renomear nem migrar sem pedido. Os service
  workers não tocam nessa chave.
- `sw.js` da raiz só limpa o cache antigo e se desregistra. O worker do Guia
  controla apenas `/guia-emocoes/`.

## Site profissional

- Links, WhatsApp e e-mail ficam em `assets/js/config.js`. SEO e dados
  estruturados ficam em `index.html`.
- Ao mudar `assets/css/styles.css` ou `assets/js/main.js`, atualizar o `?v=` nas
  páginas que os carregam: `index.html`, `cuidados/`, `privacidade/` e `404.html`.
- Manter CRP visível, modalidades claras, aviso de que não é serviço de
  emergência e nenhuma promessa de resultado.

## Conteúdo

- Textos clínicos, as 25 emoções, o PDF e os textos profissionais são do Mateus.
  Não reescrever por preferência; só com pedido dele.

## Testes

```sh
pnpm test              # Chromium desktop e mobile, WebKit mobile
pnpm test:guide-scroll
```

Skips condicionais escolhem o projeto certo para cada cenário. Não são falhas
escondidas, e não se deve somar retestes ao total.

## Publicação

- Enviar a `main` somente os arquivos públicos aprovados. Nunca fazer merge da
  branch de trabalho inteira em `main`: ela carrega a história do portal.
