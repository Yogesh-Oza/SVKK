import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { buildActivityLogWhere } from "./activity-log-scope.service.js";

describe("buildActivityLogWhere", () => {
  it("SUPER_ADMIN has no actor filter", () => {
    expect(buildActivityLogWhere({}, UserRole.SUPER_ADMIN)).toEqual({});
  });

  it("ADMIN restricts to USER and SUPERVISOR actors", () => {
    expect(buildActivityLogWhere({}, UserRole.ADMIN)).toEqual({
      user: { role: { in: [UserRole.USER, UserRole.SUPERVISOR] } },
    });
  });

  it("merges module filter with ADMIN actor filter", () => {
    expect(buildActivityLogWhere({ module: "policy" }, UserRole.ADMIN)).toEqual({
      AND: [{ module: "policy" }, { user: { role: { in: [UserRole.USER, UserRole.SUPERVISOR] } } }],
    });
  });
});
