import { describe, it, expect } from "vitest";
import { getRequiredPermissionsForPath } from "@/lib/svkk/route-permissions";

describe("route-permissions v2", () => {
  it("maps future premium paths", () => {
    expect(getRequiredPermissionsForPath("/future-premium")).toEqual(["future:read"]);
    expect(getRequiredPermissionsForPath("/future-premium/lookup")).toEqual(["future:lookup"]);
  });

  it("maps MIS to either policy or claim read", () => {
    expect(getRequiredPermissionsForPath("/mis")).toEqual([
      "mis:policy:read",
      "mis:claim:read",
    ]);
  });
});
