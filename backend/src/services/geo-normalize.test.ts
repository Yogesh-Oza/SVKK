import { describe, it, expect } from "vitest";
import { matchesGeoValue, normalizeGeoToken } from "./geo-normalize.js";

describe("geo-normalize", () => {
  it("trims whitespace", () => {
    expect(normalizeGeoToken("  Mumbai ")).toBe("Mumbai");
  });

  it("matches case-insensitively", () => {
    expect(matchesGeoValue("Mumbai", ["mumbai"])).toBe(true);
    expect(matchesGeoValue(null, ["mumbai"])).toBe(false);
  });
});
