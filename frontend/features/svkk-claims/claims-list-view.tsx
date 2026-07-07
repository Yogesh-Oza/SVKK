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
import { ClaimAddDialog } from "@/features/svkk-claims/claim-add-dialog";
import { ClaimCsvImportInline } from "@/features/svkk-claims/claim-csv-import-panel";
import { ClaimEditDialog } from "@/features/svkk-claims/claim-edit-dialog";
import type { ClaimDetail } from "@/features/svkk-claims/claim-detail-types";
import {
  CategoryBadge,
  formatDateCell,
  formatInrCompact,
  formatInrRupee,
  LodgeTypeBadge,
  StatusBadge,
} from "@/features/svkk-claims/claim-register-badges";
import {
  PolicyFilterMulti,
  type PolicyFilterOption,
} from "@/features/svkk-policies/policy-filter-multi";
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { toIsoDateParam } from "@/lib/svkk/form-date";
import {
  canCreateClaim,
  canDeleteClaim,
  canImportClaim,
  canUpdateClaim,
} from "@/lib/svkk/permissions";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  BarChart3,
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
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CLAIM_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

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
  deductionDetails?: string | null;
  village: string | null;
  patientName: string | null;
  patientAge?: number | null;
  patientRelation?: string | null;
  patientGender?: string | null;
  policyHolderName?: string | null;
  policyTypeText?: string | null;
  claimType?: string | null;
  hospitalName?: string | null;
  hospitalArea?: string | null;
  insuranceCompany?: string | null;
  illness?: string | null;
  paymentDetails?: string | null;
  admissionDate?: string | null;
  dischargeDate?: string | null;
  claimReceivedDate?: string | null;
  matchStatus?: string | null;
  policyId?: string | null;
  policy?: {
    policyNo: string | null;
    policyGrouping?: string | null;
    category?: { key: string } | null;
  } | null;
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
  svkkPublicIds: string[];
  categoryKeys: string[];
  policyTypes: string[];
  policyGroupings: string[];
  insuranceCompanies: string[];
  areas: string[];
  statusTexts: string[];
};

type SummaryRes = {
  totalClaims: number;
  paidOrSettledCount: number;
  underProcessCount: number;
  cashlessCount: number;
  reimbursementCount: number;
  cashDeniedCount: number;
  remDeniedCount: number;
  sumLodgeAmount: number;
  sumPaidAmount: number;
  sumDeductionAmount: number;
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
  { value: "admissionDate", label: "Admission date newest" },
  { value: "admissionDate_asc", label: "Admission date oldest" },
];

const PAGE_SIZES = [25, 50, 100, 200, 500];

const claimTableCell = "font-sans text-sm font-medium text-foreground tabular-nums antialiased";

