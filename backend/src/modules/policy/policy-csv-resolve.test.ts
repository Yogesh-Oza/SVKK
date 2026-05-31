import { describe, expect, it } from "vitest";
import {
  normalizeProductType,
  policyTypeKeyToAdVariant,
  resolvePolicyTypeFromCache,
  type PolicyTypeCache,
} from "./policy-csv-resolve.js";

function mockCache(): PolicyTypeCache {
  const types = [
    { id: "pt-ff", key: "family_floater", name: "Family Floater" },
    { id: "pt-ak", key: "asha_kiran", name: "Asha Kiran" },
  ];
  const byKey = new Map(types.map((t) => [t.key, t]));
  const byKeyNormalized = new Map(types.map((t) => [t.key, t]));
  const byNameNormalized = new Map(
    types.map((t) => [normalizeProductType(t.name), t]),
  );
  const aliasToKey = new Map<string, string>([
    [normalizeProductType("health"), "family_floater"],
    [normalizeProductType("mediclaim"), "family_floater"],
  ]);
  return {
    types,
    byKey,
    byKeyNormalized,
    byNameNormalized,
    aliasToKey,
    allowedLabels: () => types.map((t) => t.name).join(", "),
    fuzzyMatch: () => [],
  };
}

describe("policy-csv-resolve product type", () => {
  it("normalizes product type text", () => {
    expect(normalizeProductType("  Health Insurance ")).toBe("health insurance");
  });

  it("resolves health alias to family floater", () => {
    const cache = mockCache();
    const r = resolvePolicyTypeFromCache("health", cache);
    expect(r?.key).toBe("family_floater");
  });

  it("resolves case-insensitive name", () => {
    const cache = mockCache();
    expect(resolvePolicyTypeFromCache("FAMILY FLOATER", cache)?.key).toBe("family_floater");
  });

  it("maps policy type key to ad variant", () => {
    expect(policyTypeKeyToAdVariant("asha_kiran")).toBe("ASHA_KIRAN");
  });
});
