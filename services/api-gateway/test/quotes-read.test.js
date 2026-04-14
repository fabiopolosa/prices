import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.js";

test("quotes read endpoint returns confidence and explainability metadata", async (t) => {
  const calls = [];
  const searchClient = {
    async searchQuotes(params) {
      calls.push(params);
      return {
        area: "rome-center",
        retrievalVersion: "m2-hybrid-v1",
        totalCandidates: 3,
        results: [
          {
            rank: 1,
            canonicalPriceId: "cp-1001",
            confidence: 0.93,
            explainability: {
              retrievalVersion: "m2-hybrid-v1",
              finalScore: 0.9731,
              lexicalScore: 1,
              semanticScore: 0.9402,
              structuredFilterScore: 1,
              matchedTerms: ["whole", "milk"]
            },
            lineage: {
              sourceTypes: ["merchant", "call_confirmed"],
              ontology: {
                service: "ontology-service",
                version: "v1",
                termKeys: ["category:dairy", "attribute:whole", "format:1l"]
              },
              clustering: {
                service: "clustering-service",
                version: "v1",
                clusterKey: "cluster:rome-centro",
                areaKey: "rome-center"
              }
            }
          }
        ]
      };
    }
  };

  const server = createServer({ searchClient });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/quotes:read?query=whole%20milk&area=rome-center&limit=2`,
    {
      headers: { "x-actor-role": "consumer", "x-tenant-id": "tenant-1" }
    }
  );

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], {
    query: "whole milk",
    area: "rome-center",
    limit: 2,
    tenantId: "tenant-1",
    requestId: response.headers.get("x-request-id")
  });
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].confidence, 0.93);
  assert.equal(body.results[0].explainability.retrievalVersion, "m2-hybrid-v1");
  assert.equal(body.results[0].lineage.ontology.version, "v1");
  assert.equal(body.results[0].lineage.clustering.clusterKey, "cluster:rome-centro");
});

test("quotes read endpoint enforces role boundary", async (t) => {
  const server = createServer({
    searchClient: {
      async searchQuotes() {
        throw new Error("should not call search client");
      }
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/quotes:read?query=whole%20milk`, {
    headers: { "x-actor-role": "guest", "x-tenant-id": "tenant-1" }
  });

  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, "Role not allowed for quote reads");
});
