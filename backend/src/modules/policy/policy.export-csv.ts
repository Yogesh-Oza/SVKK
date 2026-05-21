import type { Prisma } from "@prisma/client";
import { maskInsuredParty } from "../../domain/pii.js";
import {
  formatCategoryLabel,
  type CategoryRef,
} from "../../lib/category-display.js";
import { prisma } from "../../lib/prisma.js";
import { parsePolicyListOrderBy, POLICY_LIST_EXPORT_MAX_ROWS } from "./policy.list.js";

const exportInclude = {
  insuredParty: true,
  policyType: { select: { key: true, name: true } },
  category: { select: { key: true, name: true } },
  years: {
    where: { deletedAt: null },
    orderBy: { yearLabel: "desc" as const },
    include: {
      members: { where: { deletedAt: null }, orderBy: { name: "asc" as const } },
      payments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" as const },
        include: { cheque: { select: { number: true, status: true, bankName: true } } },
      },
    },
  },
} satisfies Prisma.PolicyInclude;

export type PolicyExportRow = Prisma.PolicyGetPayload<{ include: typeof exportInclude }>;

const MAX_MEMBER_SLOTS_CAP = 12;

const MEMBER_SLOT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "dob", label: "DOB" },
  { key: "relationship", label: "Relationship" },
  { key: "gender", label: "Gender" },
  { key: "sumInsured", label: "Sum insured" },
  { key: "basicPremium", label: "Basic premium" },
  { key: "cumulativeBonus", label: "Cumulative bonus" },
  { key: "memberPhone", label: "Phone" },
  { key: "ageAtEntry", label: "Age at entry" },
] as const;

function csvCell(value: unknown): string {
  if (value == null) return "";
  const s =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : value instanceof Date
        ? value.toISOString()
        : typeof value === "object" && value !== null && "toString" in value
          ? String((value as { toString: () => string }).toString())
          : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function fmtDecimal(v: Prisma.Decimal | null | undefined): string {
  if (v == null) return "";
  return v.toString();
}

function formatPolicyUrl(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const t = raw.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown[];
      if (Array.isArray(arr)) return `${arr.length} document(s)`;
    } catch {
      /* fall through */
    }
  }
  return t.length > 200 ? `${t.slice(0, 197)}…` : t;
}

function summarizePayments(
  payments: PolicyExportRow["years"][number]["payments"],
): string {
  if (!payments.length) return "";
  return payments
    .map((p) => {
      const chequeNo = p.cheque?.number ? ` chq ${p.cheque.number}` : "";
      return `${p.method} ${fmtDecimal(p.amount)} (${p.status})${chequeNo}`;
    })
    .join("; ");
}

export function pickExportPolicyYear(
  years: PolicyExportRow["years"],
  preferredYearLabels: string[],
): PolicyExportRow["years"][number] | undefined {
  if (!years.length) return undefined;
  if (preferredYearLabels.length) {
    for (const label of preferredYearLabels) {
      const found = years.find((y) => y.yearLabel === label);
      if (found) return found;
    }
    const any = years.find((y) => preferredYearLabels.includes(y.yearLabel));
    if (any) return any;
  }
  return years[0];
}

function memberCellValue(
  member: PolicyExportRow["years"][number]["members"][number] | undefined,
  key: (typeof MEMBER_SLOT_FIELDS)[number]["key"],
): string {
  if (!member) return "";
  switch (key) {
    case "name":
    case "relationship":
    case "gender":
    case "memberPhone":
      return member[key] ?? "";
    case "dob":
      return fmtDate(member.dob);
    case "sumInsured":
    case "basicPremium":
    case "cumulativeBonus":
      return fmtDecimal(member[key]);
    case "ageAtEntry":
      return member.ageAtEntry != null ? String(member.ageAtEntry) : "";
    default:
      return "";
  }
}

/** Base policy + year columns (members appended separately). */
const BASE_HEADERS = [
  "SVKK ID",
  "Reference no",
  "Policy no",
  "Customer ID",
  "Holder name",
  "Holder email",
  "Holder mobile",
  "Holder PAN",
  "Holder Aadhaar",
  "Holder DOB",
  "Holder gender",
  "Holder age",
  "Holder relationship",
  "Category",
  "Policy type",
  "Product (AD)",
  "Policy grouping",
  "Village",
  "Area",
  "City",
  "State",
  "Pincode",
  "Address line 1",
  "Address line 2",
  "Address line 3",
  "Address line 4",
  "Contact phone",
  "WhatsApp",
  "Nominee name",
  "Nominee relation",
  "Period year",
  "Period month",
  "Persons insured",
  "Insurance company",
  "TPA",
  "Remarks",
  "Year label",
  "Policy start",
  "Policy end",
  "Sum insured",
  "Gross premium",
  "VKK premium",
  "SVKK premium",
  "Net premium",
  "Expected net premium",
  "Tax %",
  "Tax amount",
  "VKK commission",
  "Commission amount",
  "Two lac floater",
  "Year policy holder premium",
  "Diff paid by holder",
  "Gaam mahajan VKK",
  "Gaam mahajan contribution",
  "Excess / short",
  "Payment mode",
  "Payment type",
  "Amount received",
  "Bank name",
  "UTR reference",
  "Year remarks",
  "Payments",
  "Documents",
  "Created at",
  "Updated at",
] as const;

