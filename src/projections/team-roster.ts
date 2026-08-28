import type { SamsRosterInput } from "@lib/db/schemas";
import { snapshotVersion } from "../events/schemas";
import {
  toClubProjection,
  toTeamProjection,
  type ClubRecord,
  type TeamRecord,
} from "./club-season-teams";

export type RosterPlayerRecord = SamsRosterInput["players"][number];
export type RosterOfficialRecord = SamsRosterInput["officials"][number];

export function rosterProjectionSnapshot(
  roster: Pick<SamsRosterInput, "players" | "officials">,
): string {
  return snapshotVersion({
    players: roster.players,
    officials: roster.officials,
  });
}

export function toRosterPlayerProjection(player: RosterPlayerRecord) {
  return {
    uuid: player.uuid,
    name: player.name,
    ...(player.jerseyNumber != null ? { jerseyNumber: player.jerseyNumber } : {}),
    ...(player.position ? { position: player.position } : {}),
    ...(player.portraitImageLink ? { portraitUrl: player.portraitImageLink } : {}),
  };
}

export function toRosterOfficialProjection(official: RosterOfficialRecord) {
  return {
    uuid: official.uuid,
    name: official.name,
    ...(official.role ? { role: official.role } : {}),
  };
}

export function toTeamRosterTeamProjection(team: TeamRecord) {
  return {
    ...toTeamProjection(team),
    sportsclubUuid: team.sportsclubUuid,
  };
}

export function buildTeamRosterProjection(args: {
  team: TeamRecord;
  roster?: Pick<SamsRosterInput, "players" | "officials" | "lastSyncedAt">;
  season: { uuid: string; name: string; current: boolean };
  projectedAt?: string;
  cachedAt?: string;
  isStale?: boolean;
}) {
  const players = args.roster?.players ?? [];
  const officials = args.roster?.officials ?? [];
  const projectedAt = args.projectedAt ?? new Date().toISOString();
  const cachedAt = args.cachedAt ?? args.roster?.lastSyncedAt ?? projectedAt;
  return {
    team: toTeamRosterTeamProjection(args.team),
    season: args.season,
    players: players.map(toRosterPlayerProjection),
    officials: officials.map(toRosterOfficialProjection),
    projectedAt,
    cachedAt,
    isStale: args.isStale ?? false,
  };
}

export function buildClubSeasonRostersProjection(args: {
  club: ClubRecord;
  teams: TeamRecord[];
  rostersByTeamUuid: Map<string, Pick<SamsRosterInput, "players" | "officials" | "lastSyncedAt">>;
  season: { uuid: string; name: string; current: boolean };
  projectedAt?: string;
  cachedAt?: string;
  isStale?: boolean;
}) {
  const projectedAt = args.projectedAt ?? new Date().toISOString();
  const rosterCachedAt = [...args.rostersByTeamUuid.values()]
    .map((roster) => roster.lastSyncedAt)
    .sort()
    .at(-1);
  const cachedAt = args.cachedAt ?? rosterCachedAt ?? projectedAt;
  const rosters = args.teams
    .filter((team) => team.sportsclubUuid === args.club.sportsclubUuid)
    .filter((team) => team.seasonUuid === args.season.uuid)
    .map((team) => {
      const roster = args.rostersByTeamUuid.get(team.uuid);
      const players = roster?.players ?? [];
      const officials = roster?.officials ?? [];
      return {
        team: toTeamRosterTeamProjection(team),
        players: players.map(toRosterPlayerProjection),
        officials: officials.map(toRosterOfficialProjection),
      };
    });
  return {
    club: toClubProjection(args.club),
    season: args.season,
    rosters,
    projectedAt,
    cachedAt,
    isStale: args.isStale ?? false,
  };
}
