import http from "node:http";
import crypto from "node:crypto";

export const serviceName = "api-gateway";
const ALLOWED_READ_ROLES = new Set(["consumer", "moderator", "ops", "admin"]);
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 100;

const rateLimits = new Map();

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function getRateLimitKey(req) {
  return req.headers["x-tenant-id"] ?? req.socket.remoteAddress ?? "unknown";
}

function isRateLimited(key) {
  const now = Date.now();
  const limit = rateLimits.get(key) ?? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > limit.resetAt) {
    limit.count = 1;
    limit.resetAt = now + RATE_LIMIT_WINDOW_MS;
  } else {
    limit.count++;
  }

  rateLimits.set(key, limit);
  return limit.count > MAX_REQUESTS_PER_WINDOW;
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

function authorizeReadRequest(req) {
  const roleHeader = req.headers["x-actor-role"];
  const role = String(Array.isArray(roleHeader) ? roleHeader[0] : roleHeader ?? "consumer").toLowerCase();
  const tenantId = req.headers["x-tenant-id"];

  if (!tenantId) {
    return { ok: false, error: "x-tenant-id header is required", statusCode: 401 };
  }

  if (!ALLOWED_READ_ROLES.has(role)) {
    return { ok: false, error: "Role not allowed for quote reads", role, statusCode: 403 };
  }

  return { ok: true, role, tenantId };
}

export function createKnowledgeSearchClient({ baseUrl = process.env.KNOWLEDGE_SERVICE_URL ?? "http://127.0.0.1:4101" } = {}) {
  return {
    async searchQuotes({ query, area, limit, tenantId, requestId }) {
      const requestUrl = new URL("/v1/retrieval/search", baseUrl);
      requestUrl.searchParams.set("query", query);
      if (area) {
        requestUrl.searchParams.set("area", area);
      }
      requestUrl.searchParams.set("limit", String(limit));

      const response = await fetch(requestUrl, {
        headers: {
          "x-tenant-id": tenantId,
          "x-request-id": requestId
        }
      });

      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { error: "unknown downstream error" };
        }
        const message = typeof errorBody?.error === "string" ? errorBody.error : "downstream retrieval failed";
        throw new Error(message);
      }

      return response.json();
    }
  };
}

async function handleRequest(req, res, { searchClient, authorizeRead }) {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const requestId = req.headers["x-request-id"] ?? crypto.randomUUID();
  const rateLimitKey = getRateLimitKey(req);

  if (isRateLimited(rateLimitKey)) {
    sendJson(res, 429, { error: "Too many requests", service: serviceName }, { "x-request-id": requestId });
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/health" || requestUrl.pathname === "/v1/health")) {
    sendJson(res, 200, { ok: true, service: serviceName, version: "v1" }, { "x-request-id": requestId });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/v1/quotes:ingest") {
    sendJson(res, 202, {
      accepted: true,
      service: serviceName,
      message: "Quote ingest request accepted for asynchronous processing."
    }, { "x-request-id": requestId });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/v1/quotes:read") {
    const auth = authorizeRead(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, {
        error: auth.error,
        role: auth.role,
        service: serviceName
      }, { "x-request-id": requestId });
      return;
    }

    const query = requestUrl.searchParams.get("query") ?? requestUrl.searchParams.get("q");
    const area = requestUrl.searchParams.get("area");
    const limit = parseLimit(requestUrl.searchParams.get("limit"));

    if (!query || query.trim().length === 0) {
      sendJson(res, 400, { error: "query is required", service: serviceName }, { "x-request-id": requestId });
      return;
    }

    try {
      const retrieval = await searchClient.searchQuotes({
        query,
        area,
        limit,
        tenantId: auth.tenantId,
        requestId
      });
      sendJson(res, 200, {
        query,
        area: retrieval.area,
        retrievalVersion: retrieval.retrievalVersion,
        totalCandidates: retrieval.totalCandidates,
        totalResults: retrieval.results.length,
        role: auth.role,
        results: retrieval.results
      }, { "x-request-id": requestId });
    } catch (error) {
      sendJson(res, 502, {
        error: "Failed to query retrieval service",
        detail: error instanceof Error ? error.message : "unknown error",
        service: serviceName
      }, { "x-request-id": requestId });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found", service: serviceName }, { "x-request-id": requestId });
}

export function createServer({
  searchClient = createKnowledgeSearchClient(),
  authorizeRead = authorizeReadRequest
} = {}) {
  return http.createServer((req, res) => {
    handleRequest(req, res, { searchClient, authorizeRead }).catch((error) => {
      sendJson(res, 500, {
        error: "Unexpected gateway failure",
        detail: error instanceof Error ? error.message : "unknown error",
        service: serviceName
      });
    });
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
