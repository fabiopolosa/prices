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

test("SLO endpoint returns pilot city/category SLO views", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const { response, body } = await getJson(baseUrl, "/v1/slo?city=rome&category=grocery-core");

  assert.equal(response.status, 200);
  assert.equal(body.city, "rome");
  assert.equal(body.category, "grocery-core");
  assert.equal(body.slos.length, 3);
  assert.equal(body.summary.breached, 0);
  assert.equal(body.slos[0].runbookPath.includes("m3-go-no-go-operations.md"), true);
  assert.equal(body.slos[0].labels.city, "rome");
  assert.equal(body.slos[0].labels.category, "grocery-core");
  assert.equal(typeof body.slos[0].owner, "string");
});

test("dashboard endpoint includes KPI, SLO, runbook links, and responder routing", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const { response, body } = await getJson(baseUrl, "/v1/dashboard");

  assert.equal(response.status, 200);
  assert.equal(body.city, "rome");
  assert.equal(body.category, "grocery-core");
  assert.equal(body.kpis.length, 3);
  assert.equal(body.slos.length, 3);
  assert.equal(body.panels.length, 3);
  assert.equal(body.panels[0].runbookPath.includes("#"), true);
  assert.equal(Array.isArray(body.panels[0].responders), true);
  assert.equal(body.panels[0].responders.length > 0, true);
  assert.equal(body.kpis[0].labels.city, "rome");
  assert.equal(body.kpis[0].labels.category, "grocery-core");
  assert.equal(typeof body.kpis[0].source, "string");
});

test("alert dry-run fires rules with evidence for ingestion, retrieval, and map latency breaches", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const { response, body } = await postJson(baseUrl, "/v1/alerts/dry-run", {
    city: "rome",
    category: "grocery-core",
    signals: {
      ingestionFailureRate: 0.07,
      retrievalRegressionRate: 0.22,
      mapReadP95LatencyMs: 840
    }
  });

  assert.equal(response.status, 200);
  assert.equal(body.city, "rome");
  assert.equal(body.category, "grocery-core");
  assert.equal(body.triggerCount, 3);
  assert.equal(body.triggered.length, 3);
  assert.equal(body.triggered[0].evidence.observed > body.triggered[0].evidence.threshold, true);
  assert.equal(body.triggered[0].runbookPath.includes("m3-go-no-go-operations.md"), true);
});
