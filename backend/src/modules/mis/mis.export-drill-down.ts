/** Same metric columns as main policy-member report CSV export. */
export const POLICY_MEMBER_REPORT_METRIC_COLS = [
  "label",
  "totalPolicies",
  "membersPlusPolicies",
  "cntAshaKiran",
  "cntFamilyFloater",
  "cntIndividual",
  "sumVkk",
  "sumCo",
  "sumGross",
  "sumComm",
  "sumTwoLac",
  "sumPolHolder",
  "sumGaam",
  "sumRefund",
  "sumCd",
  "age0_18",
  "age19_35",
  "age36_45",
  "age46_50",
  "age51_55",
  "age56_60",
  "age61_65",
  "age65p",
] as const;

export type PolicyMemberReportMetricCol = (typeof POLICY_MEMBER_REPORT_METRIC_COLS)[number];

/** Column order and titles matching the drill-down UI table. */
export const DRILL_CSV_COLUMNS: { key: PolicyMemberReportMetricCol; title: string }[] = [
  { key: "label", title: "Type of PO" },
  { key: "totalPolicies", title: "Total policies" },
  { key: "membersPlusPolicies", title: "Members + policies" },
  { key: "cntAshaKiran", title: "Asha-kiran" },
  { key: "cntFamilyFloater", title: "Family-floating" },
  { key: "cntIndividual", title: "Individual" },
  { key: "sumVkk", title: "Total VKK premium" },
  { key: "sumCo", title: "Co premium" },
  { key: "sumGross", title: "Gross premium" },
  { key: "sumComm", title: "Commission" },
  { key: "sumTwoLac", title: "Two lakh F" },
  { key: "sumPolHolder", title: "Policy holder premium" },
  { key: "sumGaam", title: "Gaam Mahajan VKK refund" },
  { key: "sumRefund", title: "Refund cheque amt" },
  { key: "sumCd", title: "CD amount" },
  { key: "age0_18", title: "Age 0–18" },
  { key: "age19_35", title: "Age 19–35" },
  { key: "age36_45", title: "Age 36–45" },
  { key: "age46_50", title: "Age 46–50" },
  { key: "age51_55", title: "Age 51–55" },
  { key: "age56_60", title: "Age 56–60" },
  { key: "age61_65", title: "Age 61–65" },
  { key: "age65p", title: "Age >65" },
];

const MONEY_KEYS = new Set<PolicyMemberReportMetricCol>([
  "sumVkk",
  "sumCo",
  "sumGross",
  "sumComm",
  "sumTwoLac",
  "sumPolHolder",
  "sumGaam",
  "sumRefund",
  "sumCd",
]);

export type PolicyMemberDrillDownCsvRow = Record<PolicyMemberReportMetricCol, string | number>;

export type PolicyMemberDrillDownCsvInput = {
  drillType: "village" | "area";
  drillLabel: string;
  sections: Array<{
    categoryKey: string;
    categoryLabel: string;
    rows: PolicyMemberDrillDownCsvRow[];
  }>;
};

function csvCell(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

/** Matches MIS drill-down UI (`formatCell` / `formatInr`). */
export function formatDrillDownCell(key: PolicyMemberReportMetricCol, value: number): string {
  if (MONEY_KEYS.has(key)) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  }
  return value.toLocaleString("en-IN");
}

/** e.g. `area ambarnath-east — a category` (same as dialog section heading). */
export function drillDownSectionTitle(
  drillType: "village" | "area",
  drillLabel: string,
  categoryLabel: string,
): string {
  return `${drillType} ${drillLabel.trim().toLowerCase()} — ${categoryLabel}`;
}

/**
 * CSV layout mirrors the drill-down dialog: section title, header row, SVKK/NVKK/RTY/OTHER rows,
 * blank line between categories.
 */
export function buildPolicyMemberDrillDownCsv(detail: PolicyMemberDrillDownCsvInput): string {
  const lines: string[] = [];
  let firstSection = true;

  for (const section of detail.sections) {
    if (!firstSection) {
      lines.push("");
    }
    firstSection = false;

    lines.push(
      csvCell(drillDownSectionTitle(detail.drillType, detail.drillLabel, section.categoryLabel)),
    );
    lines.push(DRILL_CSV_COLUMNS.map((c) => csvCell(c.title)).join(","));
    for (const row of section.rows) {
      const cells = DRILL_CSV_COLUMNS.map((col) => {
        if (col.key === "label") {
          return csvCell(String(row.label ?? "").toUpperCase());
        }
        const raw = row[col.key];
        const n = typeof raw === "number" ? raw : Number(raw);
        return csvCell(formatDrillDownCell(col.key, Number.isFinite(n) ? n : 0));
      });
      lines.push(cells.join(","));
    }
  }

  return `${lines.join("\n")}\n`;
}

export function drillDownExportFilename(
  drillType: "village" | "area",
  drillLabel: string,
): string {
  const slug = drillLabel
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `policy-member-${drillType}-${slug || "detail"}.csv`;
}
