import http from "node:http";
import { DataStore } from "./dataStore.js";
import { EventBus } from "./eventBus.js";
import { IngestionService } from "./ingestionService.js";

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function createServer(dependencies = {}) {
  const dataStore = dependencies.dataStore || new DataStore();
  const eventBus = dependencies.eventBus || new EventBus();
  const ingestionService =
    dependencies.ingestionService || new IngestionService({ dataStore, eventBus });

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && req.url === "/admin/canonical-quotes") {
      sendJson(res, 200, { items: dataStore.listCanonicalQuotes() });
      return;
    }

    if (req.method === "GET" && req.url === "/admin/review-queue") {
      sendJson(res, 200, { items: dataStore.listReviewQueue() });
      return;
    }

    if (req.method === "GET" && req.url === "/admin/events") {
      sendJson(res, 200, { items: eventBus.listEvents() });
      return;
    }

    const match = req.url && req.url.match(/^\/ingest\/(ugc|merchant|call-confirmed)$/);
    if (req.method === "POST" && match) {
      try {
        const payload = await parseBody(req);
        const idempotencyKey = req.headers["idempotency-key"]
          ? String(req.headers["idempotency-key"])
          : null;
        const result = ingestionService.ingest({
          source: match[1],
          payload,
          idempotencyKey
        });
        sendJson(res, 202, result);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  return {
    server,
    dataStore,
    eventBus,
    ingestionService
  };
}

export function startServer({ port = 3000 } = {}) {
  const app = createServer();
  return new Promise((resolve) => {
    app.server.listen(port, () => {
      resolve(app);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  startServer({ port }).then(({ server }) => {
    const address = server.address();
    if (typeof address === "object" && address) {
      console.log(`Ingestion service listening on port ${address.port}`);
    }
  });
}
