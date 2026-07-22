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

  it("maps recycle bin to archive permissions", () => {
    expect(getRequiredPermissionsForPath("/policies/archive")).toEqual([
      "policy:delete",
      "policy:restore",
      "policy:purge",
    ]);
  });

  it("keeps policy create and read distinct from archive", () => {
    expect(getRequiredPermissionsForPath("/policies/new")).toEqual(["policy:create"]);
    expect(getRequiredPermissionsForPath("/policies")).toEqual(["policy:read"]);
  });
});
