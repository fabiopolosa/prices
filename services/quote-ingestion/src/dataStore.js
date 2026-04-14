import { randomUUID } from "node:crypto";

export class DataStore {
  constructor() {
    this.idempotency = new Map();
    this.canonicalQuotes = new Map();
    this.reviewQueue = [];
    this.confidenceProjection = new Map();
    this.processedConfidenceEventIds = new Set();
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

  applyConfidenceEvent(event) {
    if (!event || typeof event !== "object") {
      throw new Error("confidence event must be an object");
    }
    if (!event.eventId) {
      throw new Error("confidence event requires eventId");
    }
    if (this.processedConfidenceEventIds.has(event.eventId)) {
      return false;
    }

    this.processedConfidenceEventIds.add(event.eventId);

    const existing = this.confidenceProjection.get(event.canonicalQuoteId) || {
      canonicalQuoteId: event.canonicalQuoteId,
      latestPrice: event.latestPrice,
      currency: event.currency,
      winningSource: event.winningSource,
      lastConfidence: event.confidence,
      lastConfidenceBand: event.confidenceBand || null,
      lastSubmissionId: event.submissionId,
      lastSource: event.source,
      lastSourceEventId: event.sourceEventId || null,
      lastIdempotencyKey: event.idempotencyKey || null,
      lastEventId: event.eventId,
      lastEventSequence: event.sequence,
      updatedAt: event.emittedAt,
      appliedEvents: 0,
      sourceCounts: {}
    };

    existing.appliedEvents += 1;
    existing.sourceCounts[event.source] = (existing.sourceCounts[event.source] || 0) + 1;

    const shouldRefreshLatest = event.sequence >= existing.lastEventSequence;
    if (shouldRefreshLatest) {
      existing.latestPrice = event.latestPrice;
      existing.currency = event.currency;
      existing.winningSource = event.winningSource;
      existing.lastConfidence = event.confidence;
      existing.lastConfidenceBand = event.confidenceBand || null;
      existing.lastSubmissionId = event.submissionId;
      existing.lastSource = event.source;
      existing.lastSourceEventId = event.sourceEventId || null;
      existing.lastIdempotencyKey = event.idempotencyKey || null;
      existing.lastEventId = event.eventId;
      existing.lastEventSequence = event.sequence;
      existing.updatedAt = event.emittedAt;
    }

    this.confidenceProjection.set(event.canonicalQuoteId, existing);
    return true;
  }

  resetConfidenceProjection() {
    this.confidenceProjection.clear();
    this.processedConfidenceEventIds.clear();
  }

  listConfidenceProjection() {
    return Array.from(this.confidenceProjection.values());
  }
}