function buildMemberHeaders(maxSlots: number): string[] {
  const headers: string[] = [];
  for (let i = 1; i <= maxSlots; i++) {
    for (const f of MEMBER_SLOT_FIELDS) {
      headers.push(`Member ${i} ${f.label}`);
    }
  }
  return headers;
}

function rowToBaseCells(
  r: PolicyExportRow,
  party: Record<string, unknown> | null,
  year: PolicyExportRow["years"][number] | undefined,
  categoryByKey: Map<string, CategoryRef>,
): string[] {
  return [
    String(party?.svkkPublicId ?? ""),
    r.referenceNo ?? "",
    r.policyNo ?? "",
    String(party?.customerId ?? ""),
    String(party?.name ?? ""),
    String(party?.email ?? ""),
    String(party?.mobile ?? ""),
    String(party?.pan ?? ""),
    String(party?.aadhaarNo ?? ""),
    fmtDate(party?.dateOfBirth as Date | null | undefined),
    r.holderGender ?? "",
    r.holderAge != null ? String(r.holderAge) : "",
    r.holderRelationship ?? "",
    formatCategoryLabel(
      r.category ? { id: "", key: r.category.key, name: r.category.name } : null,
      r.categoryText,
      categoryByKey,
    ),
    r.policyType?.name ?? "",
    r.adProductVariant ?? "",
    r.policyGrouping ?? "",
    r.village ?? "",
    r.area ?? "",
    r.city ?? "",
    r.state ?? "",
    r.pincode ?? "",
    r.addressLine1 ?? "",
    r.addressLine2 ?? "",
    r.addressLine3 ?? "",
    r.addressLine4 ?? "",
    r.contactPhone ?? "",
    r.whatsappNo ?? "",
    r.nomineeName ?? "",
    r.nomineeRelation ?? "",
    r.periodYearText ?? "",
    r.periodMonthText ?? "",
    r.personsInsuredCount != null ? String(r.personsInsuredCount) : "",
    r.insuranceCompany ?? "",
    r.tpa ?? "",
    r.remarks ?? "",
    year?.yearLabel ?? "",
    fmtDate(year?.policyStart),
    fmtDate(year?.policyEnd),
    fmtDecimal(year?.sumInsured),
    fmtDecimal(year?.grossPremium),
    fmtDecimal(year?.vkkPremium),
    fmtDecimal(year?.svkkPremium),
    fmtDecimal(year?.netPremium),
    fmtDecimal(year?.expectedNetPremium),
    fmtDecimal(year?.taxPercent),
    fmtDecimal(year?.taxAmount),
    fmtDecimal(year?.vkkCommission),
    fmtDecimal(year?.commissionAmount),
    fmtDecimal(year?.twoLacFloater),
    fmtDecimal(year?.yearPolicyHolderPremium),
    fmtDecimal(year?.diffPaidByHolder),
    fmtDecimal(year?.gaamMahajanVkk),
    fmtDecimal(year?.gaamMahajanContribution),
    fmtDecimal(year?.excessShortAmount),
    year?.paymentMode ?? "",
    year?.paymentType ?? "",
    fmtDecimal(year?.amountReceived),
    year?.bankName ?? "",
    year?.utrRef ?? "",
    year?.yearRemarks ?? "",
    year ? summarizePayments(year.payments) : "",
    formatPolicyUrl(r.policyUrl),
    r.createdAt.toISOString(),
    r.updatedAt.toISOString(),
  ];
}

function rowToMemberCells(
  year: PolicyExportRow["years"][number] | undefined,
  maxSlots: number,
): string[] {
  const members = year?.members ?? [];
  const cells: string[] = [];
  for (let i = 0; i < maxSlots; i++) {
    const m = members[i];
    for (const f of MEMBER_SLOT_FIELDS) {
      cells.push(memberCellValue(m, f.key));
    }
  }
  return cells;
}

export function buildPoliciesExportCsv(
  rows: PolicyExportRow[],
  permissions: Set<string>,
  preferredYearLabels: string[] = [],
  categoryByKey: Map<string, CategoryRef> = new Map(),
): string {
  let maxMemberSlots = 0;
  for (const r of rows) {
    const year = pickExportPolicyYear(r.years, preferredYearLabels);
    maxMemberSlots = Math.max(maxMemberSlots, year?.members.length ?? 0);
  }
  maxMemberSlots = Math.min(maxMemberSlots, MAX_MEMBER_SLOTS_CAP);

  const headers = [...BASE_HEADERS, ...buildMemberHeaders(maxMemberSlots)];
  const lines: string[] = [headers.map(csvCell).join(",")];

  for (const r of rows) {
    const party = maskInsuredParty(permissions, r.insuredParty as Record<string, unknown>);
    const year = pickExportPolicyYear(r.years, preferredYearLabels);
    const cells = [
      ...rowToBaseCells(r, party, year, categoryByKey),
      ...rowToMemberCells(year, maxMemberSlots),
    ];
    lines.push(cells.map(csvCell).join(","));
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

export async function queryPolicyListForExport(args: {
  where: Prisma.PolicyWhereInput;
  sort: string | undefined;
}): Promise<PolicyExportRow[]> {
  const orderBy = parsePolicyListOrderBy(args.sort);
  return prisma.policy.findMany({
    where: args.where,
    orderBy,
    take: POLICY_LIST_EXPORT_MAX_ROWS,
    include: exportInclude,
  });
}
