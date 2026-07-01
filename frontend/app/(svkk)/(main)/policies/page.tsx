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
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PoliciesColumnHeader } from "@/features/svkk-policies/policies-column-header";
import {
  categoryLabelForSnapshot,
  PolicyListSnapshotPanel,
  policyTypeLabelForSnapshot,
} from "@/features/svkk-policies/policy-list-snapshot";
import { yearChipLabel, yearQuickActionsTitle } from "@/features/svkk-policies/policy-year-display";
import { buildCategoryByKeyMap } from "@/lib/svkk/category-display";
import {
  PolicyFilterMulti,
  type PolicyFilterOption,
} from "@/features/svkk-policies/policy-filter-multi";
import { policyTypeKeyToAdVariant } from "@/features/svkk-policies/ad-product-variant";
import { PolicyCsvImportInline } from "@/features/svkk-policies/policy-csv-import-panel";
import { PolicyCsvExportDialog } from "@/features/svkk-policies/policy-csv-export-dialog";
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";
import { getSvkkApiBase } from "@/lib/svkk/config";
import {
  formatDateForFormInput,
  todayFormDate,
  toIsoDateParam,
} from "@/lib/svkk/form-date";
import { monthFilterOptionsFromMeta } from "@/lib/svkk/policy-period-months";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { OfflineDashboard } from "@/components/svkk/offline-dashboard";
import { OfflineStatusBanner } from "@/components/svkk/offline-status-banner";
import { useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import type { PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import { buildReceiptDocumentHtml } from "@/lib/svkk/policy-receipt-print";
import { resolveReceiptImagesForPrint } from "@/lib/svkk/receipt-image-resolve";
import {
  buildReceiptFilename,
  downloadReceiptPreviewAsPdf,
  printReceiptPreview,
} from "@/lib/svkk/receipt-pdf";
import { useReceiptSettings } from "@/lib/svkk/use-receipt-settings";
import {
  canDeletePolicy,
  canUpdatePolicy,
  hasPermission,
} from "@/lib/svkk/permissions";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutList,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  navigatePolicyRoute,
  onOfflineAwareLinkClick,
} from "@/lib/svkk/offline/navigate";
import { renderOfflinePolicySubRoute } from "@/components/svkk/offline-policy-route";
import { isOfflinePolicySubRoute } from "@/lib/svkk/offline/policy-route-paths";
import {
  getBrowserPathnameSnapshot,
  subscribeBrowserPathname,
} from "@/lib/svkk/offline/subscribe-browser-pathname";
import { debugOfflineRoute } from "@/lib/svkk/offline/offline-route-debug";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

type ListPolicyYear = {
  policyId: string;
  yearLabel: string;
  displayYearLabel?: string;
  referenceNo: string | null;
  policyNo: string | null;
  vkkPremium: unknown;
  sumInsured: unknown;
};

type ListPolicy = {
  svkkPublicId: string;
  primaryPolicyId: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  personsInsuredCount: number | null;
  area: string | null;
  remarks: string | null;
  adProductVariant?: string | null;
  periodMonthText?: string | null;
  periodYearText?: string | null;
  whatsappNo?: string | null;
  policyGrouping?: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    mobile: string;
    email?: string | null;
    customerId: string | null;
    pan: string | null;
  };
  policyType: { id: string; name: string };
  category: { id: string; key: string; name: string } | null;
  categoryText?: string | null;
  years: ListPolicyYear[];
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

/** Unified table body typography: bold data cells across the policy register. */
const policyTableCell = "font-sans text-sm font-bold text-foreground tabular-nums antialiased";

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
  { value: "periodMonthText", label: "Month A–Z" },
  { value: "periodMonthText_desc", label: "Month Z–A" },
  { value: "categoryName", label: "Category A–Z" },
  { value: "categoryName_desc", label: "Category Z–A" },
  { value: "svkkId", label: "SVKK ID A–Z" },
  { value: "svkkId_desc", label: "SVKK ID Z–A" },
];

