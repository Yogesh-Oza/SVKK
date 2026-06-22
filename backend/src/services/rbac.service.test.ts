import { describe, it, expect } from "vitest";
import { assertValidScopeSet } from "./rbac.service.js";
import { AppError } from "../errors/app-error.js";

describe("assertValidScopeSet", () => {
  it("requires Future scope when future:read is granted", () => {
    expect(() => assertValidScopeSet(["future:read"])).toThrow(AppError);
    expect(() =>
      assertValidScopeSet(["future:read", "future:scope_all"]),
    ).not.toThrow();
  });

  it("requires Policy MIS scope when mis:policy:read is granted", () => {
    expect(() => assertValidScopeSet(["mis:policy:read"])).toThrow(AppError);
    expect(() =>
      assertValidScopeSet(["mis:policy:read", "mis:policy:scope_village"]),
    ).not.toThrow();
  });

  it("requires Claim MIS scope when mis:claim:read is granted", () => {
    expect(() => assertValidScopeSet(["mis:claim:read"])).toThrow(AppError);
    expect(() =>
      assertValidScopeSet(["mis:claim:read", "mis:claim:scope_all"]),
    ).not.toThrow();
  });

  it("allows at most one scope per family", () => {
    expect(() =>
      assertValidScopeSet(["future:scope_all", "future:scope_village"]),
    ).toThrow(/Future scope/);
  });
});
