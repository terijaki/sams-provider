import type { SamsEvent } from "./schemas";

export type PublishBatchItem = {
  event: SamsEvent;
  additionalClubUuids?: readonly string[];
};

export interface DomainEventPublisher {
  publish(items: Array<SamsEvent | PublishBatchItem>): Promise<void>;
}

export function asPublishBatchItem(item: SamsEvent | PublishBatchItem): PublishBatchItem {
  if (
    "event" in item &&
    item.event !== null &&
    typeof item.event === "object" &&
    "type" in item.event &&
    "payload" in item.event
  ) {
    return item;
  }
  return { event: item as SamsEvent };
}

export class InMemoryEventPublisher implements DomainEventPublisher {
  readonly published: SamsEvent[] = [];

  async publish(items: Array<SamsEvent | PublishBatchItem>): Promise<void> {
    for (const item of items) {
      this.published.push(asPublishBatchItem(item).event);
    }
  }
}
