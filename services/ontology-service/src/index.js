import http from "node:http";

export const serviceName = "ontology-service";
const ontologyVersion = "v1";
const sourceVersion = "m1-schema-v1";

const productOntology = new Map([
  [
    "whole-milk-1l",
    [
      { termKey: "category:dairy", domain: "category", label: "Dairy", confidence: 0.99 },
      { termKey: "attribute:whole", domain: "attribute", label: "Whole", confidence: 0.97 },
      { termKey: "format:1l", domain: "attribute", label: "1L", confidence: 0.95 }
    ]
  ],
  [
    "lactose-free-milk-1l",
    [
      { termKey: "category:dairy", domain: "category", label: "Dairy", confidence: 0.99 },
      {
        termKey: "attribute:lactose-free",
        domain: "attribute",
        label: "Lactose Free",
        confidence: 0.98
      },
      { termKey: "format:1l", domain: "attribute", label: "1L", confidence: 0.95 }
    ]
  ],
  [
    "spaghetti-500g",
    [
      {
        termKey: "category:dry-goods",
        domain: "category",
        label: "Dry Goods",
        confidence: 0.98
      },
      { termKey: "attribute:organic", domain: "attribute", label: "Organic", confidence: 0.92 },
      { termKey: "format:500g", domain: "attribute", label: "500g", confidence: 0.96 }
    ]
  ],
  [
    "olive-oil-1l",
    [
      { termKey: "category:condiments", domain: "category", label: "Condiments", confidence: 0.99 },
      {
        termKey: "attribute:extra-virgin",
        domain: "attribute",
        label: "Extra Virgin",
        confidence: 0.96
      },
      { termKey: "format:1l", domain: "attribute", label: "1L", confidence: 0.95 }
    ]
  ],
  [
    "sparkling-water-15l",
    [
      { termKey: "category:beverages", domain: "category", label: "Beverages", confidence: 0.98 },
      {
        termKey: "attribute:sparkling",
        domain: "attribute",
        label: "Sparkling",
        confidence: 0.95
      },
      { termKey: "format:1-5l", domain: "attribute", label: "1.5L", confidence: 0.94 }
    ]
  ],
  [
    "tomato-passata-700g",
    [
      { termKey: "category:condiments", domain: "category", label: "Condiments", confidence: 0.97 },
      { termKey: "attribute:tomato", domain: "attribute", label: "Tomato", confidence: 0.91 },
      { termKey: "format:700g", domain: "attribute", label: "700g", confidence: 0.95 }
    ]
  ]
]);

const storeOntology = new Map([
  [
    "coop-roma-centro",
    [
      {
        termKey: "cluster:rome-centro",
        domain: "store_cluster",
        label: "Rome Centro Cluster",
        confidence: 0.93
      }
    ]
  ],
  [
    "conad-roma-centro",
    [
      {
        termKey: "cluster:rome-centro",
        domain: "store_cluster",
        label: "Rome Centro Cluster",
        confidence: 0.9
      }
    ]
  ],
  [
    "carrefour-roma-east",
    [
      {
        termKey: "cluster:rome-est",
        domain: "store_cluster",
        label: "Rome East Cluster",
        confidence: 0.9
      }
    ]
  ],
  [
    "esselunga-roma-north",
    [
      {
        termKey: "cluster:rome-nord",
        domain: "store_cluster",
        label: "Rome North Cluster",
        confidence: 0.89
      }
    ]
  ],
  [
    "conad-roma-south",
    [
      {
        termKey: "cluster:rome-sud",
        domain: "store_cluster",
        label: "Rome South Cluster",
        confidence: 0.88
      }
    ]
  ]
]);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function notFound(res, resourceType) {
  sendJson(res, 404, {
    error: `${resourceType} ontology not found`,
    service: serviceName
  });
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toOntologyResponse(keyName, keyValue, terms) {
  return {
    [keyName]: keyValue,
    ontologyVersion,
    terms,
    lineage: {
      sourceTable:
        keyName === "productKey" ? "pricing.product_ontology_links" : "pricing.store_ontology_links",
      sourceVersion
    }
  };
}

export function createServer() {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && (requestUrl.pathname === "/health" || requestUrl.pathname === "/v1/health")) {
      sendJson(res, 200, { ok: true, service: serviceName, version: ontologyVersion });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/v1/ontology/products/")) {
      const productKey = normalizeKey(decodeURIComponent(requestUrl.pathname.split("/").at(-1) ?? ""));
      const terms = productOntology.get(productKey);
      if (!terms) {
        notFound(res, "product");
        return;
      }

      sendJson(res, 200, toOntologyResponse("productKey", productKey, terms));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/v1/ontology/stores/")) {
      const storeKey = normalizeKey(decodeURIComponent(requestUrl.pathname.split("/").at(-1) ?? ""));
      const terms = storeOntology.get(storeKey);
      if (!terms) {
        notFound(res, "store");
        return;
      }

      sendJson(res, 200, toOntologyResponse("storeKey", storeKey, terms));
      return;
    }

    sendJson(res, 404, { error: "Not found", service: serviceName });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const server = createServer();
  server.listen(port, () => {
    const address = server.address();
    if (typeof address === "object" && address) {
      console.log(`${serviceName} listening on port ${address.port}`);
    }
  });
}
