#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_SQL="${SCRIPT_DIR}/../health/healthcheck.sql"

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${HEALTH_SQL}"
