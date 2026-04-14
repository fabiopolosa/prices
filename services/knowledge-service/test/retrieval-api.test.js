import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.js";

test("knowledge-service retrieval endpoint serves ranked results for product + area query", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/retrieval/search?query=whole%20milk&area=rome-center&limit=2`
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.retrievalVersion, "m2-hybrid-v1");
  assert.equal(body.area, "rome-center");
  assert.equal(body.results.length, 2);
  assert.equal(body.results[0].store.areaKey, "rome-center");
  assert.equal(body.results[0].lineage.ontology.service, "ontology-service");
  assert.equal(body.results[0].lineage.clustering.service, "clustering-service");
});
