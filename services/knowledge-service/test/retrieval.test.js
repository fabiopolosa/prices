import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRetrievalBaseline, searchCatalog } from "../src/retrieval.js";

test("searchCatalog applies area filter and returns explainability + lineage metadata", () => {
  const result = searchCatalog({
    query: "whole milk",
    area: "rome-center",
    limit: 3
  });

  assert.equal(result.retrievalVersion, "m2-hybrid-v1");
  assert.equal(result.area, "rome-center");
  assert.ok(result.results.length > 0);
  assert.ok(result.results.every((item) => item.store.areaKey === "rome-center"));
  assert.equal(result.results[0].product.key, "whole-milk-1l");
  assert.equal(typeof result.results[0].confidence, "number");
  assert.equal(typeof result.results[0].explainability.finalScore, "number");
  assert.ok(Array.isArray(result.results[0].explainability.matchedTerms));
  assert.ok(Array.isArray(result.results[0].lineage.sourceTypes));
  assert.ok(result.results[0].lineage.sourceTypes.length > 0);
  assert.equal(result.results[0].lineage.ontology.service, "ontology-service");
  assert.equal(result.results[0].lineage.ontology.version, "v1");
  assert.ok(result.results[0].lineage.ontology.termKeys.length > 0);
  assert.equal(result.results[0].lineage.clustering.service, "clustering-service");
  assert.equal(result.results[0].lineage.clustering.version, "v1");
  assert.match(result.results[0].lineage.clustering.clusterKey, /^cluster:/);
});

test("relevance baseline meets precision and recall thresholds at k=3", () => {
  const baseline = evaluateRetrievalBaseline({ k: 3 });

  assert.equal(baseline.retrievalVersion, "m2-hybrid-v1");
  assert.equal(baseline.k, 3);
  assert.equal(baseline.evaluatedQueries, 4);
  assert.ok(baseline.meanPrecisionAtK >= 0.41);
  assert.ok(baseline.meanRecallAtK >= 0.95);
});
