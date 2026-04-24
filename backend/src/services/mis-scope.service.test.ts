import { describe, expect, it } from "vitest";
import { buildMisVillageWhere, mergeDateRange } from "./mis-scope.service.js";

describe("buildMisVillageWhere", () => {
  it("full scope without filter returns empty objects", () => {
    const w = buildMisVillageWhere({ kind: "full" }, undefined);
    expect(w.policy).toEqual({});
    expect(w.claim).toEqual({});
  });

  it("full scope with village pins both models", () => {
    const w = buildMisVillageWhere({ kind: "full" }, "V1");
    expect(w.policy).toEqual({ village: "V1" });
    expect(w.claim).toEqual({ village: "V1" });
  });

  it("restricted scope uses IN list", () => {
    const w = buildMisVillageWhere({ kind: "villages", villages: ["A", "B"] }, undefined);
    expect(w.policy).toEqual({ village: { in: ["A", "B"] } });
    expect(w.claim).toEqual({ village: { in: ["A", "B"] } });
  });

  it("restricted empty list matches nothing", () => {
    const w = buildMisVillageWhere({ kind: "villages", villages: [] }, undefined);
    expect(w.policy).toEqual({ id: { in: [] } });
    expect(w.claim).toEqual({ id: { in: [] } });
  });

  it("restricted with valid filter village matches exact", () => {
    const w = buildMisVillageWhere({ kind: "villages", villages: ["A", "B"] }, "A");
    expect(w.policy).toEqual({ village: "A" });
  });
});

describe("mergeDateRange", () => {
  const from = new Date("2025-01-01");
  const to = new Date("2025-12-31");
  it("adds date to policy and claim", () => {
    const base = {
      policy: { village: "X" } as const,
      claim: { village: "X" } as const,
    };
    const m = mergeDateRange(base, from, to);
    expect(m.policy).toEqual({ AND: [{ village: "X" }, { createdAt: { gte: from, lte: to } }] });
    expect(m.claim).toEqual({ AND: [{ village: "X" }, { createdAt: { gte: from, lte: to } }] });
  });
});
