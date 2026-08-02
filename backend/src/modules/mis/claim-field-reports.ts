import {
  CLAIM_CSV_FIELD_META,
  CLAIM_FIELD_REPORT_CATEGORY_TOP_N,
  type ClaimCsvReportKind,
} from "../claim/claim-csv-field-meta.js";
import type { ClaimFieldReportRow } from "./claim-mis.queries.js";

export type FieldReportKind = ClaimCsvReportKind;

export type FieldReportDistribution = {
  label: string;
  count: number;
  percent: number;
  /** Lodge (claim) amount total for this bucket/value. */
  lodgeAmount?: number;
  /** Settled (paid) amount total for this bucket/value. */
  settledAmount?: number;
  /** @deprecated use lodgeAmount — kept for older UI clients */
  totalAmount?: number;
};

export type FieldReportCard = {
  field: string;
  label: string;
  kind: FieldReportKind;
  summary?: { metric: string; value: string | number }[];
  distribution?: FieldReportDistribution[];
  /** Full categorical breakdown for CSV (may exceed top-N UI slice). */
  distributionFull?: FieldReportDistribution[];
  /** Claim-wise amount detail for CSV (HTML parity — key columns + value). */
  amountDetail?: {
    claimNo: string;
    value: number;
    svkkId: string;
    patientName: string;
    policyNumber: string;
    hospitalName: string;
    statusText: string;
    lodgeAmount: number;
    settledAmount: number;
  }[];
  uniqueCount?: number;
  filledRows?: number;
  emptyRows?: number;
  /** True when category distribution was truncated to top N. */
  truncated?: boolean;
  /** Empty canonical column with no data in filtered set. */
  emptyMessage?: string;
};

function parseAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** en-GB style (dd/mm/yyyy) — matches SVKK_Claim_MIS.html field reports. */
function fmtDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getUTCFullYear()}`;
}

function cellToDisplay(raw: unknown): string {
  if (raw == null) return "";
  if (raw instanceof Date) return fmtDate(raw);
  return String(raw).trim();
}

function parseDateValue(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
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

function emptyCard(field: string, label: string, kind: FieldReportKind, total: number): FieldReportCard {
  return {
    field,
    label,
    kind,
    filledRows: 0,
    emptyRows: total,
    uniqueCount: 0,
    emptyMessage: "No data in this column",
    summary:
      kind === "id"
        ? [
            { metric: "Unique Values", value: 0 },
            { metric: "Filled Rows", value: 0 },
            { metric: "Empty Rows", value: total },
            { metric: "Duplicates", value: 0 },
          ]
        : kind === "date"
          ? [
              { metric: "Earliest", value: "—" },
              { metric: "Latest", value: "—" },
              { metric: "Filled Rows", value: 0 },
              { metric: "Empty Rows", value: total },
            ]
          : kind === "amount"
            ? [
                { metric: "Sum", value: 0 },
                { metric: "Average", value: 0 },
                { metric: "Maximum", value: 0 },
                { metric: "Minimum", value: 0 },
              ]
            : undefined,
  };
}

/**
 * Build field-wise MIS report cards for all 39 canonical claim CSV fields.
 * Always returns one card per CLAIM_CSV_FIELD_META entry (empty columns included).
 */
export function buildClaimFieldReports(rows: ClaimFieldReportRow[]): FieldReportCard[] {
  const cards: FieldReportCard[] = [];
  const total = rows.length;

  for (const meta of CLAIM_CSV_FIELD_META) {
    const { key: field, header: label, reportKind: kind } = meta;
    const vals = rows.map((r) => cellToDisplay(r[field as keyof ClaimFieldReportRow]));
    const nonEmpty = vals.filter(Boolean);
    const uniqueVals = [...new Set(nonEmpty)];
    const emptyRows = total - nonEmpty.length;

    if (!nonEmpty.length) {
      cards.push(emptyCard(field, label, kind, total));
      continue;
    }

    if (kind === "amount") {
      const amounts = rows.map((r) => parseAmount(r[field as keyof ClaimFieldReportRow]));
      const filledAmounts = amounts.filter((_, i) => vals[i]);
      const sum = filledAmounts.reduce((a, b) => a + b, 0);
      const avg = filledAmounts.length ? sum / filledAmounts.length : 0;
      const max = filledAmounts.length ? Math.max(...filledAmounts) : 0;
      const min = filledAmounts.length ? Math.min(...filledAmounts) : 0;
      const buckets = AMT_BUCKETS.map((b) => ({ ...b, count: 0, lodge: 0, settled: 0, total: 0 }));
      const amountDetail: NonNullable<FieldReportCard["amountDetail"]> = [];
      for (let i = 0; i < rows.length; i++) {
        if (!vals[i]) continue;
        const n = amounts[i]!;
        const row = rows[i]!;
        amountDetail.push({
          claimNo: cellToDisplay(row.claimNo) || `row-${i + 1}`,
          value: Math.round(n),
          svkkId: cellToDisplay(row.svkkId),
          patientName: cellToDisplay(row.patientName),
          policyNumber: cellToDisplay(row.policyNumber),
          hospitalName: cellToDisplay(row.hospitalName),
          statusText: cellToDisplay(row.statusText),
          lodgeAmount: Math.round(parseAmount(row.claimAmount)),
          settledAmount: Math.round(parseAmount(row.approvedAmount)),
        });
        for (const b of buckets) {
          if (n >= b.lo && n < b.hi) {
            b.count++;
            b.lodge += parseAmount(row.claimAmount);
            b.settled += parseAmount(row.approvedAmount);
            b.total += n;
            break;
          }
        }
      }
      amountDetail.sort((a, b) => b.value - a.value);
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
            percent: filledAmounts.length ? (b.count / filledAmounts.length) * 100 : 0,
            lodgeAmount: Math.round(b.total),
            settledAmount: Math.round(b.settled),
            totalAmount: Math.round(b.total),
          })),
        amountDetail,
        filledRows: nonEmpty.length,
        emptyRows,
      });
      continue;
    }

    if (kind === "date") {
      const dates = rows
        .map((r) => parseDateValue(r[field as keyof ClaimFieldReportRow]))
        .filter((d): d is Date => d != null);
      if (!dates.length) {
        cards.push(emptyCard(field, label, kind, total));
        continue;
      }
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

    // category
    const acc: Record<string, { count: number; lodge: number; settled: number }> = {};
    for (const row of rows) {
      const display = cellToDisplay(row[field as keyof ClaimFieldReportRow]);
      const v = display === "" ? "(blank)" : display;
      if (!acc[v]) acc[v] = { count: 0, lodge: 0, settled: 0 };
      // Skip pure blanks from distribution but still count in emptyRows above.
      if (display === "") continue;
      acc[v]!.count++;
      acc[v]!.lodge += parseAmount(row.claimAmount);
      acc[v]!.settled += parseAmount(row.approvedAmount);
    }
    // Remove accidental (blank) entry if we skipped blanks
    delete acc["(blank)"];
    const sorted = Object.entries(acc).sort((a, b) => b[1].count - a[1].count);
    const truncated = sorted.length > CLAIM_FIELD_REPORT_CATEGORY_TOP_N;
    const fullDist = sorted.map(([k, v]) => ({
      label: k,
      count: v.count,
      percent: total ? (v.count / total) * 100 : 0,
      lodgeAmount: Math.round(v.lodge),
      settledAmount: Math.round(v.settled),
      totalAmount: Math.round(v.lodge),
    }));
    cards.push({
      field,
      label,
      kind,
      distribution: fullDist.slice(0, CLAIM_FIELD_REPORT_CATEGORY_TOP_N),
      distributionFull: fullDist,
      filledRows: nonEmpty.length,
      emptyRows,
      uniqueCount: uniqueVals.length,
      truncated,
    });
  }

  return cards;
}

/** Build sectioned CSV for Download All Reports (or a single field). */
export function buildClaimFieldReportsCsv(
  cards: FieldReportCard[],
  opts?: { fieldKey?: string },
): string {
  const selected = opts?.fieldKey
    ? cards.filter((c) => c.field === opts.fieldKey)
    : cards;
  const lines: string[] = [];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  for (const card of selected) {
    lines.push(["FIELD", card.label, "kind", card.kind].map(esc).join(","));
    if (card.emptyMessage) {
      lines.push(["message", card.emptyMessage].map(esc).join(","));
      lines.push("");
      continue;
    }
    if (card.kind === "category") {
      lines.push("VALUE,COUNT,PERCENT,LODGE_AMT,SETTLED_AMT");
      const rows = card.distributionFull ?? card.distribution ?? [];
      for (const d of rows) {
        lines.push(
          [
            d.label,
            d.count,
            d.percent.toFixed(2),
            d.lodgeAmount ?? d.totalAmount ?? 0,
            d.settledAmount ?? 0,
          ]
            .map(esc)
            .join(","),
        );
      }
      if (card.truncated) {
        lines.push(
          ["note", `UI shows top ${CLAIM_FIELD_REPORT_CATEGORY_TOP_N}; CSV includes all ${card.uniqueCount} values`]
            .map(esc)
            .join(","),
        );
      }
    } else if (card.kind === "amount") {
      lines.push("SUMMARY");
      lines.push(["Metric", "Value"].map(esc).join(","));
      for (const s of card.summary ?? []) {
        lines.push([s.metric, s.value].map(esc).join(","));
      }
      lines.push("");
      lines.push("VALUE DISTRIBUTION");
      lines.push(["Range", "Count", "Percent", "Total Amount"].map(esc).join(","));
      for (const d of card.distribution ?? []) {
        lines.push(
          [d.label, d.count, d.percent.toFixed(1) + "%", d.lodgeAmount ?? d.totalAmount ?? 0]
            .map(esc)
            .join(","),
        );
      }
      lines.push("");
      lines.push("CLAIM-WISE DETAIL (sorted high to low)");
      lines.push(
        [
          "#",
          card.label,
          "SVKK ID",
          "Patient Name",
          "Policy Number",
          "Claim No",
          "Hospital",
          "Status",
          "Lodge Amt",
          "Settled Amt",
        ]
          .map(esc)
          .join(","),
      );
      (card.amountDetail ?? []).forEach((d, i) => {
        lines.push(
          [
            i + 1,
            d.value,
            d.svkkId,
            d.patientName,
            d.policyNumber,
            d.claimNo,
            d.hospitalName,
            d.statusText,
            d.lodgeAmount,
            d.settledAmount,
          ]
            .map(esc)
            .join(","),
        );
      });
    } else {
      lines.push(["Metric", "Value"].map(esc).join(","));
      for (const s of card.summary ?? []) {
        lines.push([s.metric, s.value].map(esc).join(","));
      }
    }
    lines.push("");
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
