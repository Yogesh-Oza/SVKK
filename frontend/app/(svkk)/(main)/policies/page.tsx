"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PoliciesColumnHeader } from "@/features/svkk-policies/policies-column-header";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { canDeletePolicy, canUpdatePolicy } from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import type { PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import { openPolicyReceiptPrint } from "@/lib/svkk/policy-receipt-print";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, MoreHorizontal, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ListPolicy = {
  id: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  personsInsuredCount: number | null;
  area: string | null;
  remarks: string | null;
  adProductVariant?: string | null;
  periodYearText?: string | null;
  periodMonthText?: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    mobile: string;
    customerId: string | null;
    pan: string | null;
  };
  policyType: { id: string; name: string };
  category: { id: string; key: string; name: string } | null;
  years: Array<{
    yearLabel: string;
    sumInsured: unknown;
    vkkPremium: unknown;
    expectedNetPremium: unknown;
  }>;
};

type PageListRes = {
  items: ListPolicy[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type FiltersMeta = {
  villages: string[];
  areas: string[];
  sumInsuredValues: string[];
  periodYearTexts: string[];
  periodMonthTexts: string[];
};

type CategoryItem = { id: string; key: string; name: string };
type PolicyTypeItem = { id: string; key: string; name: string };

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt", label: "Newest first" },
  { value: "createdAt_asc", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "customerId", label: "Customer ID A–Z" },
  { value: "customerId_desc", label: "Customer ID Z–A" },
  { value: "categoryKey", label: "Category A–Z" },
  { value: "categoryKey_desc", label: "Category Z–A" },
  { value: "policyTypeName", label: "Policy type A–Z" },
  { value: "policyTypeName_desc", label: "Policy type Z–A" },
  { value: "village", label: "Village A–Z" },
  { value: "village_desc", label: "Village Z–A" },
  { value: "mobile", label: "Mobile A–Z" },
  { value: "mobile_desc", label: "Mobile Z–A" },
  { value: "policyNo", label: "Policy no. A–Z" },
  { value: "policyNo_desc", label: "Policy no. Z–A" },
  { value: "referenceNo", label: "Reference no. A–Z" },
  { value: "referenceNo_desc", label: "Reference no. Z–A" },
];

function sumLabel(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return "—";
}

export default function SvkkPoliciesPage() {
  const { user } = useSvkkAuth();
  const role = user?.role;
  const canDel = role ? canDeletePolicy(role) : false;
  const canEdit = role ? canUpdatePolicy(role) : false;

  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const prevSearchApplied = useRef(searchApplied);
  const [village, setVillage] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [periodYearText, setPeriodYearText] = useState("");
  const [periodMonthText, setPeriodMonthText] = useState("");
  const [categoryIdState, setCategoryIdState] = useState("");
  const [policyTypeId, setPolicyTypeId] = useState("");
  const [adVariant, setAdVariant] = useState<string>("");
  const [area, setArea] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [policyGrouping, setPolicyGrouping] = useState<string>("");
  const [chequeStatus, setChequeStatus] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [sort, setSort] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<ListPolicy[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<FiltersMeta | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [policyTypes, setPolicyTypes] = useState<PolicyTypeItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    referenceNo: false,
  });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rowDeleteId, setRowDeleteId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  const missingUrl = !getSvkkApiBase();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchApplied(searchDraft.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    if (prevSearchApplied.current !== searchApplied) {
      prevSearchApplied.current = searchApplied;
      setPage(1);
    }
  }, [searchApplied]);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    q.set("sort", sort);
    if (searchApplied.trim()) q.set("search", searchApplied.trim());
    if (village.trim()) q.set("village", village.trim());
    if (yearLabel.trim()) q.set("yearLabel", yearLabel.trim());
    if (periodYearText) q.set("periodYearText", periodYearText);
    if (periodMonthText) q.set("periodMonthText", periodMonthText);
    if (categoryIdState) q.set("categoryId", categoryIdState);
    if (policyTypeId) q.set("policyTypeId", policyTypeId);
    if (adVariant) q.set("adProductVariant", adVariant);
    if (area.trim()) q.set("area", area.trim());
    if (sumInsured) q.set("sumInsured", sumInsured);
    if (policyGrouping) q.set("policyGrouping", policyGrouping);
    if (chequeStatus) q.set("chequeStatus", chequeStatus);
    if (filterMonth && filterYear) {
      const m = Number(filterMonth);
      const y = Number(filterYear);
      if (m >= 1 && m <= 12 && y >= 1990) {
        q.set("month", String(m));
        q.set("year", String(y));
      }
    }
    return q.toString();
  }, [
    page,
    pageSize,
    sort,
    searchApplied,
    village,
    yearLabel,
    periodYearText,
    periodMonthText,
    categoryIdState,
    policyTypeId,
    adVariant,
    area,
    sumInsured,
    policyGrouping,
    chequeStatus,
    filterMonth,
    filterYear,
  ]);

  /** Same filters and sort as the table; omit paging so export returns all matching rows. */
  const exportQueryString = useMemo(() => {
    const q = new URLSearchParams(queryString);
    q.delete("page");
    q.delete("pageSize");
    return q.toString();
  }, [queryString]);

  const exportPoliciesCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      const res = await backendApi.get(`/policies/export.csv?${exportQueryString}`, {
        responseType: "blob",
      });
      const truncated = String(res.headers["x-export-truncated"] ?? "").toLowerCase() === "true";
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      a.download = `policies-export-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast.message("Export capped", {
          description:
            "More than 100,000 policies matched; the file includes the first 100,000 in the current sort order. Narrow filters if needed.",
        });
      } else {
        toast.success("Policies exported");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }, [exportQueryString]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setErr(null);
      const res = await svkkJson<PageListRes>(`/policies?${queryString}`);
      setRows(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
      setRowSelection({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (missingUrl) return;
    void load();
  }, [missingUrl, load]);

  useEffect(() => {
    if (missingUrl) return;
    void (async () => {
      try {
        const f = await svkkJson<FiltersMeta>("/policies/filters");
        setMeta(f);
        const cat = await svkkJson<{ items: CategoryItem[] }>("/categories");
        setCategories(cat.items);
        const pt = await svkkJson<PolicyTypeItem[]>(
          "/calculation/reference/policy-types",
        );
        setPolicyTypes(pt);
      } catch {
        /* non-fatal */
      }
    })();
  }, [missingUrl]);

  const selectedCount = useMemo(
    () => Object.values(rowSelection).filter(Boolean).length,
    [rowSelection],
  );

  async function bulkDelete() {
    const ids = Object.entries(rowSelection)
      .filter(([, v]) => v)
      .map(([id]) => id);
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      await svkkJson("/policies/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      toast.success(`Deleted ${ids.length} polic${ids.length === 1 ? "y" : "ies"}`);
      setBulkOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteOne(id: string) {
    setActionBusy(true);
    try {
      await backendApi.delete(`/policies/${id}`);
      toast.success("Policy deleted");
      setRowDeleteId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function printReceiptForRow(id: string) {
    setReceiptBusyId(id);
    try {
      const p = await svkkJson<PolicyDetailForReceipt>(`/policies/${id}`);
      const opened = await openPolicyReceiptPrint(p);
      if (!opened) {
        toast.message("Receipt downloaded", {
          description:
            "A new tab may have been blocked; the PDF should be in your Downloads folder.",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate receipt");
    } finally {
      setReceiptBusyId(null);
    }
  }

  const applySort = useCallback((key: string) => {
    setSort(key);
    setPage(1);
  }, []);

  const pagination: PaginationState = useMemo(
    () => ({ pageIndex: Math.max(0, page - 1), pageSize }),
    [page, pageSize],
  );

  const columns = useMemo<ColumnDef<ListPolicy>[]>(() => {
    const cols: ColumnDef<ListPolicy>[] = [];

    if (canDel) {
      cols.push({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
            className="translate-y-0.5"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
            className="translate-y-0.5"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      });
    }

    cols.push(
      {
        id: "customer",
        accessorFn: (r) => r.insuredParty.name,
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Name"
            sortAsc="name"
            sortDesc="name_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => {
          const p = row.original;
          const name = p.insuredParty.name;
          const initials = name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          return (
            <div className="flex min-w-0 max-w-[240px] items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                {p.referenceNo ? (
                  <p className="text-muted-foreground truncate font-mono text-xs">{p.referenceNo}</p>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: "customerId",
        accessorFn: (r) => r.insuredParty.customerId ?? "",
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Customer ID"
            sortAsc="customerId"
            sortDesc="customerId_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original.insuredParty.customerId ?? "—"}
          </span>
        ),
      },
      {
        id: "category",
        accessorFn: (r) => r.category?.key ?? "",
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Category"
            sortAsc="categoryKey"
            sortDesc="categoryKey_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => row.original.category?.key ?? "—",
      },
      {
        id: "policyType",
        accessorFn: (r) => r.policyType.name,
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Policy type"
            sortAsc="policyTypeName"
            sortDesc="policyTypeName_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => row.original.policyType.name,
      },
      {
        id: "sumInsured",
        accessorFn: (r) => sumLabel(r.years[0]?.sumInsured),
        header: "Sum insured",
        cell: ({ row }) => {
          const y0 = row.original.years[0];
          return y0 ? sumLabel(y0.sumInsured) : "—";
        },
      },
      {
        id: "village",
        accessorFn: (r) => r.village ?? "",
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Village"
            sortAsc="village"
            sortDesc="village_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => row.original.village ?? "—",
      },
      {
        id: "mobile",
        accessorFn: (r) => r.insuredParty.mobile,
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Mobile"
            sortAsc="mobile"
            sortDesc="mobile_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm whitespace-nowrap">{row.original.insuredParty.mobile}</span>
        ),
      },
      {
        id: "referenceNo",
        accessorFn: (r) => r.referenceNo ?? "",
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Reference"
            sortAsc="referenceNo"
            sortDesc="referenceNo_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.referenceNo ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href={`/policies/${p.id}`}>View</Link>
                </DropdownMenuItem>
                {canEdit ? (
                  <DropdownMenuItem className="cursor-pointer" asChild>
                    <Link href={`/policies/${p.id}`}>Edit</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={receiptBusyId === p.id}
                  onClick={() => void printReceiptForRow(p.id)}
                >
                  {receiptBusyId === p.id ? "Opening receipt…" : "Receipt"}
                </DropdownMenuItem>
                {canDel ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={() => setRowDeleteId(p.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableHiding: false,
      },
    );

    return cols;
  }, [applySort, canDel, canEdit, receiptBusyId, sort]);

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    manualPagination: true,
    pageCount: Math.max(1, totalPages),
    state: {
      pagination,
      rowSelection,
      columnVisibility,
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      setPage(next.pageIndex + 1);
      setPageSize(next.pageSize);
    },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: canDel,
  });

  const colCount = table.getVisibleLeafColumns().length;

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold">Policies</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" asChild>
            <Link href="/policies/new">Add policy</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/calculator">Premium calculator</Link>
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search policies…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="h-9 w-[200px] pl-8 lg:w-[280px]"
                aria-label="Search name, customer ID, village, ref no, phone, bank, nominee, PAN"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="policies-sort" className="text-muted-foreground sr-only sm:not-sr-only sm:whitespace-nowrap">
                Sort
              </Label>
              <Select value={sort} onValueChange={applySort}>
                <SelectTrigger id="policies-sort" className="h-9 w-[160px] cursor-pointer" size="sm">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DataTableViewOptions table={table} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 cursor-pointer"
              disabled={loading || exportBusy}
              onClick={() => void exportPoliciesCsv()}
            >
              {exportBusy ? "Exporting…" : "Export"}
            </Button>
          </div>
        </div>

        <Collapsible defaultOpen className="space-y-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 cursor-pointer">
              <ChevronDown className="size-4" />
              Advanced filters
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <p className="text-muted-foreground text-xs">
              Filters apply as you change them. Search above uses the same fields as before (name, customer ID, village, ref no, phone, etc.).
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div>
                <Label className="text-xs">Village</Label>
                <Select value={village || "__all__"} onValueChange={(v) => setVillage(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All villages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All villages</SelectItem>
                    {(meta?.villages ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fiscal year (label)</Label>
                <Input
                  placeholder="e.g. 2025-26"
                  value={yearLabel}
                  onChange={(e) => setYearLabel(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Policy year (period)</Label>
                <Select value={periodYearText || "__all__"} onValueChange={(v) => setPeriodYearText(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {(meta?.periodYearTexts ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Month (period text)</Label>
                <Select value={periodMonthText || "__all__"} onValueChange={(v) => setPeriodMonthText(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {(meta?.periodMonthTexts ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={categoryIdState || "__all__"} onValueChange={(v) => setCategoryIdState(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.key} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Product (AD)</Label>
                <Select value={adVariant || "__all__"} onValueChange={(v) => setAdVariant(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    <SelectItem value="FAMILY_FLOATER">Family floater</SelectItem>
                    <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                    <SelectItem value="ASHA_KIRAN">Asha Kiran</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Policy type (chart)</Label>
                <Select value={policyTypeId || "__all__"} onValueChange={(v) => setPolicyTypeId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {policyTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Area</Label>
                <Select value={area || "__all__"} onValueChange={(v) => setArea(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {(meta?.areas ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sum insured</Label>
                <Select value={sumInsured || "__all__"} onValueChange={(v) => setSumInsured(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {(meta?.sumInsuredValues ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Policy grouping</Label>
                <Select value={policyGrouping || "__all__"} onValueChange={(v) => setPolicyGrouping(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {["SVKK", "NVKK", "RTY", "OTHER"].map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Cheque status</Label>
                <Select value={chequeStatus || "__all__"} onValueChange={(v) => setChequeStatus(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {["CLEARED", "DISHONOURED", "PENDING", "PAID", "UNPAID"].map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Created in month (optional)</Label>
                <div className="flex gap-2">
                  <Select value={filterMonth || "__m__"} onValueChange={(v) => setFilterMonth(v === "__m__" ? "" : v)}>
                    <SelectTrigger className="flex-1 cursor-pointer">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__m__">—</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-24"
                    placeholder="Year"
                    inputMode="numeric"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                setSearchDraft("");
                setSearchApplied("");
                prevSearchApplied.current = "";
                setVillage("");
                setYearLabel("");
                setPeriodYearText("");
                setPeriodMonthText("");
                setCategoryIdState("");
                setPolicyTypeId("");
                setAdVariant("");
                setArea("");
                setSumInsured("");
                setPolicyGrouping("");
                setChequeStatus("");
                setFilterMonth("");
                setFilterYear("");
                setSort("createdAt");
                setPage(1);
              }}
            >
              Reset filters
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {canDel && selectedCount > 0 ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
            Delete selected ({selectedCount})
          </Button>
        </div>
      ) : null}

      {err ? <p className="text-destructive text-sm">{err}</p> : null}

      <div className="bg-card rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-muted-foreground h-24 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={colCount} className="text-muted-foreground h-24 text-center text-sm">
                  No policies match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex flex-col gap-3 px-0 sm:flex-row sm:items-center sm:justify-between sm:px-1">
        <p className="text-sm">
          {selectedCount} of {rows.length} on this page selected
          {total > 0 ? ` · ${total} total` : ""}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <Label htmlFor="policies-page-size" className="whitespace-nowrap text-sm">
              Rows
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const n = Number(v);
                setPageSize(n);
                setPage(1);
              }}
            >
              <SelectTrigger id="policies-page-size" className="h-8 w-[72px] cursor-pointer" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="whitespace-nowrap text-sm">
            Page {page} of {Math.max(1, totalPages)}
            {total > 0 ? ` (${total} total)` : ""}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => setPage(1)}
              disabled={page <= 1 || loading}
            >
              <span className="sr-only">First page</span>
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || loading}
            >
              <span className="sr-only">Last page</span>
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected policies?</DialogTitle>
            <DialogDescription>
              This will soft-delete {selectedCount} polic{selectedCount === 1 ? "y" : "ies"}. This action is reserved for
              administrators.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={actionBusy} onClick={() => void bulkDelete()}>
              {actionBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rowDeleteId != null} onOpenChange={(o) => !o && setRowDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this policy?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRowDeleteId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionBusy}
              onClick={() => rowDeleteId && void deleteOne(rowDeleteId)}
            >
              {actionBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
