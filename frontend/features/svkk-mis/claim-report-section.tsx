"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatInr } from "@/features/svkk-dashboard/currency";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { todayFormDate, toIsoDateParam, formatDateForFormInput } from "@/lib/svkk/form-date";
import { monthFilterOptionsFromMeta } from "@/lib/svkk/policy-period-months";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { PolicyMemberDrillDownSheet } from "@/features/svkk-mis/policy-member-drill-down-sheet";
import { buildPolicyMemberDrillQueryString } from "@/features/svkk-mis/mis-drill-query";
import { Download, RotateCcw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const REPORT_FETCH_DEBOUNCE_MS = 400;

const GROUP_BY_OPTIONS = [
  { value: "village" as const, label: "Village wise" },
  { value: "category" as const, label: "Category wise" },
  { value: "sum_insured" as const, label: "Sum insured wise" },
  { value: "policy_type" as const, label: "Policy type wise" },
];

const FALLBACK_CATEGORY_OPTIONS: PolicyFilterOption[] = [
  "A",
  "B",
  "C",
  "D",
  "STAFF",
  "SVGA",
].map((c) => ({ value: c, label: c }));

type ClaimReportRow = {
  label: string;
  claimCount: number;
  sumClaimAmount: number;
  sumApprovedAmount: number;
  sumDeductionAmount: number;
};

type ReportResponse = {
  dateFrom: string | null;
  dateTo: string;
  groupBy: (typeof GROUP_BY_OPTIONS)[number]["value"];
  rows: ClaimReportRow[];
};

type FiltersMeta = {
  villages: string[];
  areas: string[];
  sumInsuredValues: string[];
  policyGroupings: string[];
  periodYearTexts: string[];
  periodMonthTexts: string[];
};

const DIM_HEADER: Record<ReportResponse["groupBy"], string> = {
  village: "Village",
  category: "Category",
  sum_insured: "Sum insured",
  policy_type: "Policy type",
};

type ClaimReportSectionProps = {
  onError?: (message: string | null) => void;
};

const VALID_GROUP_BY = new Set(GROUP_BY_OPTIONS.map((o) => o.value));

export function ClaimReportSection({ onError }: ClaimReportSectionProps) {
  const { options: ddOptions } = useDropdownOptions();
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayFormDate());
  const [groupBy, setGroupBy] = useState<(typeof GROUP_BY_OPTIONS)[number]["value"]>("village");
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [villages, setVillages] = useState<string[]>([]);
  const [sumInsureds, setSumInsureds] = useState<string[]>([]);
  const [policyGroupings, setPolicyGroupings] = useState<string[]>([]);
  const [periodMonths, setPeriodMonths] = useState<string[]>([]);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const [rows, setRows] = useState<ClaimReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [filterMeta, setFilterMeta] = useState<FiltersMeta | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillVillage, setDrillVillage] = useState<string | null>(null);

  const reportFetchGenerationRef = useRef(0);
  const reportDebounceReadyRef = useRef(false);

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const df = searchParams.get("dateFrom");
    const dt = searchParams.get("dateTo");
    const gb = searchParams.get("groupBy");
    if (df !== null) setDateFrom(formatDateForFormInput(df) || df);
    if (dt) setDateTo(formatDateForFormInput(dt) || dt);
    if (gb && VALID_GROUP_BY.has(gb as (typeof GROUP_BY_OPTIONS)[number]["value"])) {
      setGroupBy(gb as (typeof GROUP_BY_OPTIONS)[number]["value"]);
    }
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
    () =>
      (filterMeta?.policyGroupings.length ? filterMeta.policyGroupings : ["OTHER", "RTY"]).map(
        (g) => ({ value: g, label: g }),
      ),
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

  const sumInsuredOptions = useMemo<PolicyFilterOption[]>(() => {
    if (ddOptions.SUM_INSURED.length) {
      return ddOptions.SUM_INSURED;
    }
    return (filterMeta?.sumInsuredValues ?? []).map((v) => ({ value: v, label: v }));
  }, [ddOptions.SUM_INSURED, filterMeta?.sumInsuredValues]);

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams();
    const dateFromParam = toIsoDateParam(dateFrom);
    const dateToParam = toIsoDateParam(dateTo);
    if (dateFromParam) q.set("dateFrom", dateFromParam);
    if (dateToParam) q.set("dateTo", dateToParam);
    q.set("groupBy", groupBy);
    categoryKeys.forEach((c) => q.append("categoryKeys", c));
    villages.forEach((v) => q.append("villages", v));
    sumInsureds.forEach((s) => q.append("sumInsureds", s));
    policyGroupings.forEach((g) => q.append("policyGroupings", g));
    periodMonths.forEach((m) => q.append("periodMonthTexts", m));
    fiscalYears.forEach((y) => q.append("fiscalLabels", y));
    return q;
  }, [
    categoryKeys,
    dateFrom,
    dateTo,
    fiscalYears,
    groupBy,
    periodMonths,
    policyGroupings,
    sumInsureds,
    villages,
  ]);

  const reportQueryString = useMemo(() => buildQuery().toString(), [buildQuery]);

  const policyDrillQueryString = useMemo(
    () =>
      buildPolicyMemberDrillQueryString({
        dateFrom,
        dateTo,
        categoryKeys,
        villages,
        sumInsureds,
        policyGroupings,
        periodMonthTexts: periodMonths,
        fiscalLabels: fiscalYears,
      }),
    [
      categoryKeys,
      dateFrom,
      dateTo,
      fiscalYears,
      periodMonths,
      policyGroupings,
      sumInsureds,
      villages,
    ],
  );

  const openVillageDrill = useCallback((label: string) => {
    if (!label || label === "—") return;
    setDrillVillage(label);
    setDrillOpen(true);
  }, []);

  useEffect(() => {
    if (!getSvkkApiBase()) return;
    void (async () => {
      try {
        const f = await svkkJson<FiltersMeta>("/policies/filters");
        setFilterMeta(f);
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  useEffect(() => {
    if (!getSvkkApiBase()) {
      onError?.("Configure NEXT_PUBLIC_API_URL");
      setLoading(false);
      return;
    }
    onError?.(null);
    setLoading(true);

    const delay = reportDebounceReadyRef.current ? REPORT_FETCH_DEBOUNCE_MS : 0;
    reportDebounceReadyRef.current = true;

    const timer = window.setTimeout(() => {
      const generation = ++reportFetchGenerationRef.current;
      void (async () => {
        try {
          const res = await svkkJson<ReportResponse>(`/mis/claim-report?${reportQueryString}`);
          if (generation !== reportFetchGenerationRef.current) return;
          setRows(res.rows);
        } catch (e) {
          if (generation !== reportFetchGenerationRef.current) return;
          onError?.(e instanceof Error ? e.message : "Failed to load claim MIS");
        } finally {
          if (generation === reportFetchGenerationRef.current) {
            setLoading(false);
          }
        }
      })();
    }, delay);

    return () => {
      window.clearTimeout(timer);
      reportFetchGenerationRef.current += 1;
    };
  }, [onError, reportQueryString]);

  const onGroupByChange = useCallback((v: string) => {
    const next = v as (typeof GROUP_BY_OPTIONS)[number]["value"];
    setGroupBy(next);
    if (next !== "village") setVillages([]);
    if (next !== "sum_insured") setSumInsureds([]);
  }, []);

  const resetFilters = useCallback(() => {
    setDateFrom("");
    setDateTo(todayFormDate());
    setGroupBy("village");
    setCategoryKeys([]);
    setVillages([]);
    setSumInsureds([]);
    setPolicyGroupings([]);
    setPeriodMonths([]);
    setFiscalYears([]);
    setFilterText("");
  }, []);

  const filtersActive = useMemo(
    () =>
      dateFrom !== "" ||
      dateTo !== todayFormDate() ||
      groupBy !== "village" ||
      categoryKeys.length > 0 ||
      villages.length > 0 ||
      sumInsureds.length > 0 ||
      policyGroupings.length > 0 ||
      periodMonths.length > 0 ||
      fiscalYears.length > 0 ||
      filterText.trim() !== "",
    [
      categoryKeys,
      dateFrom,
      dateTo,
      filterText,
      fiscalYears,
      groupBy,
      periodMonths,
      policyGroupings,
      sumInsureds,
      villages,
    ],
  );

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [filterText, rows]);

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => ({
          claimCount: acc.claimCount + r.claimCount,
          sumClaimAmount: acc.sumClaimAmount + r.sumClaimAmount,
          sumApprovedAmount: acc.sumApprovedAmount + r.sumApprovedAmount,
          sumDeductionAmount: acc.sumDeductionAmount + r.sumDeductionAmount,
        }),
        {
          claimCount: 0,
          sumClaimAmount: 0,
          sumApprovedAmount: 0,
          sumDeductionAmount: 0,
        },
      ),
    [filteredRows],
  );

  const exportCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      const res = await backendApi.get(`/mis/export/claim-report.csv?${buildQuery().toString()}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "claim-mis-report.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }, [buildQuery, onError]);

  return (
    <div className="space-y-4 rounded-lg border border-border/80 bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div className="rounded-xl border-2 border-slate-200/90 bg-linear-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
          <Label className="text-foreground/90 mb-2 block text-xs font-semibold tracking-wide">
            From date
          </Label>
          <PolicyDateInput
            value={dateFrom}
            onValueChange={setDateFrom}
            className="h-10 bg-background/90"
          />
        </div>
        <div className="rounded-xl border-2 border-slate-200/90 bg-linear-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
          <Label className="text-foreground/90 mb-2 block text-xs font-semibold tracking-wide">
            To date
          </Label>
          <PolicyDateInput
            value={dateTo}
            onValueChange={setDateTo}
            className="h-10 bg-background/90"
          />
          <p className="text-muted-foreground mt-1.5 text-[11px] leading-snug">
            Filters by claim received date (falls back to admission/created date).
          </p>
        </div>
        <PolicyFilterMulti
          label="Category"
          placeholder="All categories"
          options={categoryOptions}
          selected={categoryKeys}
          onChange={setCategoryKeys}
          accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
        />
        <div className="rounded-xl border-2 border-cyan-200/90 bg-linear-to-br from-cyan-50/95 to-card p-3 shadow-sm dark:border-cyan-900/50 dark:from-cyan-950/35 dark:to-card">
          <Label className="text-foreground/90 mb-2 block text-xs font-semibold tracking-wide">
            Group rows by
          </Label>
          <Select value={groupBy} onValueChange={onGroupByChange}>
            <SelectTrigger className="mt-0 h-10 bg-background/90">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {groupBy === "village" ? (
          <PolicyFilterMulti
            label="Village"
            placeholder="All villages"
            options={villageOptions}
            selected={villages}
            onChange={setVillages}
            accentClassName="border-emerald-200/90 from-emerald-50/95 to-card dark:border-emerald-900/50 dark:from-emerald-950/35 dark:to-card"
          />
        ) : null}
        {groupBy === "sum_insured" ? (
          <PolicyFilterMulti
            label="Sum insured"
            placeholder="All sum insured"
            options={sumInsuredOptions}
            selected={sumInsureds}
            onChange={setSumInsureds}
            accentClassName="border-orange-200/90 from-orange-50/95 to-card dark:border-orange-900/50 dark:from-orange-950/35 dark:to-card"
          />
        ) : null}
        <PolicyFilterMulti
          label="Policy grouping"
          placeholder="All groupings"
          options={groupingOptions}
          selected={policyGroupings}
          onChange={setPolicyGroupings}
          accentClassName="border-indigo-200/90 from-indigo-50/95 to-card dark:border-indigo-900/50 dark:from-indigo-950/35 dark:to-card"
        />
        <PolicyFilterMulti
          label="Month"
          placeholder="All months"
          options={monthOptions}
          selected={periodMonths}
          onChange={setPeriodMonths}
          accentClassName="border-sky-200/90 from-sky-50/95 to-card dark:border-sky-900/50 dark:from-sky-950/35 dark:to-card"
          popoverContentClassName="max-h-[min(22rem,70vh)]"
        />
        <PolicyFilterMulti
          label="Year"
          placeholder="All years"
          options={yearOptions}
          selected={fiscalYears}
          onChange={setFiscalYears}
          accentClassName="border-amber-200/90 from-amber-50/95 to-card dark:border-amber-900/50 dark:from-amber-950/35 dark:to-card"
        />
      </div>

      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="gap-1.5"
          disabled={loading || exportBusy}
          onClick={() => void exportCsv()}
        >
          <Download className="size-3.5" />
          {exportBusy ? "Exporting…" : "Export CSV"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={loading || !filtersActive}
          onClick={resetFilters}
        >
          <RotateCcw className="size-3.5" />
          Reset filters
        </Button>
        {loading ? (
          <span className="text-muted-foreground text-xs">Updating report…</span>
        ) : null}
      </div>

      <div className="max-w-sm">
        <Label className="text-muted-foreground text-xs">Search in table</Label>
        <Input
          className="mt-1 h-9"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter group label…"
        />
        {groupBy === "village" ? (
          <p className="text-muted-foreground mt-1.5 text-xs">
            Click a village name to open category breakdown (SVKK, NVKK, RTY, OTHER) with policy
            metrics for that village. Uses the same filters as this report.
          </p>
        ) : null}
      </div>

      <div className="relative max-w-full overflow-x-auto rounded-md border">
        {loading ? (
          <div
            className="from-primary/40 pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-linear-to-r via-primary to-primary/40"
            aria-hidden
          />
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-muted/40 text-xs font-semibold">
                {DIM_HEADER[groupBy]}
              </TableHead>
              <TableHead className="bg-muted/40 text-right text-xs font-semibold">Claims</TableHead>
              <TableHead className="bg-muted/40 text-right text-xs font-semibold">
                Claim amount
              </TableHead>
              <TableHead className="bg-muted/40 text-right text-xs font-semibold">
                Approved amt
              </TableHead>
              <TableHead className="bg-muted/40 text-right text-xs font-semibold">
                Deduction amount
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j} className="min-w-[5.5rem] py-1.5">
                      <Skeleton className="h-8 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredRows.length ? (
              filteredRows.map((r) => (
                <TableRow key={r.label} className="text-sm">
                  <TableCell className="font-medium">
                    {groupBy === "village" ? (
                      <button
                        type="button"
                        className="cursor-pointer text-left font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => openVillageDrill(r.label)}
                      >
                        {r.label}
                      </button>
                    ) : (
                      r.label
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.claimCount.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatInr(r.sumClaimAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatInr(r.sumApprovedAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatInr(r.sumDeductionAmount)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-left">
                  <p className="text-muted-foreground ml-[15%] py-6 text-sm font-medium">
                    {rows.length === 0 ? "No records" : "No records match your search"}
                  </p>
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredRows.length > 0 ? (
              <TableRow className="border-t-2 border-t-foreground/10 bg-muted/30 font-medium">
                <TableCell className="py-2 text-sm">TOTAL</TableCell>
                <TableCell className="py-2 text-right text-sm tabular-nums">
                  {totals.claimCount.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="py-2 text-right text-sm tabular-nums">
                  {formatInr(totals.sumClaimAmount)}
                </TableCell>
                <TableCell className="py-2 text-right text-sm tabular-nums">
                  {formatInr(totals.sumApprovedAmount)}
                </TableCell>
                <TableCell className="py-2 text-right text-sm tabular-nums">
                  {formatInr(totals.sumDeductionAmount)}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <PolicyMemberDrillDownSheet
        open={drillOpen}
        onOpenChange={setDrillOpen}
        drillType={drillVillage ? "village" : null}
        drillLabel={drillVillage}
        reportQueryString={policyDrillQueryString}
      />
    </div>
  );
}
