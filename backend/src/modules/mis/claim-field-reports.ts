import type { ClaimFieldReportRow } from "./claim-mis.queries.js";

export type FieldReportKind = "amount" | "date" | "category" | "id";

export type FieldReportCard = {
  field: string;
  label: string;
  kind: FieldReportKind;
  summary?: { metric: string; value: string | number }[];
  distribution?: { label: string; count: number; percent: number; totalAmount?: number }[];
  uniqueCount?: number;
  filledRows?: number;
  emptyRows?: number;
};

const AMT_FIELDS = new Set([
  "claimAmount",
  "approvedAmount",
  "deductionAmount",
]);

const DATE_FIELDS = new Set([
  "claimReceivedDate",
  "admissionDate",
  "dischargeDate",
]);

const ID_FIELDS = new Set(["svkkPublicId", "policyHolderName", "patientName", "hospitalName"]);

const FIELD_LABELS: Record<string, string> = {
  svkkPublicId: "SVKK ID",
  policyTypeText: "Policy Type",
  policyHolderName: "Policy Holder Name",
  patientName: "Patient Name",
  patientGender: "Sex",
  village: "Village",
  insuranceCompany: "Insurance Company",
  hospitalName: "Hospital Name",
  hospitalArea: "Area",
  illness: "DIAGNOSIS",
  claimType: "Claim LodgeType",
  claimAmount: "Claim Amount",
  approvedAmount: "Paid Amount",
  deductionAmount: "Deduction Amount",
  statusText: "Status",
  policyYear: "Policy Year",
  networkType: "Network Type",
  roomCategory: "Room Category",
};

const REPORT_FIELDS = [
  "svkkPublicId",
  "policyTypeText",
  "policyHolderName",
  "patientName",
  "patientGender",
  "village",
  "insuranceCompany",
  "hospitalName",
  "hospitalArea",
  "illness",
  "claimType",
  "statusText",
  "policyYear",
  "networkType",
  "roomCategory",
  "claimAmount",
  "approvedAmount",
  "deductionAmount",
  "claimReceivedDate",
  "admissionDate",
  "dischargeDate",
] as const;

function classifyField(field: string, uniqueCount: number, nonEmpty: number): FieldReportKind {
  if (AMT_FIELDS.has(field)) return "amount";
  if (DATE_FIELDS.has(field)) return "date";
  if (ID_FIELDS.has(field)) return "id";
  if (nonEmpty > 0 && uniqueCount / nonEmpty > 0.6 && uniqueCount > 25) return "id";
  return "category";
}

function parseAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${m}-${d.getUTCFullYear()}`;
}

const AMT_BUCKETS = [
  { lo: -Infinity, hi: 1, label: "₹0" },
  { lo: 1, hi: 10_000, label: "₹1 – ₹10K" },
  { lo: 10_000, hi: 25_000, label: "₹10K – ₹25K" },
  { lo: 25_000, hi: 50_000, label: "₹25K – ₹50K" },
  { lo: 50_000, hi: 100_000, label: "₹50K – ₹1L" },
  { lo: 100_000, hi: 200_000, label: "₹1L – ₹2L" },
  { lo: 200_000, hi: 300_000, label: "₹2L – ₹3L" },
  { lo: 300_000, hi: 500_000, label: "₹3L – ₹5L" },
  { lo: 500_000, hi: 1_000_000, label: "₹5L – ₹10L" },
  { lo: 1_000_000, hi: Infinity, label: "₹10L +" },
];

/** Build field-wise MIS report cards from claim rows. */
export function buildClaimFieldReports(rows: ClaimFieldReportRow[]): FieldReportCard[] {
  const cards: FieldReportCard[] = [];
  const total = rows.length;

  for (const field of REPORT_FIELDS) {
    const label = FIELD_LABELS[field] ?? field;
    const vals = rows.map((r) => {
      const v = r[field as keyof ClaimFieldReportRow];
      if (v instanceof Date) return fmtDate(v);
      return v == null ? "" : String(v).trim();
    });
    const nonEmpty = vals.filter(Boolean);
    const uniqueVals = [...new Set(nonEmpty)];
    const kind = classifyField(field, uniqueVals.length, nonEmpty.length);
    const emptyRows = total - nonEmpty.length;

    if (kind === "amount") {
      const amounts = rows.map((r) => parseAmount(r[field as keyof ClaimFieldReportRow]));
      if (!nonEmpty.length) continue;
      const sum = amounts.reduce((a, b) => a + b, 0);
      const avg = amounts.length ? sum / amounts.length : 0;
      const max = amounts.length ? Math.max(...amounts) : 0;
      const min = amounts.length ? Math.min(...amounts) : 0;
      const buckets = AMT_BUCKETS.map((b) => ({ ...b, count: 0, total: 0 }));
      for (const n of amounts) {
        for (const b of buckets) {
          if (n >= b.lo && n < b.hi) {
            b.count++;
            b.total += n;
            break;
          }
        }
      }
      cards.push({
        field,
        label,
        kind,
        summary: [
          { metric: "Sum", value: Math.round(sum) },
          { metric: "Average", value: Math.round(avg) },
          { metric: "Maximum", value: max },
          { metric: "Minimum", value: min },
        ],
        distribution: buckets
          .filter((b) => b.count > 0)
          .map((b) => ({
            label: b.label,
            count: b.count,
            percent: amounts.length ? (b.count / amounts.length) * 100 : 0,
            totalAmount: Math.round(b.total),
          })),
        filledRows: nonEmpty.length,
        emptyRows,
      });
      continue;
    }

    if (kind === "date") {
      const dates = rows
        .map((r) => r[field as keyof ClaimFieldReportRow])
        .filter((v): v is Date => v instanceof Date);
      if (!dates.length) continue;
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      cards.push({
        field,
        label,
        kind,
        summary: [
          { metric: "Earliest", value: fmtDate(min) },
          { metric: "Latest", value: fmtDate(max) },
          { metric: "Filled Rows", value: dates.length },
          { metric: "Empty Rows", value: emptyRows },
        ],
        filledRows: dates.length,
        emptyRows,
      });
      continue;
    }

    if (kind === "id") {
      cards.push({
        field,
        label,
        kind,
        summary: [
          { metric: "Unique Values", value: uniqueVals.length },
          { metric: "Filled Rows", value: nonEmpty.length },
          { metric: "Empty Rows", value: emptyRows },
          { metric: "Duplicates", value: nonEmpty.length - uniqueVals.length },
        ],
        filledRows: nonEmpty.length,
        emptyRows,
        uniqueCount: uniqueVals.length,
      });
      continue;
    }

    if (!uniqueVals.length) continue;
    const acc: Record<string, { count: number; lodge: number; settled: number }> = {};
    for (const row of rows) {
      const raw = row[field as keyof ClaimFieldReportRow];
      const v =
        raw instanceof Date
          ? fmtDate(raw)
          : raw == null || String(raw).trim() === ""
            ? "(blank)"
            : String(raw).trim();
      if (!acc[v]) acc[v] = { count: 0, lodge: 0, settled: 0 };
      acc[v]!.count++;
      acc[v]!.lodge += parseAmount(row.claimAmount);
      acc[v]!.settled += parseAmount(row.approvedAmount);
    }
    const sorted = Object.entries(acc).sort((a, b) => b[1].count - a[1].count);
    cards.push({
      field,
      label,
      kind,
      distribution: sorted.slice(0, 25).map(([k, v]) => ({
        label: k,
        count: v.count,
        percent: total ? (v.count / total) * 100 : 0,
        totalAmount: Math.round(v.lodge),
      })),
      filledRows: nonEmpty.length,
      emptyRows,
      uniqueCount: uniqueVals.length,
    });
  }

  return cards;
}
