import { describe, expect, it } from "vite-plus/test";
import { isSamsNotFoundResult } from "./not-found";

describe("isSamsNotFoundResult", () => {
  it("detects HTTP 404 responses", () => {
    expect(isSamsNotFoundResult({ response: { status: 404 } as Response })).toBe(true);
  });

  it("detects not-found messages in structured errors", () => {
    expect(isSamsNotFoundResult({ error: { message: "Team not found" } })).toBe(true);
    expect(isSamsNotFoundResult({ error: "404 Not Found" })).toBe(true);
  });

  it("returns false for other failures", () => {
    expect(isSamsNotFoundResult({ error: { message: "timeout" } })).toBe(false);
    expect(isSamsNotFoundResult({})).toBe(false);
  });
});
