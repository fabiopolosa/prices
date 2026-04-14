const RETRIEVAL_VERSION = "m2-hybrid-v1";
const ONTOLOGY_API_VERSION = "v1";
const CLUSTERING_API_VERSION = "v1";
const EMBEDDING_DIMENSIONS = 24;

const CATALOG = [
  {
    canonicalPriceId: "cp-1001",
    productKey: "whole-milk-1l",
    productName: "Whole Milk 1L",
    category: "dairy",
    storeKey: "coop-roma-centro",
    storeName: "Coop Roma Centro",
    areaKey: "rome-center",
    priceAmount: 1.89,
    currency: "EUR",
    unit: "1L",
    confidence: 0.93,
    capturedAt: "2026-04-13T08:30:00.000Z",
    tags: ["milk", "dairy", "whole", "fresh"]
  },
  {
    canonicalPriceId: "cp-1002",
    productKey: "whole-milk-1l",
    productName: "Whole Milk 1L",
    category: "dairy",
    storeKey: "conad-roma-centro",
    storeName: "Conad Roma Centro",
    areaKey: "rome-center",
    priceAmount: 1.79,
    currency: "EUR",
    unit: "1L",
    confidence: 0.89,
    capturedAt: "2026-04-13T09:10:00.000Z",
    tags: ["milk", "dairy", "whole", "promo"]
  },
  {
    canonicalPriceId: "cp-1003",
    productKey: "spaghetti-500g",
    productName: "Organic Spaghetti 500g",
    category: "dry-goods",
    storeKey: "coop-roma-centro",
    storeName: "Coop Roma Centro",
    areaKey: "rome-center",
    priceAmount: 1.35,
    currency: "EUR",
    unit: "500g",
    confidence: 0.9,
    capturedAt: "2026-04-13T10:00:00.000Z",
    tags: ["pasta", "spaghetti", "organic", "durum"]
  },
  {
    canonicalPriceId: "cp-1004",
    productKey: "olive-oil-1l",
    productName: "Extra Virgin Olive Oil 1L",
    category: "condiments",
    storeKey: "carrefour-roma-east",
    storeName: "Carrefour Roma East",
    areaKey: "rome-east",
    priceAmount: 8.49,
    currency: "EUR",
    unit: "1L",
    confidence: 0.87,
    capturedAt: "2026-04-13T11:40:00.000Z",
    tags: ["olive", "oil", "extra", "virgin"]
  },
  {
    canonicalPriceId: "cp-1005",
    productKey: "lactose-free-milk-1l",
    productName: "Lactose-Free Milk 1L",
    category: "dairy",
    storeKey: "esselunga-roma-north",
    storeName: "Esselunga Roma North",
    areaKey: "rome-north",
    priceAmount: 2.05,
    currency: "EUR",
    unit: "1L",
    confidence: 0.92,
    capturedAt: "2026-04-13T12:10:00.000Z",
    tags: ["milk", "dairy", "lactose-free", "light"]
  },
  {
    canonicalPriceId: "cp-1006",
    productKey: "sparkling-water-15l",
    productName: "Sparkling Mineral Water 1.5L",
    category: "beverages",
    storeKey: "conad-roma-south",
    storeName: "Conad Roma South",
    areaKey: "rome-south",
    priceAmount: 0.69,
    currency: "EUR",
    unit: "1.5L",
    confidence: 0.85,
    capturedAt: "2026-04-13T13:05:00.000Z",
    tags: ["water", "sparkling", "beverage", "mineral"]
  },
  {
    canonicalPriceId: "cp-1007",
    productKey: "tomato-passata-700g",
    productName: "Tomato Passata 700g",
    category: "condiments",
    storeKey: "coop-roma-centro",
    storeName: "Coop Roma Centro",
    areaKey: "rome-center",
    priceAmount: 1.18,
    currency: "EUR",
    unit: "700g",
    confidence: 0.84,
    capturedAt: "2026-04-13T14:15:00.000Z",
    tags: ["tomato", "passata", "sauce", "italian"]
  }
];

const RELEVANCE_FIXTURES = [
  {
    query: "whole milk 1l",
    area: "rome-center",
    relevant: ["cp-1001", "cp-1002"]
  },
  {
    query: "organic spaghetti pasta",
    area: "rome-center",
    relevant: ["cp-1003"]
  },
  {
    query: "extra virgin olive oil",
    area: "rome-east",
    relevant: ["cp-1004"]
  },
  {
    query: "sparkling water",
    area: "rome-south",
    relevant: ["cp-1006"]
  }
];

