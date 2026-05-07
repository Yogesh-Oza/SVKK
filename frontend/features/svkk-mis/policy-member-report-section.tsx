"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { svkkJson } from "@/lib/svkk/api";
import { backendApi } from "@/lib/api/svkk-client";
import { getSvkkApiBase } from "@/lib/svkk/config";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Column,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInr } from "@/features/svkk-dashboard/currency";

const GROUP_BY_OPTIONS = [
  { value: "village" as const, label: "Village wise" },
  { value: "area" as const, label: "Area wise" },
  { value: "policy_type" as const, label: "Policy type wise" },
  { value: "sum_insured" as const, label: "Sum insured wise" },
  { value: "age" as const, label: "Age wise" },
];

const CATEGORY_OPTIONS = ["A", "B", "C", "D", "STAFF"] as const;
const POLICY_GROUP_OPTIONS = ["OTHER", "RTY"] as const;

const ROW_KEYS: (keyof PolicyMemberRow)[] = [
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
const YEAR_OPTIONS = ["", "2023", "2024", "2025", "2026", "2027"] as const;
const MONTHS: { v: string; m: string }[] = [
  { v: "", m: "All" },
  { v: "1", m: "January" },
  { v: "2", m: "February" },
  { v: "3", m: "March" },
  { v: "4", m: "April" },
  { v: "5", m: "May" },
  { v: "6", m: "June" },
  { v: "7", m: "July" },
  { v: "8", m: "August" },
  { v: "9", m: "September" },
  { v: "10", m: "October" },
  { v: "11", m: "November" },
  { v: "12", m: "December" },
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
  asOfDate: string;
  groupBy: (typeof GROUP_BY_OPTIONS)[number]["value"];
  rows: PolicyMemberRow[];
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

function formatCell(key: keyof PolicyMemberRow, v: number) {
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
  return ({ column }: { column: Column<T, unknown> }) => (
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

function makeColumns(dimLabel: string): ColumnDef<PolicyMemberRow>[] {
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

  return [
    {
      accessorKey: "label",
      header: sortableHeader<PolicyMemberRow>(dimLabel),
      cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
    },
    n("totalPolicies", "Total policies"),
    n("membersPlusPolicies", "Members + policies"),
    n("cntAshaKiran", "Asha-kiran"),
    n("cntFamilyFloater", "Family-floating"),
    n("cntIndividual", "Individual"),
    n("sumVkk", "Total VKK premium"),
    n("sumCo", "Co premium"),
    n("sumGross", "Gross premium"),
    n("sumComm", "Commission"),
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
  asOf: string;
  village: string;
  onError: (m: string) => void;
};

export function PolicyMemberReportSection({ asOf, village, onError }: Props) {
  const [groupBy, setGroupBy] = useState<(typeof GROUP_BY_OPTIONS)[number]["value"]>("village");
  const [category, setCategory] = useState<string>("");
  const [policyGroup, setPolicyGroup] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [filterText, setFilterText] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [data, setData] = useState<PolicyMemberRow[]>([]);
  const [asOfLabel, setAsOfLabel] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<ReportResponse["groupBy"] | null>(null);
  const [loading, setLoading] = useState(false);

  const columns = useMemo(
    () => makeColumns(activeGroup ? DIM_HEADER[activeGroup] : "—"),
    [activeGroup],
  );

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
    q.set("asOfDate", asOf);
    if (village.trim()) {
      q.set("village", village.trim());
    }
    q.set("groupBy", groupBy);
    if (category) {
      q.set("categoryKey", category);
    }
    if (policyGroup) {
      q.set("policyGrouping", policyGroup);
    }
    if (month) {
      q.set("month", month);
    }
    if (year) {
      q.set("year", year);
    }
    return q;
  }, [asOf, category, groupBy, month, policyGroup, village, year]);

  const runReport = useCallback(async () => {
    onError("");
    if (!getSvkkApiBase()) {
      onError("Configure NEXT_PUBLIC_API_URL");
      return;
    }
    setLoading(true);
    try {
      const res = await svkkJson<ReportResponse>(
        `/mis/policy-member-report?${buildQuery().toString()}`,
      );
      setData(res.rows);
      setAsOfLabel(res.asOfDate);
      setActiveGroup(res.groupBy);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Report failed");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, onError]);

  useEffect(() => {
    void runReport();
  }, [runReport]);

  const downloadCsv = useCallback(() => {
    void (async () => {
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
      }
    })();
  }, [buildQuery, onError]);

  const total = sumFiltered(table.getFilteredRowModel().rows);

  return (
    <div className="space-y-4 rounded-lg border border-border/80 bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Policy &amp; member report</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
            Uses the as-of date and optional village from above. Sort columns and
            use the search box to narrow rows (totals follow the filtered set).
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select
            value={category || "__all__"}
            onValueChange={(v) => setCategory(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Select option</Label>
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as (typeof groupBy))}
          >
            <SelectTrigger className="mt-1 h-9">
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
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Policy grouping</Label>
          <Select
            value={policyGroup || "__pall__"}
            onValueChange={(v) => setPolicyGroup(v === "__pall__" ? "" : v)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__pall__">All</SelectItem>
              {POLICY_GROUP_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Month (policy created)</Label>
          <Select
            value={month || "__mall__"}
            onValueChange={(v) => setMonth(v === "__mall__" ? "" : v)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.v || "mall"} value={m.v || "__mall__"}>
                  {m.m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[120px]">
          <Label className="text-xs text-muted-foreground">Year (created)</Label>
          <Select
            value={year || "__yall__"}
            onValueChange={(v) => setYear(v === "__yall__" ? "" : v)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y || "yall"} value={y || "__yall__"}>
                  {y || "All"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={downloadCsv}>
            Download CSV
          </Button>
        </div>
      </div>

      <div className="max-w-sm">
        <Label className="text-xs text-muted-foreground">Search in table</Label>
        <Input
          className="mt-1 h-9"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter any column…"
        />
      </div>

      {asOfLabel ? (
        <p className="text-muted-foreground text-xs">As of {new Date(asOfLabel).toLocaleString()}</p>
      ) : null}

      <div className="max-w-full overflow-x-auto rounded-md border">
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
            {table.getRowModel().rows.length ? (
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
                <TableCell colSpan={columns.length} className="h-20 text-center text-muted-foreground">
                  {loading ? "…" : "No data found for selected filters."}
                </TableCell>
              </TableRow>
            )}
            {table.getFilteredRowModel().rows.length > 0 ? (
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
    </div>
  );
}
