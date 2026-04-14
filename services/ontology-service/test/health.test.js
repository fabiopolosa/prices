import assert from "node:assert/strict";
import test from "node:test";
import { createServer, serviceName } from "../src/index.js";

test("ontology-service health endpoint reports service metadata", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, serviceName);
  assert.equal(body.version, "v1");
});
