import { describe, expect, it } from "vitest";
import { LEGACY_ROLE_SLUGS } from "../lib/permission-seed.js";
import { buildActivityLogWhere } from "./activity-log-scope.service.js";

describe("buildActivityLogWhere", () => {
  it("super-admin has no actor filter", () => {
    expect(buildActivityLogWhere({}, LEGACY_ROLE_SLUGS.SUPER_ADMIN)).toEqual({});
  });

  it("admin restricts to user and supervisor actors", () => {
    expect(buildActivityLogWhere({}, LEGACY_ROLE_SLUGS.ADMIN)).toEqual({
      user: {
        rbacRole: {
          slug: { in: [LEGACY_ROLE_SLUGS.USER, LEGACY_ROLE_SLUGS.SUPERVISOR] },
        },
      },
    });
  });

  it("merges module filter with admin actor filter", () => {
    expect(buildActivityLogWhere({ module: "policy" }, LEGACY_ROLE_SLUGS.ADMIN)).toEqual({
      AND: [
        { module: "policy" },
        {
          user: {
            rbacRole: {
              slug: { in: [LEGACY_ROLE_SLUGS.USER, LEGACY_ROLE_SLUGS.SUPERVISOR] },
            },
          },
        },
      ],
    });
  });

  it("filters by actor user id and role slug", () => {
    expect(
      buildActivityLogWhere(
        { userId: "u1", roleSlug: LEGACY_ROLE_SLUGS.USER },
        LEGACY_ROLE_SLUGS.SUPER_ADMIN,
      ),
    ).toEqual({
      AND: [
        { userId: "u1" },
        { user: { rbacRole: { slug: LEGACY_ROLE_SLUGS.USER } } },
      ],
    });
  });
});
