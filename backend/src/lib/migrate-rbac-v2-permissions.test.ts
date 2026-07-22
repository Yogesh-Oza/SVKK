import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  backfillPolicyCommissionPermission,
  backfillPolicyRestorePermission,
} from "./migrate-rbac-v2-permissions.js";

function createMockClient(permKeys: Record<string, string>) {
  const rolePermissions = new Map<string, { roleId: string; permissionId: string; effect: "ALLOW" | "DENY" }>();
  const key = (roleId: string, permissionId: string) => `${roleId}:${permissionId}`;

  const client = {
    permission: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const id = permKeys[where.key];
        return id ? { id } : null;
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

  return { client, rolePermissions };
}

describe("backfillPolicyCommissionPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants policy:commission to roles with policy:update", async () => {
    const { client, rolePermissions } = createMockClient({
      "policy:update": "perm-update",
      "policy:commission": "perm-commission",
    });

    await backfillPolicyCommissionPermission(client as never);

    expect(rolePermissions.get("role-admin:perm-commission")?.effect).toBe("ALLOW");
    expect(rolePermissions.get("role-supervisor:perm-commission")?.effect).toBe("ALLOW");
    expect(client.rbacRole.update).toHaveBeenCalledTimes(2);
  });

  it("is idempotent when commission already allowed", async () => {
    const { client, rolePermissions } = createMockClient({
      "policy:update": "perm-update",
      "policy:commission": "perm-commission",
    });
    rolePermissions.set("role-admin:perm-commission", {
      roleId: "role-admin",
      permissionId: "perm-commission",
      effect: "ALLOW",
    });
    rolePermissions.set("role-supervisor:perm-commission", {
      roleId: "role-supervisor",
      permissionId: "perm-commission",
      effect: "ALLOW",
    });

    await backfillPolicyCommissionPermission(client as never);

    expect(client.rolePermission.upsert).not.toHaveBeenCalled();
    expect(client.rbacRole.update).not.toHaveBeenCalled();
  });
});

describe("backfillPolicyRestorePermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants policy:restore to roles with policy:delete", async () => {
    const { client, rolePermissions } = createMockClient({
      "policy:delete": "perm-delete",
      "policy:restore": "perm-restore",
    });

    await backfillPolicyRestorePermission(client as never);

    expect(rolePermissions.get("role-admin:perm-restore")?.effect).toBe("ALLOW");
    expect(rolePermissions.get("role-supervisor:perm-restore")?.effect).toBe("ALLOW");
  });
});
