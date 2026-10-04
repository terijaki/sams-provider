import type { SamsEvent } from "./schemas";
import { clubUuidsForEvent } from "./club-uuids-for-event";

/** EventBridge `Detail` JSON: contract envelope plus optional routing metadata. */
export function eventBridgeDetail(
  event: SamsEvent,
  additionalClubUuids: readonly string[] = [],
): string {
  const clubUuids = [
    ...new Set([...clubUuidsForEvent(event), ...additionalClubUuids].filter(Boolean)),
  ];
  if (clubUuids.length === 0) {
    return JSON.stringify(event);
  }
  return JSON.stringify({ ...event, clubUuids });
}
