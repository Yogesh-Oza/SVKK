import { describe, expect, it } from "vitest";
import { CATALOG_KEYS } from "../../domain/permissions/catalog.js";
import { resolvePermissionClosure } from "../../domain/permissions/dependencies.js";

describe("wallet permissions catalog", () => {
  const keys = [
    "wallet:read",
    "wallet:opening",
    "wallet:topup",
    "wallet:debit",
    "wallet:import",
    "wallet:export",
    "wallet:clear",
  ] as const;

  it("includes all wallet keys", () => {
    for (const k of keys) {
      expect(CATALOG_KEYS).toContain(k);
    }
  });

  it("action keys depend on wallet:read", () => {
    for (const k of keys) {
      if (k === "wallet:read") continue;
      const closure = resolvePermissionClosure([k]);
      expect(closure.has("wallet:read")).toBe(true);
    }
  });
});
