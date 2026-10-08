import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function worker() {
  const handlers = new Map();
  const state = { skips: 0, claims: 0, requests: [] };
  runInNewContext(source.replace("__CLIENT_BUILD_ID__", "1234567890abcdef"), {
    self: { location: { origin: "https://portal.example.test" },
      addEventListener: (type, handler) => handlers.set(type, handler),
      skipWaiting: () => { state.skips += 1; },
      clients: { claim: async () => { state.claims += 1; } },
    },
    URL,
    fetch: async (request) => { state.requests.push(request); return new Response("synthetic network only"); },
  });
  return { handlers, state };
}

test("worker informa build técnico sem ativar uma atualização por conta própria", () => {
  const { handlers, state } = worker();
  let build;
  handlers.get("message")({ data: { type: "GET_BUILD_ID" }, ports: [{ postMessage: (value) => { build = value.buildId; } }] });
  assert.equal(build, "1234567890abcdef");
  assert.equal(state.skips, 0);
  handlers.get("message")({ data: { type: "SKIP_WAITING" } });
  assert.equal(state.skips, 1);
});

test("worker encaminha GET autenticado à rede, sem guardar resposta clínica", async () => {
  const { handlers, state } = worker();
  const request = new Request("https://portal.example.test/api/portal/entries", { headers: { cookie: "synthetic-session" } });
  let response;
  handlers.get("fetch")({ request, respondWith: (value) => { response = value; } });
  assert.equal(await (await response).text(), "synthetic network only");
  assert.equal(state.requests[0], request);
});

test("worker não intercepta escritas nem requisições externas", () => {
  const { handlers, state } = worker();
  for (const request of [
    new Request("https://portal.example.test/api/portal/entries", { method: "POST" }),
    new Request("https://other.example.test/"),
  ]) handlers.get("fetch")({ request, respondWith: () => assert.fail("não deve interceptar") });
  assert.equal(state.requests.length, 0);
});
