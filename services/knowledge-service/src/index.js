import http from "node:http";
import { getProductEntity, getStoreEntity, searchCatalog } from "./retrieval.js";

export const serviceName = "knowledge-service";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseLimit(rawValue) {
  if (!rawValue) {
    return 10;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.min(25, Math.floor(parsed));
}

export function createServer() {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && (requestUrl.pathname === "/health" || requestUrl.pathname === "/v1/health")) {
      sendJson(res, 200, { ok: true, service: serviceName, version: "v1" });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/v1/entities/products/")) {
      const productKey = decodeURIComponent(requestUrl.pathname.split("/").at(-1) ?? "");
      const product = getProductEntity(productKey);
      if (!product) {
        sendJson(res, 404, { error: "Product not found", service: serviceName });
        return;
      }

      sendJson(res, 200, { product });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/v1/entities/stores/")) {
      const storeKey = decodeURIComponent(requestUrl.pathname.split("/").at(-1) ?? "");
      const store = getStoreEntity(storeKey);
      if (!store) {
        sendJson(res, 404, { error: "Store not found", service: serviceName });
        return;
      }

      sendJson(res, 200, { store });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/retrieval/search") {
      const query = requestUrl.searchParams.get("query");
      const area = requestUrl.searchParams.get("area");
      const limit = parseLimit(requestUrl.searchParams.get("limit"));

      if (!query || query.trim().length === 0) {
        sendJson(res, 400, { error: "query is required", service: serviceName });
        return;
      }

      const result = searchCatalog({ query, area, limit });
      sendJson(res, 200, result);
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
