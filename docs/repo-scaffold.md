# MVP Repository Scaffold (Local-first to Cloud)

## Workspace Layout

- Root uses npm workspaces with service packages in `services/*`.
- Each service package owns `src/` and `test/` with local scripts:
  - `npm run build --workspace <service>`
  - `npm run test --workspace <service>`
- Root orchestration:
  - `npm run build` runs all service builds.
  - `npm run test` runs all service tests.

## Service Packages

- `services/api-gateway`
- `services/quote-ingestion`
- `services/knowledge-service`
- `services/map-layer`
- `services/ops-monitoring`
- `services/ontology-service`
- `services/clustering-service`

## Environment Contract

- `PORT`: optional, service listen port (default `3000`).
- Service-local configuration must be injected by env vars and validated at startup.
- No implicit cross-service imports; integration uses API/event contracts only.

## CI Baseline

- Install once from repository root (`npm install`).
- Execute `npm run build` and `npm run test` from root as required checks.
- Quote event contract compatibility is enforced in `services/quote-ingestion/test/contracts.compatibility.test.js` and must pass before merge.
