import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PATIENT_MAP_CATALOG,
  PATIENT_MAP_CONTENT_VERSION,
  PATIENT_MAP_RESPONSES,
} from "../content/patient-map-catalog.ts";

const EXPECTED_RESPONSE_LABELS = [
  "Combina comigo",
  "Tenho curiosidade",
  "Depende do contexto",
  "Só tolero",
  "Não combina",
  "Ainda não sei",
];

const EXPECTED_MAP_IDS = [
  "meu-jeito",
  "interesses",
  "vinculos",
  "limites",
  "futuro",
];

test("preserva a versão e as seis respostas editoriais canônicas", () => {
  assert.equal(PATIENT_MAP_CATALOG.contentVersion, PATIENT_MAP_CONTENT_VERSION);
  assert.equal(PATIENT_MAP_CONTENT_VERSION, "mapa-pessoal-refinado-ouro-v1");
  assert.equal(PATIENT_MAP_RESPONSES.length, 6);
  assert.deepEqual(
    PATIENT_MAP_RESPONSES.map((option) => option.label),
    EXPECTED_RESPONSE_LABELS,
  );
  assert.equal(
    new Set(PATIENT_MAP_RESPONSES.map((option) => option.key)).size,
    PATIENT_MAP_RESPONSES.length,
  );
});

test("preserva integralmente a abertura e a síntese da planilha", () => {
  assert.equal(
    PATIENT_MAP_CATALOG.landing.website,
    "psico-mateus.github.io",
  );
  assert.deepEqual(PATIENT_MAP_CATALOG.landing.highlights, [
    "5\nmapas de exploração",
    "150\npistas com exemplos",
    "1\nsíntese pessoal",
  ]);
  assert.equal(PATIENT_MAP_CATALOG.summary.areaLabels.length, 5);
  assert.equal(PATIENT_MAP_CATALOG.summary.prompts.length, 6);

  const openingAndSummaryDigest = createHash("sha256")
    .update(
      JSON.stringify({
        landing: PATIENT_MAP_CATALOG.landing,
        summary: PATIENT_MAP_CATALOG.summary,
      }),
    )
    .digest("hex");

  assert.equal(
    openingAndSummaryDigest,
    "267f9b7b0c3aa7f1648719edd7e1f7bddf0e78635807b87029b5764bfe994082",
    "mudanças na abertura ou síntese exigem revisão editorial",
  );
});

test("contém cinco mapas, 25 seções e 150 itens", () => {
  assert.deepEqual(
    PATIENT_MAP_CATALOG.maps.map((map) => map.id),
    EXPECTED_MAP_IDS,
  );

  const sections = PATIENT_MAP_CATALOG.maps.flatMap((map) => map.sections);
  const items = sections.flatMap((section) => section.items);

  assert.equal(PATIENT_MAP_CATALOG.maps.length, 5);
  assert.equal(sections.length, 25);
  assert.equal(items.length, 150);

  for (const map of PATIENT_MAP_CATALOG.maps) {
    assert.equal(map.sections.length, 5, map.id);
    assert.equal(
      map.sections.reduce((total, section) => total + section.items.length, 0),
      30,
      map.id,
    );
  }

  for (const section of sections) {
    assert.equal(section.items.length, 6, section.id);
  }
});

test("usa IDs globais únicos e ordem explícita sem confundir o ID local", () => {
  const sections = PATIENT_MAP_CATALOG.maps.flatMap((map) => map.sections);
  const items = sections.flatMap((section) => section.items);
  const globalIds = [
    ...PATIENT_MAP_CATALOG.maps.map((map) => map.id),
    ...sections.map((section) => section.id),
    ...items.map((item) => item.id),
  ];

  assert.equal(new Set(globalIds).size, globalIds.length);

  PATIENT_MAP_CATALOG.maps.forEach((map, mapIndex) => {
    assert.equal(map.order, mapIndex + 1);
    assert.equal(map.active, true);

    map.sections.forEach((section, sectionIndex) => {
      const expectedSection = String(sectionIndex + 1).padStart(2, "0");
      assert.equal(section.order, sectionIndex + 1);
      assert.equal(section.active, true);
      assert.equal(section.localId, expectedSection);
      assert.equal(section.id, map.id + ".section." + expectedSection);

      section.items.forEach((item, itemIndex) => {
        const expectedLocalId = expectedSection + "." + (itemIndex + 1);
        assert.equal(item.order, itemIndex + 1);
        assert.equal(item.active, true);
        assert.equal(item.localId, expectedLocalId);
        assert.equal(item.id, map.id + "." + expectedLocalId);
      });
    });
  });
});

test("não introduz pesos, pontos ou propriedades de pontuação", () => {
  const propertyNames = [];

  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    for (const [key, nestedValue] of Object.entries(value)) {
      propertyNames.push(
        key.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
      );
      visit(nestedValue);
    }
  };

  visit(PATIENT_MAP_CATALOG);

  const forbidden = propertyNames.filter((key) =>
    /^(weight|weights|score|scores|point|points|pontuacao|peso|pesos)$/.test(key),
  );

  assert.deepEqual(forbidden, []);
});

test("mantém a estrutura editorial integral auditada da planilha", () => {
  const removeOrderingMetadata = (value) => {
    if (Array.isArray(value)) return value.map(removeOrderingMetadata);
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "order" && key !== "active")
        .map(([key, nestedValue]) => [key, removeOrderingMetadata(nestedValue)]),
    );
  };

  const editorialDigest = createHash("sha256")
    .update(JSON.stringify(removeOrderingMetadata(PATIENT_MAP_CATALOG.maps)))
    .digest("hex");

  assert.equal(
    editorialDigest,
    "bc87892a86b517735a501ca420b52871af147741773b5f5d696d0115941c4ca2",
    "qualquer mudança editorial exige revisão e nova contentVersion",
  );

  assert.equal(
    PATIENT_MAP_CATALOG.maps[0].sections[0].items[0].title,
    "Ter tempo sozinho",
  );
  assert.equal(
    PATIENT_MAP_CATALOG.maps[4].sections[4].items[5].title,
    "Viver de forma mais coerente com meus valores",
  );
  assert.match(
    PATIENT_MAP_CATALOG.summary.disclaimer,
    /não são pontuação nem diagnóstico/i,
  );
});
