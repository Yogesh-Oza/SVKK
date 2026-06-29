import { describe, it, expect, vi, beforeEach } from "vitest";
import { backfillPolicyCommissionPermission } from "./migrate-rbac-v2-permissions.js";

function createMockClient() {
  const rolePermissions = new Map<string, { roleId: string; permissionId: string; effect: "ALLOW" | "DENY" }>();
  const key = (roleId: string, permissionId: string) => `${roleId}:${permissionId}`;

  const permIds = { update: "perm-update", commission: "perm-commission" };

  const client = {
    permission: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        if (where.key === "policy:update") return { id: permIds.update };
        if (where.key === "policy:commission") return { id: permIds.commission };
        return null;
      }),
    },
    rolePermission: {
      findMany: vi.fn(async () => [{ roleId: "role-admin" }, { roleId: "role-supervisor" }]),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { roleId_permissionId: { roleId: string; permissionId: string } };
        }) => {
          const { roleId, permissionId } = where.roleId_permissionId;
          return rolePermissions.get(key(roleId, permissionId)) ?? null;
        },
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { roleId_permissionId: { roleId: string; permissionId: string } };
          create: { roleId: string; permissionId: string; effect: "ALLOW" };
        }) => {
          const { roleId, permissionId } = where.roleId_permissionId;
          rolePermissions.set(key(roleId, permissionId), {
            roleId,
            permissionId,
            effect: create.effect,
          });
        },
      ),
    },
    rbacRole: {
      update: vi.fn(async () => ({})),
    },
    user: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (fn: (tx: typeof client) => Promise<void>) => fn(client)),
  };

  return { client, rolePermissions, permIds };
}

describe("backfillPolicyCommissionPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants policy:commission to roles with policy:update", async () => {
    const { client, rolePermissions, permIds } = createMockClient();

    await backfillPolicyCommissionPermission(client as never);

    expect(rolePermissions.get(`role-admin:${permIds.commission}`)?.effect).toBe("ALLOW");
    expect(rolePermissions.get(`role-supervisor:${permIds.commission}`)?.effect).toBe("ALLOW");
    expect(client.rbacRole.update).toHaveBeenCalledTimes(2);
  });

  it("is idempotent when commission already allowed", async () => {
    const { client, rolePermissions, permIds } = createMockClient();
    rolePermissions.set(`role-admin:${permIds.commission}`, {
      roleId: "role-admin",
      permissionId: permIds.commission,
      effect: "ALLOW",
    });
    rolePermissions.set(`role-supervisor:${permIds.commission}`, {
      roleId: "role-supervisor",
      permissionId: permIds.commission,
      effect: "ALLOW",
    });

    await backfillPolicyCommissionPermission(client as never);

    expect(client.rolePermission.upsert).not.toHaveBeenCalled();
    expect(client.rbacRole.update).not.toHaveBeenCalled();
  });
});
