import "dotenv/config";
import { canAccessPath, getRequiredPermissionsForPath } from "../lib/svkk/route-permissions";

type LoginResult = {
  accessToken: string;
  user: {
    email: string;
    roleSlug: string;
    permissions: string[];
  };
};

type RouteCheck = {
  path: string;
  expected: boolean;
};

const API_BASE = process.env.SVKK_API_URL ?? "http://127.0.0.1:4000/api/v1";

const USERS: Array<{
  label: string;
  email: string;
  password: string;
  optional?: boolean;
  checks: RouteCheck[];
}> = [
  {
    label: "Super Admin seed user",
    email: "admin@svkk.local",
    password: "admin123!",
    checks: [
      { path: "/dashboard", expected: true },
      { path: "/roles", expected: true },
      { path: "/users", expected: true },
      { path: "/admin", expected: true },
      { path: "/receipt-settings", expected: true },
      { path: "/email-templates", expected: true },
      { path: "/category-form", expected: true },
      { path: "/notifications", expected: true },
    ],
  },
  {
    label: "Supervisor seed user",
    email: "supervisor@svkk.local",
    password: "supervisor123!",
    checks: [
      { path: "/dashboard", expected: true },
      { path: "/policies", expected: true },
      { path: "/claims", expected: true },
      { path: "/wallet", expected: true },
      { path: "/mis", expected: true },
      { path: "/roles", expected: false },
      { path: "/users", expected: false },
      { path: "/admin", expected: false },
      { path: "/receipt-settings", expected: false },
    ],
  },
  {
    label: "Basic user seed user",
    email: "user@svkk.local",
    password: "user123!",
    optional: true,
    checks: [
      { path: "/dashboard", expected: true },
      { path: "/policies", expected: true },
      { path: "/policies/new", expected: true },
      { path: "/claims", expected: false },
      { path: "/wallet", expected: false },
      { path: "/mis", expected: false },
      { path: "/roles", expected: false },
      { path: "/users", expected: false },
      { path: "/notifications", expected: true },
    ],
  },
];

function line(ok: boolean, message: string) {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${message}`);
}

async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as Partial<LoginResult> & { message?: string };
  if (!res.ok || !json.accessToken || !json.user) {
    throw new Error(`Login failed for ${email}: ${res.status} ${json.message ?? ""}`.trim());
  }
  return json as LoginResult;
}

function verifyChecks(
  permissions: string[],
  checks: RouteCheck[],
): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  for (const check of checks) {
    const actual = canAccessPath(permissions, check.path);
    const required = getRequiredPermissionsForPath(check.path)?.join(" OR ") ?? "(authenticated)";
    const ok = actual === check.expected;
    if (ok) {
      passed += 1;
    } else {
      failed += 1;
    }
    line(
      ok,
      `${check.path} => expected=${check.expected} actual=${actual} required=${required}`,
    );
  }
  return { passed, failed };
}

async function main() {
  console.log(`Verifying SVKK UI route access rules against ${API_BASE}\n`);

  let totalPassed = 0;
  let totalFailed = 0;

  for (const candidate of USERS) {
    console.log(`\n${candidate.label}`);
    console.log(`  user=${candidate.email}`);
    let session: LoginResult;
    try {
      session = await login(candidate.email, candidate.password);
    } catch (error) {
      if (candidate.optional) {
        line(true, `skipped optional user: ${String(error)}`);
        continue;
      }
      throw error;
    }
    console.log(`  role=${session.user.roleSlug}`);
    console.log(`  permissions=${session.user.permissions.length}`);
    const result = verifyChecks(session.user.permissions, candidate.checks);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log(`\nSummary: ${totalPassed} passed, ${totalFailed} failed`);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
