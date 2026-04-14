BEGIN;

INSERT INTO pricing.products (product_key, name, brand, size_label, metadata)
VALUES
  ('pasta-fusilli-500g', 'Pasta Fusilli', 'Acme Foods', '500g', '{"seed":"rome-pilot"}'::jsonb),
  ('milk-whole-1l', 'Whole Milk', 'Latteria Roma', '1L', '{"seed":"rome-pilot"}'::jsonb)
ON CONFLICT (product_key) DO UPDATE
SET
  name = EXCLUDED.name,
  brand = EXCLUDED.brand,
  size_label = EXCLUDED.size_label,
  metadata = EXCLUDED.metadata;

INSERT INTO pricing.stores (store_key, name, city, region_code, country_code, location, metadata)
VALUES
  (
    'roma-centro-001',
    'Roma Centro Market',
    'Rome',
    'LAZ',
    'IT',
    ST_GeogFromText('SRID=4326;POINT(12.4964 41.9028)'),
    '{"seed":"rome-pilot","district":"centro"}'::jsonb
  ),
  (
    'roma-trastevere-002',
    'Trastevere Fresh',
    'Rome',
    'LAZ',
    'IT',
    ST_GeogFromText('SRID=4326;POINT(12.4689 41.8894)'),
    '{"seed":"rome-pilot","district":"trastevere"}'::jsonb
  )
ON CONFLICT (store_key) DO UPDATE
SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  region_code = EXCLUDED.region_code,
  country_code = EXCLUDED.country_code,
  location = EXCLUDED.location,
  metadata = EXCLUDED.metadata;

INSERT INTO pricing.ontology_terms (term_key, domain, label, description)
VALUES
  ('category:pasta', 'category', 'Pasta', 'Dry pasta products'),
  ('category:dairy', 'category', 'Dairy', 'Milk and dairy products'),
  ('brand:acme-foods', 'brand', 'Acme Foods', 'Seed brand for pilot pricing'),
  ('cluster:rome-centro', 'store_cluster', 'Rome Centro Cluster', 'Pilot city center stores')
ON CONFLICT (term_key) DO UPDATE
SET
  domain = EXCLUDED.domain,
  label = EXCLUDED.label,
  description = EXCLUDED.description;

INSERT INTO pricing.price_submissions (
  source,
  source_event_id,
  idempotency_key,
  product_id,
  store_id,
  raw_payload,
  normalized_payload,
  currency,
  observed_price,
  observed_at,
  submitted_at
)
SELECT
  src.source,
  src.source_event_id,
  src.idempotency_key,
  p.id,
  s.id,
  src.raw_payload,
  src.normalized_payload,
  src.currency,
  src.observed_price,
  src.observed_at,
  src.submitted_at
FROM (
  VALUES
    (
      'merchant',
      'merchant-rome-001',
      'merchant-rome-001',
      'pasta-fusilli-500g',
      'roma-centro-001',
      '{"source":"merchant","city":"Rome"}'::jsonb,
      '{"productKey":"pasta-fusilli-500g","storeKey":"roma-centro-001"}'::jsonb,
      'EUR',
      1.99::numeric(10,2),
      TIMESTAMPTZ '2026-04-14T08:00:00Z',
      TIMESTAMPTZ '2026-04-14T08:00:30Z'
    ),
    (
      'call_confirmed',
      'call-rome-002',
      'call-rome-002',
      'milk-whole-1l',
      'roma-trastevere-002',
      '{"source":"call_confirmed","city":"Rome"}'::jsonb,
      '{"productKey":"milk-whole-1l","storeKey":"roma-trastevere-002"}'::jsonb,
      'EUR',
      1.85::numeric(10,2),
      TIMESTAMPTZ '2026-04-14T08:05:00Z',
      TIMESTAMPTZ '2026-04-14T08:05:20Z'
    )
) AS src (
  source,
  source_event_id,
  idempotency_key,
  product_key,
  store_key,
  raw_payload,
  normalized_payload,
  currency,
  observed_price,
  observed_at,
  submitted_at
)
JOIN pricing.products p ON p.product_key = src.product_key
JOIN pricing.stores s ON s.store_key = src.store_key
ON CONFLICT (source, source_event_id) DO UPDATE
SET
  idempotency_key = EXCLUDED.idempotency_key,
  raw_payload = EXCLUDED.raw_payload,
  normalized_payload = EXCLUDED.normalized_payload,
  observed_price = EXCLUDED.observed_price,
  observed_at = EXCLUDED.observed_at,
  submitted_at = EXCLUDED.submitted_at;

