# Contract Versioning Policy (MVP v1)

## Rules

- HTTP APIs are versioned in the URI prefix: `/v1/...`.
- Event contracts are versioned in event type suffixes and schema metadata, e.g. `quote.ingested.v1` and `schemaVersion: 1`.
- Ontology and clustering service contracts follow the same major-version rule and must preserve lineage fields (`sourceTable`, `sourceVersion`) within a major.
- Additive, backward-compatible fields may ship without bumping major version.
- Breaking changes require a new major (`v2`) endpoint/event and parallel operation window.
- Consumers must reject unknown major versions and tolerate unknown optional fields.

## Change Process

1. Update the contract file under `contracts/openapi` or `contracts/asyncapi`.
2. Add a compatibility note in the owning issue comment.
3. Update producer and consumer tests in the affected workspace package.
4. Keep `services/quote-ingestion/test/contracts.compatibility.test.js` green (CI blocks merge on breaking v1 event contract changes).
4. For ontology/clustering changes, run regression tests that assert read-path explainability and lineage fields are both present.