function listRowFromDetail(d: ClaimDetail): Claim {
  const amt = (v: string | number | null | undefined) => (v == null ? null : String(v));
  return {
    id: d.id,
    claimNo: d.claimNo,
    svkkPublicId: d.svkkPublicId,
    policyYear: d.policyYear,
    status: d.status,
    statusText: d.statusText,
    claimAmount: amt(d.claimAmount),
    approvedAmount: amt(d.approvedAmount),
    deductionAmount: amt(d.deductionAmount),
    deductionDetails: d.deductionDetails,
    village: d.village ?? null,
    patientName: d.patientName ?? null,
    patientAge: d.patientAge,
    patientRelation: d.patientRelation,
    patientGender: d.patientGender,
    policyHolderName: d.policyHolderName,
    policyTypeText: d.policyTypeText,
    claimType: d.claimType,
    hospitalName: d.hospitalName,
    hospitalArea: d.hospitalArea,
    insuranceCompany: d.insuranceCompany,
    illness: d.illness,
    paymentDetails: d.paymentDetails,
    admissionDate: d.admissionDate,
    dischargeDate: d.dischargeDate,
    claimReceivedDate: d.claimReceivedDate,
    matchStatus: d.matchStatus,
    policyId: d.policyId,
    policy: d.policy,
  };
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSvkkAuth();
  const perms = user?.permissions ?? [];
  const canU = canUpdateClaim(perms);
  const canD = canDeleteClaim(perms);
  const canImport = canImportClaim(perms);
  const canCreate = canCreateClaim(perms);
  const missingUrl = !getSvkkApiBase();

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const prevSearchApplied = useRef(searchApplied);
  const urlSearchBootstrapped = useRef(false);

  useEffect(() => {
    if (urlSearchBootstrapped.current) return;
    const q = searchParams.get("search")?.trim();
    if (!q) return;
    urlSearchBootstrapped.current = true;
    setSearchDraft(q);
    setSearchApplied(q);
  }, [searchParams]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [admissionDateFrom, setAdmissionDateFrom] = useState("");
  const [admissionDateTo, setAdmissionDateTo] = useState("");
  const [villages, setVillages] = useState<string[]>([]);
  const [policyYears, setPolicyYears] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [claimTypes, setClaimTypes] = useState<string[]>([]);
  const [matchStatuses, setMatchStatuses] = useState<string[]>([]);
  const [svkkPublicIds, setSvkkPublicIds] = useState<string[]>([]);
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [policyTypes, setPolicyTypes] = useState<string[]>([]);
  const [policyGroupings, setPolicyGroupings] = useState<string[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [statusTexts, setStatusTexts] = useState<string[]>([]);
  const [sort, setSort] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [rows, setRows] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<SummaryRes | null>(null);
  const [meta, setMeta] = useState<FiltersMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [editClaimId, setEditClaimId] = useState<string | null>(null);
  const [editClaimNo, setEditClaimNo] = useState<string | null>(null);
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
        admissionDateFrom,
        admissionDateTo,
        villages,
        policyYears,
        statuses,
        claimTypes,
        matchStatuses,
        svkkPublicIds,
        categoryKeys,
        policyTypes,
        policyGroupings,
        insuranceCompanies,
        areas,
        statusTexts,
      }),
    [
      dateFrom,
      dateTo,
      admissionDateFrom,
      admissionDateTo,
      villages,
      policyYears,
      statuses,
      claimTypes,
      matchStatuses,
      svkkPublicIds,
      categoryKeys,
      policyTypes,
      policyGroupings,
      insuranceCompanies,
      areas,
      statusTexts,
    ],
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
    if (dateTo.trim()) n++;
    if (admissionDateFrom.trim()) n++;
    if (admissionDateTo.trim()) n++;
    n +=
      villages.length +
      policyYears.length +
      statuses.length +
      claimTypes.length +
      matchStatuses.length +
      svkkPublicIds.length +
      categoryKeys.length +
      policyTypes.length +
      policyGroupings.length +
      insuranceCompanies.length +
      areas.length +
      statusTexts.length;
    return n;
  }, [
    searchApplied,
    dateFrom,
    dateTo,
    admissionDateFrom,
    admissionDateTo,
    villages,
    policyYears,
    statuses,
    claimTypes,
    matchStatuses,
    svkkPublicIds,
    categoryKeys,
    policyTypes,
    policyGroupings,
    insuranceCompanies,
    areas,
    statusTexts,
  ]);

  const filterQueryString = useMemo(() => {
    const q = new URLSearchParams();
    if (searchApplied) q.set("search", searchApplied);
    const dateFromParam = toIsoDateParam(dateFrom);
    const dateToParam = toIsoDateParam(dateTo);
    const admFromParam = toIsoDateParam(admissionDateFrom);
    const admToParam = toIsoDateParam(admissionDateTo);
    if (dateFromParam) q.set("dateFrom", dateFromParam);
    if (dateToParam) q.set("dateTo", dateToParam);
    if (admFromParam) q.set("admissionDateFrom", admFromParam);
    if (admToParam) q.set("admissionDateTo", admToParam);
    villages.forEach((v) => q.append("villages", v));
    policyYears.forEach((y) => q.append("policyYears", y));
    statuses.forEach((s) => q.append("statuses", s));
    claimTypes.forEach((t) => q.append("claimTypes", t));
    matchStatuses.forEach((m) => q.append("matchStatuses", m));
    svkkPublicIds.forEach((id) => q.append("svkkPublicIds", id));
    categoryKeys.forEach((c) => q.append("categoryKeys", c));
    policyTypes.forEach((t) => q.append("policyTypes", t));
    policyGroupings.forEach((g) => q.append("policyGroupings", g));
    insuranceCompanies.forEach((i) => q.append("insuranceCompanies", i));
    areas.forEach((a) => q.append("areas", a));
    statusTexts.forEach((s) => q.append("statusTexts", s));
    return q.toString();
  }, [
    searchApplied,
    dateFrom,
    dateTo,
    admissionDateFrom,
    admissionDateTo,
    villages,
    policyYears,
    statuses,
    claimTypes,
    matchStatuses,
    svkkPublicIds,
    categoryKeys,
    policyTypes,
    policyGroupings,
    insuranceCompanies,
    areas,
    statusTexts,
  ]);

  const queryString = useMemo(() => {
    const q = new URLSearchParams(filterQueryString);
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    q.set("sort", sort);
    return q.toString();
  }, [filterQueryString, page, pageSize, sort]);

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

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await svkkJson<SummaryRes>(`/claims/summary?${filterQueryString}`);
      setSummary(res);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [filterQueryString]);

  const refresh = useCallback(() => {
    void loadList();
    void loadSummary();
  }, [loadList, loadSummary]);

  useEffect(() => {
    if (missingUrl) return;
    if (!user?.permissions?.includes("claim:read") && !user?.permissions?.includes("*:*")) return;
    void loadList();
    void loadSummary();
  }, [missingUrl, user, loadList, loadSummary]);

  useEffect(() => {
    if (missingUrl) return;
    void svkkJson<FiltersMeta>("/claims/filters")
      .then(setMeta)
      .catch(() =>
        setMeta({
          villages: [],
          policyYears: [],
          claimTypes: [],
          svkkPublicIds: [],
          categoryKeys: [],
          policyTypes: [],
          policyGroupings: [],
          insuranceCompanies: [],
          areas: [],
          statusTexts: [],
        }),
      );
  }, [missingUrl]);

  const villageOptions = useMemo(() => toOptions(meta?.villages ?? []), [meta?.villages]);
  const yearOptions = useMemo(() => toOptions(meta?.policyYears ?? []), [meta?.policyYears]);
  const claimTypeOptions = useMemo(() => toOptions(meta?.claimTypes ?? []), [meta?.claimTypes]);
  const svkkOptions = useMemo(() => toOptions(meta?.svkkPublicIds ?? []), [meta?.svkkPublicIds]);
  const categoryOptions = useMemo(() => toOptions(meta?.categoryKeys ?? []), [meta?.categoryKeys]);
  const policyTypeOptions = useMemo(() => toOptions(meta?.policyTypes ?? []), [meta?.policyTypes]);
  const groupingOptions = useMemo(() => toOptions(meta?.policyGroupings ?? []), [meta?.policyGroupings]);
  const insuranceOptions = useMemo(
    () => toOptions(meta?.insuranceCompanies ?? []),
    [meta?.insuranceCompanies],
  );
  const areaOptions = useMemo(() => toOptions(meta?.areas ?? []), [meta?.areas]);
  const statusTextOptions = useMemo(() => toOptions(meta?.statusTexts ?? []), [meta?.statusTexts]);

  const exportClaimsCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      const q = new URLSearchParams(filterQueryString);
      q.set("sort", sort);
      const res = await backendApi.get(`/claims/export.csv?${q}`, { responseType: "blob" });
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
  }, [filterQueryString, sort]);

  function goToMisReport() {
    const q = new URLSearchParams();
    q.set("tab", "claim");
    const df = toIsoDateParam(dateFrom);
    const dt = toIsoDateParam(dateTo);
    if (df) q.set("dateFrom", df);
    if (dt) q.set("dateTo", dt);
    villages.forEach((v) => q.append("villages", v));
    categoryKeys.forEach((c) => q.append("categoryKeys", c));
    router.push(`/mis?${q.toString()}`);
  }

  async function removeClaim() {
    if (!claimToDelete) return;
    const id = claimToDelete.id;
    setDeleteBusy(true);
    try {
      await backendApi.delete(`/claims/${id}`);
      toast.success("Claim deleted");
      refresh();
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
    setDateTo("");
    setAdmissionDateFrom("");
    setAdmissionDateTo("");
    setVillages([]);
    setPolicyYears([]);
    setStatuses([]);
    setClaimTypes([]);
    setMatchStatuses([]);
    setSvkkPublicIds([]);
    setCategoryKeys([]);
    setPolicyTypes([]);
    setPolicyGroupings([]);
    setInsuranceCompanies([]);
    setAreas([]);
    setStatusTexts([]);
    setSort("createdAt");
    setPage(1);
  }

  if (user && !user.permissions?.includes("claim:read") && !user.permissions?.includes("*:*")) {
    return <p className="text-muted-foreground text-sm">You do not have access to claims.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  const colCount = 22 + (canU || canD ? 1 : 0);

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
            Search and filter imported claims. Use CSV import to add new records; edit full claim
            details from the register.
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
                Refine by received date, admission date, location, status, and free-text search.
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
              <div className="grid gap-4 lg:grid-cols-3">
                {canImport ? (
                  <div>
                    <ClaimCsvImportInline disabled={!canImport} onImported={refresh} />
                  </div>
                ) : null}
                <div>
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
                <div className="flex flex-col justify-end gap-2">
                  {canCreate ? (
                    <Button type="button" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                      <Plus className="size-3.5" />
                      Add entry
                    </Button>
                  ) : null}
                </div>
              </div>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border p-3">
                  <Label className="mb-2 block text-xs font-bold">From date (received)</Label>
                  <PolicyDateInput value={dateFrom} onValueChange={setDateFrom} className="h-10" />
                </div>
                <div className="rounded-xl border p-3">
                  <Label className="mb-2 block text-xs font-bold">To date (received)</Label>
                  <PolicyDateInput value={dateTo} onValueChange={setDateTo} className="h-10" />
                </div>
                <div className="rounded-xl border p-3">
                  <Label className="mb-2 block text-xs font-bold">From date (admission)</Label>
                  <PolicyDateInput
                    value={admissionDateFrom}
                    onValueChange={setAdmissionDateFrom}
                    className="h-10"
                  />
                </div>
                <div className="rounded-xl border p-3">
                  <Label className="mb-2 block text-xs font-bold">To date (admission)</Label>
                  <PolicyDateInput
                    value={admissionDateTo}
                    onValueChange={setAdmissionDateTo}
                    className="h-10"
                  />
                </div>
                <PolicyFilterMulti
                  label="Category"
                  placeholder="All categories"
                  options={categoryOptions}
                  selected={categoryKeys}
                  onChange={setCategoryKeys}
                  accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="SVKK ID"
                  placeholder="All SVKK IDs"
                  options={svkkOptions}
                  selected={svkkPublicIds}
                  onChange={setSvkkPublicIds}
                  accentClassName="border-sky-200/90 from-sky-50/95 to-card dark:border-sky-900/50 dark:from-sky-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Policy type"
                  placeholder="All policy types"
                  options={policyTypeOptions}
                  selected={policyTypes}
                  onChange={setPolicyTypes}
                  accentClassName="border-blue-200/90 from-blue-50/95 to-card dark:border-blue-900/50 dark:from-blue-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Policy grouping"
                  placeholder="All groupings"
                  options={groupingOptions}
                  selected={policyGroupings}
                  onChange={setPolicyGroupings}
                  accentClassName="border-indigo-200/90 from-indigo-50/95 to-card dark:border-indigo-900/50 dark:from-indigo-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Status"
                  placeholder="All statuses"
                  options={STATUS_OPTIONS}
                  selected={statuses}
                  onChange={setStatuses}
                  accentClassName="border-amber-200/90 from-amber-50/95 to-card dark:border-amber-900/50 dark:from-amber-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Status text"
                  placeholder="All status texts"
                  options={statusTextOptions}
                  selected={statusTexts}
                  onChange={setStatusTexts}
                  accentClassName="border-orange-200/90 from-orange-50/95 to-card dark:border-orange-900/50 dark:from-orange-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Claim lodge type"
                  placeholder="All types"
                  options={claimTypeOptions}
                  selected={claimTypes}
                  onChange={setClaimTypes}
                  accentClassName="border-cyan-200/90 from-cyan-50/95 to-card dark:border-cyan-900/50 dark:from-cyan-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Village"
                  placeholder="All villages"
                  options={villageOptions}
                  selected={villages}
                  onChange={setVillages}
                  accentClassName="border-emerald-200/90 from-emerald-50/95 to-card dark:border-emerald-900/50 dark:from-emerald-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Insurance company"
                  placeholder="All companies"
                  options={insuranceOptions}
                  selected={insuranceCompanies}
                  onChange={setInsuranceCompanies}
                  accentClassName="border-teal-200/90 from-teal-50/95 to-card dark:border-teal-900/50 dark:from-teal-950/35 dark:to-card"
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
                  label="Area / city"
                  placeholder="All areas"
                  options={areaOptions}
                  selected={areas}
                  onChange={setAreas}
                  accentClassName="border-slate-200/90 from-slate-50/95 to-card dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Match"
                  placeholder="All match states"
                  options={MATCH_OPTIONS}
                  selected={matchStatuses}
                  onChange={setMatchStatuses}
                  accentClassName="border-rose-200/90 from-rose-50/95 to-card dark:border-rose-900/50 dark:from-rose-950/35 dark:to-card"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={goToMisReport}>
                  <BarChart3 className="size-3.5" />
                  View MIS report
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: ClipboardList, label: "Total claims", value: summary?.totalClaims, accent: true },
          { icon: LayoutList, label: "Paid / settled", value: summary?.paidOrSettledCount },
          { icon: Filter, label: "Under process", value: summary?.underProcessCount },
          { icon: LayoutList, label: "Total lodge amt", value: formatInrCompact(summary?.sumLodgeAmount), money: true },
          { icon: LayoutList, label: "Total paid amt", value: formatInrCompact(summary?.sumPaidAmount), money: true },
          { icon: LayoutList, label: "Deductions", value: formatInrCompact(summary?.sumDeductionAmount), money: true },
          { icon: LayoutList, label: "On this page", value: rows.length },
          { icon: Filter, label: "Active filters", value: activeFilterCount },
        ].map((card) => (
          <Card key={card.label} className={cn("py-0 shadow-sm", card.accent && "border-primary/15 from-primary/8 bg-linear-to-br to-card")}>
            <CardContent className="flex items-center gap-3 px-4 py-4">
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                <card.icon className="text-muted-foreground size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium uppercase">{card.label}</p>
                <p className="text-xl font-bold tabular-nums">
                  {loading || summaryLoading ? (
                    <Skeleton className="mt-1 h-7 w-16" />
                  ) : card.money ? (
                    (card.value ?? "—")
                  ) : (
                    (typeof card.value === "number" ? card.value.toLocaleString() : card.value) ?? "—"
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
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
                <Badge variant="secondary" className="font-normal">
                  {total.toLocaleString()} records
                </Badge>
              </CardTitle>
              <CardDescription>
                All matching claims — use Edit to update full claim details from the actions column.
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
        <div className="relative overflow-x-auto">
          {loading ? (
            <div
              className="from-primary/40 pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-linear-to-r via-primary to-primary/40"
              aria-hidden
            />
          ) : null}
          <Table className="min-w-[2200px] font-sans text-sm antialiased">
            <TableHeader className="[&_tr]:bg-muted/80">
              <TableRow>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">SVKK ID</TableHead>
                <TableHead className="text-xs">Policy type</TableHead>
                <TableHead className="text-xs">Grouping</TableHead>
                <TableHead className="text-xs">Policy no</TableHead>
                <TableHead className="text-xs">Holder</TableHead>
                <TableHead className="text-xs">Patient</TableHead>
                <TableHead className="text-xs">Village</TableHead>
                <TableHead className="text-xs">Insurance</TableHead>
                <TableHead className="text-xs">Claim #</TableHead>
                <TableHead className="text-xs">Hospital</TableHead>
                <TableHead className="text-xs">Area</TableHead>
                <TableHead className="text-xs">Admission</TableHead>
                <TableHead className="text-xs">Discharge</TableHead>
                <TableHead className="text-xs">Diagnosis</TableHead>
                <TableHead className="text-xs">Lodge type</TableHead>
                <TableHead className="text-xs">Lodge amt</TableHead>
                <TableHead className="text-xs">Deduction</TableHead>
                <TableHead className="text-xs">Paid amt</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Match</TableHead>
                <TableHead className="text-xs">Year</TableHead>
                {(canU || canD) && <TableHead className="text-right text-xs">Actions</TableHead>}
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
                    <TableCell>
                      <CategoryBadge value={c.policy?.category?.key} />
                    </TableCell>
                    <TableCell className={cn(claimTableCell, "font-mono text-xs")}>{c.svkkPublicId || "—"}</TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">{c.policyTypeText ?? "—"}</TableCell>
                    <TableCell className="max-w-[90px] truncate text-xs">{c.policy?.policyGrouping ?? "—"}</TableCell>
                    <TableCell className={cn(claimTableCell, "font-mono text-xs")}>
                      {c.policyId && c.policy?.policyNo ? (
                        <Link href={`/policies/${c.policyId}`} className="text-primary hover:underline">
                          {c.policy.policyNo}
                        </Link>
                      ) : (
                        (c.policy?.policyNo ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate">{c.policyHolderName ?? "—"}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{c.patientName ?? "—"}</TableCell>
                    <TableCell>{c.village ?? "—"}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{c.insuranceCompany ?? "—"}</TableCell>
                    <TableCell className={cn(claimTableCell, "font-mono text-xs")}>{c.claimNo}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{c.hospitalName ?? "—"}</TableCell>
                    <TableCell className="max-w-[90px] truncate">{c.hospitalArea ?? "—"}</TableCell>
                    <TableCell className="text-xs">{formatDateCell(c.admissionDate)}</TableCell>
                    <TableCell className="text-xs">{formatDateCell(c.dischargeDate)}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{c.illness ?? "—"}</TableCell>
                    <TableCell>
                      <LodgeTypeBadge value={c.claimType} />
                    </TableCell>
                    <TableCell className={claimTableCell}>{formatInrRupee(c.claimAmount)}</TableCell>
                    <TableCell className={claimTableCell}>{formatInrRupee(c.deductionAmount)}</TableCell>
                    <TableCell className={claimTableCell}>{formatInrRupee(c.approvedAmount)}</TableCell>
                    <TableCell>
                      <StatusBadge value={c.statusText ?? c.status} />
                    </TableCell>
                    <TableCell className="text-xs">{matchLabel(c.matchStatus)}</TableCell>
                    <TableCell>{c.policyYear}</TableCell>
                    {canU || canD ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canU ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditClaimId(c.id);
                                setEditClaimNo(c.claimNo);
                              }}
                            >
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
                      <p className="text-xs">Import claims via CSV or widen your date filters.</p>
                      <Button type="button" variant="link" size="sm" onClick={resetFilters}>
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
            Showing <span className="text-foreground font-medium">{rows.length}</span> of{" "}
            <span className="text-foreground font-medium">{total.toLocaleString()}</span> claims
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="claims-page-size" className="text-muted-foreground text-xs">
                Per page
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger id="claims-page-size" className="h-8 w-[84px]" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground text-sm">
              Page {page} of {Math.max(1, totalPages)}
            </p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" className="size-8 p-0" onClick={() => setPage(1)} disabled={page <= 1 || loading}>
                <ChevronsLeft className="size-4" />
              </Button>
              <Button type="button" variant="outline" className="size-8 p-0" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button type="button" variant="outline" className="size-8 p-0" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
                <ChevronRight className="size-4" />
              </Button>
              <Button type="button" variant="outline" className="size-8 p-0" onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading}>
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      <Dialog open={!!claimToDelete} onOpenChange={(o) => !o && setClaimToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this claim?</DialogTitle>
            <DialogDescription>
              This cannot be undone.
              {claimToDelete ? (
                <span className="mt-2 block font-mono text-xs">{claimToDelete.claimNo}</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setClaimToDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void removeClaim()}>
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClaimAddDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={refresh} />

      <ClaimEditDialog
        claimId={editClaimId}
        claimNo={editClaimNo}
        onClose={() => {
          setEditClaimId(null);
          setEditClaimNo(null);
        }}
        onSaved={(detail) => {
          const row = listRowFromDetail(detail);
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          void loadSummary();
        }}
      />
    </motion.div>
  );
}
