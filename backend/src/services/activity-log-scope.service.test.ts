import { describe, expect, it, vi } from "vitest";
import { LEGACY_ROLE_SLUGS } from "../lib/permission-seed.js";
import {
  activityLogIdsMatchingPayload,
  buildActivityLogWhere,
  sanitizeActivityLogSearchTerm,
} from "./activity-log-scope.service.js";

describe("sanitizeActivityLogSearchTerm", () => {
  it("trims and strips LIKE metacharacters", () => {
    expect(sanitizeActivityLogSearchTerm("  dhiraj  ")).toBe("dhiraj");
    expect(sanitizeActivityLogSearchTerm("100%_done")).toBe("100done");
  });
});

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

  it("includes payload match ids in search OR", () => {
    expect(
      buildActivityLogWhere(
        { search: "dhiraj" },
        LEGACY_ROLE_SLUGS.SUPER_ADMIN,
        { payloadMatchIds: ["log-1", "log-2"] },
      ),
    ).toEqual({
      OR: [
        { module: { contains: "dhiraj" } },
        { action: { contains: "dhiraj" } },
        { entityId: { contains: "dhiraj" } },
        { entityType: { contains: "dhiraj" } },
        { user: { name: { contains: "dhiraj" } } },
        { user: { email: { contains: "dhiraj" } } },
        { id: { in: ["log-1", "log-2"] } },
      ],
    });
  });

  it("omits id clause when payload match list is empty", () => {
    const where = buildActivityLogWhere(
      { search: "dhiraj" },
      LEGACY_ROLE_SLUGS.SUPER_ADMIN,
      { payloadMatchIds: [] },
    );
    expect(where).toEqual({
      OR: [
        { module: { contains: "dhiraj" } },
        { action: { contains: "dhiraj" } },
        { entityId: { contains: "dhiraj" } },
        { entityType: { contains: "dhiraj" } },
        { user: { name: { contains: "dhiraj" } } },
        { user: { email: { contains: "dhiraj" } } },
      ],
    });
  });
});

describe("activityLogIdsMatchingPayload", () => {
  it("returns empty for blank or wildcard-only terms", async () => {
    const prisma = { $queryRaw: vi.fn() };
    await expect(activityLogIdsMatchingPayload(prisma as never, "  ")).resolves.toEqual([]);
    await expect(activityLogIdsMatchingPayload(prisma as never, "%%")).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("queries CAST LIKE and returns ids", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
    };
    await expect(activityLogIdsMatchingPayload(prisma as never, "dhiraj")).resolves.toEqual([
      "a",
      "b",
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
});
