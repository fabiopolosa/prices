import http from "node:http";
import {
  createTelemetryStore,
  defaultPilotScope,
  defaultSignals,
  metricContracts,
  metricNames
} from "./telemetry.js";

export const serviceName = "ops-monitoring";
export const apiVersion = "v1";

const kpiDefinitions = Object.freeze([
  {
    id: "activation-rate",
    title: "Activation rate",
    metric: "activationRate",
    unit: "ratio",
    target: 0.35
  },
  {
    id: "retention-d7",
    title: "D7 retention",
    metric: "day7RetentionRate",
    unit: "ratio",
    target: 0.25
  },
  {
    id: "data-quality-coverage",
    title: "Data quality coverage",
    metric: "dataQualityCoverage",
    unit: "ratio",
    target: 0.99
  }
]);

const sloDefinitions = Object.freeze([
  {
    id: "slo-ingestion-failure-rate",
    title: "Ingestion failure rate",
    description: "Share of ingestion requests that fail normalization or projection.",
    metric: "ingestionFailureRate",
    threshold: 0.02,
    unit: "ratio",
    window: "15m",
    alertRuleId: "alert-ingestion-failure",
    runbookPath: "/docs/playbooks/m3-go-no-go-operations.md#ingestion-failure",
    responders: ["data-platform-oncall", "founding-engineer"]
  },
  {
    id: "slo-retrieval-regression",
    title: "Retrieval regression rate",
    description: "Fraction of retrieval responses that regress versus baseline relevance.",
    metric: "retrievalRegressionRate",
    threshold: 0.05,
    unit: "ratio",
    window: "30m",
    alertRuleId: "alert-retrieval-regression",
    runbookPath: "/docs/playbooks/m3-go-no-go-operations.md#retrieval-regression",
    responders: ["ranking-oncall", "founding-engineer"]
  },
  {
    id: "slo-map-latency-p95",
    title: "Map read p95 latency",
    description: "95th percentile read latency for map overlays.",
    metric: "mapReadP95LatencyMs",
    threshold: 350,
    unit: "ms",
    window: "10m",
    alertRuleId: "alert-map-latency",
    runbookPath: "/docs/playbooks/m3-go-no-go-operations.md#map-latency-breach",
    responders: ["maps-oncall", "founding-engineer"]
  }
]);

const alertRules = Object.freeze(
  sloDefinitions.map((slo) => ({
    id: slo.alertRuleId,
    title: `${slo.title} breach`,
    summary: `Triggers when ${slo.title.toLowerCase()} breaches ${formatValue(
      slo.threshold,
      slo.unit
    )} over ${slo.window}.`,
    metric: slo.metric,
    comparator: ">",
    threshold: slo.threshold,
    unit: slo.unit,
    severity: "high",
    window: slo.window,
    runbookPath: slo.runbookPath,
    responders: slo.responders,
    sloId: slo.id
  }))
);

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

function normalizeScope(source = {}) {
  return {
    city:
      typeof source.city === "string" && source.city.trim().length > 0
        ? source.city.trim()
        : defaultPilotScope.city,
    category:
      typeof source.category === "string" && source.category.trim().length > 0
        ? source.category.trim()
        : defaultPilotScope.category
  };
}

function normalizeSignals(source = {}, baseline = defaultSignals) {
  const parsed = { ...baseline };
  for (const [key, value] of Object.entries(source)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && key in parsed) {
      parsed[key] = numeric;
    }
  }
  return parsed;
}

function formatValue(value, unit) {
  if (unit === "ratio") {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (unit === "ms") {
    return `${Math.round(value)} ms`;
  }
  return String(value);
}

function metadataForMetric(metric, signalMetadata = {}) {
  return signalMetadata[metric] || null;
}

function evaluateKpi(definition, signals, signalMetadata) {
  const value = signals[definition.metric];
  const metadata = metadataForMetric(definition.metric, signalMetadata);
  const status = value >= definition.target ? "healthy" : "at_risk";
  return {
    id: definition.id,
    title: definition.title,
    status,
    metric: definition.metric,
    observed: value,
    observedLabel: formatValue(value, definition.unit),
    target: definition.target,
    targetLabel: formatValue(definition.target, definition.unit),
    unit: definition.unit,
    owner: metadata?.owner || null,
    source: metadata?.source || null,
    labels: metadata?.labels || null
  };
}

function evaluateSlo(definition, signals, signalMetadata) {
  const observed = signals[definition.metric];
  const metadata = metadataForMetric(definition.metric, signalMetadata);
  const ratio = definition.threshold === 0 ? 0 : observed / definition.threshold;
  let status = "healthy";
  if (ratio > 1) {
    status = "breached";
  } else if (ratio >= 0.8) {
    status = "at_risk";
  }

  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    status,
    metric: definition.metric,
    observed,
    observedLabel: formatValue(observed, definition.unit),
    threshold: definition.threshold,
    thresholdLabel: formatValue(definition.threshold, definition.unit),
    burnRate: Number(ratio.toFixed(2)),
    unit: definition.unit,
    window: definition.window,
    alertRuleId: definition.alertRuleId,
    runbookPath: definition.runbookPath,
    responders: definition.responders,
    owner: metadata?.owner || null,
    source: metadata?.source || null,
    labels: metadata?.labels || null
  };
}

