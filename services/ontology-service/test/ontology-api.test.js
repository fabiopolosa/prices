import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.js";

test("product ontology endpoint returns versioned terms and lineage source", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/ontology/products/whole-milk-1l`
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.productKey, "whole-milk-1l");
  assert.equal(body.ontologyVersion, "v1");
  assert.ok(body.terms.length >= 1);
  assert.equal(body.lineage.sourceTable, "pricing.product_ontology_links");
});

test("store ontology endpoint returns 404 for unknown key", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/ontology/stores/unknown-store`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "store ontology not found");
});
