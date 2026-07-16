# Site profissional — Mateus Ribeiro Marcos

Site estático profissional de Mateus Ribeiro Marcos, Psicólogo Clínico (CRP 08/38930), preparado para publicação direta no GitHub Pages. A raiz apresenta a prática profissional, a formação em Terapia Cognitivo-Comportamental, as modalidades de atendimento e os canais de contato.

O projeto também preserva o **Guia Prático para Reconhecer Emoções**, uma ferramenta clínica interativa com 25 emoções, busca, filtros, comparações, registro guiado salvo localmente e suporte a instalação e funcionamento off-line.

## Estrutura

```text
/
├── index.html                         Site profissional
├── 404.html                           Página de erro
├── sw.js                              Migração do service worker antigo da raiz
├── robots.txt
├── sitemap.xml
├── .nojekyll
├── assets/
│   ├── css/styles.css                 Estilos compartilhados do novo site
│   ├── js/config.js                   Links e mensagens reutilizados
│   ├── js/main.js                     Menu, compartilhamento e comportamento do site
│   ├── downloads/                     PDF original do guia
│   └── images/                        Foto, capa, favicons e previews sociais
├── guia/index.html                    Redirecionamento legado
├── guia-emocoes/                      Aplicativo interativo e PWA do guia
├── privacidade/index.html
└── cuidados/index.html
```

## Executar localmente

O projeto não exige instalação de dependências ou etapa de build. Na raiz do repositório, execute:

```bash
python3 -m http.server 4173
```

Depois, abra `http://127.0.0.1:4173/`. Um servidor HTTP é necessário para testar corretamente URLs absolutas, service workers, cache e comportamento off-line; abrir os arquivos diretamente com `file://` não é suficiente.

## Atualizar dados e links

Links profissionais, mensagens de WhatsApp e o assunto de e-mail ficam centralizados em `assets/js/config.js`. Metadados de SEO e dados estruturados também precisam ser revisados manualmente em `index.html` quando houver mudança de domínio, nome profissional ou informações públicas.

## Substituir o PDF

Substitua o arquivo abaixo mantendo exatamente o mesmo nome:

```text
assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf
```

Depois, confira se o botão de download abre o arquivo completo e atualize `assets/images/guide-cover.png` caso a capa tenha mudado.

## Atualizar imagens Open Graph

Os previews usados no compartilhamento têm 1200 × 630 pixels:

```text
assets/images/social-preview-site.png
assets/images/social-preview-guia.png
```

Os arquivos-fonte editáveis ficam em `assets/images/sources/`. Ao atualizar um preview, preserve o tamanho final, a legibilidade no recorte central e os textos alternativos definidos nos metadados das páginas.

Com Pillow disponível, os previews e a versão WebP da fotografia podem ser gerados novamente com:

```bash
python3 assets/images/sources/generate_assets.py /caminho/para/foto-profissional.png
```

Revise visualmente os dois PNGs depois da geração antes de publicar.

## Testar a PWA do guia

1. Sirva o projeto por HTTP local ou HTTPS.
2. Abra `/guia-emocoes/`.
3. Confirme que o registro usa somente `/guia-emocoes/sw.js` com escopo `/guia-emocoes/`.
4. Preencha uma etapa do registro guiado e recarregue a página para conferir a persistência local.
5. No painel de desenvolvimento do navegador, marque o modo off-line e recarregue o guia.
6. Verifique que o site profissional continua fora do escopo do worker do guia.

O rascunho usa a chave `guia-emocoes-rascunho-v1` no `localStorage`. Os service workers não removem essa chave, não apagam IndexedDB e não alteram dados escritos pelo usuário.

## Migração do cache antigo

O arquivo `sw.js` da raiz é um worker temporário de limpeza. Ele remove somente o cache legado conhecido `guia-emocoes-github-v1`, cancela seu próprio registro e não intercepta novas requisições. O worker atual do guia usa caches com o prefixo `guia-emocoes-scoped-` e controla apenas `/guia-emocoes/`.

Para testar a migração, registre primeiro a versão antiga em uma origem de teste, salve um rascunho, carregue esta versão e confirme que:

- o cache antigo foi removido;
- o registro da raiz desapareceu;
- o rascunho do `localStorage` permaneceu intacto;
- o novo worker aparece somente com escopo `/guia-emocoes/`.

## Publicação

O conteúdo da branch publicada pelo GitHub Pages deve corresponder à raiz deste repositório. Antes de publicar:

1. revise as alterações na branch de trabalho;
2. execute os testes locais;
3. confirme os links externos e o PDF;
4. faça merge na branch configurada no GitHub Pages somente após aprovação explícita.

Não é necessário executar um gerador de site. O arquivo `.nojekyll` garante que a árvore estática seja servida sem processamento do Jekyll.

## Direitos autorais

© Mateus Ribeiro Marcos. Todos os direitos reservados.

O conteúdo clínico, os textos profissionais e o **Guia Prático para Reconhecer Emoções** são protegidos por direitos autorais. O fato de este repositório ser público não concede automaticamente licença aberta, autorização de reprodução ou permissão para reutilização comercial. Nenhuma licença MIT, Creative Commons ou equivalente é aplicada ao conteúdo clínico sem autorização expressa do autor.
