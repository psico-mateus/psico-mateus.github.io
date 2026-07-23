# Registros entre sessões

Portal privado de apoio à psicoterapia de Mateus Ribeiro Marcos, Psicólogo Clínico (CRP 08/38930). Pacientes convidados podem guardar registros, mantê-los privados e escolher individualmente quais compartilhar. O acesso profissional é somente leitura.

O portal não é prontuário, chat, canal de emergência, monitoramento em tempo real nem ferramenta de diagnóstico ou análise automática.

## Estrutura

```text
app/
  PortalApp.tsx                         Fluxos públicos e dashboard do paciente
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
- `invitations`: convites de uso único, válidos por 7 dias;
- `sessions`: sessões armazenadas somente pelo hash do token;
- `access_logs`: eventos técnicos sem conteúdo clínico;
- `auth_windows`: limites de tentativas.

O cadastro de paciente exige convite, confirmação de 18 anos ou mais e aceite do aviso de privacidade. Registros nascem privados. O servidor filtra o acesso profissional por vínculo ativo e compartilhamento atual. O acesso profissional exige MFA.

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
