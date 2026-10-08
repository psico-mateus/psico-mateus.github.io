import assert from "node:assert/strict";
import test from "node:test";
import { createClientRequestId } from "../app/client-request-id.ts";

test("identificador usa randomUUID quando disponível", () => {
  assert.equal(createClientRequestId({ randomUUID: () => "synthetic-request-id", getRandomValues: () => assert.fail() }), "synthetic-request-id");
});

test("navegador sem randomUUID mantém envio deduplicável com 128 bits aleatórios", () => {
  const source = { getRandomValues: (values) => crypto.getRandomValues(values) };
  const first = createClientRequestId(source);
  const second = createClientRequestId(source);
  assert.match(first, /^[a-f0-9]{32}$/u);
  assert.match(second, /^[a-f0-9]{32}$/u);
  assert.notEqual(first, second);
});
