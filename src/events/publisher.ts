import type { SamsEvent } from "./schemas";

export interface DomainEventPublisher {
  publish(events: SamsEvent[]): Promise<void>;
}

export class InMemoryEventPublisher implements DomainEventPublisher {
  readonly published: SamsEvent[] = [];

  async publish(events: SamsEvent[]): Promise<void> {
    this.published.push(...events);
  }
}
