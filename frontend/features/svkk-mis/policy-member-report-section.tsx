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
import { formatInr } from "@/features/svkk-dashboard/currency";
import { backendApi } from "@/lib/api/svkk-client";
import { svkkJson } from "@/lib/svkk/api";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { hasPermission } from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { PolicyMemberDrillDownSheet } from "@/features/svkk-mis/policy-member-drill-down-sheet";
import { ArrowUpDown, Download, RotateCcw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Wait after filter changes before hitting the MIS report API (table search stays instant). */
const REPORT_FETCH_DEBOUNCE_MS = 400;

const GROUP_BY_OPTIONS = [
  { value: "village" as const, label: "Village wise" },
  { value: "area" as const, label: "Area wise" },
  { value: "policy_type" as const, label: "Policy type wise" },
  { value: "sum_insured" as const, label: "Sum insured wise" },
  { value: "age" as const, label: "Age wise" },
];

const CATEGORY_OPTIONS: PolicyFilterOption[] = ["A", "B", "C", "D", "STAFF"].map((c) => ({
  value: c,
  label: c,
}));

const CREATED_MONTH_OPTIONS: PolicyFilterOption[] = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export const ROW_KEYS: (keyof PolicyMemberRow)[] = [
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
];

export type PolicyMemberRow = {
  label: string;
  totalPolicies: number;
  membersPlusPolicies: number;
  cntAshaKiran: number;
  cntFamilyFloater: number;
  cntIndividual: number;
  sumVkk: number;
  sumCo: number;
  sumGross: number;
  sumComm: number;
  sumTwoLac: number;
  sumPolHolder: number;
  sumGaam: number;
  sumRefund: number;
  sumCd: number;
  age0_18: number;
  age19_35: number;
  age36_45: number;
  age46_50: number;
  age51_55: number;
  age56_60: number;
  age61_65: number;
  age65p: number;
};

type ReportResponse = {
  dateFrom: string | null;
  dateTo: string;
  groupBy: (typeof GROUP_BY_OPTIONS)[number]["value"];
  rows: PolicyMemberRow[];
};

type FiltersMeta = {
  villages: string[];
  areas: string[];
  sumInsuredValues: string[];
  policyGroupings: string[];
  periodYearTexts: string[];
};

const DIM_HEADER: Record<ReportResponse["groupBy"], string> = {
  village: "Village / row",
  area: "Area",
  policy_type: "Policy type",
  sum_insured: "Sum insured",
  age: "Age band",
};

function inr(n: number) {
  return formatInr(n);
}

function int(n: number) {
  return n.toLocaleString("en-IN");
}

export function formatCell(key: keyof PolicyMemberRow, v: number) {
  const moneyKeys: (keyof PolicyMemberRow)[] = [
    "sumVkk",
    "sumCo",
    "sumGross",
    "sumComm",
    "sumTwoLac",
    "sumPolHolder",
    "sumGaam",
    "sumRefund",
    "sumCd",
  ];
  if (moneyKeys.includes(key)) {
    return inr(v);
  }
  return int(v);
}

function sortableHeader<T>(title: string) {
  function SortableHeader({ column }: { column: Column<T, unknown> }) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-8 px-1.5 -ml-1.5 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {title}
        <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-60" />
      </Button>
    );
  }
  SortableHeader.displayName = `SortableHeader(${title})`;
  return SortableHeader;
}

function sumFiltered(rows: Row<PolicyMemberRow>[]) {
  const z: PolicyMemberRow = {
    label: "TOTAL",
    totalPolicies: 0,
    membersPlusPolicies: 0,
    cntAshaKiran: 0,
    cntFamilyFloater: 0,
    cntIndividual: 0,
    sumVkk: 0,
    sumCo: 0,
    sumGross: 0,
    sumComm: 0,
    sumTwoLac: 0,
    sumPolHolder: 0,
    sumGaam: 0,
    sumRefund: 0,
    sumCd: 0,
    age0_18: 0,
    age19_35: 0,
    age36_45: 0,
    age46_50: 0,
    age51_55: 0,
    age56_60: 0,
    age61_65: 0,
    age65p: 0,
  };
  for (const r of rows) {
    const o = r.original;
    z.totalPolicies += o.totalPolicies;
    z.membersPlusPolicies += o.membersPlusPolicies;
    z.cntAshaKiran += o.cntAshaKiran;
    z.cntFamilyFloater += o.cntFamilyFloater;
    z.cntIndividual += o.cntIndividual;
    z.sumVkk += o.sumVkk;
    z.sumCo += o.sumCo;
    z.sumGross += o.sumGross;
    z.sumComm += o.sumComm;
    z.sumTwoLac += o.sumTwoLac;
    z.sumPolHolder += o.sumPolHolder;
    z.sumGaam += o.sumGaam;
    z.sumRefund += o.sumRefund;
    z.sumCd += o.sumCd;
    z.age0_18 += o.age0_18;
    z.age19_35 += o.age19_35;
    z.age36_45 += o.age36_45;
    z.age46_50 += o.age46_50;
    z.age51_55 += o.age51_55;
    z.age56_60 += o.age56_60;
    z.age61_65 += o.age61_65;
    z.age65p += o.age65p;
  }
  return z;
}

