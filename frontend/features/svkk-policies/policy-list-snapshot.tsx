import { parseRemarks } from "@/features/svkk-policies/ad-policy-detail-to-form";
import { resolvePolicyTypeDisplayLabel } from "@/features/svkk-policies/ad-product-variant";
import {
  resolveCategoryDisplayLabel,
  type CategoryRef,
} from "@/lib/svkk/category-display";

export type PolicyListSnapshotSource = {
  policyNo: string | null;
  periodMonthText?: string | null;
  periodYearText?: string | null;
  village: string | null;
  area: string | null;
  remarks: string | null;
  policyGrouping?: string | null;
  whatsappNo?: string | null;
  adProductVariant?: string | null;
  insuredParty: {
    name: string;
    email?: string | null;
    customerId: string | null;
  };
  policyType: { name: string };
  category: { key: string; name: string } | null;
  categoryText?: string | null;
  years: Array<{ yearLabel: string; policyNo: string | null }>;
};

function display(v: string | null | undefined): string {
  const s = v?.trim();
  return s || "—";
}

/** Prefer policy-change remark, then general, then full text. */
export function latestRemarkForSnapshot(remarks: string | null | undefined): string {
  if (!remarks?.trim()) return "—";
  const { generalRemark, policyChangeRemark } = parseRemarks(remarks);
  const change = policyChangeRemark.trim();
  if (change) return change;
  const general = generalRemark.trim();
  if (general) return general;
  return remarks.trim();
}

/** Resolve label from admin policy types (dynamic) when provided. */
export function policyTypeLabelForSnapshot(
  row: PolicyListSnapshotSource,
  policyTypeOptions?: ReadonlyArray<{ value: string; label: string }>,
): string {
  return resolvePolicyTypeDisplayLabel(row.policyType, row.adProductVariant, policyTypeOptions);
}

/** Resolves category name from DB (admin categories); falls back to key/text. */
export function categoryLabelForSnapshot(
  row: PolicyListSnapshotSource,
  categoryByKey?: Map<string, CategoryRef>,
): string {
  return resolveCategoryDisplayLabel(row.category, row.categoryText, categoryByKey);
}

export type PolicySnapshotField = { label: string; value: string; mono?: boolean };

export function buildPolicySnapshotFields(
  row: PolicyListSnapshotSource,
  categoryByKey?: Map<string, CategoryRef>,
  policyTypeOptions?: ReadonlyArray<{ value: string; label: string }>,
): PolicySnapshotField[] {
  const latestYear = row.years[0];
  return [
    { label: "Policy no.", value: display(latestYear?.policyNo ?? row.policyNo), mono: true },
    { label: "Month", value: display(row.periodMonthText) },
    { label: "Year", value: display(row.periodYearText ?? latestYear?.yearLabel) },
    { label: "Holder name", value: display(row.insuredParty.name) },
    { label: "WhatsApp no.", value: display(row.whatsappNo) },
    { label: "Email ID", value: display(row.insuredParty.email) },
    { label: "Area", value: display(row.area) },
    { label: "Village", value: display(row.village) },
    { label: "Customer ID", value: display(row.insuredParty.customerId), mono: true },
    { label: "Latest remark", value: latestRemarkForSnapshot(row.remarks) },
    { label: "Grouping", value: display(row.policyGrouping) },
    { label: "Policy type", value: display(policyTypeLabelForSnapshot(row, policyTypeOptions)) },
    { label: "Category", value: display(categoryLabelForSnapshot(row, categoryByKey)) },
  ];
}

export function PolicyListSnapshotPanel({
  row,
  categoryByKey,
  policyTypeOptions,
}: {
  row: PolicyListSnapshotSource;
  categoryByKey?: Map<string, CategoryRef>;
  policyTypeOptions?: ReadonlyArray<{ value: string; label: string }>;
}) {
  const fields = buildPolicySnapshotFields(row, categoryByKey, policyTypeOptions);
  return (
    <div className="ring-primary/15 max-w-full rounded-xl border border-blue-200/80 bg-blue-50/90 py-3 pl-4 pr-3 shadow-sm ring-1 dark:border-blue-500/25 dark:bg-blue-950/35 dark:ring-blue-500/20">
      <p className="text-blue-900/80 dark:text-blue-200/90 mb-3 text-[11px] font-bold uppercase tracking-wider">
        Policy snapshot
        <span className="text-blue-700/70 dark:text-blue-300/70 ml-2 font-normal normal-case">
          (summary for this SVKK ID)
        </span>
      </p>
      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-blue-800/70 dark:text-blue-300/65 mb-0.5 text-xs font-medium">{f.label}</dt>
            <dd
              className={
                f.mono
                  ? "text-blue-950 dark:text-blue-50 font-mono text-xs font-semibold break-all"
                  : f.label === "Latest remark"
                    ? "text-blue-950/90 dark:text-blue-100/90 line-clamp-3 text-xs wrap-break-word"
                    : "text-blue-950 dark:text-blue-50 wrap-break-word font-medium"
              }
              title={f.value !== "—" ? f.value : undefined}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
