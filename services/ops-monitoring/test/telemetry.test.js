import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.js";

async function startServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.json();
  return { response, body };
}

async function postJson(baseUrl, path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return { response, body };
}

test("telemetry contracts expose owners for activation, retention, quality, latency, and error metrics", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const { response, body } = await getJson(baseUrl, "/v1/telemetry/contracts");
  assert.equal(response.status, 200);

  const metrics = new Map(body.metrics.map((entry) => [entry.metric, entry]));
  assert.equal(metrics.get("activationRate").owner, "growth-analytics");
  assert.equal(metrics.get("day7RetentionRate").owner, "growth-analytics");
  assert.equal(metrics.get("dataQualityCoverage").owner, "data-platform-oncall");
  assert.equal(metrics.get("ingestionFailureRate").owner, "data-platform-oncall");
  assert.equal(metrics.get("retrievalRegressionRate").owner, "ranking-oncall");
  assert.equal(metrics.get("mapReadP95LatencyMs").owner, "maps-oncall");
});

test("telemetry emit stores labeled samples and dashboard/slo surfaces preserve shape", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const emit = await postJson(baseUrl, "/v1/telemetry/emit", {
    city: "rome",
    category: "grocery-core",
    source: "qa-backfill",
    labels: {
      pipeline: "pilot-city-rome"
    },
    signals: {
      activationRate: 0.5,
      mapReadP95LatencyMs: 318
    }
  });

  assert.equal(emit.response.status, 202);
  assert.equal(emit.body.emittedCount, 2);

  const activationMetric = emit.body.snapshot.metrics.find((entry) => entry.metric === "activationRate");
  assert.equal(activationMetric.value, 0.5);
  assert.equal(activationMetric.source, "qa-backfill");
  assert.equal(activationMetric.labels.pipeline, "pilot-city-rome");

  const { body: dashboard } = await getJson(baseUrl, "/v1/dashboard?city=rome&category=grocery-core");
  const activationKpi = dashboard.kpis.find((entry) => entry.metric === "activationRate");
  assert.equal(activationKpi.labels.city, "rome");
  assert.equal(activationKpi.labels.category, "grocery-core");
  assert.equal(activationKpi.labels.metric, "activationRate");

  const { body: slo } = await getJson(baseUrl, "/v1/slo?city=rome&category=grocery-core");
  const mapLatencySlo = slo.slos.find((entry) => entry.metric === "mapReadP95LatencyMs");
  assert.equal(mapLatencySlo.labels.city, "rome");
  assert.equal(mapLatencySlo.labels.category, "grocery-core");
  assert.equal(mapLatencySlo.labels.metric, "mapReadP95LatencyMs");
});

test("telemetry signals endpoint returns normalized metric labels for pilot path", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const { response, body } = await getJson(baseUrl, "/v1/telemetry/signals?city=rome&category=grocery-core");
  assert.equal(response.status, 200);
  assert.equal(body.metrics.length, 6);

  for (const metric of body.metrics) {
    assert.equal(metric.labels.city, "rome");
    assert.equal(metric.labels.category, "grocery-core");
    assert.equal(metric.labels.metric, metric.metric);
    assert.equal(typeof metric.labels.source, "string");
  }
});