function makeColumns(
  dimLabel: string,
  onDrill?: (label: string) => void,
  canSeeCommission?: boolean,
): ColumnDef<PolicyMemberRow>[] {
  const n = (id: keyof PolicyMemberRow, title: string) =>
    ({
      accessorKey: id,
      header: sortableHeader<PolicyMemberRow>(title),
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <span className="tabular-nums text-right block">{formatCell(id, v)}</span>
        );
      },
    }) satisfies ColumnDef<PolicyMemberRow>;

  const base: ColumnDef<PolicyMemberRow>[] = [
    {
      accessorKey: "label",
      header: sortableHeader<PolicyMemberRow>(dimLabel),
      cell: ({ row }) => {
        const label = row.original.label;
        if (onDrill && label && label !== "—") {
          return (
            <button
              type="button"
              className="cursor-pointer text-left font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => onDrill(label)}
            >
              {label}
            </button>
          );
        }
        return <span className="font-medium">{label}</span>;
      },
    },
    n("totalPolicies", "Total policies"),
    n("membersPlusPolicies", "Members + policies"),
    n("cntAshaKiran", "Asha-kiran"),
    n("cntFamilyFloater", "Family-floating"),
    n("cntIndividual", "Individual"),
    n("sumVkk", "Total VKK premium"),
    n("sumCo", "Co premium"),
    n("sumGross", "Gross premium"),
    ...(canSeeCommission ? [n("sumComm", "Commission")] : []),
    n("sumTwoLac", "Two lakh F"),
    n("sumPolHolder", "Policy holder premium"),
    n("sumGaam", "Gaam Mahajan VKK refund"),
    n("sumRefund", "Refund cheque amt"),
    n("sumCd", "CD amount"),
    n("age0_18", "Age 0–18"),
    n("age19_35", "Age 19–35"),
    n("age36_45", "Age 36–45"),
    n("age46_50", "Age 46–50"),
    n("age51_55", "Age 51–55"),
    n("age56_60", "Age 56–60"),
    n("age61_65", "Age 61–65"),
    n("age65p", "Age >65"),
  ];
  return base;
}

function globalFilterFn(
  row: Row<PolicyMemberRow>,
  _columnId: string,
  filter: unknown,
) {
  const s = String(filter ?? "").toLowerCase().trim();
  if (!s) {
    return true;
  }
  const o = row.original;
  return Object.values(o).some((v) => String(v).toLowerCase().includes(s));
}

type Props = {
  onError: (m: string) => void;
};

const VALID_GROUP_BY = new Set(GROUP_BY_OPTIONS.map((o) => o.value));

