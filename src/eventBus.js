export class EventBus {
  constructor() {
    this.events = [];
  }

  emit(event) {
    this.events.push(event);
  }

  listEvents() {
    return this.events;
  }
}
