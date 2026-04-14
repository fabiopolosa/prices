BEGIN;

CREATE INDEX IF NOT EXISTS idx_stores_location_gist
  ON pricing.stores USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_products_embedding_ivfflat
  ON pricing.products USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_price_submissions_product_store_observed
  ON pricing.price_submissions (product_id, store_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_submissions_submitted_at
  ON pricing.price_submissions (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_prices_confidence
  ON pricing.canonical_prices (confidence DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_prices_store_product
  ON pricing.canonical_prices (store_id, product_id);

CREATE INDEX IF NOT EXISTS idx_confidence_events_canonical_created
  ON pricing.confidence_events (canonical_price_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_ontology_links_term
  ON pricing.product_ontology_links (ontology_term_id);

CREATE INDEX IF NOT EXISTS idx_store_ontology_links_term
  ON pricing.store_ontology_links (ontology_term_id);

COMMIT;
