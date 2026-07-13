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

  it("searches holder/ref/recipient via JSON payloads as well as columns", () => {
    expect(
      buildActivityLogWhere({ search: "Neeta Satyan" }, LEGACY_ROLE_SLUGS.SUPER_ADMIN),
    ).toEqual({
      OR: [
        { module: { contains: "Neeta Satyan" } },
        { action: { contains: "Neeta Satyan" } },
        { entityId: { contains: "Neeta Satyan" } },
        { entityType: { contains: "Neeta Satyan" } },
        { user: { name: { contains: "Neeta Satyan" } } },
        { user: { email: { contains: "Neeta Satyan" } } },
        { afterData: { string_contains: "Neeta Satyan" } },
        { beforeData: { string_contains: "Neeta Satyan" } },
      ],
    });
  });

  it("trims search and ignores blank search", () => {
    expect(buildActivityLogWhere({ search: "  " }, LEGACY_ROLE_SLUGS.SUPER_ADMIN)).toEqual({});
    expect(
      buildActivityLogWhere({ search: "  SVKK2627JUL6136  " }, LEGACY_ROLE_SLUGS.SUPER_ADMIN),
    ).toMatchObject({
      OR: expect.arrayContaining([
        { afterData: { string_contains: "SVKK2627JUL6136" } },
        { beforeData: { string_contains: "SVKK2627JUL6136" } },
      ]),
    });
  });
});
