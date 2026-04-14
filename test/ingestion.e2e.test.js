import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/server.js";

async function startTestServer() {
  const app = createServer();
  await new Promise((resolve) => app.server.listen(0, resolve));
  const address = app.server.address();
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function postJson(baseUrl, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    json: await response.json()
  };
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  return response.json();
}

test("handles idempotent retries and preserves lineage", async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(() => app.server.close());

  const payload = {
    product: { sku: "MILK-1L", name: "Whole Milk" },
    store: { externalId: "S-001", name: "Roma Market", city: "Rome" },
    price: 1.89,
    currency: "EUR",
    sourceEventId: "ugc-evt-1"
  };

  const first = await postJson(baseUrl, "/ingest/ugc", payload, {
    "idempotency-key": "retry-001"
  });
  const second = await postJson(baseUrl, "/ingest/ugc", payload, {
    "idempotency-key": "retry-001"
  });

  assert.equal(first.status, 202);
  assert.equal(first.json.status, "accepted");
  assert.equal(second.status, 202);
  assert.equal(second.json.status, "duplicate");
  assert.equal(second.json.duplicateOfSubmissionId, first.json.submissionId);

  const quotes = await getJson(baseUrl, "/admin/canonical-quotes");
  assert.equal(quotes.items.length, 1);
  assert.equal(quotes.items[0].lineages.length, 1);
});

test("failed normalization is stored in recoverable review queue", async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(() => app.server.close());

  const invalidPayload = {
    product: {},
    store: { name: "Unknown" },
    price: -1
  };

  const response = await postJson(baseUrl, "/ingest/merchant", invalidPayload, {
    "idempotency-key": "bad-payload-001"
  });

  assert.equal(response.status, 202);
  assert.equal(response.json.status, "queued_for_review");

  const reviewQueue = await getJson(baseUrl, "/admin/review-queue");
  assert.equal(reviewQueue.items.length, 1);
  assert.equal(reviewQueue.items[0].source, "merchant");
  assert.match(reviewQueue.items[0].reason, /product requires/i);
});

test("end-to-end ingestion writes canonical data from all three source types", async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(() => app.server.close());

  const quotePayload = {
    product: { name: "Pasta Fusilli", brand: "Acme Foods" },
    store: { name: "Centro Store", city: "Milan", region: "LOM" },
    currency: "EUR"
  };

  const merchant = await postJson(baseUrl, "/ingest/merchant", {
    ...quotePayload,
    price: 1.99,
    sourceEventId: "merchant-001"
  });
  const ugc = await postJson(baseUrl, "/ingest/ugc", {
    ...quotePayload,
    price: 2.19,
    sourceEventId: "ugc-001"
  });
  const callConfirmed = await postJson(baseUrl, "/ingest/call-confirmed", {
    ...quotePayload,
    price: 2.09,
    sourceEventId: "call-001"
  });

  assert.equal(merchant.json.status, "accepted");
  assert.equal(ugc.json.status, "accepted");
  assert.equal(callConfirmed.json.status, "accepted");

  const quotes = await getJson(baseUrl, "/admin/canonical-quotes");
  assert.equal(quotes.items.length, 1);

  const canonical = quotes.items[0];
  const sources = canonical.lineages.map((item) => item.source).sort();
  assert.deepEqual(sources, ["call_confirmed", "merchant", "ugc"]);
  assert.equal(canonical.latestPrice, 1.99);
  assert.equal(canonical.winningSource, "merchant");

  const events = await getJson(baseUrl, "/admin/events");
  assert.equal(events.items.length, 3);
  for (const event of events.items) {
    assert.equal(event.type, "quote.confidence.v1");
    assert.equal(event.schemaVersion, 1);
    assert.equal(typeof event.payload.confidence, "number");
  }
});
