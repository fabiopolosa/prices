import { createHash } from "node:crypto";
import http from "node:http";

export const serviceName = "map-layer";

const apiVersion = "v1";
const supportedLayerTypes = ["coverage", "demand", "anomaly"];
const supportedLayerTypeSet = new Set(supportedLayerTypes);
const defaultSnapshotId = "pilot-rome-2026-04-01";

const pilotSnapshots = Object.freeze({
  [defaultSnapshotId]: Object.freeze({
    snapshotId: defaultSnapshotId,
    asOf: "2026-04-01T00:00:00.000Z",
    stores: Object.freeze([
      {
        id: "store-001",
        name: "Prati Market",
        city: "Rome",
        region: "LAZ",
        location: Object.freeze({ lat: 41.9142, lng: 12.4626 }),
        latestPrice: 2.09,
        baselinePrice: 2,
        coverageScore: 0.92,
        demandScore: 0.58
      },
      {
        id: "store-002",
        name: "Testaccio Alimentari",
        city: "Rome",
        region: "LAZ",
        location: Object.freeze({ lat: 41.8768, lng: 12.4768 }),
        latestPrice: 1.87,
        baselinePrice: 1.95,
        coverageScore: 0.84,
        demandScore: 0.66
      },
      {
        id: "store-003",
        name: "Termini Fresh",
        city: "Rome",
        region: "LAZ",
        location: Object.freeze({ lat: 41.901, lng: 12.5018 }),
        latestPrice: 2.19,
        baselinePrice: 2.05,
        coverageScore: 0.79,
        demandScore: 0.74
      },
      {
        id: "store-004",
        name: "Aurelio Coop",
        city: "Rome",
        region: "LAZ",
        location: Object.freeze({ lat: 41.9016, lng: 12.4346 }),
        latestPrice: 2.03,
        baselinePrice: 1.99,
        coverageScore: 0.9,
        demandScore: 0.52
      },
      {
        id: "store-005",
        name: "San Giovanni Market",
        city: "Rome",
        region: "LAZ",
        location: Object.freeze({ lat: 41.8857, lng: 12.5052 }),
        latestPrice: 2.24,
        baselinePrice: 2.08,
        coverageScore: 0.76,
        demandScore: 0.81
      },
      {
        id: "store-006",
        name: "Monti Bottega",
        city: "Rome",
        region: "LAZ",
        location: Object.freeze({ lat: 41.8956, lng: 12.4933 }),
        latestPrice: 1.96,
        baselinePrice: 2.02,
        coverageScore: 0.88,
        demandScore: 0.61
      }
    ])
  })
});

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
        reject(createHttpError(413, "request body too large"));
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
        reject(createHttpError(400, "invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBbox(rawBbox) {
  if (!rawBbox) {
    return null;
  }

  const values = rawBbox.split(",").map((value) => Number(value.trim()));
  if (values.length !== 4 || values.some((value) => Number.isNaN(value))) {
    throw createHttpError(400, "bbox must be minLng,minLat,maxLng,maxLat");
  }

  const [minLng, minLat, maxLng, maxLat] = values;
  if (minLng > maxLng || minLat > maxLat) {
    throw createHttpError(400, "bbox coordinates are invalid");
  }

  return { minLng, minLat, maxLng, maxLat };
}

function parseLayerType(rawLayerType, { required = false } = {}) {
  if (!rawLayerType) {
    if (required) {
      throw createHttpError(400, "layerType is required");
    }
    return "coverage";
  }

  const layerType = String(rawLayerType).trim().toLowerCase();
  if (!supportedLayerTypeSet.has(layerType)) {
    throw createHttpError(
      400,
      `layerType must be one of: ${supportedLayerTypes.join(", ")}`
    );
  }

  return layerType;
}

function parseLimit(rawLimit) {
  if (!rawLimit) {
    return 200;
  }

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 500) {
    throw createHttpError(400, "limit must be an integer between 1 and 500");
  }

  return parsed;
}

function getSnapshot(snapshots, snapshotId = defaultSnapshotId) {
  const snapshot = snapshots[snapshotId];
  if (!snapshot) {
    throw createHttpError(400, `snapshotId ${snapshotId} is not available`);
  }
  return snapshot;
}

