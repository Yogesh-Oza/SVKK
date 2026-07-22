import { describe, expect, it } from "vitest";
import { CATALOG_KEYS } from "./catalog.js";
import { PERMISSION_DEPENDENCIES, resolvePermissionClosure } from "./dependencies.js";

describe("policy archive permissions", () => {
  it("includes restore and purge in the catalog", () => {
    expect(CATALOG_KEYS).toContain("policy:restore");
    expect(CATALOG_KEYS).toContain("policy:purge");
    expect(CATALOG_KEYS).toContain("policy:delete");
  });

  it("requires policy:read for restore and purge", () => {
    expect(PERMISSION_DEPENDENCIES["policy:restore"]).toEqual(["policy:read"]);
    expect(PERMISSION_DEPENDENCIES["policy:purge"]).toEqual(["policy:read"]);
    expect(resolvePermissionClosure(["policy:restore"]).has("policy:read")).toBe(true);
    expect(resolvePermissionClosure(["policy:purge"]).has("policy:read")).toBe(true);
  });
});
