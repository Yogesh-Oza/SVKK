"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PolicyFilterMulti,
  type PolicyFilterOption,
} from "@/features/svkk-policies/policy-filter-multi";
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";
import { formatInrCompact, formatInrRupee } from "@/features/svkk-claims/claim-register-badges";
import { ClaimMisDrillSheet } from "@/features/svkk-mis/claim-mis-drill-sheet";
import { MisCsvExportDialog } from "@/features/svkk-mis/mis-csv-export-dialog";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { todayFormDate, toIsoDateParam, formatDateForFormInput } from "@/lib/svkk/form-date";
import { monthFilterOptionsFromMeta } from "@/lib/svkk/policy-period-months";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { ArrowLeft, Calendar, Download, Hash, Layers, RotateCcw, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const FALLBACK_CATEGORY_OPTIONS: PolicyFilterOption[] = ["A", "B", "C", "D", "OTHER"].map((c) => ({
  value: c,
  label: c,
}));

type CategoryRow = {
  category: string;
  cashNo: number;
  cashLodge: number;
  cashSettled: number;
  reimNo: number;
  reimLodge: number;
  reimSettled: number;
  cashDeniedNo: number;
  cashDeniedLodge: number;
  remDeniedNo: number;
  remDeniedLodge: number;
  totalNo: number;
  totalLodge: number;
  totalSettled: number;
  totalDeduction?: number;
};

type CategorySummaryRes = {
  dateFrom: string | null;
  dateTo: string;
  rows: CategoryRow[];
  totals: CategoryRow;
};

type FieldReportCard = {
  field: string;
  label: string;
  kind: "amount" | "date" | "category" | "id";
  summary?: { metric: string; value: string | number }[];
  distribution?: {
    label: string;
    count: number;
    percent: number;
    lodgeAmount?: number;
    settledAmount?: number;
    totalAmount?: number;
  }[];
  uniqueCount?: number;
  filledRows?: number;
  emptyRows?: number;
  truncated?: boolean;
  emptyMessage?: string;
};

type FieldReportsRes = {
  recordCount: number;
  totalInScope?: number;
  cards: FieldReportCard[];
};

type FiltersMeta = {
  villages: string[];
  policyGroupings: string[];
  periodYearTexts: string[];
  periodMonthTexts: string[];
};

type ClaimFiltersMeta = {
  insuranceCompanies: string[];
  areas: string[];
  statusTexts: string[];
  claimTypes: string[];
  treatmentTypes: string[];
  diseaseCategories: string[];
};

type ClaimMisSummarySectionProps = {
  onError?: (message: string | null) => void;
};

export function ClaimMisSummarySection({ onError }: ClaimMisSummarySectionProps) {
  const { options: ddOptions } = useDropdownOptions();
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);
  const missingUrl = !getSvkkApiBase();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayFormDate());
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [villages, setVillages] = useState<string[]>([]);
  const [policyGroupings, setPolicyGroupings] = useState<string[]>([]);
  const [periodMonths, setPeriodMonths] = useState<string[]>([]);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [statusTexts, setStatusTexts] = useState<string[]>([]);
  const [claimTypes, setClaimTypes] = useState<string[]>([]);
  const [treatmentTypes, setTreatmentTypes] = useState<string[]>([]);
  const [diseaseCategories, setDiseaseCategories] = useState<string[]>([]);
  const [fieldSearch, setFieldSearch] = useState("");

  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<CategoryRow | null>(null);
  const [fieldCards, setFieldCards] = useState<FieldReportCard[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [totalInScope, setTotalInScope] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [filterMeta, setFilterMeta] = useState<FiltersMeta | null>(null);
  const [claimFilterMeta, setClaimFilterMeta] = useState<ClaimFiltersMeta | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillVillage, setDrillVillage] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const df = searchParams.get("dateFrom");
    const dt = searchParams.get("dateTo");
    if (df) setDateFrom(formatDateForFormInput(df) || df);
    if (dt) setDateTo(formatDateForFormInput(dt) || dt);
    const v = searchParams.getAll("villages");
    if (v.length) setVillages(v);
    const c = searchParams.getAll("categoryKeys");
    if (c.length) setCategoryKeys(c);
  }, [searchParams]);

  const categoryOptions = useMemo<PolicyFilterOption[]>(
    () => (ddOptions.categories.length > 0 ? ddOptions.categories : FALLBACK_CATEGORY_OPTIONS),
    [ddOptions.categories],
  );

  const villageOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.villages ?? []).map((v) => ({ value: v, label: v })),
    [filterMeta?.villages],
  );

  const groupingOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.policyGroupings ?? []).map((g) => ({ value: g, label: g })),
    [filterMeta?.policyGroupings],
  );

  const yearOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.periodYearTexts ?? []).map((y) => ({ value: y, label: y })),
    [filterMeta?.periodYearTexts],
  );

  const monthOptions = useMemo(
    () => monthFilterOptionsFromMeta(filterMeta?.periodMonthTexts ?? []),
    [filterMeta?.periodMonthTexts],
  );

  const insuranceOptions = useMemo<PolicyFilterOption[]>(
    () => (claimFilterMeta?.insuranceCompanies ?? []).map((v) => ({ value: v, label: v })),
    [claimFilterMeta?.insuranceCompanies],
  );
  const areaOptions = useMemo<PolicyFilterOption[]>(
    () => (claimFilterMeta?.areas ?? []).map((v) => ({ value: v, label: v })),
    [claimFilterMeta?.areas],
  );
  const statusOptions = useMemo<PolicyFilterOption[]>(
    () => (claimFilterMeta?.statusTexts ?? []).map((v) => ({ value: v, label: v })),
    [claimFilterMeta?.statusTexts],
  );
  const lodgeTypeOptions = useMemo<PolicyFilterOption[]>(
    () => (claimFilterMeta?.claimTypes ?? []).map((v) => ({ value: v, label: v })),
    [claimFilterMeta?.claimTypes],
  );
  const treatmentOptions = useMemo<PolicyFilterOption[]>(
    () => (claimFilterMeta?.treatmentTypes ?? []).map((v) => ({ value: v, label: v })),
    [claimFilterMeta?.treatmentTypes],
  );
  const diseaseOptions = useMemo<PolicyFilterOption[]>(
    () => (claimFilterMeta?.diseaseCategories ?? []).map((v) => ({ value: v, label: v })),
    [claimFilterMeta?.diseaseCategories],
  );

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams();
    const dateFromParam = toIsoDateParam(dateFrom);
    const dateToParam = toIsoDateParam(dateTo);
    if (dateFromParam) q.set("dateFrom", dateFromParam);
    if (dateToParam) q.set("dateTo", dateToParam);
    categoryKeys.forEach((c) => q.append("categoryKeys", c));
    villages.forEach((v) => q.append("villages", v));
    policyGroupings.forEach((g) => q.append("policyGroupings", g));
    periodMonths.forEach((m) => q.append("periodMonthTexts", m));
    fiscalYears.forEach((y) => q.append("fiscalLabels", y));
    insuranceCompanies.forEach((v) => q.append("insuranceCompanies", v));
    areas.forEach((v) => q.append("areas", v));
    statusTexts.forEach((v) => q.append("statusTexts", v));
    claimTypes.forEach((v) => q.append("claimTypes", v));
    treatmentTypes.forEach((v) => q.append("treatmentTypes", v));
    diseaseCategories.forEach((v) => q.append("diseaseCategories", v));
    return q;
  }, [
    areas,
    categoryKeys,
    claimTypes,
    dateFrom,
    dateTo,
    diseaseCategories,
    fiscalYears,
    insuranceCompanies,
    periodMonths,
    policyGroupings,
    statusTexts,
    treatmentTypes,
    villages,
  ]);

  const loadReports = useCallback(async () => {
    if (missingUrl) return;
    setLoading(true);
    try {
      const qs = buildQuery().toString();
      const [cat, fields] = await Promise.all([
        svkkJson<CategorySummaryRes>(`/mis/claim-category-summary?${qs}`),
        svkkJson<FieldReportsRes>(`/mis/claim-field-reports?${qs}`),
      ]);
      setCategoryRows(cat.rows);
      setCategoryTotals(cat.totals);
      setFieldCards(fields.cards);
      setRecordCount(fields.recordCount);
      setTotalInScope(fields.totalInScope ?? fields.recordCount);
      onError?.(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load MIS report";
      onError?.(msg);
      setCategoryRows([]);
      setCategoryTotals(null);
      setFieldCards([]);
      setRecordCount(0);
      setTotalInScope(0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, missingUrl, onError]);

  useEffect(() => {
    if (missingUrl) return;
    void Promise.all([
      svkkJson<FiltersMeta>("/policies/filters"),
      svkkJson<ClaimFiltersMeta>("/claims/filters"),
    ])
      .then(([policyMeta, claimMeta]) => {
        setFilterMeta(policyMeta);
        setClaimFilterMeta(claimMeta);
      })
      .catch(() => {
        setFilterMeta(null);
        setClaimFilterMeta(null);
      });
  }, [missingUrl]);

  useEffect(() => {
    const t = setTimeout(() => void loadReports(), 400);
    return () => clearTimeout(t);
  }, [loadReports]);

  const summaryCards = useMemo(() => {
    if (!categoryTotals) return null;
    const cashless = categoryRows.reduce((s, r) => s + r.cashNo, 0);
    const reim = categoryRows.reduce((s, r) => s + r.reimNo, 0);
    const cashDenied = categoryRows.reduce((s, r) => s + r.cashDeniedNo, 0);
    const remDenied = categoryRows.reduce((s, r) => s + r.remDeniedNo, 0);
    return {
      totalClaims: categoryTotals.totalNo,
      totalLodge: categoryTotals.totalLodge,
      totalSettled: categoryTotals.totalSettled,
      totalDeduction: categoryTotals.totalDeduction ?? 0,
      cashless,
      reim,
      cashDenied,
      remDenied,
    };
  }, [categoryRows, categoryTotals]);

  async function exportCategoryCsv(columns: string[]) {
    setExportBusy(true);
    try {
      const q = buildQuery();
      columns.forEach((column) => q.append("fields", column));
      const res = await backendApi.get(`/mis/export/claim-category-summary.csv?${q.toString()}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "claim-mis-category-summary.csv";
      a.click();
      URL.revokeObjectURL(url);
      setExportDialogOpen(false);
      toast.success("MIS exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadFieldCsv(fieldKey?: string) {
    setExportBusy(true);
    try {
      const q = buildQuery();
      if (fieldKey) q.set("field", fieldKey);
      const res = await backendApi.get(`/mis/export/claim-field-reports.csv?${q.toString()}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = fieldKey ? fieldKey.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() : "all";
      a.download = `claim-mis-field-${slug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(fieldKey ? "Field report downloaded" : "All field reports downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo(todayFormDate());
    setCategoryKeys([]);
    setVillages([]);
    setPolicyGroupings([]);
    setPeriodMonths([]);
    setFiscalYears([]);
    setInsuranceCompanies([]);
    setAreas([]);
    setStatusTexts([]);
    setClaimTypes([]);
    setTreatmentTypes([]);
    setDiseaseCategories([]);
  }

  const filteredFieldCards = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return fieldCards;
    return fieldCards.filter(
      (c) => c.label.toLowerCase().includes(q) || c.field.toLowerCase().includes(q),
    );
  }, [fieldCards, fieldSearch]);

  const fmt = (n: number) => (n === 0 ? "—" : formatInrCompact(n));
  const fmtN = (n: number) => (n === 0 ? "—" : n.toLocaleString());
  /** HTML MIS ff() — always shows ₹0 for zero. */
  const fmtInr = (n: number) => formatInrRupee(n).replace(/^₹\s*/, "₹");
  /** Table cells: zero → — (HTML `v?ff(v):'—'`). */
  const fmtAmt = (n: number | null | undefined) => {
    if (n == null || n === 0) return "—";
    return fmtInr(n);
  };

  function formatSummaryValue(kind: FieldReportCard["kind"], value: string | number) {
    if (kind === "amount" && typeof value === "number") return fmtInr(value);
    return value;
  }

  function kindLabel(kind: FieldReportCard["kind"], card: FieldReportCard): string {
    if (kind === "id") return "Identifier";
    if (kind === "date") return "Date";
    if (kind === "amount") return "Amount";
    if (card.uniqueCount != null && card.uniqueCount > 0) {
      return `${card.uniqueCount} value${card.uniqueCount === 1 ? "" : "s"}`;
    }
    return "category";
  }

  function KindIcon({ kind }: { kind: FieldReportCard["kind"] }) {
    const cls = "size-3.5 shrink-0 text-[#1a56a4]";
    if (kind === "amount") return <Wallet className={cls} />;
    if (kind === "date") return <Calendar className={cls} />;
    if (kind === "id") return <Hash className={cls} />;
    return <Layers className={cls} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">MIS Summary Report</h2>
        <p className="text-muted-foreground text-sm">
          {loading
            ? "Loading…"
            : recordCount
              ? `${recordCount.toLocaleString()} records · based on current filters`
              : totalInScope > 0
                ? "No claims match these filters or date range — widen dates or clear filters."
                : "No claims in the database yet — import via Claims → CSV."}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Filters by claim received date (falls back to admission/created date).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">From date</Label>
              <PolicyDateInput value={dateFrom} onValueChange={setDateFrom} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">To date</Label>
              <PolicyDateInput value={dateTo} onValueChange={setDateTo} className="mt-1" />
            </div>
            <PolicyFilterMulti label="Category" placeholder="All categories" options={categoryOptions} selected={categoryKeys} onChange={setCategoryKeys} accentClassName="border-violet-200/90 from-violet-50/95 to-card" />
            <PolicyFilterMulti label="Village" placeholder="All villages" options={villageOptions} selected={villages} onChange={setVillages} accentClassName="border-emerald-200/90 from-emerald-50/95 to-card" />
            <PolicyFilterMulti label="Policy grouping" placeholder="All groupings" options={groupingOptions} selected={policyGroupings} onChange={setPolicyGroupings} accentClassName="border-indigo-200/90 from-indigo-50/95 to-card" />
            <PolicyFilterMulti label="Insurance company" placeholder="All insurers" options={insuranceOptions} selected={insuranceCompanies} onChange={setInsuranceCompanies} accentClassName="border-rose-200/90 from-rose-50/95 to-card" />
            <PolicyFilterMulti label="Status" placeholder="All statuses" options={statusOptions} selected={statusTexts} onChange={setStatusTexts} accentClassName="border-teal-200/90 from-teal-50/95 to-card" />
            <PolicyFilterMulti label="Claim lodge type" placeholder="All lodge types" options={lodgeTypeOptions} selected={claimTypes} onChange={setClaimTypes} accentClassName="border-cyan-200/90 from-cyan-50/95 to-card" />
            <PolicyFilterMulti label="Treatment type" placeholder="All treatments" options={treatmentOptions} selected={treatmentTypes} onChange={setTreatmentTypes} accentClassName="border-lime-200/90 from-lime-50/95 to-card" />
            <PolicyFilterMulti label="Disease category" placeholder="All diseases" options={diseaseOptions} selected={diseaseCategories} onChange={setDiseaseCategories} accentClassName="border-orange-200/90 from-orange-50/95 to-card" />
            <PolicyFilterMulti label="Area" placeholder="All areas" options={areaOptions} selected={areas} onChange={setAreas} accentClassName="border-fuchsia-200/90 from-fuchsia-50/95 to-card" />
            <PolicyFilterMulti label="Month" placeholder="All months" options={monthOptions} selected={periodMonths} onChange={setPeriodMonths} accentClassName="border-sky-200/90 from-sky-50/95 to-card" />
            <PolicyFilterMulti label="Year" placeholder="All years" options={yearOptions} selected={fiscalYears} onChange={setFiscalYears} accentClassName="border-amber-200/90 from-amber-50/95 to-card" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" className="gap-1.5" disabled={exportBusy} onClick={() => setExportDialogOpen(true)}>
              <Download className="size-3.5" />
              Export MIS CSV
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/claims">
                <ArrowLeft className="size-3.5" />
                Back to register
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={resetFilters}>
              <RotateCcw className="size-3.5" />
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total claims", value: summaryCards?.totalClaims, sub: "all categories combined" },
          { label: "Total lodge amount", value: formatInrCompact(summaryCards?.totalLodge), sub: "sum of lodge amts" },
          { label: "Total settled amount", value: formatInrCompact(summaryCards?.totalSettled), sub: "sum of paid amts" },
          { label: "Total deductions", value: formatInrCompact(summaryCards?.totalDeduction), sub: "sum of deductions" },
          { label: "Cashless claims", value: summaryCards?.cashless, sub: "no. of cashless" },
          { label: "Reimbursement claims", value: summaryCards?.reim, sub: "no. of reimbursement" },
          { label: "Cash denied", value: summaryCards?.cashDenied, sub: "cashless denied count" },
          { label: "REM denied", value: summaryCards?.remDenied, sub: "reimbursement denied" },
        ].map((card) => (
          <Card key={card.label} className="py-0">
            <CardContent className="px-4 py-4">
              <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">{card.label}</p>
              <p className="text-2xl font-bold tabular-nums">
                {loading ? <Skeleton className="mt-1 h-8 w-16" /> : (typeof card.value === "number" ? card.value.toLocaleString() : card.value ?? "—")}
              </p>
              <p className="text-muted-foreground text-[10px]">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <div>
            <CardTitle className="text-base">Category-wise claim summary</CardTitle>
            <CardDescription>Cashless + Reimbursement breakdown by Category A / B / C / D</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={exportBusy} onClick={() => setExportDialogOpen(true)}>
            Download CSV
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table className="min-w-[1200px] text-xs">
            <TableHeader>
              <TableRow className="bg-blue-900 text-white hover:bg-blue-900">
                <TableHead rowSpan={2} className="text-white">Category</TableHead>
                <TableHead colSpan={3} className="bg-blue-700 text-center text-white">Cashless</TableHead>
                <TableHead colSpan={3} className="bg-violet-700 text-center text-white">Reimbursement</TableHead>
                <TableHead colSpan={2} className="bg-red-800 text-center text-white">Cash denied</TableHead>
                <TableHead colSpan={2} className="bg-amber-700 text-center text-white">REM denied</TableHead>
                <TableHead rowSpan={2} className="bg-gray-700 text-white">Total</TableHead>
                <TableHead rowSpan={2} className="bg-gray-700 text-white">Lodge amt</TableHead>
                <TableHead rowSpan={2} className="bg-emerald-800 text-white">Settled amt</TableHead>
              </TableRow>
              <TableRow className="text-white hover:bg-transparent">
                <TableHead className="bg-blue-600 text-white">No.</TableHead>
                <TableHead className="bg-blue-600 text-white">Lodge</TableHead>
                <TableHead className="bg-blue-600 text-white">Settled</TableHead>
                <TableHead className="bg-violet-600 text-white">No.</TableHead>
                <TableHead className="bg-violet-600 text-white">Lodge</TableHead>
                <TableHead className="bg-violet-600 text-white">Settle</TableHead>
                <TableHead className="bg-red-700 text-white">No.</TableHead>
                <TableHead className="bg-red-700 text-white">Lodge amt</TableHead>
                <TableHead className="bg-amber-600 text-white">No.</TableHead>
                <TableHead className="bg-amber-600 text-white">Lodge amt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="h-24 text-center">
                    <Skeleton className="mx-auto h-8 w-48" />
                  </TableCell>
                </TableRow>
              ) : categoryRows.length ? (
                <>
                  {categoryRows.map((r) => (
                    <TableRow key={r.category}>
                      <TableCell className="font-bold">{r.category}</TableCell>
                      <TableCell className="text-right text-blue-800">{fmtN(r.cashNo)}</TableCell>
                      <TableCell className="text-right">{fmt(r.cashLodge)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{fmt(r.cashSettled)}</TableCell>
                      <TableCell className="text-right text-violet-800">{fmtN(r.reimNo)}</TableCell>
                      <TableCell className="text-right">{fmt(r.reimLodge)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{fmt(r.reimSettled)}</TableCell>
                      <TableCell className="text-right text-red-800">{fmtN(r.cashDeniedNo)}</TableCell>
                      <TableCell className="text-right text-red-700">{fmt(r.cashDeniedLodge)}</TableCell>
                      <TableCell className="text-right text-amber-800">{fmtN(r.remDeniedNo)}</TableCell>
                      <TableCell className="text-right text-amber-700">{fmt(r.remDeniedLodge)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtN(r.totalNo)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.totalLodge)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-800">{fmt(r.totalSettled)}</TableCell>
                    </TableRow>
                  ))}
                  {categoryTotals ? (
                    <TableRow className="bg-amber-50 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{fmtN(categoryTotals.cashNo)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.cashLodge)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.cashSettled)}</TableCell>
                      <TableCell className="text-right">{fmtN(categoryTotals.reimNo)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.reimLodge)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.reimSettled)}</TableCell>
                      <TableCell className="text-right">{fmtN(categoryTotals.cashDeniedNo)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.cashDeniedLodge)}</TableCell>
                      <TableCell className="text-right">{fmtN(categoryTotals.remDeniedNo)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.remDeniedLodge)}</TableCell>
                      <TableCell className="text-right">{fmtN(categoryTotals.totalNo)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.totalLodge)}</TableCell>
                      <TableCell className="text-right">{fmt(categoryTotals.totalSettled)}</TableCell>
                    </TableRow>
                  ) : null}
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={14} className="text-muted-foreground h-24 text-center text-sm">
                    {totalInScope > 0
                      ? "No records match these filters — widen dates or clear filters."
                      : "No claims in the database yet — import via Claims → CSV."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Field-wise detailed reports</CardTitle>
              <CardDescription>
                Every canonical claim column (39) — categorical breakdowns, amount sum/avg/min/max,
                date range &amp; count. Same structure as the Claim MIS HTML reference; data from live
                Claims DB.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={exportBusy || !fieldCards.length}
              onClick={() => void downloadFieldCsv()}
            >
              <Download className="size-3.5" />
              Download All Reports
            </Button>
          </div>
          <div className="pt-2">
            <Input
              placeholder="Filter fields by name…"
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : filteredFieldCards.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-3.5">
              {filteredFieldCards.map((card) => (
                <div
                  key={card.field}
                  className="overflow-hidden rounded-[10px] border border-[#dde3ec] bg-white shadow-[0_1px_3px_rgba(0,0,0,.07)]"
                  data-field={card.label}
                >
                  {/* Title bar — matches HTML .fr-card-title */}
                  <div className="flex items-center gap-1.5 border-b border-[#eef1f6] bg-[#f8fafc] px-3.5 py-2.5 text-[12.5px] font-bold text-[#1e2a3b]">
                    <KindIcon kind={card.kind} />
                    <span className="min-w-0 truncate">{card.label}</span>
                    <small className="ml-auto shrink-0 rounded-full bg-[#e8f0fb] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-[#1a56a4]">
                      {kindLabel(card.kind, card)}
                    </small>
                    <button
                      type="button"
                      disabled={exportBusy}
                      onClick={() => void downloadFieldCsv(card.field)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-[#dde3ec] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#1a56a4] transition-colors hover:border-[#1a56a4] hover:bg-[#1a56a4] hover:text-white disabled:opacity-50"
                    >
                      <Download className="size-2.5" />
                      CSV
                    </button>
                  </div>

                  {card.emptyMessage ? (
                    <p className="px-4 py-4 text-center text-[11.5px] text-[#9aa3b8]">{card.emptyMessage}</p>
                  ) : null}

                  {/* Amount — .fr-stats + distribution table */}
                  {card.kind === "amount" && !card.emptyMessage ? (
                    <>
                      <div className="grid grid-cols-2">
                        {card.summary?.map((s, i) => (
                          <div
                            key={s.metric}
                            className={`border-b border-[#eef1f6] px-3.5 py-2.5 ${i % 2 === 0 ? "border-r border-[#eef1f6]" : ""}`}
                          >
                            <div className="text-[9.5px] font-bold uppercase tracking-[0.3px] text-[#6b7a99]">
                              {s.metric}
                            </div>
                            <div
                              className={`mt-0.5 text-[15px] font-bold tabular-nums ${s.metric === "Sum" ? "text-[#065f46]" : "text-[#1e2a3b]"}`}
                            >
                              {formatSummaryValue(card.kind, s.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {card.distribution && card.distribution.length > 0 ? (
                        <>
                          <div className="border-t border-[#eef1f6] bg-[#f8fafc] px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.4px] text-[#6b7a99]">
                            Value Distribution
                          </div>
                          <div className="max-h-[260px] overflow-y-auto">
                            <table className="w-full border-collapse text-[11.5px]">
                              <thead>
                                <tr>
                                  {["Range", "Count", "%", "Total Amt"].map((h, hi) => (
                                    <th
                                      key={h}
                                      className={`sticky top-0 border-b border-[#dde3ec] bg-[#f0f4f8] px-2.5 py-1.5 text-[9.5px] font-bold uppercase text-[#6b7a99] ${hi > 0 ? "text-right" : "text-left"}`}
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {card.distribution.map((d) => (
                                  <tr key={d.label} className="hover:bg-[#e8f0fb]">
                                    <td className="border-b border-[#eef1f6] px-2.5 py-1.5 last:border-0">
                                      {d.label}
                                    </td>
                                    <td className="border-b border-[#eef1f6] px-2.5 py-1.5 text-right tabular-nums">
                                      {d.count.toLocaleString()}
                                    </td>
                                    <td className="border-b border-[#eef1f6] px-2.5 py-1.5 text-right tabular-nums text-[#6b7a99]">
                                      {d.percent.toFixed(1)}%
                                    </td>
                                    <td className="border-b border-[#eef1f6] px-2.5 py-1.5 text-right font-semibold tabular-nums text-[#065f46]">
                                      {fmtAmt(d.lodgeAmount ?? d.totalAmount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="border-t border-[#eef1f6] px-3.5 py-1.5 text-center text-[10.5px] text-[#9aa3b8]">
                            {(card.filledRows ?? 0).toLocaleString()} claims · full row details included in
                            download
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {/* Identifier / Date — 2×2 stats grid */}
                  {(card.kind === "id" || card.kind === "date") && !card.emptyMessage ? (
                    <div className="grid grid-cols-2">
                      {card.summary?.map((s, i) => (
                        <div
                          key={s.metric}
                          className={`border-b border-[#eef1f6] px-3.5 py-2.5 ${i % 2 === 0 ? "border-r border-[#eef1f6]" : ""}`}
                        >
                          <div className="text-[9.5px] font-bold uppercase tracking-[0.3px] text-[#6b7a99]">
                            {s.metric}
                          </div>
                          <div className="mt-0.5 text-[15px] font-bold tabular-nums text-[#1e2a3b]">
                            {formatSummaryValue(card.kind, s.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Category — scrollable Value/Count/%/Lodge/Settled table */}
                  {card.kind === "category" && !card.emptyMessage ? (
                    <>
                      <div className="max-h-[260px] overflow-y-auto">
                        <table className="w-full border-collapse text-[11.5px]">
                          <thead>
                            <tr>
                              {["Value", "Count", "%", "Lodge Amt", "Settled Amt"].map((h, hi) => (
                                <th
                                  key={h}
                                  className={`sticky top-0 border-b border-[#dde3ec] bg-[#f0f4f8] px-2.5 py-1.5 text-[9.5px] font-bold uppercase text-[#6b7a99] ${hi > 0 ? "text-right" : "text-left"}`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {card.distribution?.map((d) => (
                              <tr key={d.label} className="hover:bg-[#e8f0fb]">
                                <td
                                  className="max-w-[150px] truncate border-b border-[#eef1f6] px-2.5 py-1.5"
                                  title={d.label}
                                >
                                  {d.label}
                                </td>
                                <td className="border-b border-[#eef1f6] px-2.5 py-1.5 text-right tabular-nums">
                                  {d.count.toLocaleString()}
                                </td>
                                <td className="border-b border-[#eef1f6] px-2.5 py-1.5 text-right tabular-nums text-[#6b7a99]">
                                  {d.percent.toFixed(1)}%
                                </td>
                                <td className="border-b border-[#eef1f6] px-2.5 py-1.5 text-right tabular-nums">
                                  {fmtAmt(d.lodgeAmount ?? d.totalAmount)}
                                </td>
                                <td className="border-b border-[#eef1f6] px-2.5 py-1.5 text-right font-semibold tabular-nums text-[#065f46]">
                                  {fmtAmt(d.settledAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {card.truncated && card.uniqueCount != null ? (
                        <div className="border-t border-[#eef1f6] px-3.5 py-1.5 text-center text-[10.5px] text-[#9aa3b8]">
                          + {(card.uniqueCount - (card.distribution?.length ?? 0)).toLocaleString()} more
                          values (all included in download)
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No field reports for the current filter set.</p>
          )}
        </CardContent>
      </Card>

      <ClaimMisDrillSheet
        open={drillOpen}
        onOpenChange={setDrillOpen}
        village={drillVillage}
        reportQueryString={buildQuery().toString()}
      />
      <MisCsvExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={exportCategoryCsv}
        exporting={exportBusy}
        report="claim-category-summary"
        title="Export Claim MIS CSV"
        description="Choose which fields to include. Current table filters still apply to exported rows."
      />
    </div>
  );
}
