#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ -z "${SMOKE_RESTORE_DATABASE_URL:-}" ]]; then
  echo "SMOKE_RESTORE_DATABASE_URL is required" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_SQL="${SCRIPT_DIR}/../health/healthcheck.sql"

TMP_DIR="$(mktemp -d)"
BACKUP_FILE="${TMP_DIR}/prices-smoke.dump"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Creating backup from source database..."
pg_dump "${DATABASE_URL}" --format=custom --no-owner --no-privileges --file "${BACKUP_FILE}"

echo "Restoring backup into smoke database..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "${SMOKE_RESTORE_DATABASE_URL}" \
  "${BACKUP_FILE}"

echo "Running healthcheck on smoke database..."
psql "${SMOKE_RESTORE_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${HEALTH_SQL}"

source_counts="$(
  psql "${DATABASE_URL}" -Atqc \
    "SELECT
      (SELECT COUNT(*) FROM pricing.products) || ':' ||
      (SELECT COUNT(*) FROM pricing.stores) || ':' ||
      (SELECT COUNT(*) FROM pricing.price_submissions) || ':' ||
      (SELECT COUNT(*) FROM pricing.canonical_prices) || ':' ||
      (SELECT COUNT(*) FROM pricing.confidence_events) || ':' ||
      (SELECT COUNT(*) FROM pricing.ontology_terms)"
)"

restore_counts="$(
  psql "${SMOKE_RESTORE_DATABASE_URL}" -Atqc \
    "SELECT
      (SELECT COUNT(*) FROM pricing.products) || ':' ||
      (SELECT COUNT(*) FROM pricing.stores) || ':' ||
      (SELECT COUNT(*) FROM pricing.price_submissions) || ':' ||
      (SELECT COUNT(*) FROM pricing.canonical_prices) || ':' ||
      (SELECT COUNT(*) FROM pricing.confidence_events) || ':' ||
      (SELECT COUNT(*) FROM pricing.ontology_terms)"
)"

if [[ "${source_counts}" != "${restore_counts}" ]]; then
  echo "Backup/restore row-count mismatch: source=${source_counts} restore=${restore_counts}" >&2
  exit 1
fi

echo "Backup/restore smoke test passed."