function evaluateRule(rule, signals, signalMetadata) {
  const observed = signals[rule.metric];
  const metadata = metadataForMetric(rule.metric, signalMetadata);
  let triggered = false;
  if (rule.comparator === ">") {
    triggered = observed > rule.threshold;
  } else if (rule.comparator === ">=") {
    triggered = observed >= rule.threshold;
  } else if (rule.comparator === "<") {
    triggered = observed < rule.threshold;
  } else if (rule.comparator === "<=") {
    triggered = observed <= rule.threshold;
  }

  return {
    ruleId: rule.id,
    title: rule.title,
    severity: rule.severity,
    triggered,
    runbookPath: rule.runbookPath,
    responders: rule.responders,
    evidence: {
      metric: rule.metric,
      observed,
      threshold: rule.threshold,
      comparator: rule.comparator,
      unit: rule.unit,
      observedLabel: formatValue(observed, rule.unit),
      thresholdLabel: formatValue(rule.threshold, rule.unit),
      window: rule.window,
      labels: metadata?.labels || null,
      owner: metadata?.owner || null,
      source: metadata?.source || null
    },
    metricLabels: metadata?.labels || null,
    metricOwner: metadata?.owner || null
  };
}

function buildDashboard({ scope, signals, signalMetadata }) {
  const kpis = kpiDefinitions.map((definition) =>
    evaluateKpi(definition, signals, signalMetadata)
  );
  const slos = sloDefinitions.map((definition) =>
    evaluateSlo(definition, signals, signalMetadata)
  );

  return {
    generatedAt: new Date().toISOString(),
    city: scope.city,
    category: scope.category,
    kpis,
    slos,
    panels: slos.map((slo) => ({
      id: `${slo.id}-panel`,
      title: `${slo.title} panel`,
      status: slo.status,
      runbookPath: slo.runbookPath,
      responders: slo.responders,
      alertRuleId: slo.alertRuleId
    }))
  };
}

function buildSloPayload({ scope, signals, signalMetadata }) {
  const slos = sloDefinitions.map((definition) =>
    evaluateSlo(definition, signals, signalMetadata)
  );
  return {
    generatedAt: new Date().toISOString(),
    city: scope.city,
    category: scope.category,
    summary: {
      healthy: slos.filter((slo) => slo.status === "healthy").length,
      atRisk: slos.filter((slo) => slo.status === "at_risk").length,
      breached: slos.filter((slo) => slo.status === "breached").length
    },
    slos
  };
}

function buildRulesPayload() {
  return {
    generatedAt: new Date().toISOString(),
    rules: alertRules
  };
}

function buildAdHocSignalMetadata(scope, source = "dry-run") {
  const emittedAt = new Date().toISOString();
  const metadata = {};
  for (const metric of metricNames) {
    const contract = metricContracts[metric];
    metadata[metric] = {
      owner: contract.owner,
      domain: contract.domain,
      kind: contract.kind,
      unit: contract.unit,
      source,
      emittedAt,
      automated: false,
      labels: {
        city: scope.city,
        category: scope.category,
        metric,
        source
      }
    };
  }
  return metadata;
}

function buildDryRunPayload({ scope, signals, signalMetadata }) {
  const evaluations = alertRules.map((rule) =>
    evaluateRule(rule, signals, signalMetadata)
  );
  const triggered = evaluations.filter((evaluation) => evaluation.triggered);
  const notTriggered = evaluations.filter((evaluation) => !evaluation.triggered);

  return {
    generatedAt: new Date().toISOString(),
    city: scope.city,
    category: scope.category,
    triggerCount: triggered.length,
    triggered,
    notTriggered
  };
}

