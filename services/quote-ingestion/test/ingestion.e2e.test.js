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

  const first = await postJson(baseUrl, "/v1/ingest/ugc", payload, {
    "idempotency-key": "retry-001"
  });
  const second = await postJson(baseUrl, "/v1/ingest/ugc", payload, {
    "idempotency-key": "retry-001"
  });

  assert.equal(first.status, 202);
  assert.equal(first.json.status, "accepted");
  assert.equal(second.status, 202);
  assert.equal(second.json.status, "duplicate");
  assert.equal(second.json.duplicateOfSubmissionId, first.json.submissionId);

  const quotes = await getJson(baseUrl, "/v1/canonical-quotes");
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

  const response = await postJson(baseUrl, "/v1/ingest/merchant", invalidPayload, {
    "idempotency-key": "bad-payload-001"
  });

  assert.equal(response.status, 202);
  assert.equal(response.json.status, "queued_for_review");

  const reviewQueue = await getJson(baseUrl, "/v1/review-queue");
  assert.equal(reviewQueue.items.length, 1);
  assert.equal(reviewQueue.items[0].source, "merchant");
  assert.match(reviewQueue.items[0].reason, /product requires/i);
});

test("event backbone fans out ingestion + confidence flows and materializes projection", async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(() => app.server.close());

  const quotePayload = {
    product: { name: "Pasta Fusilli", brand: "Acme Foods" },
    store: { name: "Centro Store", city: "Milan", region: "LOM" },
    currency: "EUR"
  };

  const merchant = await postJson(baseUrl, "/v1/ingest/merchant", {
    ...quotePayload,
    price: 1.99,
    sourceEventId: "merchant-001"
  });
  const ugc = await postJson(baseUrl, "/v1/ingest/ugc", {
    ...quotePayload,
    price: 2.19,
    sourceEventId: "ugc-001"
  });
  const callConfirmed = await postJson(baseUrl, "/v1/ingest/call-confirmed", {
    ...quotePayload,
    price: 2.09,
    sourceEventId: "call-001"
  });

  assert.equal(merchant.json.status, "accepted");
  assert.equal(ugc.json.status, "accepted");
  assert.equal(callConfirmed.json.status, "accepted");

  const quotes = await getJson(baseUrl, "/v1/canonical-quotes");
  assert.equal(quotes.items.length, 1);

  const canonical = quotes.items[0];
  const sources = canonical.lineages.map((item) => item.source).sort();
  assert.deepEqual(sources, ["call_confirmed", "merchant", "ugc"]);
  assert.equal(canonical.latestPrice, 1.99);
  assert.equal(canonical.winningSource, "merchant");

  const events = await getJson(baseUrl, "/admin/events");
  assert.equal(events.items.length, 6);

  const ingestedEvents = events.items.filter((event) => event.type === "quote.ingested.v1");
  const confidenceEvents = events.items.filter((event) => event.type === "quote.confidence.v1");

  assert.equal(ingestedEvents.length, 3);
  assert.equal(confidenceEvents.length, 3);
  for (const event of confidenceEvents) {
    assert.equal(event.schemaVersion, 1);
    assert.equal(typeof event.payload.confidence, "number");
    assert.match(event.payload.confidenceBand, /^(low|medium|high)$/);
  }

  const projection = await getJson(baseUrl, "/v1/confidence-projection");
  assert.equal(projection.items.length, 1);
  assert.equal(projection.items[0].appliedEvents, 3);
  assert.deepEqual(projection.items[0].sourceCounts, {
    merchant: 1,
    ugc: 1,
    call_confirmed: 1
  });

  const consumers = await getJson(baseUrl, "/v1/event-consumers");
  const consumerNames = consumers.items.map((item) => item.name).sort();
  assert.deepEqual(consumerNames, ["confidence-enricher", "confidence-projection"]);
});

test("replay rebuilds projection and idempotent consumers skip duplicates on re-run", async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(() => app.server.close());

  const quotePayload = {
    product: { name: "Olive Oil", brand: "Acme Foods" },
    store: { name: "North Store", city: "Milan", region: "LOM" },
    currency: "EUR"
  };

  await postJson(baseUrl, "/v1/ingest/merchant", {
    ...quotePayload,
    price: 5.2,
    sourceEventId: "merchant-100"
  });
  await postJson(baseUrl, "/v1/ingest/ugc", {
    ...quotePayload,
    price: 5.6,
    sourceEventId: "ugc-100"
  });
  await postJson(baseUrl, "/v1/ingest/call-confirmed", {
    ...quotePayload,
    price: 5.4,
    sourceEventId: "call-100"
  });

  const replayDesc = await postJson(baseUrl, "/v1/replay", {
    consumerName: "confidence-projection",
    fromSequence: 1,
    toSequence: 6,
    direction: "desc",
    resetConsumerState: true
  });
  assert.equal(replayDesc.status, 202);
  assert.equal(replayDesc.json.status, "replayed");
  assert.equal(replayDesc.json.deliveredCount, 3);
  assert.equal(replayDesc.json.failedCount, 0);

  const afterReplay = await getJson(baseUrl, "/v1/confidence-projection");
  assert.equal(afterReplay.items.length, 1);
  assert.equal(afterReplay.items[0].appliedEvents, 3);
  assert.equal(afterReplay.items[0].lastSource, "call_confirmed");
  assert.equal(afterReplay.items[0].sourceCounts.call_confirmed, 1);
  assert.equal(afterReplay.items[0].sourceCounts.merchant, 1);
  assert.equal(afterReplay.items[0].sourceCounts.ugc, 1);

  const replayAgain = await postJson(baseUrl, "/v1/replay", {
    consumerName: "confidence-projection",
    fromSequence: 1,
    toSequence: 6,
    direction: "desc",
    resetConsumerState: false
  });
  assert.equal(replayAgain.status, 202);
  assert.equal(replayAgain.json.status, "replayed");
  assert.equal(replayAgain.json.deliveredCount, 0);
  assert.equal(replayAgain.json.failedCount, 0);

  const afterSecondReplay = await getJson(baseUrl, "/v1/confidence-projection");
  assert.equal(afterSecondReplay.items.length, 1);
  assert.equal(afterSecondReplay.items[0].appliedEvents, 3);
});
