#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../migrations"

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS pricing;
CREATE TABLE IF NOT EXISTS pricing.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

for file in "${MIGRATIONS_DIR}"/*.sql; do
  migration_name="$(basename "${file}")"
  already_applied="$(
    psql "${DATABASE_URL}" -Atqc \
      "SELECT 1 FROM pricing.schema_migrations WHERE filename = '${migration_name}' LIMIT 1"
  )"

  if [[ "${already_applied}" == "1" ]]; then
    echo "Skipping already-applied migration: ${migration_name}"
    continue
  fi

  echo "Applying migration: ${migration_name}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${file}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO pricing.schema_migrations (filename) VALUES ('${migration_name}')"
done

echo "Migrations complete."