const PRODUCT_ONTOLOGY_TERMS = Object.freeze({
  "whole-milk-1l": ["category:dairy", "attribute:whole", "format:1l"],
  "lactose-free-milk-1l": ["category:dairy", "attribute:lactose-free", "format:1l"],
  "spaghetti-500g": ["category:dry-goods", "attribute:organic", "format:500g"],
  "olive-oil-1l": ["category:condiments", "attribute:extra-virgin", "format:1l"],
  "sparkling-water-15l": ["category:beverages", "attribute:sparkling", "format:1-5l"],
  "tomato-passata-700g": ["category:condiments", "attribute:tomato", "format:700g"]
});

const AREA_CLUSTER_KEYS = Object.freeze({
  "rome-center": "cluster:rome-centro",
  "rome-east": "cluster:rome-est",
  "rome-north": "cluster:rome-nord",
  "rome-south": "cluster:rome-sud"
});

const LINEAGE_SOURCES_BY_PRICE_ID = Object.freeze({
  "cp-1001": ["merchant", "call_confirmed"],
  "cp-1002": ["ugc", "merchant"],
  "cp-1003": ["merchant"],
  "cp-1004": ["merchant", "ugc"],
  "cp-1005": ["merchant", "call_confirmed"],
  "cp-1006": ["ugc"],
  "cp-1007": ["merchant"]
});

function normalizeAreaKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeToken(value) {
  return String(value ?? "").trim().toLowerCase();
}

function tokenize(text) {
  return normalizeToken(text)
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token, modulus) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }
  return hash % modulus;
}

function buildEmbedding(tokens) {
  const vector = Array(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of tokens) {
    const bucket = hashToken(token, EMBEDDING_DIMENSIONS);
    const weight = 1 + Math.min(token.length, 8) / 10;
    vector[bucket] += weight;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function round(value) {
  return Number(value.toFixed(4));
}

function buildSearchText(entry) {
  return [
    entry.productName,
    entry.productKey,
    entry.storeName,
    entry.storeKey,
    entry.areaKey,
    entry.category,
    ...entry.tags
  ].join(" ");
}

const HYDRATED_CATALOG = CATALOG.map((entry) => {
  const searchText = buildSearchText(entry);
  const tokens = tokenize(searchText);
  const embedding = buildEmbedding(tokens);

  return {
    ...entry,
    _tokens: tokens,
    _tokenSet: new Set(tokens),
    _embedding: embedding
  };
});

const PRODUCTS = new Map();
const STORES = new Map();

for (const entry of HYDRATED_CATALOG) {
  if (!PRODUCTS.has(entry.productKey)) {
    PRODUCTS.set(entry.productKey, {
      key: entry.productKey,
      name: entry.productName,
      category: entry.category
    });
  }
  if (!STORES.has(entry.storeKey)) {
    STORES.set(entry.storeKey, {
      key: entry.storeKey,
      name: entry.storeName,
      areaKey: entry.areaKey
    });
  }
}

function scoreEntry({ entry, queryTokens, queryTokenSet, queryEmbedding, areaFilter }) {
  const matchedTerms = [];
  for (const token of queryTokenSet) {
    if (entry._tokenSet.has(token)) {
      matchedTerms.push(token);
    }
  }

  const lexicalScore =
    queryTokenSet.size === 0 ? 0 : matchedTerms.length / queryTokenSet.size;
  const semanticScore = clamp((cosineSimilarity(queryEmbedding, entry._embedding) + 1) / 2, 0, 1);
  const structuredFilterScore = areaFilter ? 1 : 0.5;
  const finalScore = 0.45 * lexicalScore + 0.45 * semanticScore + 0.1 * structuredFilterScore;

  return {
    ...entry,
    _finalScore: finalScore,
    _matchedTerms: matchedTerms,
    _lexicalScore: lexicalScore,
    _semanticScore: semanticScore,
    _structuredFilterScore: structuredFilterScore
  };
}

function toResultCard(entry, rank) {
  const ontologyTermKeys = PRODUCT_ONTOLOGY_TERMS[entry.productKey] ?? [`category:${entry.category}`];
  const clusterKey = AREA_CLUSTER_KEYS[entry.areaKey] ?? "cluster:unassigned";
  const sourceTypes = LINEAGE_SOURCES_BY_PRICE_ID[entry.canonicalPriceId] ?? ["merchant"];

  return {
    rank,
    canonicalPriceId: entry.canonicalPriceId,
    product: {
      key: entry.productKey,
      name: entry.productName,
      category: entry.category
    },
    store: {
      key: entry.storeKey,
      name: entry.storeName,
      areaKey: entry.areaKey
    },
    canonicalPrice: {
      amount: entry.priceAmount,
      currency: entry.currency,
      unit: entry.unit,
      capturedAt: entry.capturedAt
    },
    confidence: entry.confidence,
    explainability: {
      retrievalVersion: RETRIEVAL_VERSION,
      finalScore: round(entry._finalScore),
      lexicalScore: round(entry._lexicalScore),
      semanticScore: round(entry._semanticScore),
      structuredFilterScore: round(entry._structuredFilterScore),
      matchedTerms: entry._matchedTerms
    },
    lineage: {
      sourceTypes,
      ontology: {
        service: "ontology-service",
        version: ONTOLOGY_API_VERSION,
        termKeys: ontologyTermKeys
      },
      clustering: {
        service: "clustering-service",
        version: CLUSTERING_API_VERSION,
        clusterKey,
        areaKey: entry.areaKey
      }
    }
  };
}

function sortByRank(a, b) {
  if (a._finalScore !== b._finalScore) {
    return b._finalScore - a._finalScore;
  }
  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence;
  }
  return a.canonicalPriceId.localeCompare(b.canonicalPriceId);
}

function parseLimit(limitValue) {
  const fallbackLimit = 10;
  if (limitValue === undefined || limitValue === null || limitValue === "") {
    return fallbackLimit;
  }

  const parsed = Number(limitValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackLimit;
  }
  return Math.min(25, Math.floor(parsed));
}

export function searchCatalog({ query, area = null, limit = 10 }) {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("query is required");
  }

  const normalizedArea = area ? normalizeAreaKey(area) : null;
  const queryTokens = tokenize(query);
  const queryTokenSet = new Set(queryTokens);
  const queryEmbedding = buildEmbedding(queryTokens);
  const parsedLimit = parseLimit(limit);

  const candidates = HYDRATED_CATALOG.filter((entry) => {
    if (!normalizedArea) {
      return true;
    }
    return entry.areaKey === normalizedArea;
  });

  const ranked = candidates
    .map((entry) =>
      scoreEntry({
        entry,
        queryTokens,
        queryTokenSet,
        queryEmbedding,
        areaFilter: normalizedArea
      })
    )
    .sort(sortByRank)
    .slice(0, parsedLimit)
    .map((entry, index) => toResultCard(entry, index + 1));

  return {
    retrievalVersion: RETRIEVAL_VERSION,
    query,
    area: normalizedArea,
    totalCandidates: candidates.length,
    results: ranked
  };
}

