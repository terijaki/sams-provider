import { SamsEventType, type SamsEvent } from "./schemas";

function uniqueDefined(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function clubUuidsForEvent(event: SamsEvent): string[] {
  switch (event.type) {
    case SamsEventType.clubUpdated:
      return [event.payload.uuid];
    case SamsEventType.clubSeasonTeamsUpdated:
    case SamsEventType.clubSeasonRostersUpdated:
    case SamsEventType.clubMatchScheduleUpdated:
      return [event.payload.club.uuid];
    case SamsEventType.teamRosterUpdated:
      return [event.payload.team.sportsclubUuid];
    case SamsEventType.matchBlockUpdated:
    case SamsEventType.matchesUpdated:
      return uniqueDefined(
        event.payload.matches.flatMap((match) => [
          match.team1.sportsclubUuid,
          match.team2.sportsclubUuid,
        ]),
      );
    case SamsEventType.leagueRankingUpdated:
      return uniqueDefined(event.payload.entries.map((entry) => entry.sportsclubUuid));
    case SamsEventType.clubsSyncCompleted:
    case SamsEventType.teamsSyncCompleted:
    case SamsEventType.syncCompleted:
    case SamsEventType.syncFailed:
      return [];
  }
}