function isStoreInBbox(store, bbox) {
  if (!bbox) {
    return true;
  }

  const { lat, lng } = store.location;
  return (
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}

function stableStoreProjection(stores) {
  return stores
    .map((store) => ({
      id: store.id,
      lat: store.location.lat,
      lng: store.location.lng,
      latestPrice: store.latestPrice,
      baselinePrice: store.baselinePrice,
      coverageScore: store.coverageScore,
      demandScore: store.demandScore
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function computeLayerVersion({ snapshotId, layerType, stores }) {
  const digestSource = JSON.stringify({
    snapshotId,
    layerType,
    stores: stableStoreProjection(stores)
  });

  const digest = createHash("sha256").update(digestSource).digest("hex").slice(0, 16);
  return `${apiVersion}-${layerType}-${digest}`;
}

function toStoreRecord(store) {
  return {
    id: store.id,
    name: store.name,
    city: store.city,
    region: store.region,
    location: store.location,
    latestPrice: store.latestPrice
  };
}

function toOverlayFeature(store, layerType) {
  const anomalyMagnitude = Number(
    (Math.abs(store.latestPrice - store.baselinePrice) / store.baselinePrice).toFixed(4)
  );

  const baseProperties = {
    storeId: store.id,
    storeName: store.name,
    city: store.city,
    region: store.region,
    latestPrice: store.latestPrice,
    baselinePrice: store.baselinePrice
  };

  if (layerType === "coverage") {
    return {
      type: "Feature",
      id: `${layerType}-${store.id}`,
      geometry: {
        type: "Point",
        coordinates: [store.location.lng, store.location.lat]
      },
      properties: {
        ...baseProperties,
        layerType,
        score: store.coverageScore
      }
    };
  }

  if (layerType === "demand") {
    return {
      type: "Feature",
      id: `${layerType}-${store.id}`,
      geometry: {
        type: "Point",
        coordinates: [store.location.lng, store.location.lat]
      },
      properties: {
        ...baseProperties,
        layerType,
        score: store.demandScore
      }
    };
  }

  return {
    type: "Feature",
    id: `${layerType}-${store.id}`,
    geometry: {
      type: "Point",
      coordinates: [store.location.lng, store.location.lat]
    },
    properties: {
      ...baseProperties,
      layerType,
      score: anomalyMagnitude,
      driftDirection:
        store.latestPrice > store.baselinePrice
          ? "above_baseline"
          : store.latestPrice < store.baselinePrice
            ? "below_baseline"
            : "at_baseline"
    }
  };
}

function createLayerDocument({ snapshotId, snapshot, layerType }) {
  const version = computeLayerVersion({ snapshotId, layerType, stores: snapshot.stores });
  const features = snapshot.stores
    .map((store) => toOverlayFeature(store, layerType))
    .sort((left, right) => left.properties.storeId.localeCompare(right.properties.storeId));

  return {
    manifest: {
      snapshotId,
      layerType,
      version,
      asOf: snapshot.asOf,
      featureCount: features.length,
      tilePath: `/v1/map/prices?snapshotId=${encodeURIComponent(snapshotId)}&layer=${layerType}&version=${version}`
    },
    features
  };
}

class LayerCatalog {
  constructor({ snapshots = pilotSnapshots } = {}) {
    this.snapshots = snapshots;
    this.layersByKey = new Map();

    for (const layerType of supportedLayerTypes) {
      this.buildLayer({ snapshotId: defaultSnapshotId, layerType });
    }
  }

  getSnapshot(snapshotId) {
    return getSnapshot(this.snapshots, snapshotId);
  }

  getLayerKey(snapshotId, layerType) {
    return `${snapshotId}:${layerType}`;
  }

  buildLayer({ snapshotId = defaultSnapshotId, layerType }) {
    const normalizedLayerType = parseLayerType(layerType, { required: true });
    const snapshot = this.getSnapshot(snapshotId);
    const layerDocument = createLayerDocument({
      snapshotId,
      snapshot,
      layerType: normalizedLayerType
    });

    this.layersByKey.set(this.getLayerKey(snapshotId, normalizedLayerType), layerDocument);
    return layerDocument.manifest;
  }

  buildLayers({ snapshotId = defaultSnapshotId, layerType = null } = {}) {
    if (layerType) {
      return [this.buildLayer({ snapshotId, layerType })];
    }

    return supportedLayerTypes.map((candidate) =>
      this.buildLayer({ snapshotId, layerType: candidate })
    );
  }

  getLayerDocument({ snapshotId = defaultSnapshotId, layerType }) {
    const normalizedLayerType = parseLayerType(layerType, { required: true });
    const key = this.getLayerKey(snapshotId, normalizedLayerType);
    if (!this.layersByKey.has(key)) {
      this.buildLayer({ snapshotId, layerType: normalizedLayerType });
    }

    return this.layersByKey.get(key);
  }

  listLatestManifests(snapshotId = defaultSnapshotId) {
    this.getSnapshot(snapshotId);
    return supportedLayerTypes.map((layerType) =>
      this.getLayerDocument({ snapshotId, layerType }).manifest
    );
  }

  queryStores({ snapshotId = defaultSnapshotId, bbox = null, limit = 200 }) {
    const snapshot = this.getSnapshot(snapshotId);

    return snapshot.stores
      .filter((store) => isStoreInBbox(store, bbox))
      .map(toStoreRecord)
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  queryOverlay({ snapshotId = defaultSnapshotId, layerType, bbox = null, version = null }) {
    const layerDocument = this.getLayerDocument({ snapshotId, layerType });
    if (version && version !== layerDocument.manifest.version) {
      throw createHttpError(
        409,
        `version ${version} does not match latest ${layerDocument.manifest.version}`
      );
    }

    const filteredFeatures = layerDocument.features.filter((feature) => {
      if (!bbox) {
        return true;
      }

      const [lng, lat] = feature.geometry.coordinates;
      return (
        lng >= bbox.minLng &&
        lng <= bbox.maxLng &&
        lat >= bbox.minLat &&
        lat <= bbox.maxLat
      );
    });

    return {
      manifest: layerDocument.manifest,
      features: filteredFeatures
    };
  }
}

function createMetricsBucket() {
  return {
    count: 0,
    failureCount: 0,
    lastLatencyMs: 0
  };
}

function createMetricsRegistry() {
  return {
    service: serviceName,
    version: apiVersion,
    startedAt: new Date().toISOString(),
    buildJobs: createMetricsBucket(),
    reads: {
      stores: createMetricsBucket(),
      prices: createMetricsBucket(),
      manifests: createMetricsBucket()
    }
  };
}

async function trackMetric(bucket, work) {
  const startedAt = process.hrtime.bigint();
  try {
    const result = await work();
    bucket.count += 1;
    return result;
  } catch (error) {
    bucket.failureCount += 1;
    throw error;
  } finally {
    const elapsed = process.hrtime.bigint() - startedAt;
    bucket.lastLatencyMs = Number(elapsed) / 1_000_000;
  }
}

function snapshotMetrics(metrics) {
  return {
    service: metrics.service,
    version: metrics.version,
    startedAt: metrics.startedAt,
    reportedAt: new Date().toISOString(),
    buildJobs: { ...metrics.buildJobs },
    reads: {
      stores: { ...metrics.reads.stores },
      prices: { ...metrics.reads.prices },
      manifests: { ...metrics.reads.manifests }
    }
  };
}

export function createServer(dependencies = {}) {
  const layerCatalog = dependencies.layerCatalog || new LayerCatalog();
  const metrics = dependencies.metrics || createMetricsRegistry();

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");

    try {
      if (req.method === "GET" && (requestUrl.pathname === "/health" || requestUrl.pathname === "/v1/health")) {
        sendJson(res, 200, { ok: true, service: serviceName, version: apiVersion });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/v1/metrics") {
        sendJson(res, 200, snapshotMetrics(metrics));
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/v1/layers/manifests/latest") {
        await trackMetric(metrics.reads.manifests, async () => {
          const snapshotId = requestUrl.searchParams.get("snapshotId") || defaultSnapshotId;
          const manifests = layerCatalog.listLatestManifests(snapshotId);
          sendJson(res, 200, {
            snapshotId,
            manifests
          });
        });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/v1/layers/build") {
        await trackMetric(metrics.buildJobs, async () => {
          const body = await parseBody(req);
          const snapshotId = body.snapshotId || defaultSnapshotId;
          const layerType = body.layerType ? parseLayerType(body.layerType, { required: true }) : null;
          const manifests = layerCatalog.buildLayers({ snapshotId, layerType });
          sendJson(res, 202, {
            status: "completed",
            snapshotId,
            manifestVersions: manifests.map((manifest) => manifest.version),
            manifests
          });
        });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/v1/map/stores") {
        await trackMetric(metrics.reads.stores, async () => {
          const snapshotId = requestUrl.searchParams.get("snapshotId") || defaultSnapshotId;
          const bbox = parseBbox(requestUrl.searchParams.get("bbox"));
          const limit = parseLimit(requestUrl.searchParams.get("limit"));

          const stores = layerCatalog.queryStores({ snapshotId, bbox, limit });
          sendJson(res, 200, {
            snapshotId,
            count: stores.length,
            items: stores
          });
        });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/v1/map/prices") {
        await trackMetric(metrics.reads.prices, async () => {
          const snapshotId = requestUrl.searchParams.get("snapshotId") || defaultSnapshotId;
          const layerType = parseLayerType(requestUrl.searchParams.get("layer"), { required: true });
          const bbox = parseBbox(requestUrl.searchParams.get("bbox"));
          const version = requestUrl.searchParams.get("version");

          const result = layerCatalog.queryOverlay({ snapshotId, layerType, bbox, version });
          sendJson(res, 200, {
            snapshotId,
            layerType,
            version: result.manifest.version,
            manifest: result.manifest,
            count: result.features.length,
            features: result.features
          });
        });
        return;
      }

      sendJson(res, 404, { error: "Not found", service: serviceName });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      sendJson(res, statusCode, {
        error: statusCode >= 500 ? "internal server error" : error.message,
        service: serviceName
      });
    }
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