INSERT INTO pricing.canonical_prices (
  product_id,
  store_id,
  currency,
  latest_submission_id,
  latest_price,
  confidence,
  winning_source,
  effective_at
)
SELECT
  p.id,
  s.id,
  'EUR',
  ps.id,
  ps.observed_price,
  CASE
    WHEN ps.source = 'merchant' THEN 0.92
    WHEN ps.source = 'call_confirmed' THEN 0.88
    ELSE 0.75
  END,
  ps.source,
  ps.observed_at
FROM pricing.price_submissions ps
JOIN pricing.products p ON p.id = ps.product_id
JOIN pricing.stores s ON s.id = ps.store_id
WHERE ps.source_event_id IN ('merchant-rome-001', 'call-rome-002')
ON CONFLICT (product_id, store_id, currency) DO UPDATE
SET
  latest_submission_id = EXCLUDED.latest_submission_id,
  latest_price = EXCLUDED.latest_price,
  confidence = EXCLUDED.confidence,
  winning_source = EXCLUDED.winning_source,
  effective_at = EXCLUDED.effective_at;

INSERT INTO pricing.confidence_events (
  event_key,
  canonical_price_id,
  submission_id,
  previous_confidence,
  new_confidence,
  reason,
  event_payload,
  created_at
)
SELECT
  CONCAT('seed:', ps.source_event_id),
  cp.id,
  ps.id,
  NULL,
  cp.confidence,
  'seed_initial_load',
  jsonb_build_object(
    'seed', 'rome-pilot',
    'source', ps.source,
    'storeKey', s.store_key,
    'productKey', p.product_key
  ),
  ps.submitted_at
FROM pricing.canonical_prices cp
JOIN pricing.products p ON p.id = cp.product_id
JOIN pricing.stores s ON s.id = cp.store_id
JOIN pricing.price_submissions ps ON ps.id = cp.latest_submission_id
ON CONFLICT (event_key) DO UPDATE
SET
  canonical_price_id = EXCLUDED.canonical_price_id,
  submission_id = EXCLUDED.submission_id,
  new_confidence = EXCLUDED.new_confidence,
  reason = EXCLUDED.reason,
  event_payload = EXCLUDED.event_payload,
  created_at = EXCLUDED.created_at;

INSERT INTO pricing.product_ontology_links (
  product_id,
  ontology_term_id,
  relation,
  confidence,
  source_submission_id
)
SELECT
  p.id,
  t.id,
  links.relation,
  links.confidence,
  ps.id
FROM (
  VALUES
    ('pasta-fusilli-500g', 'category:pasta', 'is_a', 0.99::numeric(5,4), 'merchant-rome-001'),
    ('pasta-fusilli-500g', 'brand:acme-foods', 'made_by', 0.96::numeric(5,4), 'merchant-rome-001'),
    ('milk-whole-1l', 'category:dairy', 'is_a', 0.98::numeric(5,4), 'call-rome-002')
) AS links (product_key, term_key, relation, confidence, source_event_id)
JOIN pricing.products p ON p.product_key = links.product_key
JOIN pricing.ontology_terms t ON t.term_key = links.term_key
JOIN pricing.price_submissions ps ON ps.source_event_id = links.source_event_id
ON CONFLICT (product_id, ontology_term_id, relation) DO UPDATE
SET
  confidence = EXCLUDED.confidence,
  source_submission_id = EXCLUDED.source_submission_id,
  linked_at = now();

INSERT INTO pricing.store_ontology_links (
  store_id,
  ontology_term_id,
  relation,
  confidence,
  source_submission_id
)
SELECT
  s.id,
  t.id,
  links.relation,
  links.confidence,
  ps.id
FROM (
  VALUES
    ('roma-centro-001', 'cluster:rome-centro', 'belongs_to', 0.93::numeric(5,4), 'merchant-rome-001')
) AS links (store_key, term_key, relation, confidence, source_event_id)
JOIN pricing.stores s ON s.store_key = links.store_key
JOIN pricing.ontology_terms t ON t.term_key = links.term_key
JOIN pricing.price_submissions ps ON ps.source_event_id = links.source_event_id
ON CONFLICT (store_id, ontology_term_id, relation) DO UPDATE
SET
  confidence = EXCLUDED.confidence,
  source_submission_id = EXCLUDED.source_submission_id,
  linked_at = now();

COMMIT;
