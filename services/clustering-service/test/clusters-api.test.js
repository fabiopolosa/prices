import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.js";

test("store cluster endpoint returns versioned assignment and lineage source", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/clusters/stores/coop-roma-centro`
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.storeKey, "coop-roma-centro");
  assert.equal(body.clusterVersion, "v1");
  assert.equal(body.cluster.key, "cluster:rome-centro");
  assert.equal(body.lineage.sourceTable, "pricing.store_ontology_links");
});

test("area cluster endpoint returns deterministic cluster list", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/clusters/areas/rome-center`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.areaKey, "rome-center");
  assert.equal(body.clusterVersion, "v1");
  assert.ok(body.count >= 1);
  assert.equal(body.items[0].key, "cluster:rome-centro");
});
