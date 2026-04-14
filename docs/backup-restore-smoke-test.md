# Backup/Restore Smoke Test

Use this runbook to verify dump/restore viability for the MVP data platform.

## Prerequisites

- Source database is migrated and seeded.
- A separate smoke-restore database exists and is reachable (empty or disposable).
- `pg_dump`, `pg_restore`, and `psql` are installed.

## Environment

```bash
export DATABASE_URL="postgresql://<user>:<password>@<source-host>:5432/<source-db>"
export SMOKE_RESTORE_DATABASE_URL="postgresql://<user>:<password>@<restore-host>:5432/<restore-db>"
```

## Run Smoke Test

```bash
npm run db:backup-restore-smoke
```

The script performs:

1. Custom-format backup (`pg_dump`) from `DATABASE_URL`.
2. Clean restore (`pg_restore --clean --if-exists`) into `SMOKE_RESTORE_DATABASE_URL`.
3. Health checks on the restored database using `database/health/healthcheck.sql`.
4. Row-count parity checks for key MVP tables.

## Expected Result

Successful run ends with:

```text
Backup/restore smoke test passed.
```

If row counts diverge or health checks fail, the script exits non-zero and prints the mismatch or failing assertion.
