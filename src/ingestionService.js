import { randomUUID } from "node:crypto";
import { normalizePrice, normalizeProduct, normalizeStore } from "./normalization.js";

const SOURCE_CONFIDENCE = {
  ugc: 0.6,
  merchant: 0.9,
  call_confirmed: 0.85
};

export class IngestionService {
  constructor({ dataStore, eventBus }) {
    this.dataStore = dataStore;
    this.eventBus = eventBus;
  }

  ingest({ source, payload, idempotencyKey }) {
    const mappedSource = source === "call-confirmed" ? "call_confirmed" : source;
    const duplicateSubmissionId = this.dataStore.checkIdempotency(mappedSource, idempotencyKey);

    if (duplicateSubmissionId) {
      return {
        status: "duplicate",
        duplicateOfSubmissionId: duplicateSubmissionId
      };
    }

    try {
      const normalized = {
        product: normalizeProduct(payload.product),
        store: normalizeStore(payload.store),
        ...normalizePrice(payload.price, payload.currency)
      };

      const submission = {
        id: randomUUID(),
        source: mappedSource,
        sourceEventId: payload.sourceEventId || null,
        idempotencyKey: idempotencyKey || null,
        receivedAt: new Date().toISOString(),
        normalized,
        confidence: SOURCE_CONFIDENCE[mappedSource] ?? 0.5
      };

      this.dataStore.rememberIdempotency(mappedSource, idempotencyKey, submission.id);
      const canonicalQuote = this.dataStore.upsertCanonicalQuote(submission);

      this.eventBus.emit({
        type: "quote.confidence.v1",
        schemaVersion: 1,
        emittedAt: submission.receivedAt,
        payload: {
          canonicalQuoteId: canonicalQuote.id,
          source: mappedSource,
          submissionId: submission.id,
          confidence: submission.confidence,
          winningSource: canonicalQuote.winningSource,
          latestPrice: canonicalQuote.latestPrice,
          currency: canonicalQuote.currency
        }
      });

      return {
        status: "accepted",
        submissionId: submission.id,
        canonicalQuoteId: canonicalQuote.id
      };
    } catch (error) {
      this.dataStore.queueForReview({
        source: mappedSource,
        reason: error.message,
        rawPayload: payload,
        idempotencyKey: idempotencyKey || null
      });

      return {
        status: "queued_for_review",
        reason: error.message
      };
    }
  }
}
