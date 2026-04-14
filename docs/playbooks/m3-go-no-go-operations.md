# M3 Go/No-Go Operations Runbook

This runbook supports the M3 pilot operational dashboard and alert rules in `ops-monitoring`.

## Dashboard Scope

- Pilot city: `rome`
- Pilot category: `grocery-core`
- Primary owner: `founding-engineer`
- Telemetry contract: `docs/m3-telemetry-data-contract.md`

## Ingestion Failure

- Alert source: `alert-ingestion-failure`
- Trigger: ingestion failure rate `> 2.00%` over 15 minutes
- Responders: `data-platform-oncall`, `founding-engineer`

Steps:
1. Check the ingestion event backlog and replay health.
2. Compare canonical quote write success vs raw ingest count.
3. If backlog keeps growing for 15+ minutes, declare M3 launch gate `no-go`.

## Retrieval Regression

- Alert source: `alert-retrieval-regression`
- Trigger: retrieval regression rate `> 5.00%` over 30 minutes
- Responders: `ranking-oncall`, `founding-engineer`

Steps:
1. Sample top failing retrieval queries and inspect explainability payloads.
2. Check ontology/clustering freshness and latest read deployment version.
3. Roll back retrieval ranking release if regression persists for two windows.

## Map Latency Breach

- Alert source: `alert-map-latency`
- Trigger: map read p95 latency `> 350 ms` over 10 minutes
- Responders: `maps-oncall`, `founding-engineer`

Steps:
1. Inspect map-layer build/read metrics and failure counters.
2. Confirm latest layer manifest compatibility and API gateway latency.
3. If p95 remains above threshold after mitigation, gate launch to `no-go`.
