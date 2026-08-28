import { createHash } from "node:crypto";

export function mapRosterPlayers(
  teamUuid: string,
  players: Array<{
    uuid?: string;
    name?: string | null;
    jerseyNumber?: number | null;
    position?: string | null;
    portraitImageLink?: string | null;
  }>,
) {
  const mapped = [];
  for (const player of players) {
    if (!player.name?.trim()) {
      continue;
    }
    mapped.push({
      uuid:
        player.uuid ??
        pseudoRosterUuid(teamUuid, "player", player.name, player.jerseyNumber ?? undefined),
      name: player.name,
      ...(player.jerseyNumber != null ? { jerseyNumber: player.jerseyNumber } : {}),
      ...(player.position ? { position: player.position } : {}),
      ...(player.portraitImageLink ? { portraitImageLink: player.portraitImageLink } : {}),
    });
  }
  return mapped;
}

export function mapRosterOfficials(
  teamUuid: string,
  officials: Array<{ uuid?: string; name?: string | null; role?: string | null }>,
) {
  const mapped = [];
  for (const official of officials) {
    if (!official.name?.trim()) {
      continue;
    }
    mapped.push({
      uuid:
        official.uuid ??
        pseudoRosterUuid(teamUuid, "official", official.name, official.role ?? undefined),
      name: official.name,
      ...(official.role ? { role: official.role } : {}),
    });
  }
  return mapped;
}

function pseudoRosterUuid(
  teamUuid: string,
  kind: "player" | "official",
  ...parts: (string | number | undefined)[]
): string {
  const input = [teamUuid, kind, ...parts.map((part) => String(part ?? ""))].join("|");
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
