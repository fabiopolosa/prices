# Playbook: Ontology + Clustering Service Migration (M4)

Related issue: [OVE-44](/OVE/issues/OVE-44)

## Goal

Extract ontology traversal and clustering workloads into dedicated services without breaking existing retrieval/gateway consumers.

## Preconditions

- [OVE-40](/OVE/issues/OVE-40) retrieval read path is stable in production-like tests.
- [OVE-43](/OVE/issues/OVE-43) event backbone supports idempotent replay for backfill.
- Contracts are published and reviewed:
  - `contracts/openapi/ontology-service.v1.yaml`
  - `contracts/openapi/clustering-service.v1.yaml`

## Phase 1: Shadow Read

1. Deploy `ontology-service` and `clustering-service` in read-only mode.
2. Keep `knowledge-service` as source of truth for user-facing output.
3. Compare shadow responses against current retrieval payloads for 7 days.

Exit criteria:

- mismatch rate under 0.5% for ontology term keys and cluster keys
- no regression in read-path SLOs

## Phase 2: Partial Cutover

1. Route 10% read traffic through external ontology/clustering lookups.
2. Keep fallback to internal baseline on timeout/error.
3. Log per-request lineage completeness checks.

Exit criteria:

- no increase in 5xx rate
- P95 latency delta under 20 ms
- lineage completeness at 100%

## Phase 3: Full Cutover

1. Increase traffic to 100% external lookups.
2. Keep fallback path enabled for one release cycle.
3. Remove fallback only after 14 days with no lineage/explainability regression.

## Rollback

- Immediately set traffic split to 0% external lookups.
- Keep services online for diagnostics.
- Open incident ticket with mismatch samples and source IDs.

## Regression Checklist (Required per release)

Run:

```bash
npm run test --workspace @prices/knowledge-service
npm run test --workspace @prices/api-gateway
npm run test --workspace @prices/ontology-service
npm run test --workspace @prices/clustering-service
```

Required assertions:

- `explainability` fields present on every retrieval card
- `lineage` fields present on every retrieval card
- ontology/clustering contract versions remain `v1`
- gateway passthrough preserves both explainability and lineage objects
