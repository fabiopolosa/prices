import http from "node:http";

export const serviceName = "clustering-service";
const clusterVersion = "v1";
const sourceVersion = "m1-schema-v1";

const storeClusters = new Map([
  [
    "coop-roma-centro",
    {
      key: "cluster:rome-centro",
      label: "Rome Centro Cluster",
      areaKey: "rome-center",
      confidence: 0.93
    }
  ],
  [
    "conad-roma-centro",
    {
      key: "cluster:rome-centro",
      label: "Rome Centro Cluster",
      areaKey: "rome-center",
      confidence: 0.9
    }
  ],
  [
    "carrefour-roma-east",
    {
      key: "cluster:rome-est",
      label: "Rome East Cluster",
      areaKey: "rome-east",
      confidence: 0.89
    }
  ],
  [
    "esselunga-roma-north",
    {
      key: "cluster:rome-nord",
      label: "Rome North Cluster",
      areaKey: "rome-north",
      confidence: 0.91
    }
  ],
  [
    "conad-roma-south",
    {
      key: "cluster:rome-sud",
      label: "Rome South Cluster",
      areaKey: "rome-south",
      confidence: 0.88
    }
  ]
]);

const clustersByArea = new Map();
for (const cluster of storeClusters.values()) {
  const existing = clustersByArea.get(cluster.areaKey) ?? [];
  if (!existing.find((item) => item.key === cluster.key)) {
    existing.push(cluster);
    clustersByArea.set(cluster.areaKey, existing);
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toClusterResponse(storeKey, cluster) {
  return {
    storeKey,
    clusterVersion,
    cluster,
    lineage: {
      sourceTable: "pricing.store_ontology_links",
      sourceVersion
    }
  };
}

function toAreaResponse(areaKey, clusters) {
  return {
    areaKey,
    clusterVersion,
    count: clusters.length,
    items: clusters,
    lineage: {
      sourceTable: "pricing.store_ontology_links",
      sourceVersion
    }
  };
}

export function createServer() {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && (requestUrl.pathname === "/health" || requestUrl.pathname === "/v1/health")) {
      sendJson(res, 200, { ok: true, service: serviceName, version: clusterVersion });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/v1/clusters/stores/")) {
      const storeKey = normalizeKey(decodeURIComponent(requestUrl.pathname.split("/").at(-1) ?? ""));
      const cluster = storeClusters.get(storeKey);
      if (!cluster) {
        sendJson(res, 404, {
          error: "store cluster not found",
          service: serviceName
        });
        return;
      }

      sendJson(res, 200, toClusterResponse(storeKey, cluster));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/v1/clusters/areas/")) {
      const areaKey = normalizeKey(decodeURIComponent(requestUrl.pathname.split("/").at(-1) ?? ""));
      const clusters = clustersByArea.get(areaKey) ?? [];
      sendJson(res, 200, toAreaResponse(areaKey, clusters));
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
