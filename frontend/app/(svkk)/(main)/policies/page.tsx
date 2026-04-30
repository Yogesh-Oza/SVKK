"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { canDeletePolicy, canUpdatePolicy } from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import type { PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import { buildReceiptDocumentHtml } from "@/lib/svkk/policy-receipt-print";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  policyGroupings: string[];
};

type CategoryItem = { id: string; key: string; name: string };
type YearActionKind = "edit" | "receipt";

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
  const router = useRouter();
  const { user } = useSvkkAuth();
  const role = user?.role;
  const canDel = role ? canDeletePolicy(role) : false;
  const canEdit = role ? canUpdatePolicy(role) : false;
  const canCsvUpload = role === "ADMIN" || role === "SUPER_ADMIN";

  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const prevSearchApplied = useRef(searchApplied);
  const [village, setVillage] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [periodMonthText, setPeriodMonthText] = useState("");
  const [categoryIdState, setCategoryIdState] = useState("");
  const [adVariant, setAdVariant] = useState<string>("");
  const [area, setArea] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [policyGrouping, setPolicyGrouping] = useState<string>("");
  const [sort, setSort] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string>("");

  const [rows, setRows] = useState<ListPolicy[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<FiltersMeta | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
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
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);
  const [rowYearAction, setRowYearAction] = useState<{ policyId: string; kind: YearActionKind } | null>(
    null,
  );

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
    if (yearLabel.trim()) q.set("periodYearText", yearLabel.trim());
    if (periodMonthText) q.set("periodMonthText", periodMonthText);
    if (categoryIdState) q.set("categoryId", categoryIdState);
    if (adVariant) q.set("adProductVariant", adVariant);
    if (area.trim()) q.set("area", area.trim());
    if (sumInsured) q.set("sumInsured", sumInsured);
    if (policyGrouping) q.set("policyGrouping", policyGrouping);
    return q.toString();
  }, [
    page,
    pageSize,
    sort,
    searchApplied,
    village,
    yearLabel,
    periodMonthText,
    categoryIdState,
    adVariant,
    area,
    sumInsured,
    policyGrouping,
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

  const uploadPoliciesCsv = useCallback(async () => {
    if (!uploadFile) {
      setUploadMsg("Choose a CSV file first.");
      return;
    }
    setUploadBusy(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("updateMode", "POLICY_ONLY");
      fd.append("dryRun", "false");
      fd.append("force", "false");
      await backendApi.post("/upload/csv", fd);
      setUploadMsg("CSV uploaded successfully.");
      setUploadFile(null);
      await load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "CSV upload failed");
    } finally {
      setUploadBusy(false);
    }
  }, [uploadFile, load]);

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

  function prioritizeYear(
    p: PolicyDetailForReceipt,
    selectedYearLabel?: string,
  ): PolicyDetailForReceipt {
    if (!selectedYearLabel) return p;
    const idx = p.years.findIndex((y) => y.yearLabel === selectedYearLabel);
    if (idx <= 0) return p;
    const picked = p.years[idx];
    if (!picked) return p;
    return {
      ...p,
      years: [picked, ...p.years.filter((_, i) => i !== idx)],
    };
  }

  async function openReceiptPreviewForRow(id: string, selectedYearLabel?: string) {
    setReceiptBusyId(id);
    try {
      const p = await svkkJson<PolicyDetailForReceipt>(`/policies/${id}`);
      const payload = prioritizeYear(p, selectedYearLabel);
      setReceiptPreviewHtml(buildReceiptDocumentHtml(payload));
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
        id: "policyNo",
        accessorFn: (r) => r.policyNo ?? "",
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Policy No"
            sortAsc="policyNo"
            sortDesc="policyNo_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => (
          <Link href={`/policies/${row.original.id}`} className="font-medium underline">
            {row.original.policyNo ?? "—"}
          </Link>
        ),
      },
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
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  setRowYearAction(null);
                  setExpandedPolicyId((curr) => (curr === p.id ? null : p.id));
                }}
              >
                {expandedPolicyId === p.id ? "Hide" : "View"}
              </Button>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setExpandedPolicyId(p.id);
                    setRowYearAction((curr) =>
                      curr?.policyId === p.id && curr.kind === "edit"
                        ? null
                        : { policyId: p.id, kind: "edit" },
                    );
                  }}
                >
                  Edit
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={receiptBusyId === p.id}
                onClick={() => {
                  setExpandedPolicyId(p.id);
                  setRowYearAction((curr) =>
                    curr?.policyId === p.id && curr.kind === "receipt"
                      ? null
                      : { policyId: p.id, kind: "receipt" },
                  );
                }}
              >
                Receipt
              </Button>
              {canDel ? (
                <Button size="sm" variant="destructive" onClick={() => setRowDeleteId(p.id)}>
                  Delete
                </Button>
              ) : null}
            </div>
          );
        },
        enableHiding: false,
      },
    );

    return cols;
  }, [applySort, canDel, canEdit, expandedPolicyId, receiptBusyId, rowYearAction, router, sort]);

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

      <div className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Policy List</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Upload CSV</Label>
            <div className="mt-1 flex gap-2">
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm"
                disabled={!canCsvUpload}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                size="sm"
                disabled={!canCsvUpload || !uploadFile || uploadBusy}
                onClick={() => void uploadPoliciesCsv()}
              >
                {uploadBusy ? "Uploading…" : "Upload"}
              </Button>
            </div>
            {uploadMsg ? <p className="text-muted-foreground mt-1 text-xs">{uploadMsg}</p> : null}
          </div>
          <div>
            <Label className="text-xs">Search</Label>
            <div className="relative mt-1">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Select Year</Label>
            <Select value={yearLabel || "__all__"} onValueChange={(v) => setYearLabel(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Years</SelectItem>
                {(meta?.periodYearTexts ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Select Category</Label>
            <Select value={categoryIdState || "__all__"} onValueChange={(v) => setCategoryIdState(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.key} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Select Policy Type</Label>
            <Select value={adVariant || "__all__"} onValueChange={(v) => setAdVariant(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All Policy Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Policy Type</SelectItem>
                <SelectItem value="FAMILY_FLOATER">Family Floater</SelectItem>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="ASHA_KIRAN">Asha Kiran</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Select Month</Label>
            <Select value={periodMonthText || "__all__"} onValueChange={(v) => setPeriodMonthText(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Month</SelectItem>
                {(meta?.periodMonthTexts ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Select Area</Label>
            <Select value={area || "__all__"} onValueChange={(v) => setArea(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Area</SelectItem>
                {(meta?.areas ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Select Village</Label>
            <Select value={village || "__all__"} onValueChange={(v) => setVillage(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All Village" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Village</SelectItem>
                {(meta?.villages ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Select Sum Insured</Label>
            <Select value={sumInsured || "__all__"} onValueChange={(v) => setSumInsured(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All SI" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All SI</SelectItem>
                {(meta?.sumInsuredValues ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Select Group</Label>
            <Select value={policyGrouping || "__all__"} onValueChange={(v) => setPolicyGrouping(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 cursor-pointer">
                <SelectValue placeholder="All Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Group</SelectItem>
                {(meta?.policyGroupings ?? []).map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={loading || exportBusy} onClick={() => void exportPoliciesCsv()}>
              {exportBusy ? "Exporting…" : "Export"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchDraft("");
                setSearchApplied("");
                prevSearchApplied.current = "";
                setVillage("");
                setYearLabel("");
                setPeriodMonthText("");
                setCategoryIdState("");
                setAdVariant("");
                setArea("");
                setSumInsured("");
                setPolicyGrouping("");
                setSort("createdAt");
                setPage(1);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {canDel && selectedCount > 0 ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
            Delete selected ({selectedCount})
          </Button>
        </div>
      ) : null}

      {err ? <p className="text-destructive text-sm">{err}</p> : null}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Grouped Policy Records</h2>
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
              table.getRowModel().rows.map((row) => {
                const original = row.original;
                return (
                  <Fragment key={row.id}>
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expandedPolicyId === original.id ? (
                      <TableRow key={`${row.id}-years`}>
                        <TableCell colSpan={colCount} className="bg-muted/20">
                          <div className="space-y-3 p-2">
                            <p className="text-sm font-medium">
                              {rowYearAction?.policyId === original.id
                                ? rowYearAction.kind === "edit"
                                  ? "Select year to edit"
                                  : "Select year to generate receipt"
                                : "View year-wise records"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {original.years.map((y) => (
                                <Button
                                  key={`${original.id}-chip-${y.yearLabel}`}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    if (rowYearAction?.policyId === original.id && rowYearAction.kind === "edit") {
                                      router.push(
                                        `/policies/${original.id}/edit?year=${encodeURIComponent(y.yearLabel)}`,
                                      );
                                      setRowYearAction(null);
                                      return;
                                    }
                                    if (
                                      rowYearAction?.policyId === original.id &&
                                      rowYearAction.kind === "receipt"
                                    ) {
                                      void openReceiptPreviewForRow(original.id, y.yearLabel).finally(() => {
                                        setRowYearAction(null);
                                      });
                                      return;
                                    }
                                    router.push(`/policies/${original.id}?year=${encodeURIComponent(y.yearLabel)}`);
                                  }}
                                >
                                  {y.yearLabel} · ₹{sumLabel(y.vkkPremium)}
                                </Button>
                              ))}
                            </div>
                            {rowYearAction?.policyId === original.id ? null : (
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px] border-collapse text-sm">
                                  <thead>
                                    <tr className="bg-muted/40">
                                      <th className="border p-2 text-left">Year</th>
                                      <th className="border p-2 text-left">Policy No</th>
                                      <th className="border p-2 text-left">Customer ID</th>
                                      <th className="border p-2 text-left">Holder</th>
                                      <th className="border p-2 text-left">Village</th>
                                      <th className="border p-2 text-left">Area</th>
                                      <th className="border p-2 text-left">Category</th>
                                      <th className="border p-2 text-left">Month</th>
                                      <th className="border p-2 text-left">Group</th>
                                      <th className="border p-2 text-left">SI</th>
                                      <th className="border p-2 text-left">Premium</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {original.years.map((y) => (
                                      <tr key={`${original.id}-${y.yearLabel}`}>
                                        <td className="border p-2">{y.yearLabel}</td>
                                        <td className="border p-2">{original.policyNo ?? "—"}</td>
                                        <td className="border p-2">{original.insuredParty.customerId ?? "—"}</td>
                                        <td className="border p-2">{original.insuredParty.name}</td>
                                        <td className="border p-2">{original.village ?? "—"}</td>
                                        <td className="border p-2">{original.area ?? "—"}</td>
                                        <td className="border p-2">{original.category?.key ?? "—"}</td>
                                        <td className="border p-2">{original.periodMonthText ?? "—"}</td>
                                        <td className="border p-2">{original.remarks ?? "—"}</td>
                                        <td className="border p-2">₹{sumLabel(y.sumInsured)}</td>
                                        <td className="border p-2">₹{sumLabel(y.vkkPremium)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
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

      <Dialog open={receiptPreviewHtml != null} onOpenChange={(o) => !o && setReceiptPreviewHtml(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
            <DialogDescription>Print the receipt from this popup.</DialogDescription>
          </DialogHeader>
          <div className="h-[68vh] overflow-hidden rounded border">
            <iframe title="Receipt Preview Frame" srcDoc={receiptPreviewHtml ?? ""} className="h-full w-full" />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setReceiptPreviewHtml(null)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Receipt Preview Frame"]');
                frame?.contentWindow?.focus();
                frame?.contentWindow?.print();
              }}
            >
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
