import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_MATCH_REFRESH_MODE, parseMatchRefreshMode } from "./mode";

describe("parseMatchRefreshMode", () => {
  it("defaults to adaptive when the event has no mode", () => {
    expect(parseMatchRefreshMode(undefined)).toBe(DEFAULT_MATCH_REFRESH_MODE);
    expect(parseMatchRefreshMode({})).toBe("adaptive");
    expect(parseMatchRefreshMode({ mode: "adaptive" })).toBe("adaptive");
  });

  it("selects snapshot when the scheduled target payload asks for it", () => {
    expect(parseMatchRefreshMode({ mode: "snapshot" })).toBe("snapshot");
  });

  it("ignores unknown mode values", () => {
    expect(parseMatchRefreshMode({ mode: "full" })).toBe("adaptive");
  });
});
