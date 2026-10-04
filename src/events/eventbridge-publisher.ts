import { PutEventsCommand, EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { asPublishBatchItem, type DomainEventPublisher, type PublishBatchItem } from "./publisher";
import { eventBridgeDetail } from "./eventbridge-detail";
import { EVENT_SOURCE, type SamsEvent } from "./schemas";

export class EventBridgePublisher implements DomainEventPublisher {
  constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
  ) {}

  async publish(items: Array<SamsEvent | PublishBatchItem>): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const batch = items.map(asPublishBatchItem);
    const chunkSize = 10;
    for (let index = 0; index < batch.length; index += chunkSize) {
      const chunk = batch.slice(index, index + chunkSize);
      const result = await this.client.send(
        new PutEventsCommand({
          Entries: chunk.map(({ event, additionalClubUuids }) => ({
            EventBusName: this.eventBusName,
            Source: EVENT_SOURCE,
            DetailType: event.type,
            Detail: eventBridgeDetail(event, additionalClubUuids),
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
