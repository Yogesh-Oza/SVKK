import { money, parseCsv } from "../../lib/svkk/premium/csv";
import { dateParse, normalizeMember, relationshipOptions } from "../../lib/svkk/premium/engine";
import type { MemberInput, PolicyKey } from "../../lib/svkk/premium/types";
import type { CsvRowObject } from "./future-premium-types";

export function normKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getv(obj: CsvRowObject, keys: string[]): string {
  const map = Object.fromEntries(Object.entries(obj).map(([k, v]) => [normKey(k), v]));
  for (const key of keys) {
    const value = map[normKey(key)];
    if (String(value ?? "").trim() !== "") return String(value);
  }
  return "";
}

export function csvToRowObjects(rows: string[][]): CsvRowObject[] {
  const headers = (rows[0] ?? []).map((x) => String(x ?? ""));
  return rows
    .slice(1)
    .map((r) =>
      Object.fromEntries(headers.map((k, i) => [k, String(r[i] ?? "")])),
    )
    .filter((o) => Object.values(o).some((v) => String(v).trim() !== ""));
}

export function parseCsvFileText(text: string): CsvRowObject[] {
  const grid = parseCsv(text).filter((r) => r.some((v) => String(v || "").trim() !== ""));
  if (!grid.length) return [];
  const firstCell = grid[0]?.[0]?.trim().toUpperCase() ?? "";
  if (firstCell === "CSV_VERSION") {
    const headers = grid[1] ?? [];
    return grid
      .slice(2)
      .map((r) => Object.fromEntries(headers.map((k, i) => [k, String(r[i] ?? "")])))
      .filter((o) => Object.values(o).some((v) => String(v).trim() !== ""));
  }
  return csvToRowObjects(grid);
}

export function normPolicy(v: unknown): PolicyKey {
  const k = normKey(v);
  const aliases: Record<string, PolicyKey> = {
    individual: "individual",
    individual_policy: "individual",
    asha: "asha_kiran",
    asha_kiran: "asha_kiran",
    "asha-kiran": "asha_kiran",
    family: "family_floater",
    family_floater: "family_floater",
    "family-floater": "family_floater",
    floater: "family_floater",
    senior_citizen: "senior_citizen",
    "senior-citizen": "senior_citizen",
  };
  return aliases[k] ?? k;
}

function normRel(v: unknown, policy: PolicyKey, index: number): string {
  const key = normKey(v);
  const options = relationshipOptions(policy, index);
  return options.includes(key) ? key : options[0]!;
}

function normGender(v: unknown, rel: string, index: number): MemberInput["gender"] {
  const g = String(v || "").trim().toLowerCase();
  if (g === "male" || g === "female") return g;
  if (rel === "daughter") return "female";
  if (index === 0) return "male";
  return "";
}

function ymd(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function futureMemberCount(row: CsvRowObject): number {
  return (
    Number(
      getv(row, [
        "member_count",
        "persons",
        "person_count",
        "no_of_person",
        "no_of_persons",
        "no_of_members",
        "number_of_persons",
        "person count",
        "persons_insured",
        "persons insured",
      ]),
    ) || 0
  );
}

export function buildMembersFromFutureRow(
  row: CsvRowObject,
  policy: PolicyKey,
  targetCount: number,
): MemberInput[] {
  const holderName =
    getv(row, ["holder_name", "holder name", "policy_holder_name", "policy holder name"]) ||
    getv(row, ["member_1_name", "member1_name", "member 1 name"]) ||
    "Policy Holder";
  const holderDob = ymd(
    dateParse(
      getv(row, ["holder_dob", "holder dob", "member_1_dob", "member1_dob", "member 1 dob", "dob"]),
    ),
  );
  const out: MemberInput[] = [
    {
      name: holderName,
      dob: holderDob,
      relationship: "self",
      gender: normGender(
        getv(row, ["holder_gender", "holder gender", "member_1_gender", "member1_gender", "gender"]),
        "self",
        0,
      ),
      addOnRider: money(getv(row, ["holder_addon_rider", "member_1_addon_rider", "addon_rider"])) || 0,
    },
  ];

  const maxMembers = Math.min(Math.max(targetCount || 1, 1), 10);
  for (let i = 2; i <= maxMembers; i += 1) {
    const name = getv(row, [`member_${i}_name`, `member${i}_name`, `member ${i} name`]);
    const dob = ymd(dateParse(getv(row, [`member_${i}_dob`, `member${i}_dob`, `member ${i} dob`])));
    const relRaw = getv(row, [`member_${i}_relationship`, `member${i}_relationship`, `member ${i} relationship`]);
    const genderRaw = getv(row, [`member_${i}_gender`, `member${i}_gender`, `member ${i} gender`]);
    const rider = money(getv(row, [`member_${i}_addon_rider`, `member${i}_addon_rider`])) || 0;
    const hasAny = Boolean(
      String(name).trim() || String(dob).trim() || String(relRaw).trim() || String(genderRaw).trim() || rider,
    );
    if (!hasAny) continue;
    const rel = normRel(relRaw, policy, i - 1);
    out.push({
      name: name || `Member ${i - 1}`,
      dob,
      relationship: rel,
      gender: normGender(genderRaw, rel, i - 1),
      addOnRider: rider,
    });
  }

  return out.map((m, i) => normalizeMember(m, i, policy)) as MemberInput[];
}