function buildTelemetrySnapshotPayload(snapshot) {
  return {
    generatedAt: snapshot.generatedAt,
    city: snapshot.city,
    category: snapshot.category,
    metrics: metricNames.map((metric) => ({
      metric,
      value: snapshot.signals[metric],
      owner: snapshot.metadata[metric]?.owner || null,
      source: snapshot.metadata[metric]?.source || null,
      unit: snapshot.metadata[metric]?.unit || null,
      emittedAt: snapshot.metadata[metric]?.emittedAt || null,
      labels: snapshot.metadata[metric]?.labels || null
    }))
  };
}

export function createServer() {
  const telemetryStore = createTelemetryStore();

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (
      req.method === "GET" &&
      (requestUrl.pathname === "/health" || requestUrl.pathname === "/v1/health")
    ) {
      sendJson(res, 200, { ok: true, service: serviceName, version: apiVersion });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/slo") {
      const scope = normalizeScope({
        city: requestUrl.searchParams.get("city"),
        category: requestUrl.searchParams.get("category")
      });
      telemetryStore.emitPilotSignals(scope);
      const snapshot = telemetryStore.buildSnapshot(scope);
      const payload = buildSloPayload({
        scope,
        signals: snapshot.signals,
        signalMetadata: snapshot.metadata
      });
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/dashboard") {
      const scope = normalizeScope({
        city: requestUrl.searchParams.get("city"),
        category: requestUrl.searchParams.get("category")
      });
      telemetryStore.emitPilotSignals(scope);
      const snapshot = telemetryStore.buildSnapshot(scope);
      const payload = buildDashboard({
        scope,
        signals: snapshot.signals,
        signalMetadata: snapshot.metadata
      });
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/telemetry/contracts") {
      sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        pilotScope: defaultPilotScope,
        metrics: telemetryStore.listContracts()
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/telemetry/signals") {
      const scope = normalizeScope({
        city: requestUrl.searchParams.get("city"),
        category: requestUrl.searchParams.get("category")
      });
      telemetryStore.emitPilotSignals(scope);
      const snapshot = telemetryStore.buildSnapshot(scope);
      sendJson(res, 200, buildTelemetrySnapshotPayload(snapshot));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/telemetry/emissions") {
      const scope = normalizeScope({
        city: requestUrl.searchParams.get("city"),
        category: requestUrl.searchParams.get("category")
      });
      const limit = Number(requestUrl.searchParams.get("limit")) || 20;
      sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        city: scope.city,
        category: scope.category,
        items: telemetryStore.listRecentEmissions({
          scope,
          limit
        })
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/telemetry/emit") {
      try {
        const body = await parseBody(req);
        const scope = normalizeScope(body);
        const source =
          typeof body.source === "string" && body.source.trim().length > 0
            ? body.source.trim()
            : "manual";
        const labels = body.labels && typeof body.labels === "object" ? body.labels : {};

        let emitted = [];
        if (body.metric && Object.hasOwn(body, "value")) {
          emitted = [
            telemetryStore.emitSample({
              scope,
              metric: body.metric,
              value: body.value,
              source,
              labels
            })
          ];
        } else if (body.signals && typeof body.signals === "object") {
          emitted = telemetryStore.emitSignals({
            scope,
            signals: body.signals,
            source,
            labels
          });
          if (emitted.length === 0) {
            throw new Error("signals must include at least one supported metric");
          }
        } else {
          throw new Error("request requires either {metric, value} or {signals}");
        }

        const snapshot = telemetryStore.buildSnapshot(scope);
        sendJson(res, 202, {
          status: "emitted",
          city: scope.city,
          category: scope.category,
          emittedCount: emitted.length,
          emitted,
          snapshot: buildTelemetrySnapshotPayload(snapshot)
        });
      } catch (error) {
        sendJson(res, 400, {
          error: error.message,
          service: serviceName
        });
      }
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/v1/alerts/rules") {
      sendJson(res, 200, buildRulesPayload());
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/v1/alerts/dry-run") {
      try {
        const body = await parseBody(req);
        const scope = normalizeScope(body);
        const signals = normalizeSignals(body.signals, defaultSignals);
        const signalMetadata = buildAdHocSignalMetadata(scope);
        sendJson(res, 200, buildDryRunPayload({ scope, signals, signalMetadata }));
      } catch (error) {
        sendJson(res, 400, {
          error: error.message,
          service: serviceName
        });
      }
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
