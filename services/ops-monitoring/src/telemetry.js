const defaultPilotScope = Object.freeze({
  city: "rome",
  category: "grocery-core"
});

const defaultSignals = Object.freeze({
  activationRate: 0.41,
  day7RetentionRate: 0.29,
  dataQualityCoverage: 0.994,
  ingestionFailureRate: 0.007,
  retrievalRegressionRate: 0.018,
  mapReadP95LatencyMs: 272
});

const metricContracts = Object.freeze({
  activationRate: Object.freeze({
    metric: "activationRate",
    title: "Activation rate",
    domain: "activation",
    kind: "gauge",
    unit: "ratio",
    owner: "growth-analytics"
  }),
  day7RetentionRate: Object.freeze({
    metric: "day7RetentionRate",
    title: "D7 retention rate",
    domain: "retention",
    kind: "gauge",
    unit: "ratio",
    owner: "growth-analytics"
  }),
  dataQualityCoverage: Object.freeze({
    metric: "dataQualityCoverage",
    title: "Data quality coverage",
    domain: "data_quality",
    kind: "gauge",
    unit: "ratio",
    owner: "data-platform-oncall"
  }),
  ingestionFailureRate: Object.freeze({
    metric: "ingestionFailureRate",
    title: "Ingestion failure rate",
    domain: "error",
    kind: "rate",
    unit: "ratio",
    owner: "data-platform-oncall"
  }),
  retrievalRegressionRate: Object.freeze({
    metric: "retrievalRegressionRate",
    title: "Retrieval regression rate",
    domain: "error",
    kind: "rate",
    unit: "ratio",
    owner: "ranking-oncall"
  }),
  mapReadP95LatencyMs: Object.freeze({
    metric: "mapReadP95LatencyMs",
    title: "Map read p95 latency",
    domain: "latency",
    kind: "p95",
    unit: "ms",
    owner: "maps-oncall"
  })
});

const metricNames = Object.freeze(Object.keys(metricContracts));
const knownMetricSet = new Set(metricNames);

function normalizeScope(source = {}, fallbackScope = defaultPilotScope) {
  return {
    city:
      typeof source.city === "string" && source.city.trim().length > 0
        ? source.city.trim()
        : fallbackScope.city,
    category:
      typeof source.category === "string" && source.category.trim().length > 0
        ? source.category.trim()
        : fallbackScope.category
  };
}

function createScopeMetricKey(scope, metric) {
  return `${scope.city}:${scope.category}:${metric}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function sanitizeLabelValue(value) {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function sanitizeExtraLabels(extraLabels = {}) {
  const labels = {};
  for (const [labelKey, labelValue] of Object.entries(extraLabels)) {
    if (!labelKey) {
      continue;
    }
    const value = sanitizeLabelValue(labelValue);
    if (value !== undefined) {
      labels[labelKey] = value;
    }
  }
  return labels;
}

function buildMetricLabels({ scope, metric, source, extraLabels = {} }) {
  return {
    city: scope.city,
    category: scope.category,
    metric,
    source,
    ...sanitizeExtraLabels(extraLabels)
  };
}

function toFiniteNumber(value, metric) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${metric} must be a finite number`);
  }
  return numeric;
}

function buildPilotSignals({ baselineSignals, now }) {
  const minuteBucket = Math.floor(now / 60_000);
  const wave = (minuteBucket % 7) - 3;

  return {
    activationRate: clamp(baselineSignals.activationRate + wave * 0.003, 0, 1),
    day7RetentionRate: clamp(baselineSignals.day7RetentionRate + wave * 0.0025, 0, 1),
    dataQualityCoverage: clamp(baselineSignals.dataQualityCoverage - Math.abs(wave) * 0.0004, 0, 1),
    ingestionFailureRate: clamp(baselineSignals.ingestionFailureRate + Math.max(wave, 0) * 0.0015, 0, 1),
    retrievalRegressionRate: clamp(
      baselineSignals.retrievalRegressionRate + Math.max(wave - 1, 0) * 0.0012,
      0,
      1
    ),
    mapReadP95LatencyMs: Math.max(0, baselineSignals.mapReadP95LatencyMs + wave * 12)
  };
}

