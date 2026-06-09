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

export function getv(obj: CsvRowObject | undefined, keys: string[]): string {
  if (!obj) return "";
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

/** Map export labels (Male/Female/M/F) to quote gender. */
export function normExportGender(v: unknown, rel: string, index: number): MemberInput["gender"] {
  const g = String(v || "").trim().toLowerCase();
  if (g === "male" || g === "m") return "male";
  if (g === "female" || g === "f") return "female";
  if (rel === "daughter") return "female";
  if (index === 0) return "";
  return "";
}

function ymd(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function memberSlotFieldKeys(slot: number, field: string): string[] {
  const keys = [
    `member_${slot}_${field}`,
    `member${slot}_${field}`,
    `member ${slot} ${field}`,
  ];
  if (slot === 1) {
    if (field === "name") {
      keys.push(
        "holder_name",
        "holder name",
        "policy_holder_name",
        "policy holder name",
      );
    }
    if (field === "dob") {
      keys.push("holder_dob", "holder dob", "dob");
    }
    if (field === "gender") {
      keys.push("holder_gender", "holder gender", "gender");
    }
    if (field === "relationship") {
      keys.push("holder_relationship", "holder relationship");
    }
    if (field === "addon_rider") {
      keys.push("holder_addon_rider", "addon_rider");
    }
  }
  return keys;
}

function memberSlotHasData(row: CsvRowObject, slot: number): boolean {
  const name = getv(row, memberSlotFieldKeys(slot, "name"));
  const dob = getv(row, memberSlotFieldKeys(slot, "dob"));
  const rel = getv(row, memberSlotFieldKeys(slot, "relationship"));
  const gender = getv(row, memberSlotFieldKeys(slot, "gender"));
  const rider = money(getv(row, memberSlotFieldKeys(slot, "addon_rider"))) || 0;
  return Boolean(
    String(name).trim() || String(dob).trim() || String(rel).trim() || String(gender).trim() || rider,
  );
}

/** Highest member slot with export data (slots 1–12). */
export function detectMemberSlotCount(row: CsvRowObject): number {
  let maxSlot = 0;
  for (let slot = 1; slot <= 12; slot += 1) {
    if (memberSlotHasData(row, slot)) maxSlot = slot;
  }
  return maxSlot;
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
  const declared = futureMemberCount(row);
  const detected = detectMemberSlotCount(row);
  const slotCount = Math.min(Math.max(targetCount || declared || detected || 1, 1), 12);
  const out: MemberInput[] = [];

  for (let slot = 1; slot <= slotCount; slot += 1) {
    if (slot > 1 && !memberSlotHasData(row, slot)) continue;

    const name =
      getv(row, memberSlotFieldKeys(slot, "name")) ||
      (slot === 1 ? "Policy Holder" : `Member ${slot - 1}`);
    const dob = ymd(dateParse(getv(row, memberSlotFieldKeys(slot, "dob"))));
    const relRaw = getv(row, memberSlotFieldKeys(slot, "relationship"));
    const genderRaw = getv(row, memberSlotFieldKeys(slot, "gender"));
    const rider = money(getv(row, memberSlotFieldKeys(slot, "addon_rider"))) || 0;
    const rel =
      slot === 1 ? "self" : normRel(relRaw, policy, slot - 1);

    out.push({
      name,
      dob,
      relationship: rel,
      gender: normExportGender(genderRaw, rel, slot - 1),
      addOnRider: rider,
    });
  }

  return out.map((m, i) => normalizeMember(m, i, policy)) as MemberInput[];
}
