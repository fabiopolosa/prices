# Data Platform M1: Postgres + PostGIS + pgvector

This repository now includes a local-first, cloud-target database setup for the MVP cutline.

## What Is Included

- Deterministic SQL migrations in `database/migrations/` for:
  - Required extensions (`pgcrypto`, `postgis`, `vector`)
  - Core schema for products, stores, submissions, canonical prices, confidence events, and ontology links
  - Geospatial and vector retrieval indexes
- Pilot seed dataset in `database/seeds/0001_pilot_city_rome.sql` for one city (Rome) with ontology links.
- Health SQL in `database/health/healthcheck.sql` for extension, schema, seed, PostGIS, and pgvector checks.
- Operational scripts in `database/scripts/`.

## Local Development Setup

1. Start Postgres locally:

```bash
docker compose -f database/docker-compose.yml up -d --build
```

2. Export connection string:

```bash
export DATABASE_URL="postgresql://prices:prices@127.0.0.1:5432/prices"
```

3. Apply migrations, seed, and health checks:

```bash
npm run db:migrate
npm run db:seed
npm run db:health
```

## Cloud Target Setup

Run the same scripts against a managed Postgres target (for example RDS/Aurora/Neon/Supabase/Postgres-compatible platform) as long as `postgis` and `vector` extensions are available for that target instance.

```bash
export DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<db>"
npm run db:migrate
npm run db:seed
npm run db:health
```

## Schema Notes

- `pricing.stores.location` uses `geography(Point, 4326)` for accurate meter-based geo distance operations.
- `pricing.products.embedding` uses `vector(384)` for semantic retrieval.
- `pricing.product_ontology_links` and `pricing.store_ontology_links` support ontology-ready classification and grouping.
- `pricing.confidence_events` captures confidence update lineage and scoring rationale.