export function getProductEntity(productKey) {
  if (!productKey) {
    return null;
  }
  return PRODUCTS.get(normalizeToken(productKey)) ?? null;
}

export function getStoreEntity(storeKey) {
  if (!storeKey) {
    return null;
  }
  return STORES.get(normalizeToken(storeKey)) ?? null;
}

export function evaluateRetrievalBaseline({ k = 3 } = {}) {
  const topK = Number.isFinite(k) && k > 0 ? Math.floor(k) : 3;
  const perQuery = [];

  for (const fixture of RELEVANCE_FIXTURES) {
    const retrieved = searchCatalog({
      query: fixture.query,
      area: fixture.area,
      limit: topK
    }).results;

    const retrievedIds = retrieved.map((item) => item.canonicalPriceId);
    const relevantIds = new Set(fixture.relevant);
    const hits = retrievedIds.filter((id) => relevantIds.has(id)).length;
    const precisionAtK = hits / topK;
    const recall = relevantIds.size === 0 ? 1 : hits / relevantIds.size;

    perQuery.push({
      query: fixture.query,
      area: fixture.area,
      hits,
      relevant: relevantIds.size,
      precisionAtK: round(precisionAtK),
      recall: round(recall),
      topResultIds: retrievedIds
    });
  }

  const totalPrecision = perQuery.reduce((sum, item) => sum + item.precisionAtK, 0);
  const totalRecall = perQuery.reduce((sum, item) => sum + item.recall, 0);

  return {
    retrievalVersion: RETRIEVAL_VERSION,
    k: topK,
    evaluatedQueries: perQuery.length,
    meanPrecisionAtK: round(totalPrecision / perQuery.length),
    meanRecallAtK: round(totalRecall / perQuery.length),
    perQuery
  };
}
