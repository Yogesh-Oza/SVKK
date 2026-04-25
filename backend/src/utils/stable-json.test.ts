import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable-json.js";

describe("stableStringify", () => {
  it("orders object keys for hashing", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
});
