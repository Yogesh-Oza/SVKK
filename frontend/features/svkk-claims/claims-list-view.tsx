"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClaimCsvImportInline } from "@/features/svkk-claims/claim-csv-import-panel";
import {
  PolicyFilterMulti,
  type PolicyFilterOption,
} from "@/features/svkk-policies/policy-filter-multi";
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { todayFormDate, toIsoDateParam } from "@/lib/svkk/form-date";
import {
  canDeleteClaim,
  canImportClaim,
  canUpdateClaim,
} from "@/lib/svkk/permissions";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Filter,
  LayoutList,
  RotateCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CLAIM_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
type ClaimStatus = (typeof CLAIM_STATUSES)[number];

type Claim = {
  id: string;
  claimNo: string;
  svkkPublicId: string;
  policyYear: string;
  status: string;
  statusText?: string | null;
  claimAmount: string | null;
  approvedAmount: string | null;
  deductionAmount?: string | null;
  village: string | null;
  patientName: string | null;
  policyHolderName?: string | null;
  policyTypeText?: string | null;
  claimType?: string | null;
  hospitalName?: string | null;
  matchStatus?: string | null;
  policy?: { policyNo: string | null } | null;
};

type PageListRes = {
  items: Claim[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type FiltersMeta = {
  villages: string[];
  policyYears: string[];
  claimTypes: string[];
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt", label: "Newest first" },
  { value: "createdAt_asc", label: "Oldest first" },
  { value: "claimNo", label: "Claim # A–Z" },
  { value: "claimNo_desc", label: "Claim # Z–A" },
  { value: "svkkPublicId", label: "SVKK ID A–Z" },
  { value: "svkkPublicId_desc", label: "SVKK ID Z–A" },
  { value: "policyYear", label: "Policy year A–Z" },
  { value: "policyYear_desc", label: "Policy year Z–A" },
  { value: "village", label: "Village A–Z" },
  { value: "village_desc", label: "Village Z–A" },
  { value: "claimAmount", label: "Amount high–low" },
  { value: "claimAmount_asc", label: "Amount low–high" },
  { value: "claimReceivedDate", label: "Received date newest" },
  { value: "claimReceivedDate_asc", label: "Received date oldest" },
];

const claimTableCell = "font-sans text-sm font-bold text-foreground tabular-nums antialiased";

function parseOptionalAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseInrAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatInrRupee(v: unknown): string {
  const n = parseInrAmount(v);
  if (n == null) return "—";
  return `₹ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
}

function matchLabel(status: string | null | undefined): string {
  if (status === "MATCHED_EXACT") return "Matched";
  if (status === "CONFLICT") return "Conflict";
  if (status === "UNLINKED") return "Unlinked";
  return status ?? "—";
}

function toOptions(values: string[]): PolicyFilterOption[] {
  return values.map((v) => ({ value: v, label: v }));
}

const STATUS_OPTIONS: PolicyFilterOption[] = CLAIM_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0) + s.slice(1).toLowerCase(),
}));

const MATCH_OPTIONS: PolicyFilterOption[] = [
  { value: "MATCHED_EXACT", label: "Matched" },
  { value: "UNLINKED", label: "Unlinked" },
  { value: "CONFLICT", label: "Conflict" },
];

export function ClaimsListView() {
  const { user } = useSvkkAuth();
  const perms = user?.permissions ?? [];
  const canU = canUpdateClaim(perms);
  const canD = canDeleteClaim(perms);
  const canImport = canImportClaim(perms);
  const missingUrl = !getSvkkApiBase();

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const prevSearchApplied = useRef(searchApplied);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayFormDate());
  const [villages, setVillages] = useState<string[]>([]);
  const [policyYears, setPolicyYears] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [claimTypes, setClaimTypes] = useState<string[]>([]);
  const [matchStatuses, setMatchStatuses] = useState<string[]>([]);
  const [sort, setSort] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [meta, setMeta] = useState<FiltersMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const [edit, setEdit] = useState<Claim | null>(null);
  const [editStatus, setEditStatus] = useState<ClaimStatus>("PENDING");
  const [editApproved, setEditApproved] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [claimToDelete, setClaimToDelete] = useState<Claim | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchApplied(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    if (prevSearchApplied.current !== searchApplied) {
      prevSearchApplied.current = searchApplied;
      setPage(1);
    }
  }, [searchApplied]);

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        dateFrom,
        dateTo,
        villages,
        policyYears,
        statuses,
        claimTypes,
        matchStatuses,
      }),
    [dateFrom, dateTo, villages, policyYears, statuses, claimTypes, matchStatuses],
  );
  const prevFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKey.current !== filtersKey) {
      prevFiltersKey.current = filtersKey;
      setPage(1);
    }
  }, [filtersKey]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (searchApplied) n++;
    if (dateFrom.trim()) n++;
    if (dateTo.trim() && dateTo !== todayFormDate()) n++;
    n += villages.length + policyYears.length + statuses.length + claimTypes.length + matchStatuses.length;
    return n;
  }, [searchApplied, dateFrom, dateTo, villages, policyYears, statuses, claimTypes, matchStatuses]);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    q.set("sort", sort);
    if (searchApplied) q.set("search", searchApplied);
    const dateFromParam = toIsoDateParam(dateFrom);
    const dateToParam = toIsoDateParam(dateTo);
    if (dateFromParam) q.set("dateFrom", dateFromParam);
    if (dateToParam) q.set("dateTo", dateToParam);
    villages.forEach((v) => q.append("villages", v));
    policyYears.forEach((y) => q.append("policyYears", y));
    statuses.forEach((s) => q.append("statuses", s));
    claimTypes.forEach((t) => q.append("claimTypes", t));
    matchStatuses.forEach((m) => q.append("matchStatuses", m));
    return q.toString();
  }, [
    page,
    pageSize,
    sort,
    searchApplied,
    dateFrom,
    dateTo,
    villages,
    policyYears,
    statuses,
    claimTypes,
    matchStatuses,
  ]);

  const exportQueryString = useMemo(() => {
    const q = new URLSearchParams(queryString);
    q.delete("page");
    q.delete("pageSize");
    return q.toString();
  }, [queryString]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await svkkJson<PageListRes>(`/claims?${queryString}`);
      setRows(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setPage(res.page);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (missingUrl) return;
    if (!user?.permissions?.includes("claim:read") && !user?.permissions?.includes("*:*")) return;
    void loadList();
  }, [missingUrl, user, loadList]);

  useEffect(() => {
    if (missingUrl) return;
    void svkkJson<FiltersMeta>("/claims/filters")
      .then(setMeta)
      .catch(() => setMeta({ villages: [], policyYears: [], claimTypes: [] }));
  }, [missingUrl]);

  const villageOptions = useMemo(() => toOptions(meta?.villages ?? []), [meta?.villages]);
  const yearOptions = useMemo(() => toOptions(meta?.policyYears ?? []), [meta?.policyYears]);
  const claimTypeOptions = useMemo(() => toOptions(meta?.claimTypes ?? []), [meta?.claimTypes]);

  const exportClaimsCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      const res = await backendApi.get(`/claims/export.csv?${exportQueryString}`, {
        responseType: "blob",
      });
      const truncated = String(res.headers["x-export-truncated"] ?? "").toLowerCase() === "true";
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      a.download = `claims-export-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast.message("Export capped at 100,000 rows — narrow filters if needed.");
      } else {
        toast.success("Claims exported");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }, [exportQueryString]);

  function openEdit(c: Claim) {
    setEdit(c);
    setEditStatus(
      CLAIM_STATUSES.includes(c.status as ClaimStatus) ? (c.status as ClaimStatus) : "PENDING",
    );
    setEditApproved(c.approvedAmount != null ? String(c.approvedAmount) : "");
  }

  async function saveEdit() {
    if (!edit) return;
    setPatchBusy(true);
    try {
      const approvedParsed = parseOptionalAmount(editApproved);
      if (editApproved.trim() && approvedParsed === null) {
        toast.error("Approved amount must be a non‑negative number or empty");
        return;
      }
      const updated = await svkkJson<Claim>(`/claims/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: editStatus, approvedAmount: approvedParsed }),
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      toast.success("Claim updated");
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setPatchBusy(false);
    }
  }

  async function removeClaim() {
    if (!claimToDelete) return;
    const id = claimToDelete.id;
    setDeleteBusy(true);
    try {
      await backendApi.delete(`/claims/${id}`);
      toast.success("Claim deleted");
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setClaimToDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  function resetFilters() {
    setSearchDraft("");
    setSearchApplied("");
    prevSearchApplied.current = "";
    setDateFrom("");
    setDateTo(todayFormDate());
    setVillages([]);
    setPolicyYears([]);
    setStatuses([]);
    setClaimTypes([]);
    setMatchStatuses([]);
    setSort("createdAt");
    setPage(1);
  }

  if (
    user &&
    !user.permissions?.includes("claim:read") &&
    !user.permissions?.includes("*:*")
  ) {
    return <p className="text-muted-foreground text-sm">You do not have access to claims.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  const colCount = 11 + (canU || canD ? 1 : 0);

  return (
    <motion.div
      className="space-y-8 pb-10"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Claims</h1>
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
            Search and filter imported claims. Use CSV import to add new records; edit status and
            approved amounts from the register.
          </p>
        </div>
        {canImport ? (
          <Badge variant="outline" className="w-fit gap-1.5 py-1.5">
            <FileSpreadsheet className="size-3.5" />
            CSV import enabled
          </Badge>
        ) : null}
      </div>

      <Card className="overflow-hidden py-0 shadow-md">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CardHeader className="bg-muted/20 flex flex-row flex-wrap items-start justify-between gap-4 border-b py-5 sm:items-center">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="size-5 opacity-70" />
                Filters & search
              </CardTitle>
              <CardDescription>
                Refine by received date, location, status, and free-text search.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="font-normal">
                  {activeFilterCount} active
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">No filters applied</span>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  {filtersOpen ? "Collapse" : "Expand"}
                  <ChevronDown
                    className={cn("size-4 transition-transform duration-200", filtersOpen && "rotate-180")}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {canImport ? (
                  <div className="lg:col-span-2">
                    <ClaimCsvImportInline disabled={!canImport} onImported={() => void loadList()} />
                  </div>
                ) : null}
                <div className={canImport ? "lg:col-span-2" : "lg:col-span-4"}>
                  <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                    Search
                  </Label>
                  <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      placeholder="Claim #, SVKK ID, patient, holder, hospital, policy no…"
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      className="h-10 border-dashed pl-9 font-bold shadow-none"
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border-2 border-slate-200/90 bg-linear-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
                  <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                    From date
                  </Label>
                  <PolicyDateInput
                    value={dateFrom}
                    onValueChange={setDateFrom}
                    className="h-10 bg-background/90 font-bold"
                  />
                </div>
                <div className="rounded-xl border-2 border-slate-200/90 bg-linear-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
                  <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                    To date
                  </Label>
                  <PolicyDateInput
                    value={dateTo}
                    onValueChange={setDateTo}
                    className="h-10 bg-background/90 font-bold"
                  />
                  <p className="text-muted-foreground mt-1.5 text-[11px] leading-snug">
                    Filters by claim received date.
                  </p>
                </div>
                <PolicyFilterMulti
                  label="Status"
                  placeholder="All statuses"
                  options={STATUS_OPTIONS}
                  selected={statuses}
                  onChange={setStatuses}
                  accentClassName="border-amber-200/90 from-amber-50/95 to-card dark:border-amber-900/50 dark:from-amber-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Match"
                  placeholder="All match states"
                  options={MATCH_OPTIONS}
                  selected={matchStatuses}
                  onChange={setMatchStatuses}
                  accentClassName="border-rose-200/90 from-rose-50/95 to-card dark:border-rose-900/50 dark:from-rose-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Policy year"
                  placeholder="All years"
                  options={yearOptions}
                  selected={policyYears}
                  onChange={setPolicyYears}
                  accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Claim type"
                  placeholder="All types"
                  options={claimTypeOptions}
                  selected={claimTypes}
                  onChange={setClaimTypes}
                  accentClassName="border-sky-200/90 from-sky-50/95 to-card dark:border-sky-900/50 dark:from-sky-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Village"
                  placeholder="All villages"
                  options={villageOptions}
                  selected={villages}
                  onChange={setVillages}
                  accentClassName="border-emerald-200/90 from-emerald-50/95 to-card dark:border-emerald-900/50 dark:from-emerald-950/35 dark:to-card"
                />
              </div>
              <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || exportBusy}
                  onClick={() => void exportClaimsCsv()}
                >
                  <Download className="size-3.5" />
                  {exportBusy ? "Exporting…" : "Export CSV"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={resetFilters}>
                  <RotateCcw className="size-3.5" />
                  Reset filters
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="from-primary/8 border-primary/15 bg-linear-to-br to-card py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <div className="bg-primary/12 flex size-11 shrink-0 items-center justify-center rounded-xl">
              <ClipboardList className="text-primary size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Total claims
              </p>
              <p className="text-2xl font-bold tabular-nums tracking-tight">
                {loading ? <Skeleton className="mt-1 h-8 w-16" /> : total.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl">
              <LayoutList className="text-muted-foreground size-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                On this page
              </p>
              <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl">
              <Filter className="text-muted-foreground size-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Active filters
              </p>
              <p className="text-2xl font-bold tabular-nums">{activeFilterCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {err ? (
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm">
          {err}
        </div>
      ) : null}

      <Card className="overflow-hidden py-0 shadow-md">
        <CardHeader className="bg-muted/15 space-y-4 border-b py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <LayoutList className="size-5 opacity-80" />
                Claim register
              </CardTitle>
              <CardDescription>
                All matching claims — edit status and approved amount from the actions column.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
              <Label htmlFor="claims-sort" className="text-muted-foreground text-xs font-medium">
                Sort order
              </Label>
              <Select
                value={sort}
                onValueChange={(v) => {
                  setSort(v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="claims-sort" className="cursor-pointer">
                  <SelectValue placeholder="Sort by" />
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
        </CardHeader>
        <div className="relative">
          {loading ? (
            <div
              className="from-primary/40 pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-linear-to-r via-primary to-primary/40"
              aria-hidden
            />
          ) : null}
          <Table className="font-sans text-sm antialiased">
            <TableHeader className="[&_tr]:bg-muted/80 [&_tr]:backdrop-blur-sm">
              <TableRow className="hover:bg-muted/80">
                <TableHead className="text-muted-foreground text-xs font-semibold">Policy No</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Claim #</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">SVKK ID</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Year</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Holder</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Type</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Status</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Match</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Amount</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Approved</TableHead>
                <TableHead className="text-muted-foreground text-xs font-semibold">Village</TableHead>
                {(canU || canD) && (
                  <TableHead className="text-muted-foreground text-right text-xs font-semibold">
                    Action
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: colCount }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-8 w-full max-w-32" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length ? (
                rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className={cn(claimTableCell, "font-mono text-xs")}>
                      {c.policy?.policyNo ?? "—"}
                    </TableCell>
                    <TableCell className={cn(claimTableCell, "font-mono text-xs")}>{c.claimNo}</TableCell>
                    <TableCell className={cn(claimTableCell, "font-mono text-xs")}>
                      {c.svkkPublicId || "—"}
                    </TableCell>
                    <TableCell className={claimTableCell}>{c.policyYear}</TableCell>
                    <TableCell className={cn(claimTableCell, "max-w-[140px] truncate")}>
                      {c.policyHolderName ?? c.patientName ?? "—"}
                    </TableCell>
                    <TableCell className={cn(claimTableCell, "text-xs")}>
                      {c.claimType ?? c.policyTypeText ?? "—"}
                    </TableCell>
                    <TableCell className={claimTableCell}>{c.statusText ?? c.status}</TableCell>
                    <TableCell className={cn(claimTableCell, "text-xs")}>
                      {matchLabel(c.matchStatus)}
                    </TableCell>
                    <TableCell className={claimTableCell}>{formatInrRupee(c.claimAmount)}</TableCell>
                    <TableCell className={claimTableCell}>{formatInrRupee(c.approvedAmount)}</TableCell>
                    <TableCell className={claimTableCell}>{c.village ?? "—"}</TableCell>
                    {canU || canD ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canU ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => openEdit(c)}>
                              Edit
                            </Button>
                          ) : null}
                          {canD ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setClaimToDelete(c)}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-32 text-center">
                    <div className="text-muted-foreground flex flex-col items-center gap-2 py-6">
                      <Search className="size-8 opacity-40" />
                      <p className="text-sm font-medium">No claims match these filters</p>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="text-primary h-auto p-0"
                        onClick={resetFilters}
                      >
                        Clear filters and try again
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <CardFooter className="bg-muted/10 flex flex-col gap-4 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Showing{" "}
            <span className="text-foreground font-medium">{rows.length}</span> of{" "}
            <span className="text-foreground font-medium">{total.toLocaleString()}</span> claims
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="claims-page-size" className="text-muted-foreground whitespace-nowrap text-xs">
                Rows per page
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger id="claims-page-size" className="h-8 w-[72px] cursor-pointer" size="sm">
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
            <p className="text-muted-foreground whitespace-nowrap text-sm">
              Page <span className="text-foreground font-semibold">{page}</span> of{" "}
              <span className="text-foreground font-semibold">{Math.max(1, totalPages)}</span>
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
        </CardFooter>
      </Card>

      <Dialog
        open={!!claimToDelete}
        onOpenChange={(o) => {
          if (!o) setClaimToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this claim?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Deleting claims is limited to administrators.
              {claimToDelete ? (
                <span className="mt-2 block font-mono text-xs">{claimToDelete.claimNo}</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setClaimToDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void removeClaim()}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update claim</DialogTitle>
            <DialogDescription>
              Change status and approved amount. Setting status to Approved records you as the approver
              on the server.
            </DialogDescription>
          </DialogHeader>
          {edit ? (
            <div className="space-y-3 py-1">
              <p className="text-muted-foreground font-mono text-xs">{edit.claimNo}</p>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ClaimStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAIM_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Approved amount (INR)</Label>
                <Input
                  value={editApproved}
                  onChange={(e) => setEditApproved(e.target.value)}
                  inputMode="decimal"
                  placeholder="Leave empty to clear"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={patchBusy} onClick={() => void saveEdit()}>
              {patchBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
