import { describe, expect, it } from "vitest";
import { computeBodyHash } from "./idempotency.service.js";

describe("computeBodyHash", () => {
  it("is stable for same object shape", () => {
    const a = computeBodyHash({ x: 1, y: { z: 2 } });
    const b = computeBodyHash({ y: { z: 2 }, x: 1 });
    expect(a).toBe(b);
  });
});
