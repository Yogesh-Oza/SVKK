import type { SvkkPolicyDetailForForm } from "@/features/svkk-policies/ad-policy-detail-to-form";
import type { OfflinePolicyFormDetail, OfflinePolicyListRow } from "./types";

type ApiListLike = {
  id: string;
  policyNo?: string | null;
  holderName?: string | null;
  previousPolicyNo?: string | null;
  periodYearText?: string | null;
  periodMonthText?: string | null;
  referenceNo?: string | null;
  village?: string | null;
  area?: string | null;
  remarks?: string | null;
  personsInsuredCount?: number | null;
  whatsappNo?: string | null;
  policyGrouping?: string | null;
  adProductVariant?: string | null;
  vkkPremium?: string | number | null;
  sumInsured?: string | number | null;
  listVkkPremium?: string | number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  deletedAt?: string | Date | null;
  insuredParty?: {
    svkkPublicId?: string;
    name?: string;
    mobile?: string | null;
    email?: string | null;
    customerId?: string | null;
    pan?: string | null;
  };
  policyType?: { id?: string; name?: string; key?: string | null } | null;
  category?: { id?: string; key?: string; name?: string } | null;
  categoryText?: string | null;
  years?: Array<{ yearLabel?: string; vkkPremium?: unknown; sumInsured?: unknown }>;
};

function iso(v: string | Date | null | undefined): string {
  if (!v) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

function decimalStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "object" && v !== null && "toString" in v) {
    const s = String(v);
    return s.trim() || null;
  }
  return null;
}

/** Project list API / bundle row → IDB list row. */
export function compressListRow(row: ApiListLike): OfflinePolicyListRow {
  const yearLabel =
    row.periodYearText?.trim() ||
    row.years?.[0]?.yearLabel?.trim() ||
    "";
  const y0 = row.years?.[0];
  const vkkPremium =
    decimalStr(row.vkkPremium) ??
    decimalStr(y0?.vkkPremium) ??
    decimalStr(row.listVkkPremium);
  const sumInsured = decimalStr(row.sumInsured) ?? decimalStr(y0?.sumInsured);

  return {
    id: row.id,
    policyNo: row.policyNo ?? null,
    holderName: row.holderName?.trim() || row.insuredParty?.name?.trim() || null,
    svkkId: row.insuredParty?.svkkPublicId?.trim() || "",
    mobile: row.insuredParty?.mobile?.trim() || null,
    email: row.insuredParty?.email?.trim() || null,
    pan: row.insuredParty?.pan?.trim() || null,
    village: row.village?.trim() || null,
    area: row.area?.trim() || null,
    yearLabel,
    periodMonthText: row.periodMonthText?.trim() || null,
    periodYearText: row.periodYearText?.trim() || yearLabel || null,
    customerId: row.insuredParty?.customerId?.trim() || null,
    previousPolicyNo: row.previousPolicyNo ?? null,
    referenceNo: row.referenceNo?.trim() || null,
    vkkPremium,
    sumInsured,
    policyTypeId: row.policyType?.id?.trim() || null,
    policyTypeName: row.policyType?.name?.trim() || null,
    policyTypeKey: row.policyType?.key?.trim() || null,
    categoryId: row.category?.id?.trim() || null,
    categoryKey: row.category?.key?.trim() || null,
    categoryName: row.category?.name?.trim() || null,
    categoryText: row.categoryText?.trim() || null,
    remarks: row.remarks ?? null,
    personsInsuredCount: row.personsInsuredCount ?? null,
    whatsappNo: row.whatsappNo?.trim() || null,
    policyGrouping: row.policyGrouping?.trim() || null,
    adProductVariant: row.adProductVariant?.trim() || null,
    createdAt: iso(row.createdAt ?? row.updatedAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
  };
}

/** Build list row from full policy detail (post-sync cache refresh). */
export function compressListRowFromDetail(detail: SvkkPolicyDetailForForm): OfflinePolicyListRow {
  const sortedYears = [...(detail.years ?? [])].sort((a, b) =>
    b.yearLabel.localeCompare(a.yearLabel),
  );
  const y0 = sortedYears[0];
  return compressListRow({
    id: detail.id,
    policyNo: detail.policyNo,
    holderName: detail.holderName,
    previousPolicyNo: detail.previousPolicyNo,
    periodYearText: detail.periodYearText,
    periodMonthText: detail.periodMonthText,
    referenceNo: detail.referenceNo,
    village: detail.village,
    area: detail.area,
    remarks: detail.remarks,
    personsInsuredCount: detail.personsInsuredCount,
    whatsappNo: detail.whatsappNo,
    policyGrouping: detail.policyGrouping,
    adProductVariant: detail.adProductVariant,
    updatedAt: detail.updatedAt,
    insuredParty: detail.insuredParty,
    policyType: detail.policyType,
    category: detail.category
      ? {
          id: (detail.category as { id?: string }).id,
          key: detail.category.key,
          name: detail.category.name,
        }
      : null,
    categoryText: detail.categoryText,
    years: sortedYears.map((y) => ({
      yearLabel: y.yearLabel,
      vkkPremium: y.vkkPremium,
      sumInsured: y.sumInsured,
    })),
    vkkPremium: y0?.vkkPremium,
    sumInsured: y0?.sumInsured,
  });
}

/** Strip non-form fields from policy detail before IDB write. */
export function compressDetail(raw: Record<string, unknown>): OfflinePolicyFormDetail {
  const years = Array.isArray(raw.years) ? raw.years : [];
  const detail: OfflinePolicyFormDetail = {
    ...(raw as unknown as SvkkPolicyDetailForForm),
    id: String(raw.id),
    updatedAt: iso(raw.updatedAt as string | Date),
    years: years.map((y) => {
      const year = y as Record<string, unknown>;
      const payments = Array.isArray(year.payments) ? year.payments : [];
      const members = Array.isArray(year.members) ? year.members : [];
      return {
        ...(year as SvkkPolicyDetailForForm["years"][number]),
        payments: payments.map((p) => {
          const pay = p as Record<string, unknown>;
          const { id: _id, createdAt: _ca, ...rest } = pay;
          return rest as SvkkPolicyDetailForForm["years"][number]["payments"] extends (infer U)[]
            ? U
            : never;
        }),
        members: members.map((m) => m as SvkkPolicyDetailForForm["years"][number]["members"][number]),
      };
    }),
  };
  return detail;
}

/** Expand slim IDB detail → form-compatible shape. */
export function expandDetail(stored: OfflinePolicyFormDetail): SvkkPolicyDetailForForm {
  return stored;
}

export function compressListRows(rows: ApiListLike[]): OfflinePolicyListRow[] {
  return rows.map(compressListRow);
}

export function compressDetails(rows: Record<string, unknown>[]): OfflinePolicyFormDetail[] {
  return rows.map(compressDetail);
}