function metadataFromContract({
  scope,
  metric,
  source,
  emittedAt,
  automated = false,
  extraLabels = {}
}) {
  const contract = metricContracts[metric];
  return {
    metric,
    owner: contract.owner,
    domain: contract.domain,
    kind: contract.kind,
    unit: contract.unit,
    source,
    emittedAt,
    automated,
    labels: buildMetricLabels({
      scope,
      metric,
      source,
      extraLabels
    })
  };
}

export function createTelemetryStore({
  pilotScope = defaultPilotScope,
  baselineSignals = defaultSignals,
  now = () => Date.now()
} = {}) {
  const samplesByScopeMetric = new Map();
  const emissionHistory = [];

  function emitSample({
    scope = pilotScope,
    metric,
    value,
    source = "manual",
    automated = false,
    emittedAt = new Date().toISOString(),
    labels = {}
  }) {
    if (!knownMetricSet.has(metric)) {
      throw new Error(`unsupported metric "${metric}"`);
    }
    const normalizedScope = normalizeScope(scope, pilotScope);
    const numericValue = toFiniteNumber(value, metric);
    const metadata = metadataFromContract({
      scope: normalizedScope,
      metric,
      source,
      emittedAt,
      automated,
      extraLabels: labels
    });

    const sample = {
      metric,
      value: numericValue,
      ...metadata
    };

    const key = createScopeMetricKey(normalizedScope, metric);
    samplesByScopeMetric.set(key, sample);
    emissionHistory.push(sample);
    if (emissionHistory.length > 200) {
      emissionHistory.shift();
    }

    return sample;
  }

  function emitSignals({
    scope = pilotScope,
    signals = {},
    source = "manual",
    automated = false,
    labels = {}
  }) {
    const normalizedScope = normalizeScope(scope, pilotScope);
    const emitted = [];
    for (const metric of metricNames) {
      if (!(metric in signals)) {
        continue;
      }
      emitted.push(
        emitSample({
          scope: normalizedScope,
          metric,
          value: signals[metric],
          source,
          automated,
          labels
        })
      );
    }
    return emitted;
  }

  function emitPilotSignals(scope = pilotScope) {
    const normalizedScope = normalizeScope(scope, pilotScope);
    if (
      normalizedScope.city !== pilotScope.city ||
      normalizedScope.category !== pilotScope.category
    ) {
      return [];
    }

    const pilotSignals = buildPilotSignals({
      baselineSignals,
      now: now()
    });

    return emitSignals({
      scope: normalizedScope,
      signals: pilotSignals,
      source: "pilot-auto-emitter",
      automated: true,
      labels: {
        emitter: "ops-monitoring"
      }
    });
  }

  function buildSnapshot(scope = pilotScope) {
    const normalizedScope = normalizeScope(scope, pilotScope);
    const signals = { ...baselineSignals };
    const metadata = {};

    for (const metric of metricNames) {
      const key = createScopeMetricKey(normalizedScope, metric);
      const sample = samplesByScopeMetric.get(key);
      if (sample) {
        signals[metric] = sample.value;
        metadata[metric] = {
          owner: sample.owner,
          domain: sample.domain,
          kind: sample.kind,
          unit: sample.unit,
          source: sample.source,
          emittedAt: sample.emittedAt,
          automated: sample.automated,
          labels: sample.labels
        };
        continue;
      }

      metadata[metric] = metadataFromContract({
        scope: normalizedScope,
        metric,
        source: "seed-default",
        emittedAt: null
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      city: normalizedScope.city,
      category: normalizedScope.category,
      signals,
      metadata
    };
  }

  function listContracts() {
    return metricNames.map((metric) => metricContracts[metric]);
  }

  function listRecentEmissions({ scope = null, limit = 20 } = {}) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 20;
    const normalizedScope = scope ? normalizeScope(scope, pilotScope) : null;

    const filtered = normalizedScope
      ? emissionHistory.filter(
          (sample) =>
            sample.labels.city === normalizedScope.city &&
            sample.labels.category === normalizedScope.category
        )
      : emissionHistory;

    return filtered.slice(-safeLimit).reverse();
  }

  return {
    emitSample,
    emitSignals,
    emitPilotSignals,
    buildSnapshot,
    listContracts,
    listRecentEmissions
  };
}

export { defaultPilotScope, defaultSignals, metricContracts, metricNames };
