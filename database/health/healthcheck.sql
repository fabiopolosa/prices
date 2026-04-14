\set ON_ERROR_STOP on

DO $$
DECLARE
  required_extension text;
BEGIN
  FOREACH required_extension IN ARRAY ARRAY['pgcrypto', 'postgis', 'vector']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = required_extension
    ) THEN
      RAISE EXCEPTION 'Missing required extension: %', required_extension;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'pricing.products',
    'pricing.stores',
    'pricing.price_submissions',
    'pricing.canonical_prices',
    'pricing.confidence_events',
    'pricing.ontology_terms',
    'pricing.product_ontology_links',
    'pricing.store_ontology_links'
  ]
  LOOP
    IF to_regclass(required_table) IS NULL THEN
      RAISE EXCEPTION 'Missing required table: %', required_table;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM pricing.products WHERE metadata ->> 'seed' = 'rome-pilot') < 2 THEN
    RAISE EXCEPTION 'Seed sanity check failed: expected >= 2 pilot products';
  END IF;

  IF (SELECT COUNT(*) FROM pricing.stores WHERE metadata ->> 'seed' = 'rome-pilot') < 2 THEN
    RAISE EXCEPTION 'Seed sanity check failed: expected >= 2 pilot stores';
  END IF;
END
$$;

DO $$
DECLARE
  centroid_distance_meters double precision;
BEGIN
  SELECT ST_Distance(s1.location, s2.location)
  INTO centroid_distance_meters
  FROM pricing.stores s1
  JOIN pricing.stores s2 ON s1.store_key < s2.store_key
  ORDER BY s1.store_key, s2.store_key
  LIMIT 1;

  IF centroid_distance_meters IS NULL OR centroid_distance_meters <= 0 THEN
    RAISE EXCEPTION 'PostGIS distance check failed for pilot stores';
  END IF;
END
$$;

DO $$
DECLARE
  cosine_distance double precision;
BEGIN
  SELECT '[0.1,0.2,0.3]'::vector(3) <=> '[0.1,0.2,0.3]'::vector(3)
  INTO cosine_distance;

  IF cosine_distance <> 0 THEN
    RAISE EXCEPTION 'pgvector cosine check failed: expected 0, got %', cosine_distance;
  END IF;
END
$$;

SELECT
  now() AS checked_at,
  (SELECT COUNT(*) FROM pricing.products) AS products,
  (SELECT COUNT(*) FROM pricing.stores) AS stores,
  (SELECT COUNT(*) FROM pricing.price_submissions) AS submissions,
  (SELECT COUNT(*) FROM pricing.canonical_prices) AS canonical_prices,
  (SELECT COUNT(*) FROM pricing.confidence_events) AS confidence_events,
  (SELECT COUNT(*) FROM pricing.ontology_terms) AS ontology_terms;
