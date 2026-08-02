import assert from "node:assert/strict";

// Estas verificações de transporte deliberadamente falham contra a versão
// pública anterior ao deploy do lote de HTTPS/HSTS. Não remova as asserções
// para deixar o smoke verde antes da publicação.

const portalOrigins = [
  {
    name: "portal",
    http: "http://area-do-paciente.psico-mateus.workers.dev/",
    https: "https://area-do-paciente.psico-mateus.workers.dev/",
  },
  {
    name: "legacy-portal",
    http: "http://registros.psico-mateus.workers.dev/",
    https: "https://registros.psico-mateus.workers.dev/",
  },
];

const endpoints = [
  {
    name: "site",
    url: "https://psico-mateus.github.io/",
    kind: "page",
  },
  {
    name: "guide",
    url: "https://psico-mateus.github.io/guia-emocoes/",
    kind: "page",
  },
  {
    name: "portal",
    url: "https://area-do-paciente.psico-mateus.workers.dev/",
    kind: "portal",
  },
  {
    name: "legacy-portal",
    url: "https://registros.psico-mateus.workers.dev/",
    kind: "portal",
  },
  {
    name: "portal-health",
    url: "https://area-do-paciente.psico-mateus.workers.dev/api/portal/health",
    kind: "health",
  },
  {
    name: "legacy-portal-health",
    url: "https://registros.psico-mateus.workers.dev/api/portal/health",
    kind: "health",
  },
];

function assertPortalHeaders(response, name) {
  const header = (key) => response.headers.get(key) ?? "";
  assert.match(header("cache-control"), /(?:^|,)\s*no-store(?:,|$)/iu, `${name}: cache`);
  assert.match(header("content-security-policy"), /frame-ancestors 'none'/u, `${name}: CSP`);
  assert.match(header("content-security-policy"), /form-action 'self'/u, `${name}: formulários`);
  assert.equal(header("referrer-policy"), "no-referrer", `${name}: referência`);
  assert.equal(header("x-content-type-options"), "nosniff", `${name}: conteúdo`);
  assert.equal(header("x-frame-options"), "DENY", `${name}: molduras`);
  assert.match(header("x-robots-tag"), /noindex/u, `${name}: indexação`);
  assert.match(header("permissions-policy"), /camera=\(\)/u, `${name}: câmera`);
  assert.equal(
    header("strict-transport-security"),
    "max-age=31536000",
    `${name}: HSTS — esta asserção só passa após o deploy do lote de transporte`,
  );
}

const results = [];

for (const origin of portalOrigins) {
  const startedAt = performance.now();
  const response = await fetch(origin.http, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "text/html" },
  });

  assert.equal(
    response.status,
    308,
    `${origin.name}: HTTP deve redirecionar com 308 — o smoke só passa após o deploy`,
  );
  assert.equal(response.headers.get("location"), origin.https, `${origin.name}: destino HTTPS`);
  assert.equal(response.headers.get("set-cookie"), null, `${origin.name}: redirecionamento sem sessão`);
  await response.body?.cancel();

  results.push({
    name: `${origin.name}-http-redirect`,
    status: response.status,
    milliseconds: Math.round(performance.now() - startedAt),
  });
}

for (const endpoint of endpoints) {
  const startedAt = performance.now();
  const response = await fetch(endpoint.url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: endpoint.kind === "health" ? "application/json" : "text/html" },
  });

  assert.equal(response.status, 200, `${endpoint.name}: resposta HTTP`);
  assert.equal(
    response.headers.get("set-cookie"),
    null,
    `${endpoint.name}: consulta pública não deve criar sessão`,
  );

  if (endpoint.kind === "portal") assertPortalHeaders(response, endpoint.name);
  if (endpoint.kind === "health") {
    assert.match(
      response.headers.get("cache-control") ?? "",
      /(?:^|,)\s*no-store(?:,|$)/iu,
      `${endpoint.name}: cache`,
    );
    assert.deepEqual(await response.json(), { ok: true, mode: "production" });
  } else {
    await response.body?.cancel();
  }

  results.push({
    name: endpoint.name,
    status: response.status,
    milliseconds: Math.round(performance.now() - startedAt),
  });
}

console.log(
  JSON.stringify({
    ok: true,
    scope: "public-read-only",
    authenticated_requests: 0,
    production_writes: 0,
    transport_hardening_deployed: true,
    endpoints: results,
  }),
);
