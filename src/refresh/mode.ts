export const MATCH_REFRESH_MODES = ["adaptive", "snapshot"] as const;

export type MatchRefreshMode = (typeof MATCH_REFRESH_MODES)[number];

export const DEFAULT_MATCH_REFRESH_MODE: MatchRefreshMode = "adaptive";

export const SNAPSHOT_REFRESH_STATE = "snapshot";

export function parseMatchRefreshMode(event: { mode?: string } | undefined): MatchRefreshMode {
  if (event?.mode === "snapshot") {
    return "snapshot";
  }
  return DEFAULT_MATCH_REFRESH_MODE;
}
