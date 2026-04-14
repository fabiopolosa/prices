import { randomUUID } from "node:crypto";

const ALL_EVENTS = "*";

function cloneEvent(event) {
  return {
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    schemaVersion: event.schemaVersion,
    emittedAt: event.emittedAt,
    payload: event.payload
  };
}

function toInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeSubscriptions(subscriptions) {
  if (!subscriptions || subscriptions.length === 0) {
    return new Set([ALL_EVENTS]);
  }
  return new Set(subscriptions);
}

function normalizeDirection(direction) {
  return direction === "desc" ? "desc" : "asc";
}

export class EventBus {
  constructor() {
    this.events = [];
    this.consumers = new Map();
  }

  registerConsumer({ name, subscriptions, handler }) {
    if (!name) {
      throw new Error("consumer name is required");
    }
    if (typeof handler !== "function") {
      throw new Error(`consumer "${name}" requires a handler function`);
    }
    if (this.consumers.has(name)) {
      throw new Error(`consumer "${name}" is already registered`);
    }

    this.consumers.set(name, {
      name,
      subscriptions: normalizeSubscriptions(subscriptions),
      handler,
      state: {
        processedEventIds: new Set(),
        deliveredCount: 0,
        skippedCount: 0,
        failedCount: 0,
        lastSequence: 0,
        lastDeliveredAt: null,
        lastError: null
      }
    });

    return this.getConsumerState(name);
  }

  clearConsumerState(consumerName) {
    const consumer = this.#requireConsumer(consumerName);
    consumer.state.processedEventIds.clear();
    consumer.state.deliveredCount = 0;
    consumer.state.skippedCount = 0;
    consumer.state.failedCount = 0;
    consumer.state.lastSequence = 0;
    consumer.state.lastDeliveredAt = null;
    consumer.state.lastError = null;
    return this.getConsumerState(consumerName);
  }

  emit(event) {
    if (!event || typeof event !== "object") {
      throw new Error("event must be an object");
    }
    if (!event.type) {
      throw new Error("event.type is required");
    }

    const envelope = {
      id: event.id || randomUUID(),
      sequence: this.events.length + 1,
      type: event.type,
      schemaVersion: event.schemaVersion || 1,
      emittedAt: event.emittedAt || new Date().toISOString(),
      payload: event.payload || {}
    };

    this.events.push(envelope);
    this.#deliverToSubscribedConsumers(envelope, { mode: "live" });
    return cloneEvent(envelope);
  }

  listEvents({ fromSequence = 1, toSequence = this.events.length } = {}) {
    const start = Math.max(1, toInteger(fromSequence, 1));
    const end = Math.min(this.events.length, toInteger(toSequence, this.events.length));

    if (end < start) {
      return [];
    }

    return this.events.slice(start - 1, end).map(cloneEvent);
  }

  replay({
    consumerName,
    fromSequence = 1,
    toSequence = this.events.length,
    direction = "asc",
    resetConsumerState = false
  } = {}) {
    const consumer = this.#requireConsumer(consumerName);
    if (resetConsumerState) {
      this.clearConsumerState(consumerName);
    }

    const start = Math.max(1, toInteger(fromSequence, 1));
    const end = Math.min(this.events.length, toInteger(toSequence, this.events.length));
    const normalizedDirection = normalizeDirection(direction);

    if (end < start) {
      return {
        consumerName,
        fromSequence: start,
        toSequence: end,
        direction: normalizedDirection,
        deliveredCount: 0,
        skippedCount: 0,
        failedCount: 0
      };
    }

    const events = this.events.slice(start - 1, end);
    const orderedEvents = normalizedDirection === "desc" ? [...events].reverse() : events;

    let deliveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const event of orderedEvents) {
      if (!this.#matchesSubscription(consumer, event.type)) {
        skippedCount += 1;
        continue;
      }
      const outcome = this.#deliverToConsumer(consumer, event, { mode: "replay" });
      if (outcome === "delivered") {
        deliveredCount += 1;
      } else if (outcome === "skipped") {
        skippedCount += 1;
      } else {
        failedCount += 1;
      }
    }

    return {
      consumerName,
      fromSequence: start,
      toSequence: end,
      direction: normalizedDirection,
      deliveredCount,
      skippedCount,
      failedCount
    };
  }

  getConsumerState(consumerName) {
    const consumer = this.#requireConsumer(consumerName);
    return {
      name: consumer.name,
      subscriptions: Array.from(consumer.subscriptions.values()),
      deliveredCount: consumer.state.deliveredCount,
      skippedCount: consumer.state.skippedCount,
      failedCount: consumer.state.failedCount,
      lastSequence: consumer.state.lastSequence,
      processedCount: consumer.state.processedEventIds.size,
      lastDeliveredAt: consumer.state.lastDeliveredAt,
      lastError: consumer.state.lastError
    };
  }

  listConsumers() {
    return Array.from(this.consumers.keys()).map((name) => this.getConsumerState(name));
  }

  #deliverToSubscribedConsumers(event, context) {
    for (const consumer of this.consumers.values()) {
      if (this.#matchesSubscription(consumer, event.type)) {
        this.#deliverToConsumer(consumer, event, context);
      }
    }
  }

  #deliverToConsumer(consumer, event, context) {
    if (consumer.state.processedEventIds.has(event.id)) {
      consumer.state.skippedCount += 1;
      return "skipped";
    }

    try {
      consumer.handler(cloneEvent(event), {
        mode: context.mode,
        consumerName: consumer.name
      });
      consumer.state.processedEventIds.add(event.id);
      consumer.state.deliveredCount += 1;
      consumer.state.lastSequence = Math.max(consumer.state.lastSequence, event.sequence);
      consumer.state.lastDeliveredAt = new Date().toISOString();
      consumer.state.lastError = null;
      return "delivered";
    } catch (error) {
      consumer.state.failedCount += 1;
      consumer.state.lastError = error instanceof Error ? error.message : String(error);
      return "failed";
    }
  }

  #matchesSubscription(consumer, type) {
    return consumer.subscriptions.has(ALL_EVENTS) || consumer.subscriptions.has(type);
  }

  #requireConsumer(consumerName) {
    if (!consumerName) {
      throw new Error("consumerName is required");
    }
    const consumer = this.consumers.get(consumerName);
    if (!consumer) {
      throw new Error(`unknown consumer "${consumerName}"`);
    }
    return consumer;
  }
}
