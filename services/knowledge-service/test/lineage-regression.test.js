import assert from "node:assert/strict";
import test from "node:test";
import { searchCatalog } from "../src/retrieval.js";

test("regression guard keeps explainability and lineage fields on every result card", () => {
  const result = searchCatalog({
    query: "milk",
    limit: 5
  });

  assert.ok(result.results.length > 0);
  for (const card of result.results) {
    assert.equal(typeof card.explainability.finalScore, "number");
    assert.equal(typeof card.explainability.semanticScore, "number");
    assert.ok(Array.isArray(card.explainability.matchedTerms));

    assert.ok(Array.isArray(card.lineage.sourceTypes));
    assert.ok(card.lineage.sourceTypes.length > 0);
    assert.equal(card.lineage.ontology.version, "v1");
    assert.ok(Array.isArray(card.lineage.ontology.termKeys));
    assert.ok(card.lineage.ontology.termKeys.length > 0);
    assert.equal(card.lineage.clustering.version, "v1");
    assert.match(card.lineage.clustering.clusterKey, /^cluster:/);
  }
});
