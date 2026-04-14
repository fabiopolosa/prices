# Service Boundaries (M1 Baseline + M4 Decomposition)

## api-gateway

- Terminates client auth and tenancy checks.
- Applies global rate limiting and request shaping.
- Routes reads/writes to downstream services.

## quote-ingestion

- Accepts merchant, UGC, and call-confirmed quote submissions.
- Normalizes payloads and applies idempotency.
- Emits confidence-scored quote events.

## knowledge-service

- Maintains canonical product/store entities and link rules.
- Resolves entity keys used by ingestion and read paths.
- Owns read-path retrieval ranking and explainability payload composition.

## map-layer

- Serves geospatial overlays and store lookup primitives.
- Produces viewport-aware map summaries for client rendering.

## ops-monitoring

- Exposes service health/SLO signals for pilot operation.
- Aggregates runbook-facing telemetry for go/no-go checks.
- Owns labeled metric contracts and ownership mapping (`docs/m3-telemetry-data-contract.md`).

## ontology-service (M4 follow-on)

- Isolates ontology graph traversal and term resolution.
- Serves versioned product/store ontology projections (`/v1/ontology/...`).
- Preserves source-table lineage so read-path explainability remains auditable.

## clustering-service (M4 follow-on)

- Isolates store-cluster assignment and area-cluster projection workload.
- Serves versioned cluster assignments (`/v1/clusters/...`).
- Preserves source-table lineage for deterministic cluster explainability.
