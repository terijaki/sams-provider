import { PutEventsCommand, EventBridgeClient } from "@aws-sdk/client-eventbridge";
import type { DomainEventPublisher } from "./publisher";
import { EVENT_SOURCE, type EventEnvelope } from "./schemas";

export class EventBridgePublisher implements DomainEventPublisher {
  constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
  ) {}

  async publish(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const chunkSize = 10;
    for (let index = 0; index < events.length; index += chunkSize) {
      const chunk = events.slice(index, index + chunkSize);
      const result = await this.client.send(
        new PutEventsCommand({
          Entries: chunk.map((event) => ({
            EventBusName: this.eventBusName,
            Source: EVENT_SOURCE,
            DetailType: event.type,
            Detail: JSON.stringify(event),
            Time: new Date(event.occurredAt),
          })),
        }),
      );
      if ((result.FailedEntryCount ?? 0) > 0) {
        throw new Error(`EventBridge PutEvents failed for ${result.FailedEntryCount} entries`);
      }
    }
  }
}
