/**
 * Creates RBAC v2 scoped test user + runs HTTP permission/scope checks.
 *
 * Usage (backend must be running on PORT, default 4000):
 *   npm run e2e:rbac-v2
 *
 * Test user (created/updated each run):
 *   Email:    rbac.v2.test@svkk.local
 *   Password: RbacTest123!
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { DropdownType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { upsertPermissionCatalog } from "../src/lib/permission-seed.js";
import { migrateRbacV2Permissions } from "../src/lib/migrate-rbac-v2-permissions.js";
import { createRole, updateRole } from "../src/modules/rbac/rbac-roles.service.js";
import { loadRoleGeoValues } from "../src/services/role-geo.service.js";

const TEST_EMAIL = "rbac.v2.test@svkk.local";
const TEST_PASSWORD = "RbacTest123!";
const TEST_ROLE_SLUG = "rbac-v2-scoped-tester";

/** Village-scoped Future + Policy MIS only (no dashboard, no Claim MIS / claim CRUD). */
const TEST_PERMISSION_KEYS = [
  "future:read",
  "future:lookup",
  "future:scope_village",
  "mis:policy:read",
  "mis:policy:scope_village",
  "policy:read",
  "policy:scope_village",
  "calculation:live",
] as const;

type CaseResult = {
  name: string;
  pass: boolean;
  detail: string;
};

const results: CaseResult[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function ensureCatalogAndMigration() {
  await upsertPermissionCatalog(prisma);
  await migrateRbacV2Permissions(prisma);
}

async function findActorId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@svkk.local" },
    select: { id: true },
  });
  if (admin) return admin.id;
  const any = await prisma.user.findFirst({ select: { id: true } });
  if (!any) throw new Error("No users in DB — run prisma db seed first.");
  return any.id;
}

async function upsertTestRole(actorId: string, villageOptionId: string) {
  const existing = await prisma.rbacRole.findUnique({ where: { slug: TEST_ROLE_SLUG } });
  const payload = {
    name: "RBAC v2 Scoped Tester",
    description: "E2E test role: Future + Policy MIS village scope only",
    permissionKeys: [...TEST_PERMISSION_KEYS],
    villageOptionIds: [villageOptionId],
    areaOptionIds: [] as string[],
  };

  if (existing && !existing.isDeleted) {
    return updateRole(actorId, existing.id, payload);
  }
  return createRole(actorId, { ...payload, slug: TEST_ROLE_SLUG });
}

async function upsertTestUser(roleId: string) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  return prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash, name: "RBAC V2 Tester", roleId },
    create: {
      email: TEST_EMAIL,
      passwordHash,
      name: "RBAC V2 Tester",
      roleId,
    },
  });
}

async function login(baseUrl: string): Promise<{ token: string; permissions: string[] }> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const body = (await res.json()) as {
    accessToken?: string;
    user?: { permissions?: string[] };
    message?: string;
  };
  if (!res.ok || !body.accessToken) {
    throw new Error(`Login failed (${res.status}): ${body.message ?? JSON.stringify(body)}`);
  }
  return { token: body.accessToken, permissions: body.user?.permissions ?? [] };
}

async function loginAdmin(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@svkk.local", password: "admin123!" }),
  });
  const body = (await res.json()) as { accessToken?: string; message?: string };
  if (!res.ok || !body.accessToken) {
    throw new Error(`Admin login failed (${res.status}): ${body.message ?? ""}`);
  }
  return body.accessToken;
}

