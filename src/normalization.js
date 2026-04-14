const SPACE_RE = /\s+/g;

function slug(value) {
  return String(value).trim().toLowerCase().replace(SPACE_RE, "-");
}

function compact(value) {
  return String(value).trim().toLowerCase().replace(SPACE_RE, " ");
}

function ensureObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

export function normalizeProduct(rawProduct) {
  const product = ensureObject(rawProduct, "product");
  const sku = product.sku ? slug(product.sku) : null;
  const name = product.name ? compact(product.name) : null;
  const brand = product.brand ? compact(product.brand) : null;

  if (!sku && !name) {
    throw new Error("product requires at least one of sku or name");
  }

  const key = sku || `${brand || "generic"}:${name}`;
  return {
    key,
    sku,
    name,
    brand
  };
}

export function normalizeStore(rawStore) {
  const store = ensureObject(rawStore, "store");
  const externalId = store.externalId ? slug(store.externalId) : null;
  const name = store.name ? compact(store.name) : null;
  const city = store.city ? compact(store.city) : null;
  const region = store.region ? compact(store.region) : null;

  if (!externalId && !name) {
    throw new Error("store requires at least one of externalId or name");
  }

  const location = [city, region].filter(Boolean).join(":");
  const key = externalId || `${name}:${location || "unknown"}`;

  return {
    key,
    externalId,
    name,
    city,
    region
  };
}

export function normalizePrice(rawPrice, rawCurrency) {
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("price must be a positive number");
  }

  const currency = rawCurrency ? String(rawCurrency).trim().toUpperCase() : "USD";
  if (currency.length !== 3) {
    throw new Error("currency must be a 3-letter ISO code");
  }

  return {
    price: Math.round(price * 100) / 100,
    currency
  };
}
