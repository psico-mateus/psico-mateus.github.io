import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PATIENT_ROUTE,
  patientHashForRoute,
  patientRouteFromHash,
  patientRoutesMatch,
} from "../app/patient-navigation.ts";

test("patient navigation parses only public, non-sensitive destinations", () => {
  assert.deepEqual(patientRouteFromHash(""), DEFAULT_PATIENT_ROUTE);
  assert.deepEqual(patientRouteFromHash("#inicio"), DEFAULT_PATIENT_ROUTE);
  assert.deepEqual(patientRouteFromHash("#registros"), {
    area: "records",
    resourceView: "index",
    toolId: null,
    educationSlug: null,
  });
  assert.deepEqual(patientRouteFromHash("#meu-mapa"), {
    area: "map",
    resourceView: "index",
    toolId: null,
    educationSlug: null,
  });
  assert.deepEqual(patientRouteFromHash("#recursos/ferramentas"), {
    area: "resources",
    resourceView: "tools",
    toolId: null,
    educationSlug: null,
  });
  assert.deepEqual(patientRouteFromHash("#recursos/ferramentas/voltar-ao-presente"), {
    area: "resources",
    resourceView: "tools",
    toolId: "voltar-ao-presente",
    educationSlug: null,
  });
  assert.deepEqual(patientRouteFromHash("#recursos/leituras/regulacao-emocional"), {
    area: "resources",
    resourceView: "readings",
    toolId: null,
    educationSlug: "regulacao-emocional",
  });
  assert.deepEqual(patientRouteFromHash("#registro/identificador-privado"), DEFAULT_PATIENT_ROUTE);
  assert.deepEqual(patientRouteFromHash("#recursos/leituras/%E0%A4%A"), {
    area: "resources",
    resourceView: "readings",
    toolId: null,
    educationSlug: null,
  });
  assert.deepEqual(patientRouteFromHash("#recursos/ferramentas/inexistente"), {
    area: "resources",
    resourceView: "tools",
    toolId: null,
    educationSlug: null,
  });
  assert.deepEqual(patientRouteFromHash("#recursos/leituras/inexistente"), {
    area: "resources",
    resourceView: "readings",
    toolId: null,
    educationSlug: null,
  });
  assert.deepEqual(patientRouteFromHash("#recursos/leituras/transtornos-de-ansiedade"), {
    area: "resources",
    resourceView: "readings",
    toolId: null,
    educationSlug: "ansiedade-generalizada-e-preocupacao-excessiva",
  });
});

test("patient navigation creates stable fragments and preserves public article slugs", () => {
  const routes = [
    DEFAULT_PATIENT_ROUTE,
    { area: "records", resourceView: "index", toolId: null, educationSlug: null },
    { area: "map", resourceView: "index", toolId: null, educationSlug: null },
    { area: "resources", resourceView: "index", toolId: null, educationSlug: null },
    { area: "resources", resourceView: "tools", toolId: null, educationSlug: null },
    {
      area: "resources",
      resourceView: "tools",
      toolId: "preparar-uma-conversa-dificil",
      educationSlug: null,
    },
    { area: "resources", resourceView: "readings", toolId: null, educationSlug: null },
    {
      area: "resources",
      resourceView: "readings",
      toolId: null,
      educationSlug: "regulacao-emocional",
    },
  ];

  for (const route of routes) {
    assert.equal(
      patientRoutesMatch(patientRouteFromHash(patientHashForRoute(route)), route),
      true,
    );
  }

  assert.equal(
    patientHashForRoute({
      area: "resources",
      resourceView: "readings",
      toolId: null,
      educationSlug: "tema com espaço",
    }),
    "#recursos/leituras/tema%20com%20espa%C3%A7o",
  );
});
