# Área do paciente

Portal privado de apoio à psicoterapia de Mateus Ribeiro Marcos, Psicólogo Clínico (CRP 08/38930). Pacientes convidados podem guardar registros, mantê-los privados e escolher individualmente quais compartilhar. O acesso profissional é somente leitura.

O portal não é prontuário, chat, canal de emergência, monitoramento em tempo real nem ferramenta de diagnóstico ou análise automática.

## Estrutura

```text
app/
  PortalApp.tsx                         Fluxos públicos e dashboard do paciente
  PatientEducation.tsx                 Biblioteca de apoio exclusiva do paciente
  education-content.ts                 Catálogo tipado dos textos e referências
  education-search.ts                  Busca local e cálculo de tempo de leitura
  ProfessionalDashboard.tsx            Dashboard profissional
  professional-dashboard-data.ts       Busca, ordenação e helpers de apresentação
  portal-client.ts                      Cliente HTTP e tratamento de erros
  api/portal/[...segments]/route.ts     API, autenticação e autorização
  privacidade/page.tsx                  Aviso de privacidade
db/
  runtime.ts                            Binding D1 e inicialização compatível
  schema.ts                             Esquema Drizzle
drizzle/                                Migrações versionadas
lib/
  crypto.ts                             Hashes, códigos, criptografia e TOTP
  portal.ts                             Sessões, CSRF, validação, auditoria e limites
tests/
  portal.test.mjs                       Testes unitários e regressões estruturais
worker/
  index.ts                              Entrada do Worker e headers de segurança
```

## Requisitos e comandos

- Node.js 22.13 ou superior.
- pnpm e o lockfile existente.

```bash
pnpm install
pnpm dev
pnpm lint
pnpm build
pnpm test
```

`pnpm test` executa o build antes dos testes.

A suíte `pnpm test:integration` aceita somente um servidor local isolado. Ela
requer `PORTAL_TEST_BASE_URL`, `PORTAL_TEST_SETUP_SECRET` e
`PORTAL_TEST_DB_PATH`, apontando para o SQLite local criado pelo Miniflare. O
caminho do banco é usado somente para simular a expiração de um convite
sintético; a suíte recusa URLs que não sejam locais.

## Configuração local

Crie um arquivo local ignorado pelo Git a partir de `.env.example`. As variáveis são:

- `APP_SECRET`: protege identificadores, códigos e o segredo MFA armazenado;
- `SETUP_SECRET`: restringe a configuração inicial da conta profissional;
- `PUBLIC_SITE_URL`: endereço do site profissional;
- `GUIDE_URL`: endereço do Guia de Emoções.

Nunca registre valores reais dessas variáveis no Git, em logs, testes ou documentação.

## Banco e autenticação

O portal usa Cloudflare D1. As relações principais são:

- `users`: contas de pacientes e profissional;
- `patient_links`: vínculo entre profissional e paciente;
- `entries`: registros pertencentes ao paciente;
- `entry_views`: data em que o profissional abriu cada registro compartilhado;
- `invitations`: convites de uso único, válidos por 7 dias;
- `sessions`: sessões armazenadas somente pelo hash do token;
- `assisted_recovery_grants`: validade dos códigos temporários emitidos pelo profissional;
- `access_logs`: eventos técnicos sem conteúdo clínico;
- `auth_windows`: limites de tentativas.

O cadastro de paciente exige convite, confirmação de 18 anos ou mais e aceite do aviso de privacidade. Registros nascem privados. O servidor filtra o acesso profissional por vínculo ativo e compartilhamento atual. O acesso profissional exige MFA.

O painel profissional marca um registro como visto depois que Mateus abre o conteúdo e conclui a leitura. Uma edição ou um novo compartilhamento posterior faz o registro voltar à lista de pendências. Esse estado organiza a leitura e não permite editar, responder ou transformar o texto do paciente em prontuário. O paciente vê a data da visualização apenas nos próprios registros compartilhados; registros privados não exibem estado profissional.

A área “Leitura complementar” reúne conteúdo estático de psicoeducação para pacientes
autenticados. Busca, filtros e páginas abertas existem somente no estado em
memória da interface: não criam dados no D1, não entram na exportação e não
aparecem no painel profissional. Quando o paciente decide escrever a partir de
um texto, o portal abre o mesmo formulário vazio dos demais registros, que
continua privado ao salvar.

O catálogo central registra instituição, jurisdição, tipo, exibição ao paciente e
data de verificação de cada fonte. As referências clínicas combinam OMS/CID-11,
NICE, NIMH, Judith Beck e documentos específicos do Ministério da Saúde quando
eles sustentam diretamente o tema. O portal geral de PCDTs, a LGPD e as
Resoluções CFP nº 9/2024 e nº 7/2025 orientam a implementação, mas não aparecem
automaticamente como fontes clínicas. Na verificação de 26/07/2026, a revisão
brasileira do guia de cuidado integral para TEA continuava apenas como consulta
pública encerrada; por isso, a biblioteca mantém a diretriz oficialmente
disponível e a página atual do Ministério da Saúde, sem tratar o caderno da
consulta como versão vigente.

Se um paciente perder a senha e o próprio código de recuperação, ele pode pedir ajuda diretamente a Mateus. No painel profissional, a emissão de um código temporário exige a senha profissional e um novo código do autenticador. O código vale por 24 horas, substitui o anterior e encerra todas as sessões abertas do paciente. O portal não envia e-mails e não depende de um serviço externo para essa recuperação.

## Privacidade e segurança no desenvolvimento

- Use apenas dados sintéticos.
- Não consulte nem copie dados de produção.
- Não registre títulos, textos, emoções, nomes, e-mails, códigos, cookies ou credenciais.
- Não armazene conteúdo autenticado em `localStorage`, `sessionStorage`, service worker ou Cache API.
- Mantenha `Cache-Control: no-store` nas respostas autenticadas.
- Preserve consultas parametrizadas, autorização no servidor e proteção CSRF.
- Não execute migrações em produção sem revisão, backup e autorização.

## Publicação

O build é produzido com Vinext para Cloudflare Workers. O Worker público e o banco D1 são configurados em `wrangler.jsonc`; `.openai/hosting.json` mantém os bindings lógicos usados pelo fluxo de build.

Antes de publicar:

1. revise a branch e confirme que não há segredos ou dados reais;
2. execute lint, build e testes;
3. valide login, MFA, convites, compartilhamento, revogação, exportação e exclusão em ambiente isolado;
4. revise qualquer migração sem executá-la automaticamente;
5. faça deploy somente após autorização expressa.
