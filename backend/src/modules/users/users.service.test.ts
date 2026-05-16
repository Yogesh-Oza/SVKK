import { describe, expect, it, vi, beforeEach } from "vitest";
import { assertCanDeleteUser } from "./users.service.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import { LEGACY_ROLE_SLUGS } from "../../lib/permission-seed.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    rbacRole: {
      findUnique: vi.fn(),
    },
  },
}));

const findUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const count = prisma.user.count as ReturnType<typeof vi.fn>;
const findRole = prisma.rbacRole.findUnique as ReturnType<typeof vi.fn>;

describe("assertCanDeleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects self-delete", async () => {
    await expect(assertCanDeleteUser("u1", "u1")).rejects.toThrow(AppError);
    await expect(assertCanDeleteUser("u1", "u1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
    });
  });

  it("rejects when target user is missing", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(assertCanDeleteUser("actor", "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("rejects deleting last super admin", async () => {
    findUnique.mockResolvedValueOnce({
      id: "sa1",
      rbacRole: { slug: LEGACY_ROLE_SLUGS.SUPER_ADMIN },
    });
    findRole.mockResolvedValueOnce({ id: "role-sa" });
    count.mockResolvedValueOnce(1);
    await expect(assertCanDeleteUser("actor", "sa1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
    });
  });

  it("allows deleting a super admin when another exists", async () => {
    findUnique.mockResolvedValueOnce({
      id: "sa1",
      rbacRole: { slug: LEGACY_ROLE_SLUGS.SUPER_ADMIN },
    });
    findRole.mockResolvedValueOnce({ id: "role-sa" });
    count.mockResolvedValueOnce(2);
    await expect(assertCanDeleteUser("actor", "sa1")).resolves.toBeUndefined();
  });

  it("allows deleting non-super-admin when only one super admin in system", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u1",
      rbacRole: { slug: LEGACY_ROLE_SLUGS.USER },
    });
    await expect(assertCanDeleteUser("actor", "u1")).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
  });
});
