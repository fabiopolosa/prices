# M3 Pilot Telemetry Data Contract

This document defines the metric contract consumed by `ops-monitoring` dashboard and SLO APIs for the pilot scope:

- city: `rome`
- category: `grocery-core`
- owner: `founding-engineer`

## Metric Contract

| Metric | Domain | Unit | Owner | Used by |
| --- | --- | --- | --- | --- |
| `activationRate` | activation | ratio | `growth-analytics` | `/v1/dashboard` KPI |
| `day7RetentionRate` | retention | ratio | `growth-analytics` | `/v1/dashboard` KPI |
| `dataQualityCoverage` | data_quality | ratio | `data-platform-oncall` | `/v1/dashboard` KPI |
| `ingestionFailureRate` | error | ratio | `data-platform-oncall` | `/v1/slo`, `/v1/alerts/*` |
| `retrievalRegressionRate` | error | ratio | `ranking-oncall` | `/v1/slo`, `/v1/alerts/*` |
| `mapReadP95LatencyMs` | latency | ms | `maps-oncall` | `/v1/slo`, `/v1/alerts/*` |

## Label Schema

Every emitted metric sample includes these required labels:

- `city`
- `category`
- `metric`
- `source`

Optional labels can be attached by emitters (for example `pipeline`, `emitter`).

## Telemetry API Surface

- `GET /v1/telemetry/contracts`: metric ownership and unit metadata.
- `GET /v1/telemetry/signals?city=<city>&category=<category>`: latest value and labels per metric.
- `POST /v1/telemetry/emit`: manual or automation-driven sample ingestion.

## Automated Pilot Emission

For pilot scope (`rome` + `grocery-core`), `ops-monitoring` emits a labeled telemetry snapshot automatically when serving:

- `GET /v1/dashboard`
- `GET /v1/slo`
- `GET /v1/telemetry/signals`

Emission source for automated samples: `pilot-auto-emitter`.
