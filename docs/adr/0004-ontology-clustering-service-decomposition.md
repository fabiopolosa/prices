# ADR-0004: Ontology + Clustering Service Decomposition

- Date: 2026-04-14
- Status: accepted
- Related issue: [OVE-44](/OVE/issues/OVE-44)
- Depends on: [OVE-40](/OVE/issues/OVE-40), [OVE-43](/OVE/issues/OVE-43)

## Context

`knowledge-service` currently bundles three distinct concerns:

- retrieval ranking and scoring
- ontology graph traversal
- store-cluster projection

As volume grows, ontology traversal and cluster assignment have different scaling and release cadence than the retrieval ranker. Keeping all three in one deployable raises blast radius and slows independent evolution.

## Decision

Split ontology and clustering workloads into dedicated services while preserving v1 read-path compatibility.

- Introduce `ontology-service` with versioned endpoints:
  - `/v1/ontology/products/{productKey}`
  - `/v1/ontology/stores/{storeKey}`
- Introduce `clustering-service` with versioned endpoints:
  - `/v1/clusters/stores/{storeKey}`
  - `/v1/clusters/areas/{areaKey}`
- Keep `knowledge-service` responsible for final retrieval ranking and response shaping.
- Keep the API gateway response envelope unchanged (`/v1/quotes:read`) and continue surfacing both `explainability` and `lineage` blocks per result.

## Compatibility Policy

- v1 remains backward compatible for existing consumers.
- Additive fields are allowed in v1.
- Breaking changes require v2 endpoints and a parallel operation window.
- Lineage fields are contract-critical and must not be removed inside a major version:
  - `lineage.sourceTypes`
  - `lineage.ontology.{service,version,termKeys}`
  - `lineage.clustering.{service,version,clusterKey,areaKey}`

## Scale Triggers

Move from shared Postgres-only read paths to specialized engines when any trigger stays true for 2 consecutive weeks:

- ontology traversal P95 > 120 ms at steady load
- cluster assignment recalculation backlog > 30 minutes
- retrieval read QPS > 200 with explainability enabled
- ontology term graph > 5M links

## Consequences

Positive:

- independent scaling and release of ontology/clustering logic
- lower blast radius for retrieval-path changes
- explicit versioned contracts between services

Tradeoffs:

- additional service hop latency
- more deployment and observability overhead
- migration orchestration complexity

## Validation

- Versioned contracts published under `contracts/openapi/*.v1.yaml`.
- Regression tests assert no loss of explainability/lineage fields in retrieval and gateway responses.
- Migration sequence and rollback documented in playbook.