function parseInrAmount(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v !== null && "toString" in v) {
    const n = Number(String((v as { toString: () => string }).toString()).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Indian-style grouping, e.g. ₹ 58,839 */
function formatInrRupee(v: unknown): string | null {
  const n = parseInrAmount(v);
  if (n == null) return null;
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
  return `₹ ${formatted}`;
}

export default function SvkkPoliciesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);
  const { user } = useSvkkAuth();
  const { online } = useOfflineStatus();
  const perms = user?.permissions ?? [];
  const canDel = canDeletePolicy(perms) && online;
  const canEdit = canUpdatePolicy(perms);
  const canCsvUpload = hasPermission(perms, "upload:csv");
  const receiptImageUrls = useReceiptSettings();
  const { options: ddOptions } = useDropdownOptions();

  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const prevSearchApplied = useRef(searchApplied);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayFormDate);
  const [villages, setVillages] = useState<string[]>([]);
  const [periodYears, setPeriodYears] = useState<string[]>([]);
  const [periodMonths, setPeriodMonths] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [policyTypeIds, setPolicyTypeIds] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [sumInsureds, setSumInsureds] = useState<string[]>([]);
  const [policyGroupings, setPolicyGroupings] = useState<string[]>([]);
  /** "" = all; "pending" = renewal due by to-date; otherwise renewal bucket key */
  const [renewalFilter, setRenewalFilter] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<ListPolicy[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<FiltersMeta | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rowDeleteId, setRowDeleteId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(null);
  const [receiptFilenameHint, setReceiptFilenameHint] = useState<string>("policy-receipt");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [expandedSvkkId, setExpandedSvkkId] = useState<string | null>(null);
  const [rowYearAction, setRowYearAction] = useState<{
    svkkPublicId: string;
    kind: YearActionKind;
  } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const listFetchGenerationRef = useRef(0);

  const missingUrl = !getSvkkApiBase();

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const df = searchParams.get("dateFrom");
    const dt = searchParams.get("dateTo");
    if (df !== null) setDateFrom(formatDateForFormInput(df) || df);
    if (dt) setDateTo(formatDateForFormInput(dt) || dt);
    const v = searchParams.getAll("villages");
    if (v.length) setVillages(v);
    const typeIds = searchParams.getAll("policyTypeIds");
    if (typeIds.length) {
      setPolicyTypeIds(typeIds);
    } else {
      const variants = searchParams.getAll("adProductVariants");
      if (variants.length) {
        const mapped = ddOptions.policyTypes
          .filter((t): t is typeof t & { id: string } => Boolean(t.id))
          .filter((t) => {
            const variant = policyTypeKeyToAdVariant(t.value);
            return variant != null && variants.includes(variant);
          })
          .map((t) => t.id);
        if (mapped.length) setPolicyTypeIds(mapped);
      }
    }
    const cats = searchParams.getAll("categoryIds");
    if (cats.length) setCategoryIds(cats);
    const rp = searchParams.get("renewalPending");
    const rb = searchParams.get("renewalBucket");
    if (rb) setRenewalFilter(rb);
    else if (rp === "true") setRenewalFilter("pending");
  }, [searchParams]);

  /** Map dashboard `adProductVariants` links once policy types have loaded from the API. */
  useEffect(() => {
    if (!urlHydrated.current) return;
    if (policyTypeIds.length || searchParams.getAll("policyTypeIds").length) return;
    const variants = searchParams.getAll("adProductVariants");
    if (!variants.length || !ddOptions.policyTypes.length) return;
    const mapped = ddOptions.policyTypes
      .filter((t): t is typeof t & { id: string } => Boolean(t.id))
      .filter((t) => {
        const variant = policyTypeKeyToAdVariant(t.value);
        return variant != null && variants.includes(variant);
      })
      .map((t) => t.id);
    if (mapped.length) setPolicyTypeIds(mapped);
  }, [searchParams, ddOptions.policyTypes, policyTypeIds.length]);

  const categoryKeysForQuery = useMemo(() => {
    const keys = categoryIds
      .map((id) => categories.find((c) => c.id === id)?.key?.trim())
      .filter((k): k is string => Boolean(k));
    return [...new Set(keys)];
  }, [categoryIds, categories]);

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

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        dateFrom,
        dateTo,
        villages,
        periodYears,
        periodMonths,
        categoryIds,
        policyTypeIds,
        areas,
        sumInsureds,
        policyGroupings,
        renewalFilter,
      }),
    [
      dateFrom,
      dateTo,
      villages,
      periodYears,
      periodMonths,
      categoryIds,
      policyTypeIds,
      areas,
      sumInsureds,
      policyGroupings,
      renewalFilter,
    ],
  );
  const prevFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKey.current !== filtersKey) {
      prevFiltersKey.current = filtersKey;
      setPage(1);
    }
  }, [filtersKey]);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    q.set("sort", sort);
    if (searchApplied.trim()) q.set("search", searchApplied.trim());
    const dateFromParam = toIsoDateParam(dateFrom);
    const dateToParam = toIsoDateParam(dateTo);
    if (dateFromParam) q.set("dateFrom", dateFromParam);
    if (dateToParam) q.set("dateTo", dateToParam);
    villages.forEach((v) => q.append("villages", v));
    periodYears.forEach((y) => q.append("periodYearTexts", y));
    periodMonths.forEach((m) => q.append("periodMonthTexts", m));
    categoryIds.forEach((id) => q.append("categoryIds", id));
    categoryKeysForQuery.forEach((k) => q.append("categoryKeys", k));
    policyTypeIds.forEach((id) => q.append("policyTypeIds", id));
    areas.forEach((a) => q.append("areas", a));
    sumInsureds.forEach((s) => q.append("sumInsureds", s));
    policyGroupings.forEach((g) => q.append("policyGroupings", g));
    if (renewalFilter === "pending") {
      q.set("renewalPending", "true");
      if (dateToParam) q.set("renewalAsOf", dateToParam);
    } else if (renewalFilter) {
      q.set("renewalBucket", renewalFilter);
      if (dateToParam) q.set("renewalAsOf", dateToParam);
    }
    return q.toString();
  }, [
    page,
    pageSize,
    sort,
    searchApplied,
    dateFrom,
    dateTo,
    villages,
    periodYears,
    periodMonths,
    categoryIds,
    categoryKeysForQuery,
    policyTypeIds,
    areas,
    sumInsureds,
    policyGroupings,
    renewalFilter,
  ]);

  /** Same filters and sort as the table; omit paging so export returns all matching rows. */
  const exportQueryString = useMemo(() => {
    const q = new URLSearchParams(queryString);
    q.delete("page");
    q.delete("pageSize");
    return q.toString();
  }, [queryString]);

  const exportPoliciesCsv = useCallback(async (columns: string[]) => {
    setExportBusy(true);
    try {
      const q = new URLSearchParams(exportQueryString);
      if (columns.length > 0) {
        for (const col of columns) {
          q.append("columns", col);
        }
      }
      const res = await backendApi.get(`/policies/export.csv?${q.toString()}`, {
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
      setExportDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }, [exportQueryString]);

  const downloadPolicyCsvSample = useCallback(async () => {
    try {
      const res = await backendApi.get("/policies/export-sample.csv", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "policies-import-sample.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sample download failed");
    }
  }, []);

  const load = useCallback(async () => {
    const generation = ++listFetchGenerationRef.current;
    setLoading(true);
    const loadFromCache = async () => {
      const { loadOfflinePolicyListPage } = await import("@/lib/svkk/offline/policy-data");
      const dateFromParam = toIsoDateParam(dateFrom);
      const dateToParam = toIsoDateParam(dateTo);
      return loadOfflinePolicyListPage({
        search: searchApplied,
        sort,
        page,
        pageSize,
        filters: {
          villages,
          periodYears,
          periodMonths,
          categoryIds,
          categoryKeys: categoryKeysForQuery,
          policyTypeIds,
          areas,
          sumInsureds,
          policyGroupings,
          ...(dateFromParam ? { dateFrom: dateFromParam } : {}),
          ...(dateToParam ? { dateTo: dateToParam } : {}),
        },
      });
    };
    try {
      setErr(null);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const res = await loadFromCache();
        if (generation !== listFetchGenerationRef.current) return;
        setRows(res.items as ListPolicy[]);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        setRowSelection({});
        return;
      }
      const res = await svkkJson<PageListRes>(`/policies?${queryString}`);
      if (generation !== listFetchGenerationRef.current) return;
      setRows(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
      setRowSelection({});
    } catch (e) {
      if (generation !== listFetchGenerationRef.current) return;
      const { isLikelyOfflineError } = await import("@/lib/svkk/offline/policy-data");
      if (isLikelyOfflineError(e)) {
        try {
          const res = await loadFromCache();
          if (generation !== listFetchGenerationRef.current) return;
          setRows(res.items as ListPolicy[]);
          setTotalPages(res.totalPages);
          setTotal(res.total);
          setRowSelection({});
          setErr(null);
          return;
        } catch {
          /* fall through */
        }
      }
      setErr(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      if (generation === listFetchGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [
    queryString,
    searchApplied,
    sort,
    page,
    pageSize,
    dateFrom,
    dateTo,
    villages,
    periodYears,
    periodMonths,
    categoryIds,
    categoryKeysForQuery,
    policyTypeIds,
    areas,
    sumInsureds,
    policyGroupings,
  ]);

  const downloadCsvErrorReport = useCallback(async (jobId: string) => {
    try {
      const res = await backendApi.get(`/upload/csv/${jobId}/errors.csv`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `csv-import-errors-${jobId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error report download failed");
    }
  }, []);

  useEffect(() => {
    if (missingUrl) return;
    void load();
    return () => {
      listFetchGenerationRef.current += 1;
    };
  }, [missingUrl, load]);

  useEffect(() => {
    if (missingUrl) return;
    const onCacheSynced = () => void load();
    window.addEventListener("svkk-cache-synced", onCacheSynced);
    return () => window.removeEventListener("svkk-cache-synced", onCacheSynced);
  }, [missingUrl, load]);

  useEffect(() => {
    if (missingUrl) return;
    void (async () => {
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const { getOfflineFiltersMeta, getOfflineCategories } = await import(
            "@/lib/svkk/offline/policy-data"
          );
          const [f, cat] = await Promise.all([getOfflineFiltersMeta(), getOfflineCategories()]);
          setMeta(f);
          setCategories(cat);
          return;
        }
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

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (searchApplied.trim()) n++;
    if (dateFrom) n++;
    if (dateTo !== todayFormDate()) n++;
    if (villages.length) n++;
    if (periodYears.length) n++;
    if (periodMonths.length) n++;
    if (categoryIds.length) n++;
    if (policyTypeIds.length) n++;
    if (areas.length) n++;
    if (sumInsureds.length) n++;
    if (policyGroupings.length) n++;
    if (renewalFilter) n++;
    return n;
  }, [
    searchApplied,
    dateFrom,
    dateTo,
    villages,
    periodYears,
    periodMonths,
    categoryIds,
    policyTypeIds,
    areas,
    sumInsureds,
    policyGroupings,
    renewalFilter,
  ]);

  const categoryOptions = useMemo<PolicyFilterOption[]>(
    () => categories.map((c) => ({ value: c.id, label: `${c.key} — ${c.name}` })),
    [categories],
  );

  const categoryByKey = useMemo(
    () => buildCategoryByKeyMap(categories.map((c) => ({ id: c.id, key: c.key, name: c.name }))),
    [categories],
  );
  const yearOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.periodYearTexts ?? []).map((v) => ({ value: v, label: v })),
    [meta?.periodYearTexts],
  );
  const monthOptions = useMemo<PolicyFilterOption[]>(
    () => monthFilterOptionsFromMeta(meta?.periodMonthTexts ?? []),
    [meta?.periodMonthTexts],
  );
  const areaOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.areas ?? []).map((v) => ({ value: v, label: v })),
    [meta?.areas],
  );
  const villageOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.villages ?? []).map((v) => ({ value: v, label: v })),
    [meta?.villages],
  );
  const sumInsuredOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.sumInsuredValues ?? []).map((v) => ({ value: v, label: v })),
    [meta?.sumInsuredValues],
  );
  const groupingOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.policyGroupings ?? []).map((g) => ({ value: g, label: g })),
    [meta?.policyGroupings],
  );
  const policyTypeFilterOptions = useMemo<PolicyFilterOption[]>(
    () =>
      ddOptions.policyTypes
        .filter((t): t is typeof t & { id: string } => Boolean(t.id))
        .map((t) => ({ value: t.id, label: t.label || t.value })),
    [ddOptions.policyTypes],
  );

  async function bulkDelete() {
    const ids = [
      ...new Set(
        Object.entries(rowSelection)
          .filter(([, v]) => v)
          .flatMap(([svkkId]) => rows.find((r) => r.svkkPublicId === svkkId)?.years.map((y) => y.policyId) ?? []),
      ),
    ];
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
      setReceiptFilenameHint(
        buildReceiptFilename([
          "receipt",
          p.insuredParty?.svkkPublicId || p.policyNo,
          selectedYearLabel ?? payload.years?.[0]?.yearLabel,
        ]).replace(/\.pdf$/, ""),
      );
      const resolved = await resolveReceiptImagesForPrint(receiptImageUrls);
      setReceiptPreviewHtml(buildReceiptDocumentHtml(payload, { embedded: true, ...resolved }));
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
        cell: ({ row }) => {
          const detailHref = `/policies/${row.original.primaryPolicyId}`;
          return (
          <Link
            href={detailHref}
            onClick={(e) => onOfflineAwareLinkClick(e, detailHref)}
            className="font-sans text-sm font-bold text-foreground hover:text-primary inline-flex max-w-[min(100%,220px)] items-center rounded-sm px-0.5 py-0.5 transition-colors hover:underline"
            title={row.original.policyNo ?? undefined}
          >
            <span className="truncate tabular-nums">{row.original.policyNo ?? "—"}</span>
          </Link>
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
          <span className={policyTableCell}>{row.original.insuredParty.customerId ?? "—"}</span>
        ),
      },
      {
        id: "month",
        accessorFn: (r) => r.periodMonthText ?? "",
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Month"
            sortAsc="periodMonthText"
            sortDesc="periodMonthText_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => (
          <span className={cn(policyTableCell, "max-w-[120px] truncate")}>
            {row.original.periodMonthText?.trim() || "—"}
          </span>
        ),
      },
      {
        id: "category",
        accessorFn: (r) => categoryLabelForSnapshot(r, categoryByKey),
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Category"
            sortAsc="categoryName"
            sortDesc="categoryName_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => {
          const cat = categoryLabelForSnapshot(row.original, categoryByKey);
          return (
            <span className={cn(policyTableCell, "max-w-[140px] truncate")} title={cat || undefined}>
              {cat.trim() || "—"}
            </span>
          );
        },
      },
      {
        id: "svkkId",
        accessorFn: (r) => r.insuredParty.svkkPublicId.trim(),
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="SVKK ID"
            sortAsc="svkkId"
            sortDesc="svkkId_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => {
          const id = row.original.insuredParty.svkkPublicId.trim() || "—";
          return (
            <span className={cn(policyTableCell, "max-w-[200px] truncate font-mono text-xs")} title={id !== "—" ? id : undefined}>
              {id}
            </span>
          );
        },
      },
      {
        id: "holder",
        accessorFn: (r) => r.insuredParty.name,
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Holder"
            sortAsc="name"
            sortDesc="name_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => (
          <span className={cn(policyTableCell, "max-w-[240px] truncate")}>{row.original.insuredParty.name}</span>
        ),
      },
      {
        id: "policyType",
        accessorFn: (r) => policyTypeLabelForSnapshot(r, ddOptions.policyTypes),
        header: ({ column }) => (
          <PoliciesColumnHeader
            column={column}
            title="Type"
            sortAsc="policyTypeName"
            sortDesc="policyTypeName_desc"
            activeSort={sort}
            onSortChange={applySort}
          />
        ),
        cell: ({ row }) => {
          const n = policyTypeLabelForSnapshot(row.original, ddOptions.policyTypes);
          return (
            <span className={cn(policyTableCell, "max-w-[160px] truncate")} title={n}>
              {n}
            </span>
          );
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
        cell: ({ row }) => (
          <span className={policyTableCell}>{row.original.village ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "Action",
        cell: ({ row }) => {
          const p = row.original;
          const expanded = expandedSvkkId === p.svkkPublicId;
          return (
            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant={expanded ? "secondary" : "outline"}
                    className="size-8"
                    type="button"
                    aria-label="Policy actions"
                    aria-expanded={expanded}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => {
                      setRowYearAction(null);
                      setExpandedSvkkId((curr) => (curr === p.svkkPublicId ? null : p.svkkPublicId));
                    }}
                  >
                    <Eye />
                    {expanded ? "Hide year-wise details" : "Year-wise details"}
                  </DropdownMenuItem>
                  {canEdit ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setExpandedSvkkId(p.svkkPublicId);
                        setRowYearAction((curr) =>
                          curr?.svkkPublicId === p.svkkPublicId && curr.kind === "edit"
                            ? null
                            : { svkkPublicId: p.svkkPublicId, kind: "edit" },
                        );
                      }}
                    >
                      <Pencil />
                      Edit policy…
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={receiptBusyId === p.primaryPolicyId}
                    onClick={() => {
                      setExpandedSvkkId(p.svkkPublicId);
                      setRowYearAction((curr) =>
                        curr?.svkkPublicId === p.svkkPublicId && curr.kind === "receipt"
                          ? null
                          : { svkkPublicId: p.svkkPublicId, kind: "receipt" },
                      );
                    }}
                  >
                    <FileText />
                    Receipt
                  </DropdownMenuItem>
                  {canDel ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setRowDeleteId(p.primaryPolicyId)}
                      >
                        <Trash2 />
                        Delete latest year
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        enableHiding: false,
      },
    );

    return cols;
  }, [applySort, canDel, canEdit, categoryByKey, ddOptions.policyTypes, expandedSvkkId, receiptBusyId, sort]);

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (r) => r.svkkPublicId,
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

  // Self-check for a stale/fallback SW response: if this list page ever mounts while the
  // *real* browser URL is a policies sub-route (detail/edit/new), usePathname() can't be
  // trusted to catch it — it's synced from window.location, not from the embedded RSC
  // tree, so it reports the correct URL even though this (wrong) component is mounted.
  // Recover directly here since we're the one actually on screen.
  const browserPathname = useSyncExternalStore(
    subscribeBrowserPathname,
    getBrowserPathnameSnapshot,
    () => "",
  );
  const isMismatchedSubRoute = isOfflinePolicySubRoute(browserPathname);

  useEffect(() => {
    if (!isMismatchedSubRoute) return;
    debugOfflineRoute("list page mounted under mismatched URL", { browserPathname });
  }, [browserPathname, isMismatchedSubRoute]);

  if (isMismatchedSubRoute) {
    const recovered = renderOfflinePolicySubRoute(browserPathname);
    if (recovered) return recovered;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <motion.div
      className="space-y-8 pb-10"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <OfflineStatusBanner />
      <OfflineDashboard />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
          <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
            One row per SVKK ID. Expand a row to choose a fiscal year, view premiums, and open or edit that
            year&apos;s policy record.
          </p>
        </div>
        {canCsvUpload ? (
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
              <CardDescription>Refine by period, location, product, and free-text search.</CardDescription>
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
                <div className="lg:col-span-2">
                  <PolicyCsvImportInline
                    disabled={!canCsvUpload}
                    onImported={() => void load()}
                    onDownloadSample={downloadPolicyCsvSample}
                    onDownloadErrorReport={downloadCsvErrorReport}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">Search</Label>
                  <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      placeholder="Name, policy no., mobile, customer ID…"
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      className="h-10 border-dashed pl-9 font-bold shadow-none"
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border-2 border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
                  <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                    From date
                  </Label>
                  <PolicyDateInput
                    value={dateFrom}
                    onValueChange={setDateFrom}
                    className="h-10 bg-background/90 font-bold"
                  />
                </div>
                <div className="rounded-xl border-2 border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
                  <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                    To date
                  </Label>
                  <PolicyDateInput
                    value={dateTo}
                    onValueChange={setDateTo}
                    className="h-10 bg-background/90 font-bold"
                  />
                  {renewalFilter ? (
                    <p className="text-muted-foreground mt-1.5 text-[11px] leading-snug">
                      Renewal filter uses policy end date on or before this date.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border-2 border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-card p-3 shadow-sm dark:border-amber-900/50 dark:from-amber-950/35 dark:to-card sm:col-span-2">
                  <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                    Renewal status
                  </Label>
                  <Select value={renewalFilter || "__all__"} onValueChange={(v) => setRenewalFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-10 bg-background/90 font-bold">
                      <SelectValue placeholder="All policies" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All policies</SelectItem>
                      <SelectItem value="pending">Pending renewal (ended by to-date)</SelectItem>
                      <SelectItem value="expired">Expired — renewal due</SelectItem>
                      <SelectItem value="due_2">Ends within 2 days</SelectItem>
                      <SelectItem value="due_8">Ends in 3–8 days</SelectItem>
                      <SelectItem value="due_30">Ends in 9–30 days</SelectItem>
                      <SelectItem value="due_60">Ends in 31–60 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <PolicyFilterMulti
                  label="Year"
                  placeholder="All years"
                  options={yearOptions}
                  selected={periodYears}
                  onChange={setPeriodYears}
                  accentClassName="border-amber-200/90 from-amber-50/95 to-card dark:border-amber-900/50 dark:from-amber-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Category"
                  placeholder="All categories"
                  options={categoryOptions}
                  selected={categoryIds}
                  onChange={setCategoryIds}
                  accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Policy type (product)"
                  placeholder="All types"
                  options={policyTypeFilterOptions}
                  selected={policyTypeIds}
                  onChange={setPolicyTypeIds}
                  accentClassName="border-rose-200/90 from-rose-50/95 to-card dark:border-rose-900/50 dark:from-rose-950/35 dark:to-card"
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
                  label="Area"
                  placeholder="All areas"
                  options={areaOptions}
                  selected={areas}
                  onChange={setAreas}
                  accentClassName="border-teal-200/90 from-teal-50/95 to-card dark:border-teal-900/50 dark:from-teal-950/35 dark:to-card"
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
                  label="Sum insured"
                  placeholder="All SI"
                  options={sumInsuredOptions}
                  selected={sumInsureds}
                  onChange={setSumInsureds}
                  accentClassName="border-orange-200/90 from-orange-50/95 to-card dark:border-orange-900/50 dark:from-orange-950/35 dark:to-card"
                />
                <PolicyFilterMulti
                  label="Group"
                  placeholder="All groups"
                  options={groupingOptions}
                  selected={policyGroupings}
                  onChange={setPolicyGroupings}
                  accentClassName="border-indigo-200/90 from-indigo-50/95 to-card dark:border-indigo-900/50 dark:from-indigo-950/35 dark:to-card"
                />
              </div>
              <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || exportBusy}
                  onClick={() => setExportDialogOpen(true)}
                >
                  <Download className="size-3.5" />
                  Export CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setSearchDraft("");
                    setSearchApplied("");
                    prevSearchApplied.current = "";
                    setDateFrom("");
                    setDateTo(todayFormDate());
                    setVillages([]);
                    setPeriodYears([]);
                    setPeriodMonths([]);
                    setCategoryIds([]);
                    setPolicyTypeIds([]);
                    setAreas([]);
                    setSumInsureds([]);
                    setPolicyGroupings([]);
                    setRenewalFilter("");
                    setSort("createdAt");
                    setPage(1);
                  }}
                >
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
              <Shield className="text-primary size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">SVKK IDs (grouped)</p>
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
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">On this page</p>
              <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl">
              <Users className="text-muted-foreground size-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Selected</p>
              <p className="text-2xl font-bold tabular-nums">{selectedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {canDel && selectedCount > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-destructive/25 bg-destructive/5 flex flex-col items-stretch justify-between gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center"
        >
          <p className="text-sm font-medium">
            <span className="text-destructive font-semibold">{selectedCount}</span> polic
            {selectedCount === 1 ? "y" : "ies"} selected for bulk actions
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setBulkOpen(true)}
          >
            <Trash2 className="size-3.5" />
            Delete selected
          </Button>
        </motion.div>
      ) : null}

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
                Policy register
              </CardTitle>
              <CardDescription>
                One row per SVKK ID — expand for year-wise premiums, references, and actions.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
              <Label htmlFor="policies-sort" className="text-muted-foreground text-xs font-medium">
                Sort order
              </Label>
              <Select
                value={sort}
                onValueChange={(v) => {
                  setSort(v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="policies-sort" className="cursor-pointer">
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
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-muted/80">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-muted-foreground font-sans text-xs font-semibold tracking-tight whitespace-nowrap"
                    >
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
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-8 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const original = row.original;
                return (
                  <Fragment key={row.id}>
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="font-bold">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expandedSvkkId === original.svkkPublicId ? (
                      <TableRow key={`${row.id}-years`}>
                        <TableCell colSpan={colCount} className="bg-muted/25 p-0">
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="border-primary/10 bg-linear-to-b from-muted/20 to-transparent space-y-4 border-t p-4 sm:p-5"
                          >
                            <p className="text-foreground text-sm font-semibold tracking-tight">
                              {yearQuickActionsTitle(
                                original.years,
                                rowYearAction?.svkkPublicId === original.svkkPublicId
                                  ? rowYearAction.kind
                                  : null,
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {original.years.map((y) => (
                                <Button
                                  key={`${y.policyId}-chip-${y.yearLabel}`}
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="border-primary/15 bg-primary/8 hover:bg-primary/12 shadow-sm"
                                  onClick={() => {
                                    if (
                                      rowYearAction?.svkkPublicId === original.svkkPublicId &&
                                      rowYearAction.kind === "edit"
                                    ) {
                                      navigatePolicyRoute(
                                        `/policies/${y.policyId}/edit?year=${encodeURIComponent(y.yearLabel)}`,
                                        router,
                                      );
                                      setRowYearAction(null);
                                      return;
                                    }
                                    if (
                                      rowYearAction?.svkkPublicId === original.svkkPublicId &&
                                      rowYearAction.kind === "receipt"
                                    ) {
                                      void openReceiptPreviewForRow(y.policyId, y.yearLabel).finally(() => {
                                        setRowYearAction(null);
                                      });
                                      return;
                                    }
                                    navigatePolicyRoute(
                                      `/policies/${y.policyId}?year=${encodeURIComponent(y.yearLabel)}`,
                                      router,
                                    );
                                  }}
                                >
                                  {yearChipLabel(y)} · {formatInrRupee(y.vkkPremium) ?? "—"}
                                </Button>
                              ))}
                            </div>
                            {rowYearAction?.svkkPublicId === original.svkkPublicId ? null : (
                              <PolicyListSnapshotPanel
                                row={original}
                                categoryByKey={categoryByKey}
                                policyTypeOptions={ddOptions.policyTypes}
                              />
                            )}
                          </motion.div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={colCount} className="h-32 text-center">
                  <div className="text-muted-foreground flex flex-col items-center gap-2 py-6">
                    <Search className="size-8 opacity-40" />
                    <p className="text-sm font-medium">No policies match these filters</p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="text-primary h-auto p-0"
                      onClick={() => {
                        setSearchDraft("");
                        setSearchApplied("");
                        prevSearchApplied.current = "";
                        setVillages([]);
                        setPeriodYears([]);
                        setPeriodMonths([]);
                        setCategoryIds([]);
                        setPolicyTypeIds([]);
                        setAreas([]);
                        setSumInsureds([]);
                        setPolicyGroupings([]);
                        setPage(1);
                      }}
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
            <span className="text-foreground font-medium">{selectedCount}</span> of {rows.length} on this page
            selected
            {total > 0 ? (
              <>
                {" "}
                · <span className="text-foreground font-medium">{total.toLocaleString()}</span> total
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="policies-page-size" className="text-muted-foreground whitespace-nowrap text-xs">
                Rows per page
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
        <DialogContent className="flex max-h-[90vh] w-[min(96vw,1280px)] max-w-[min(96vw,1280px)] flex-col gap-4 overflow-hidden sm:max-w-[min(96vw,1280px)]">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
            <DialogDescription>Print on paper or download as PDF.</DialogDescription>
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
              variant="outline"
              onClick={async () => {
                const tId = toast.loading("Preparing PDF…");
                try {
                  const ok = await downloadReceiptPreviewAsPdf(`${receiptFilenameHint}.pdf`);
                  if (ok) {
                    toast.success("PDF downloaded", { id: tId });
                  } else {
                    toast.error("Could not generate PDF", { id: tId });
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "PDF failed", { id: tId });
                }
              }}
            >
              Save as PDF
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!printReceiptPreview()) {
                  toast.error("Receipt not ready to print");
                }
              }}
            >
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PolicyCsvExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        exporting={exportBusy}
        onExport={exportPoliciesCsv}
      />
    </motion.div>
  );
}
