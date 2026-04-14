import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.js";

async function startTestServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function get(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const json = await response.json();
  return { status: response.status, json };
}

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  return { status: response.status, json };
}

test("map stores and overlays are deterministic for pilot fixtures", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const bbox = "12.4300,41.8700,12.5100,41.9200";
  const storesA = await get(baseUrl, `/v1/map/stores?bbox=${bbox}`);
  const storesB = await get(baseUrl, `/v1/map/stores?bbox=${bbox}`);

  assert.equal(storesA.status, 200);
  assert.equal(storesB.status, 200);
  assert.equal(storesA.json.count, storesB.json.count);
  assert.deepEqual(storesA.json.items, storesB.json.items);

  const pricesA = await get(baseUrl, `/v1/map/prices?layer=coverage&bbox=${bbox}`);
  const pricesB = await get(baseUrl, `/v1/map/prices?layer=coverage&bbox=${bbox}`);

  assert.equal(pricesA.status, 200);
  assert.equal(pricesB.status, 200);
  assert.equal(pricesA.json.version, pricesB.json.version);
  assert.deepEqual(pricesA.json.features, pricesB.json.features);
  assert.match(pricesA.json.version, /^v1-coverage-/);
});

test("layer build returns reproducible versions for same snapshot", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const firstBuild = await post(baseUrl, "/v1/layers/build", {
    snapshotId: "pilot-rome-2026-04-01",
    layerType: "anomaly"
  });

  const secondBuild = await post(baseUrl, "/v1/layers/build", {
    snapshotId: "pilot-rome-2026-04-01",
    layerType: "anomaly"
  });

  assert.equal(firstBuild.status, 202);
  assert.equal(secondBuild.status, 202);
  assert.equal(firstBuild.json.manifestVersions.length, 1);
  assert.equal(secondBuild.json.manifestVersions.length, 1);
  assert.equal(firstBuild.json.manifestVersions[0], secondBuild.json.manifestVersions[0]);

  const latest = await get(baseUrl, "/v1/layers/manifests/latest?snapshotId=pilot-rome-2026-04-01");
  assert.equal(latest.status, 200);

  const anomalyManifest = latest.json.manifests.find((manifest) => manifest.layerType === "anomaly");
  assert.equal(anomalyManifest.version, firstBuild.json.manifestVersions[0]);
});

test("metrics include latency and failure counters for build and read paths", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const successBuild = await post(baseUrl, "/v1/layers/build", { layerType: "coverage" });
  assert.equal(successBuild.status, 202);

  const successRead = await get(baseUrl, "/v1/map/prices?layer=demand");
  assert.equal(successRead.status, 200);

  const readFailure = await get(baseUrl, "/v1/map/stores?bbox=invalid");
  assert.equal(readFailure.status, 400);

  const buildFailure = await post(baseUrl, "/v1/layers/build", {
    snapshotId: "pilot-missing",
    layerType: "coverage"
  });
  assert.equal(buildFailure.status, 400);

  const metrics = await get(baseUrl, "/v1/metrics");
  assert.equal(metrics.status, 200);

  assert.equal(metrics.json.buildJobs.count, 1);
  assert.equal(metrics.json.buildJobs.failureCount, 1);
  assert.ok(metrics.json.buildJobs.lastLatencyMs >= 0);

  assert.equal(metrics.json.reads.prices.count, 1);
  assert.equal(metrics.json.reads.stores.failureCount, 1);
  assert.ok(metrics.json.reads.prices.lastLatencyMs >= 0);
});