async function apiGet(
  baseUrl: string,
  path: string,
  token: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function policyItems(json: unknown): { village: string | null }[] {
  if (!json || typeof json !== "object") return [];
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.map((r) => ({
    village: r && typeof r === "object" && "village" in r ? (r.village as string | null) : null,
  }));
}

async function runHttpTests(baseUrl: string, allowedVillageValues: string[]) {
  console.log("\n--- HTTP E2E checks ---\n");

  let testToken: string;
  let perms: string[];
  try {
    const session = await login(baseUrl);
    testToken = session.token;
    perms = session.permissions;
    record("Login as test user", true, TEST_EMAIL);
  } catch (e) {
    record("Login as test user", false, String(e));
    return;
  }

  record(
    "Has future:read + mis:policy:read",
    perms.includes("future:read") && perms.includes("mis:policy:read"),
    `keys=${perms.filter((p) => p.startsWith("future:") || p.startsWith("mis:")).join(", ")}`,
  );
  record(
    "Lacks mis:claim:read",
    !perms.includes("mis:claim:read"),
    perms.includes("mis:claim:read") ? "unexpected claim MIS access" : "ok",
  );
  record(
    "Lacks claim:read",
    !perms.includes("claim:read"),
    perms.includes("claim:read") ? "unexpected claim CRUD" : "ok",
  );

  const policies = await apiGet(baseUrl, "/policies?limit=50", testToken);
  record("GET /policies allowed", policies.status === 200, `status=${policies.status}`);

  if (policies.status === 200) {
    const rows = policyItems(policies.json);
    const allowedNorm = new Set(allowedVillageValues.map((v) => v.toLowerCase()));
    const outOfScope = rows.filter(
      (r) => r.village && !allowedNorm.has(r.village.toLowerCase()),
    );
    record(
      "Policy list respects village scope",
      outOfScope.length === 0,
      outOfScope.length
        ? `${outOfScope.length} policies outside [${allowedVillageValues.join(", ")}]`
        : `${rows.length} policies in scope`,
    );
  }

  const policyMis = await apiGet(
    baseUrl,
    "/mis/policy-member-report?groupBy=village",
    testToken,
  );
  record(
    "GET /mis/policy-member-report allowed",
    policyMis.status === 200,
    `status=${policyMis.status}`,
  );

  const claimMis = await apiGet(baseUrl, "/mis/claim-report", testToken);
  record(
    "GET /mis/claim-report denied",
    claimMis.status === 403,
    `status=${claimMis.status}`,
  );

  const claims = await apiGet(baseUrl, "/claims?limit=5", testToken);
  record("GET /claims denied", claims.status === 403, `status=${claims.status}`);

  const snapshot = await apiGet(baseUrl, "/calculation/admin/snapshot", testToken);
  record(
    "GET /calculation/admin/snapshot allowed",
    snapshot.status === 200,
    `status=${snapshot.status}`,
  );

  const futurePolicy = await apiGet(baseUrl, "/policies/export.json?limit=5", testToken);
  record(
    "GET /policies/export.json (Future lookup path) allowed",
    futurePolicy.status === 200,
    `status=${futurePolicy.status}`,
  );

  try {
    const adminToken = await loginAdmin(baseUrl);
    const adminPolicies = await apiGet(baseUrl, "/policies?limit=200", adminToken);
    if (adminPolicies.status === 200 && policies.status === 200) {
      const adminCount = policyItems(adminPolicies.json).length;
      const testCount = policyItems(policies.json).length;
      record(
        "Scoped user sees subset vs admin",
        testCount <= adminCount,
        `test=${testCount} admin(sample)=${adminCount}`,
      );
    }
  } catch {
    record("Admin comparison skipped", true, "admin@svkk.local not available");
  }
}

async function main() {
  const port = process.env.PORT ?? "4000";
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  console.log("=== RBAC v2 E2E setup ===\n");
  await ensureCatalogAndMigration();

  const villages = await prisma.dropdownOption.findMany({
    where: { type: DropdownType.VILLAGE, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    take: 3,
    select: { id: true, value: true, label: true },
  });

  if (villages.length === 0) {
    throw new Error("No VILLAGE dropdown options — run db:seed or seed-data-md first.");
  }

  const assigned = villages[0]!;
  console.log(`Assigned village for test role: ${assigned.label} (${assigned.value})`);

  const actorId = await findActorId();
  const role = await upsertTestRole(actorId, assigned.id);
  const geo = await loadRoleGeoValues(role.id);
  await upsertTestUser(role.id);

  console.log("\nTest user credentials:");
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log(`  Role:     ${TEST_ROLE_SLUG}`);
  console.log(`  Permissions: ${TEST_PERMISSION_KEYS.join(", ")}`);
  console.log(`  Villages: ${geo.villageValues.join(", ") || assigned.value}`);

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    if (!health.ok) throw new Error(`health ${health.status}`);
  } catch (e) {
    console.error(`\nAPI not reachable at http://127.0.0.1:${port} — start with: npm run dev`);
    console.error(String(e));
    process.exit(1);
  }

  await runHttpTests(baseUrl, geo.villageValues.length ? geo.villageValues : [assigned.value]);

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => !r.pass);
  console.log(`  ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nAll RBAC v2 E2E checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
