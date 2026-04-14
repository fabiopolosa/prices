import { randomUUID } from "node:crypto";

export class DataStore {
  constructor() {
    this.idempotency = new Map();
    this.canonicalQuotes = new Map();
    this.reviewQueue = [];
  }

  checkIdempotency(source, idempotencyKey) {
    if (!idempotencyKey) {
      return null;
    }
    return this.idempotency.get(`${source}:${idempotencyKey}`) || null;
  }

  rememberIdempotency(source, idempotencyKey, submissionId) {
    if (!idempotencyKey) {
      return;
    }
    this.idempotency.set(`${source}:${idempotencyKey}`, submissionId);
  }

  queueForReview(entry) {
    this.reviewQueue.push({
      id: randomUUID(),
      queuedAt: new Date().toISOString(),
      ...entry
    });
  }

  upsertCanonicalQuote(submission) {
    const canonicalKey = [
      submission.normalized.product.key,
      submission.normalized.store.key,
      submission.normalized.currency
    ].join("|");

    const existing = this.canonicalQuotes.get(canonicalKey);
    const lineageEntry = {
      submissionId: submission.id,
      source: submission.source,
      sourceEventId: submission.sourceEventId || null,
      idempotencyKey: submission.idempotencyKey || null,
      observedPrice: submission.normalized.price,
      observedAt: submission.receivedAt
    };

    if (!existing) {
      const created = {
        id: randomUUID(),
        canonicalKey,
        product: submission.normalized.product,
        store: submission.normalized.store,
        currency: submission.normalized.currency,
        latestPrice: submission.normalized.price,
        confidence: submission.confidence,
        winningSource: submission.source,
        lineages: [lineageEntry],
        updatedAt: submission.receivedAt
      };
      this.canonicalQuotes.set(canonicalKey, created);
      return created;
    }

    const isHigherConfidence = submission.confidence > existing.confidence;
    const isSameConfidenceNewer =
      submission.confidence === existing.confidence && submission.receivedAt >= existing.updatedAt;

    if (isHigherConfidence || isSameConfidenceNewer) {
      existing.latestPrice = submission.normalized.price;
      existing.confidence = submission.confidence;
      existing.winningSource = submission.source;
      existing.updatedAt = submission.receivedAt;
    }

    existing.lineages.push(lineageEntry);
    return existing;
  }

  listCanonicalQuotes() {
    return Array.from(this.canonicalQuotes.values());
  }

  listReviewQueue() {
    return this.reviewQueue;
  }
}
