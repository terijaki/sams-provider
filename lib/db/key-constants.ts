export const SK_METADATA = "METADATA";

export const samsClubPk = (sportsclubUuid: string): string => `club#${sportsclubUuid}`;
export const samsAssociationPk = (uuid: string): string => `association#${uuid}`;
export const samsTeamPk = (uuid: string): string => `team#${uuid}`;
export const samsRosterPk = (teamUuid: string): string => `roster#${teamUuid}`;
export const samsSeasonPk = (uuid: string): string => `season#${uuid}`;
export const samsLeaguePk = (uuid: string): string => `league#${uuid}`;
export const samsMatchPk = (uuid: string): string => `match#${uuid}`;
export const samsSyncMetaPk = (job: string): string => `sync#${job}`;
export const samsProjectionPk = (kind: string, id: string): string => `projection#${kind}#${id}`;
