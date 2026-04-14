BEGIN;

CREATE SCHEMA IF NOT EXISTS pricing;

CREATE TABLE IF NOT EXISTS pricing.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL UNIQUE,
  name text NOT NULL,
  brand text,
  size_label text,
  embedding vector(384),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL UNIQUE,
  name text NOT NULL,
  city text NOT NULL,
  region_code text,
  country_code char(2) NOT NULL DEFAULT 'IT',
  location geography(Point, 4326) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing.price_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('ugc', 'merchant', 'call_confirmed')),
  source_event_id text,
  idempotency_key text,
  product_id uuid NOT NULL REFERENCES pricing.products(id),
  store_id uuid NOT NULL REFERENCES pricing.stores(id),
  raw_payload jsonb NOT NULL,
  normalized_payload jsonb NOT NULL,
  currency char(3) NOT NULL,
  observed_price numeric(10, 2) NOT NULL CHECK (observed_price > 0),
  observed_at timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_price_submissions_source_event UNIQUE (source, source_event_id),
  CONSTRAINT uq_price_submissions_idempotency UNIQUE (source, idempotency_key)
);

CREATE TABLE IF NOT EXISTS pricing.canonical_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES pricing.products(id),
  store_id uuid NOT NULL REFERENCES pricing.stores(id),
  currency char(3) NOT NULL,
  latest_submission_id uuid REFERENCES pricing.price_submissions(id),
  latest_price numeric(10, 2) NOT NULL CHECK (latest_price > 0),
  confidence numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  winning_source text NOT NULL CHECK (winning_source IN ('ugc', 'merchant', 'call_confirmed')),
  effective_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_canonical_prices_product_store_currency UNIQUE (product_id, store_id, currency)
);

CREATE TABLE IF NOT EXISTS pricing.confidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  canonical_price_id uuid NOT NULL REFERENCES pricing.canonical_prices(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES pricing.price_submissions(id),
  previous_confidence numeric(5, 4) CHECK (previous_confidence >= 0 AND previous_confidence <= 1),
  new_confidence numeric(5, 4) NOT NULL CHECK (new_confidence >= 0 AND new_confidence <= 1),
  reason text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing.ontology_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_key text NOT NULL UNIQUE,
  domain text NOT NULL CHECK (domain IN ('category', 'brand', 'attribute', 'store_cluster')),
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing.product_ontology_links (
  product_id uuid NOT NULL REFERENCES pricing.products(id) ON DELETE CASCADE,
  ontology_term_id uuid NOT NULL REFERENCES pricing.ontology_terms(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'is_a',
  confidence numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_submission_id uuid REFERENCES pricing.price_submissions(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, ontology_term_id, relation)
);

CREATE TABLE IF NOT EXISTS pricing.store_ontology_links (
  store_id uuid NOT NULL REFERENCES pricing.stores(id) ON DELETE CASCADE,
  ontology_term_id uuid NOT NULL REFERENCES pricing.ontology_terms(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'belongs_to',
  confidence numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_submission_id uuid REFERENCES pricing.price_submissions(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, ontology_term_id, relation)
);

CREATE OR REPLACE FUNCTION pricing.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_set_updated_at ON pricing.products;
CREATE TRIGGER trg_products_set_updated_at
BEFORE UPDATE ON pricing.products
FOR EACH ROW
EXECUTE FUNCTION pricing.set_updated_at();

DROP TRIGGER IF EXISTS trg_stores_set_updated_at ON pricing.stores;
CREATE TRIGGER trg_stores_set_updated_at
BEFORE UPDATE ON pricing.stores
FOR EACH ROW
EXECUTE FUNCTION pricing.set_updated_at();

DROP TRIGGER IF EXISTS trg_canonical_prices_set_updated_at ON pricing.canonical_prices;
CREATE TRIGGER trg_canonical_prices_set_updated_at
BEFORE UPDATE ON pricing.canonical_prices
FOR EACH ROW
EXECUTE FUNCTION pricing.set_updated_at();

COMMIT;
