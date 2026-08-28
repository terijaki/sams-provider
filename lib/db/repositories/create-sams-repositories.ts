import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SamsAssociationsRepository } from "./sams-associations-repository";
import { SamsClubsRepository } from "./sams-clubs-repository";
import { SamsLeaguesRepository } from "./sams-leagues-repository";
import { SamsMatchesRepository } from "./sams-matches-repository";
import { SamsRostersRepository } from "./sams-rosters-repository";
import { SamsSeasonsRepository } from "./sams-seasons-repository";
import { SamsSyncMetaRepository } from "./sams-sync-meta-repository";
import { SamsTeamsRepository } from "./sams-teams-repository";

export function createSamsRepositories(documentClient: DynamoDBDocumentClient, tableName: string) {
  return {
    associations: new SamsAssociationsRepository(documentClient, tableName),
    clubs: new SamsClubsRepository(documentClient, tableName),
    teams: new SamsTeamsRepository(documentClient, tableName),
    rosters: new SamsRostersRepository(documentClient, tableName),
    seasons: new SamsSeasonsRepository(documentClient, tableName),
    leagues: new SamsLeaguesRepository(documentClient, tableName),
    matches: new SamsMatchesRepository(documentClient, tableName),
    syncMeta: new SamsSyncMetaRepository(documentClient, tableName),
  };
}

export type SamsRepositories = ReturnType<typeof createSamsRepositories>;