export function PolicyMemberReportSection({ onError }: Props) {
  const { user } = useSvkkAuth();
  const canSeeComm = user ? hasPermission(user.permissions, "policy:commission") : false;
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayIsoDate);
  const [groupBy, setGroupBy] = useState<(typeof GROUP_BY_OPTIONS)[number]["value"]>("village");
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [villages, setVillages] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [sumInsureds, setSumInsureds] = useState<string[]>([]);
  const [policyGroupings, setPolicyGroupings] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [data, setData] = useState<PolicyMemberRow[]>([]);
  const [activeGroup, setActiveGroup] = useState<ReportResponse["groupBy"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [filterMeta, setFilterMeta] = useState<FiltersMeta | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTarget, setDrillTarget] = useState<{
    type: "village" | "area";
    label: string;
  } | null>(null);
  const { options: ddOptions } = useDropdownOptions();

  const openDrill = useCallback(
    (label: string) => {
      if (groupBy !== "village" && groupBy !== "area") return;
      setDrillTarget({ type: groupBy, label });
      setDrillOpen(true);
    },
    [groupBy],
  );

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const df = searchParams.get("dateFrom");
    const dt = searchParams.get("dateTo");
    const gb = searchParams.get("groupBy");
    if (df !== null) setDateFrom(df);
    if (dt) setDateTo(dt);
    if (gb && VALID_GROUP_BY.has(gb as (typeof GROUP_BY_OPTIONS)[number]["value"])) {
      setGroupBy(gb as (typeof GROUP_BY_OPTIONS)[number]["value"]);
    }
    const v = searchParams.getAll("villages");
    if (v.length) setVillages(v);
    const m = searchParams.getAll("months");
    if (m.length) setMonths(m);
    const c = searchParams.getAll("categoryKeys");
    if (c.length) setCategoryKeys(c);
  }, [searchParams]);

  const villageOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.villages ?? []).map((v) => ({ value: v, label: v })),
    [filterMeta?.villages],
  );
  const groupingOptions = useMemo<PolicyFilterOption[]>(
    () =>
      (filterMeta?.policyGroupings.length
        ? filterMeta.policyGroupings
        : ["OTHER", "RTY"]
      ).map((g) => ({ value: g, label: g })),
    [filterMeta?.policyGroupings],
  );
  const yearOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.periodYearTexts ?? []).map((y) => ({ value: y, label: y })),
    [filterMeta?.periodYearTexts],
  );
  const areaOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.areas ?? []).map((a) => ({ value: a, label: a })),
    [filterMeta?.areas],
  );
  const sumInsuredOptions = useMemo<PolicyFilterOption[]>(() => {
    if (ddOptions.SUM_INSURED.length) {
      return ddOptions.SUM_INSURED;
    }
    return (filterMeta?.sumInsuredValues ?? []).map((v) => ({ value: v, label: v }));
  }, [ddOptions.SUM_INSURED, filterMeta?.sumInsuredValues]);

  const columns = useMemo(
    () =>
      makeColumns(
        DIM_HEADER[groupBy],
        groupBy === "village" || groupBy === "area" ? openDrill : undefined,
        canSeeComm,
      ),
    [groupBy, openDrill, canSeeComm],
  );
  const colCount = columns.length;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filterText },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilterText,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn,
  });

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (dateFrom) {
      q.set("dateFrom", dateFrom);
    }
    if (dateTo) {
      q.set("dateTo", dateTo);
    }
    q.set("groupBy", groupBy);
    categoryKeys.forEach((c) => q.append("categoryKeys", c));
    villages.forEach((v) => q.append("villages", v));
    areas.forEach((a) => q.append("areas", a));
    sumInsureds.forEach((s) => q.append("sumInsureds", s));
    policyGroupings.forEach((g) => q.append("policyGroupings", g));
    months.forEach((m) => q.append("months", m));
    fiscalYears.forEach((y) => q.append("fiscalLabels", y));
    return q;
  }, [
    areas,
    categoryKeys,
    dateFrom,
    dateTo,
    fiscalYears,
    groupBy,
    months,
    policyGroupings,
    sumInsureds,
    villages,
  ]);

  const reportQueryString = useMemo(() => buildQuery().toString(), [
    areas,
    categoryKeys,
    dateFrom,
    dateTo,
    fiscalYears,
    groupBy,
    months,
    policyGroupings,
    sumInsureds,
    villages,
  ]);

  const reportFetchGenerationRef = useRef(0);
  const reportDebounceReadyRef = useRef(false);

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
      onError("Configure NEXT_PUBLIC_API_URL");
      setLoading(false);
      return;
    }
    onError("");
    setLoading(true);

    const delay = reportDebounceReadyRef.current ? REPORT_FETCH_DEBOUNCE_MS : 0;
    reportDebounceReadyRef.current = true;

    const timer = window.setTimeout(() => {
      const generation = ++reportFetchGenerationRef.current;
      void (async () => {
        try {
          const res = await svkkJson<ReportResponse>(
            `/mis/policy-member-report?${reportQueryString}`,
          );
          if (generation !== reportFetchGenerationRef.current) return;
          setData(res.rows);
          setActiveGroup(res.groupBy);
        } catch (e) {
          if (generation !== reportFetchGenerationRef.current) return;
          onError(e instanceof Error ? e.message : "Report failed");
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
    if (next !== "village") {
      setVillages([]);
    }
    if (next !== "area") {
      setAreas([]);
    }
    if (next !== "sum_insured") {
      setSumInsureds([]);
    }
  }, []);

  const resetFilters = useCallback(() => {
    setDateFrom("");
    setDateTo(todayIsoDate());
    setGroupBy("village");
    setCategoryKeys([]);
    setVillages([]);
    setAreas([]);
    setSumInsureds([]);
    setPolicyGroupings([]);
    setMonths([]);
    setFiscalYears([]);
    setFilterText("");
    setSorting([]);
  }, []);

  const filtersActive = useMemo(
    () =>
      dateFrom !== "" ||
      dateTo !== todayIsoDate() ||
      groupBy !== "village" ||
      categoryKeys.length > 0 ||
      villages.length > 0 ||
      areas.length > 0 ||
      sumInsureds.length > 0 ||
      policyGroupings.length > 0 ||
      months.length > 0 ||
      fiscalYears.length > 0 ||
      filterText.trim() !== "" ||
      sorting.length > 0,
    [
      areas,
      categoryKeys,
      dateFrom,
      dateTo,
      filterText,
      fiscalYears,
      groupBy,
      months,
      policyGroupings,
      sorting.length,
      sumInsureds,
      villages,
    ],
  );

  const exportReportCsv = useCallback(() => {
    void (async () => {
      setExportBusy(true);
      try {
        const res = await backendApi.get(
          `/mis/export/policy-member-report.csv?${buildQuery().toString()}`,
          { responseType: "blob" },
        );
        const blob = new Blob([res.data], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "policy-member-report.csv";
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Export failed");
      } finally {
        setExportBusy(false);
      }
    })();
  }, [buildQuery, onError]);

  const total = sumFiltered(table.getFilteredRowModel().rows);

  return (
    <div className="space-y-4 rounded-lg border border-border/80 bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div className="rounded-xl border-2 border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
          <Label className="text-foreground/90 mb-2 block text-xs font-semibold tracking-wide">
            From date
          </Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 bg-background/90"
          />
        </div>
        <div className="rounded-xl border-2 border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
          <Label className="text-foreground/90 mb-2 block text-xs font-semibold tracking-wide">
            To date
          </Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 bg-background/90"
          />
        </div>
        <PolicyFilterMulti
          label="Category"
          placeholder="All categories"
          options={CATEGORY_OPTIONS}
          selected={categoryKeys}
          onChange={setCategoryKeys}
          accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
        />
        <div className="rounded-xl border-2 border-cyan-200/90 bg-gradient-to-br from-cyan-50/95 to-card p-3 shadow-sm dark:border-cyan-900/50 dark:from-cyan-950/35 dark:to-card">
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
        {groupBy === "area" ? (
          <PolicyFilterMulti
            label="Area"
            placeholder="All areas"
            options={areaOptions}
            selected={areas}
            onChange={setAreas}
            accentClassName="border-teal-200/90 from-teal-50/95 to-card dark:border-teal-900/50 dark:from-teal-950/35 dark:to-card"
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
          label="Month (policy created)"
          placeholder="All months"
          options={CREATED_MONTH_OPTIONS}
          selected={months}
          onChange={setMonths}
          accentClassName="border-sky-200/90 from-sky-50/95 to-card dark:border-sky-900/50 dark:from-sky-950/35 dark:to-card"
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
          onClick={() => void exportReportCsv()}
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
        <Label className="text-xs text-muted-foreground">Search in table</Label>
        <Input
          className="mt-1 h-9"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter any column…"
        />
        {groupBy === "village" || groupBy === "area" ? (
          <p className="text-muted-foreground mt-1.5 text-xs">
            Click a {groupBy === "village" ? "village" : "area"} name to open category breakdown
            (SVKK, NVKK, RTY, OTHER).
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
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    colSpan={h.colSpan}
                    className="whitespace-nowrap bg-muted/40 text-xs font-semibold"
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <TableCell key={j} className="py-1.5 min-w-[5.5rem]">
                      <Skeleton className="h-8 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="text-sm">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1.5 min-w-[5.5rem]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={colCount} className="h-32 text-left">
                  <p className="text-muted-foreground ml-[15%] py-6 text-sm font-medium">
                    {data.length === 0
                      ? "No records"
                      : "No records match your search"}
                  </p>
                </TableCell>
              </TableRow>
            )}
            {!loading && table.getFilteredRowModel().rows.length > 0 ? (
              <TableRow className="border-t-2 border-t-foreground/10 bg-muted/30 font-medium">
                {ROW_KEYS.map((k) => (
                  <TableCell key={k} className="py-2 text-sm">
                    {k === "label" ? (
                      "TOTAL"
                    ) : (
                      <span className="tabular-nums text-right block">
                        {formatCell(k, total[k] as number)}
                      </span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <PolicyMemberDrillDownSheet
        open={drillOpen}
        onOpenChange={setDrillOpen}
        drillType={drillTarget?.type ?? null}
        drillLabel={drillTarget?.label ?? null}
        reportQueryString={reportQueryString}
      />
    </div>
  );
}
