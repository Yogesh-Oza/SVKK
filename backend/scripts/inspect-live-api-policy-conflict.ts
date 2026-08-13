/**
 * Read-only: log into the live API and list policies for a Policy Number.
 * Usage: npx tsx scripts/inspect-live-api-policy-conflict.ts
 */
const BASE = process.env.LIVE_API_BASE ?? "https://svkk.techui.co.in/api/v1";
const EMAIL = process.env.TEST_EMAIL ?? "admin@svkk.local";
const PASSWORD = process.env.TEST_PASSWORD ?? "admin123!";
const NEEDLE = process.env.POLICY_NO ?? "14010061252800002364";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { accessToken?: string; token?: string; message?: string };
  if (!res.ok) {
    throw new Error(`Login failed ${res.status}: ${json.message ?? JSON.stringify(json).slice(0, 400)}`);
  }
  const token = json.accessToken ?? json.token;
  if (!token) throw new Error("No token");
  return token;
}

async function main() {
  console.log("API:", BASE);
  const token = await login();
  console.log("Login OK");

  const url = new URL(`${BASE}/policies`);
  url.searchParams.set("search", NEEDLE);
  url.searchParams.set("groupBySvkk", "false");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("page", "1");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Policies ${res.status}: ${text.slice(0, 600)}`);
  }
  const json = JSON.parse(text) as {
    items?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
    total?: number;
    meta?: { total?: number };
  };
  const items = json.items ?? json.data ?? [];
  console.log("total:", json.total ?? json.meta?.total ?? items.length);
  console.log("returned:", items.length);
  for (const row of items) {
    const id = String(row.id);
    const detailRes = await fetch(`${BASE}/policies/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p = (await detailRes.json()) as Record<string, unknown>;
    const years = Array.isArray(p.years)
      ? (p.years as Array<Record<string, unknown>>).map((y) => ({
          label: y.yearLabel,
          start: y.policyStart,
          end: y.policyEnd,
          si: y.sumInsured,
        }))
      : [];
    console.log({
      id,
      policyNo: p.policyNo ?? row.policyNo,
      holderName: p.holderName ?? row.holderName,
      svkkPublicId:
        p.svkkPublicId ??
        (p.insuredParty as { svkkPublicId?: string } | undefined)?.svkkPublicId,
      policyType:
        (p.policyType as { name?: string } | undefined)?.name ?? p.policyTypeName,
      village: p.village ?? row.village,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      years,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
