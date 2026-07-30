import assert from "node:assert/strict";

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
}

const results = [];

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
    endpoints: results,
  }),
);
