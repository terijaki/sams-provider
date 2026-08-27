import type { EventEnvelope } from "./schemas";

export interface DomainEventPublisher {
  publish(events: EventEnvelope[]): Promise<void>;
}

export class InMemoryEventPublisher implements DomainEventPublisher {
  readonly published: EventEnvelope[] = [];

  async publish(events: EventEnvelope[]): Promise<void> {
    this.published.push(...events);
  }
}
