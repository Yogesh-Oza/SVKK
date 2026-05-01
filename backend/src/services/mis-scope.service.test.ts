import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import {
  assertPolicyReadable,
  buildPolicyReadWhere,
  buildMisVillageWhere,
  mergeDateRange,
} from "./mis-scope.service.js";

const notDeleted = { deletedAt: null } as const;

describe("buildMisVillageWhere", () => {
  it("full scope without filter only excludes soft-deleted policies; claims have no extra predicate", () => {
    const w = buildMisVillageWhere({ kind: "full" }, undefined);
    expect(w.policy).toEqual(notDeleted);
    expect(w.claim).toEqual({});
  });

  it("full scope with village pins both models", () => {
    const w = buildMisVillageWhere({ kind: "full" }, ["V1"]);
    expect(w.policy).toEqual({ AND: [notDeleted, { village: { in: ["V1"] } }] });
    expect(w.claim).toEqual({ village: { in: ["V1"] } });
  });

  it("accepts a single village string (legacy callers)", () => {
    const w = buildMisVillageWhere({ kind: "full" }, "V1");
    expect(w.policy).toEqual({ AND: [notDeleted, { village: { in: ["V1"] } }] });
  });

  it("restricted scope uses IN list", () => {
    const w = buildMisVillageWhere({ kind: "villages", villages: ["A", "B"] }, undefined);
    expect(w.policy).toEqual({ AND: [notDeleted, { village: { in: ["A", "B"] } }] });
    expect(w.claim).toEqual({ village: { in: ["A", "B"] } });
  });

  it("restricted empty list matches nothing", () => {
    const w = buildMisVillageWhere({ kind: "villages", villages: [] }, undefined);
    expect(w.policy).toEqual({ id: { in: [] } });
    expect(w.claim).toEqual({ id: { in: [] } });
  });

  it("restricted with valid filter village matches exact", () => {
    const w = buildMisVillageWhere({ kind: "villages", villages: ["A", "B"] }, ["A"]);
    expect(w.policy).toEqual({ AND: [notDeleted, { village: { in: ["A"] } }] });
    expect(w.claim).toEqual({ village: { in: ["A"] } });
  });
});

describe("buildPolicyReadWhere", () => {
  it("USER is scoped to createdById", () => {
    const w = buildPolicyReadWhere({ kind: "villages", villages: [] }, undefined, "u1", UserRole.USER);
    expect(w).toEqual({ deletedAt: null, createdById: "u1" });
  });

  it("USER can filter by village", () => {
    const w = buildPolicyReadWhere({ kind: "villages", villages: [] }, "V1", "u1", UserRole.USER);
    expect(w).toEqual({ deletedAt: null, createdById: "u1", village: "V1" });
  });

  it("ADMIN uses village scope from buildMisVillageWhere", () => {
    const w = buildPolicyReadWhere({ kind: "full" }, "X", "u1", UserRole.ADMIN);
    expect(w).toEqual({ AND: [notDeleted, { village: { in: ["X"] } }] });
  });

  it("ADMIN can filter by multiple villages via filterVillages", () => {
    const w = buildPolicyReadWhere({ kind: "full" }, undefined, "u1", UserRole.ADMIN, ["V1", "V2"]);
    expect(w).toEqual({ AND: [notDeleted, { village: { in: ["V1", "V2"] } }] });
  });
});

describe("assertPolicyReadable", () => {
  it("allows USER when they created the policy", () => {
    expect(() =>
      assertPolicyReadable(
        { village: "V1", createdById: "u1" },
        "u1",
        UserRole.USER,
        { kind: "villages", villages: [] },
      ),
    ).not.toThrow();
  });

  it("denies USER for another creator", () => {
    expect(() =>
      assertPolicyReadable(
        { village: "V1", createdById: "other" },
        "u1",
        UserRole.USER,
        { kind: "villages", villages: [] },
      ),
    ).toThrow();
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
