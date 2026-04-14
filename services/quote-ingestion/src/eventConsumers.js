export const CONFIDENCE_ENRICHER_CONSUMER = "confidence-enricher";
export const CONFIDENCE_PROJECTION_CONSUMER = "confidence-projection";

function toConfidenceBand(confidence) {
  if (confidence >= 0.85) {
    return "high";
  }
  if (confidence >= 0.7) {
    return "medium";
  }
  return "low";
}

export function registerDefaultConsumers({ eventBus, dataStore }) {
  eventBus.registerConsumer({
    name: CONFIDENCE_ENRICHER_CONSUMER,
    subscriptions: ["quote.ingested.v1"],
    handler(event) {
      const payload = event.payload;
      eventBus.emit({
        type: "quote.confidence.v1",
        schemaVersion: 1,
        emittedAt: new Date().toISOString(),
        payload: {
          canonicalQuoteId: payload.canonicalQuoteId,
          source: payload.source,
          submissionId: payload.submissionId,
          confidence: payload.confidence,
          confidenceBand: toConfidenceBand(payload.confidence),
          winningSource: payload.winningSource,
          latestPrice: payload.latestPrice,
          currency: payload.currency,
          sourceEventId: payload.sourceEventId,
          idempotencyKey: payload.idempotencyKey
        }
      });
    }
  });

  eventBus.registerConsumer({
    name: CONFIDENCE_PROJECTION_CONSUMER,
    subscriptions: ["quote.confidence.v1"],
    handler(event) {
      dataStore.applyConfidenceEvent({
        eventId: event.id,
        sequence: event.sequence,
        emittedAt: event.emittedAt,
        ...event.payload
      });
    }
  });
}
