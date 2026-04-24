import { describe, expect, it } from "vitest";
import { normalizeMobile } from "./phone.js";

describe("normalizeMobile", () => {
  it("maps 10-digit India local to E.164", () => {
    expect(normalizeMobile("9876543210")).toBe("+919876543210");
  });

  it("accepts already E.164 with +91", () => {
    expect(normalizeMobile("+919876543210")).toBe("+919876543210");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeMobile("98765 43210")).toBe("+919876543210");
    expect(normalizeMobile("98765-43210")).toBe("+919876543210");
  });
});
