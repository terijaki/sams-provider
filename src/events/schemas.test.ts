import { describe, expect, it } from "vite-plus/test";
import {
  createEventEnvelope,
  EventType,
  clubSeasonTeamsPayloadSchema,
  eventEnvelopeSchema,
} from "./schemas";

describe("event contracts", () => {
  it("creates a versioned club-season-teams envelope", () => {
    const payload = clubSeasonTeamsPayloadSchema.parse({
      club: {
        uuid: "club-1",
        name: "Example Club",
        slug: "example-club",
        logoUrl: "https://cdn.example/sams-logos/club-1.png",
      },
      season: { uuid: "season-1", name: "2026/27", current: true },
      teams: [
        {
          uuid: "team-1",
          name: "Example Club 1",
          slug: "example-club-1",
          leagueUuid: "league-1",
          leagueName: "Landesliga",
          leagueHierarchyLevel: 3,
        },
      ],
      projectedAt: "2026-08-27T12:00:00.000Z",
    });

    const event = createEventEnvelope({
      type: EventType.clubSeasonTeamsUpdated,
      sourceSyncId: "sync-1",
      occurredAt: "2026-08-27T12:00:00.000Z",
      eventId: "event-1",
      payload,
    });

    expect(eventEnvelopeSchema.parse(event).type).toBe("sams.club-season-teams.updated");
    expect(event.schemaVersion).toBe("1.0.0");
    expect(event.snapshotVersion).toHaveLength(16);
  });

  it("rejects payloads missing required projection fields", () => {
    expect(() =>
      createEventEnvelope({
        type: EventType.clubUpdated,
        sourceSyncId: "sync-1",
        payload: { uuid: "club-1" },
      }),
    ).toThrow();
  });
});
