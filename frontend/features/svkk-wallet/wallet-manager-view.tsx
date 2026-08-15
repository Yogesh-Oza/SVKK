"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";
import {
  PolicyFilterMulti,
  type PolicyFilterOption,
} from "@/features/svkk-policies/policy-filter-multi";
import { todayFormDate } from "@/lib/svkk/form-date";
import { monthFilterOptionsFromMeta } from "@/lib/svkk/policy-period-months";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { getSvkkErrorCode, getSvkkErrorMessage } from "@/lib/svkk/api-error";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER } from "@/lib/svkk/policy-period-months";
import {
  canWalletClear,
  canWalletDebit,
  canWalletExport,
  canWalletImport,
  canWalletOpening,
  canWalletTopup,
} from "@/lib/svkk/permissions";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { cn } from "@/lib/utils";
import {
  Download,
  FileSpreadsheet,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  formatWalletDate,
  formatWalletDateTime,
  formatWalletInr,
  type WalletCsvImportResult,
  type WalletFieldMisRow,
  type WalletMisDimension,
  type WalletSummary,
  type WalletTxnPage,
} from "./wallet-types";
import { appendWalletTxnFilters } from "./wallet-txn-query";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthLabel(): string {
  return POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER[new Date().getMonth()];
}

function MisSection({
  title,
  rows,
  labelHeader,
  canExport,
  exportBusy,
  onExport,
}: {
  title: string;
  rows: WalletFieldMisRow[];
  labelHeader: string;
  canExport: boolean;
  exportBusy: boolean;
  onExport: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
        </div>
        {canExport ? (
          <Button variant="secondary" size="sm" disabled={exportBusy} onClick={onExport}>
            <Download className="size-4 mr-1" />
            Export MIS CSV
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {(rows.length
            ? rows
            : [{ key: "—", count: 0, amount: "0" }]
          ).slice(0, 12).map((row) => (
            <div
              key={`${labelHeader}-${row.key}`}
              className="rounded-lg border border-violet-100 bg-gradient-to-br from-white to-violet-50/80 p-3 border-l-4 border-l-violet-600"
            >
              <div className="text-muted-foreground text-xs truncate" title={row.key}>
                {row.key}
              </div>
              <div className="font-semibold text-lg mt-1 text-violet-900">{formatWalletInr(row.amount)}</div>
              <div className="text-muted-foreground text-xs mt-1">{row.count} entries</div>
            </div>
          ))}
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labelHeader}</TableHead>
                <TableHead className="text-right">No. of Entries</TableHead>
                <TableHead className="text-right">Wallet Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No usage yet
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={`${labelHeader}-t-${row.key}`}>
                    <TableCell>{row.key}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right font-medium">{formatWalletInr(row.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function WalletManagerView() {
  const { user } = useSvkkAuth();
  const perms = user?.permissions ?? [];
  const missingUrl = !getSvkkApiBase();
  const { options: ddOptions } = useDropdownOptions();

  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const [filterMeta, setFilterMeta] = useState<{
    villages?: string[];
    areas?: string[];
    sumInsuredValues?: string[];
    periodYearTexts?: string[];
    periodMonthTexts?: string[];
    policyGroupings?: string[];
  } | null>(null);

  const villageOptions = useMemo(() => {
    const fromMeta = filterMeta?.villages ?? [];
    const fromDd = (ddOptions.VILLAGE ?? []).map((o) => o.value || o.label).filter(Boolean);
    return [...new Set([...fromMeta, ...fromDd])].sort((a, b) => a.localeCompare(b));
  }, [filterMeta?.villages, ddOptions.VILLAGE]);
  const categoryOptions = useMemo(() => {
    const fromAdmin = (ddOptions.categories ?? [])
      .map((c) => (c.label || c.value || "").trim())
      .filter(Boolean);
    return [...new Set(fromAdmin)].sort((a, b) => a.localeCompare(b));
  }, [ddOptions.categories]);
  const groupOptions = useMemo(() => {
    const fromMeta = filterMeta?.policyGroupings ?? [];
    const fromDd = (ddOptions.policyGroupings ?? []).map((g) => g.value || g.label).filter(Boolean);
    return [...new Set([...fromMeta, ...fromDd])].sort((a, b) => a.localeCompare(b));
  }, [filterMeta?.policyGroupings, ddOptions.policyGroupings]);
  const policyTypeOptions = useMemo(
    () =>
      [...new Set((ddOptions.policyTypes ?? []).map((t) => t.label || t.value).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [ddOptions.policyTypes],
  );

  const yearFilterOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.periodYearTexts ?? []).map((v) => ({ value: v, label: v })),
    [filterMeta?.periodYearTexts],
  );
  const monthFilterOptions = useMemo<PolicyFilterOption[]>(
    () => monthFilterOptionsFromMeta(filterMeta?.periodMonthTexts ?? []),
    [filterMeta?.periodMonthTexts],
  );
  const areaFilterOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.areas ?? []).map((v) => ({ value: v, label: v })),
    [filterMeta?.areas],
  );
  const villageFilterOptions = useMemo<PolicyFilterOption[]>(
    () => villageOptions.map((v) => ({ value: v, label: v })),
    [villageOptions],
  );
  const sumInsuredFilterOptions = useMemo<PolicyFilterOption[]>(
    () => (filterMeta?.sumInsuredValues ?? []).map((v) => ({ value: v, label: v })),
    [filterMeta?.sumInsuredValues],
  );
  const groupFilterOptions = useMemo<PolicyFilterOption[]>(
    () => groupOptions.map((g) => ({ value: g, label: g })),
    [groupOptions],
  );
  const categoryFilterOptions = useMemo<PolicyFilterOption[]>(
    () => categoryOptions.map((c) => ({ value: c, label: c })),
    [categoryOptions],
  );
  const policyTypeFilterOptions = useMemo<PolicyFilterOption[]>(
    () => policyTypeOptions.map((t) => ({ value: t, label: t })),
    [policyTypeOptions],
  );

  const [openingAmount, setOpeningAmount] = useState("");
  const [openingDate, setOpeningDate] = useState(todayIsoDate);
  const [openingBusy, setOpeningBusy] = useState(false);

  const [topupAmount, setTopupAmount] = useState("");
  const [topupDate, setTopupDate] = useState(todayIsoDate);
  const [topupRemark, setTopupRemark] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);

  const [debitDate, setDebitDate] = useState(todayIsoDate);
  const [debitMonth, setDebitMonth] = useState(currentMonthLabel);
  const [debitYear, setDebitYear] = useState(String(new Date().getFullYear()));
  const [debitCategory, setDebitCategory] = useState("");
  const [debitHolder, setDebitHolder] = useState("");
  const [debitVillage, setDebitVillage] = useState("");
  const [debitGroup, setDebitGroup] = useState("");
  const [debitPolicyType, setDebitPolicyType] = useState("");
  const [debitCdAccount, setDebitCdAccount] = useState("");
  const [debitCdAmount, setDebitCdAmount] = useState("");
  const [debitRemark, setDebitRemark] = useState("");
  const [debitAmount, setDebitAmount] = useState("");
  const [debitBusy, setDebitBusy] = useState(false);
  const [negativeConfirmOpen, setNegativeConfirmOpen] = useState(false);

  const [adjAmount, setAdjAmount] = useState("");
  const [adjDirection, setAdjDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjRemark, setAdjRemark] = useState("");
  const [adjCategory, setAdjCategory] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjNegativeOpen, setAdjNegativeOpen] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<WalletCsvImportResult | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayFormDate);
  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterPolicyTypes, setFilterPolicyTypes] = useState<string[]>([]);
  const [filterMonths, setFilterMonths] = useState<string[]>([]);
  const [filterAreas, setFilterAreas] = useState<string[]>([]);
  const [filterVillages, setFilterVillages] = useState<string[]>([]);
  const [filterSumInsureds, setFilterSumInsureds] = useState<string[]>([]);
  const [filterGroups, setFilterGroups] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [txnPage, setTxnPage] = useState<WalletTxnPage | null>(null);
  const [txnLoading, setTxnLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearConfirmStep, setClearConfirmStep] = useState<1 | 2>(1);
  const [restorePayload, setRestorePayload] = useState<{
    wallet_balance?: unknown;
    wallet_last_updated?: unknown;
    wallet_transactions: Array<Record<string, unknown>>;
  } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const loadSummary = useCallback(async () => {
    if (missingUrl) return;
    setSummaryLoading(true);
    setSummaryErr(null);
    try {
      const res = await svkkJson<{ success: boolean; data: WalletSummary }>("/wallet");
      setSummary(res.data);
    } catch (e) {
      setSummaryErr(getSvkkErrorMessage(e, "Failed to load wallet"));
    } finally {
      setSummaryLoading(false);
    }
  }, [missingUrl]);

  const txnFilters = useMemo(
    () => ({
      q: search,
      dateFrom,
      dateTo,
      categories: filterCategories,
      villages: filterVillages,
      groups: filterGroups,
      months: filterMonths,
      years: filterYears,
      policyTypes: filterPolicyTypes,
      areas: filterAreas,
      sumInsureds: filterSumInsureds,
      page,
      pageSize,
    }),
    [
      search,
      dateFrom,
      dateTo,
      filterCategories,
      filterVillages,
      filterGroups,
      filterMonths,
      filterYears,
      filterPolicyTypes,
      filterAreas,
      filterSumInsureds,
      page,
      pageSize,
    ],
  );

  const loadTransactions = useCallback(async () => {
    if (missingUrl) return;
    setTxnLoading(true);
    try {
      const params = new URLSearchParams();
      appendWalletTxnFilters(params, txnFilters);
      const res = await svkkJson<{ success: boolean; data: WalletTxnPage }>(
        `/wallet/transactions?${params}`,
      );
      setTxnPage(res.data);
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Failed to load transactions"));
    } finally {
      setTxnLoading(false);
    }
  }, [missingUrl, txnFilters]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadTransactions()]);
  }, [loadSummary, loadTransactions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial / refresh fetch
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- list fetch on filters/page
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    if (missingUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const f = await svkkJson<{
          villages?: string[];
          areas?: string[];
          sumInsuredValues?: string[];
          periodYearTexts?: string[];
          periodMonthTexts?: string[];
          policyGroupings?: string[];
        }>("/policies/filters");
        if (!cancelled) setFilterMeta(f);
      } catch {
        /* non-fatal — free text / empty select */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingUrl]);

  async function submitOpening() {
    setOpeningBusy(true);
    try {
      await backendApi.post("/wallet/opening", {
        amount: openingAmount,
        dateOfSubmission: openingDate || undefined,
      });
      toast.success("Opening balance set");
      setOpeningAmount("");
      setOpeningDate(todayIsoDate());
      setPage(1);
      await refreshAll();
    } catch (e) {
      if (getSvkkErrorCode(e) === "WALLET_OPENING_EXISTS") {
        toast.error(
          getSvkkErrorMessage(
            e,
            "Opening balance can only be set when the wallet has no transactions. Use Top-up or Manual Adjustment instead.",
          ),
        );
      } else {
        toast.error(getSvkkErrorMessage(e, "Failed to set opening balance"));
      }
    } finally {
      setOpeningBusy(false);
    }
  }

  async function submitTopup() {
    setTopupBusy(true);
    try {
      await backendApi.post("/wallet/topup", {
        amount: topupAmount,
        remark: topupRemark || undefined,
        dateOfSubmission: topupDate || undefined,
      });
      toast.success("Top-up added");
      setTopupAmount("");
      setTopupDate(todayIsoDate());
      setTopupRemark("");
      await refreshAll();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Top-up failed"));
    } finally {
      setTopupBusy(false);
    }
  }

  function resetDebitForm() {
    setDebitDate(todayIsoDate());
    setDebitMonth(currentMonthLabel());
    setDebitYear(String(new Date().getFullYear()));
    setDebitCategory("");
    setDebitHolder("");
    setDebitVillage("");
    setDebitGroup("");
    setDebitPolicyType("");
    setDebitCdAccount("");
    setDebitCdAmount("");
    setDebitRemark("");
    setDebitAmount("");
  }

  async function submitDebit(allowNegative: boolean) {
    setDebitBusy(true);
    try {
      await backendApi.post("/wallet/debit", {
        category: debitCategory,
        amount: debitAmount,
        dateOfSubmission: debitDate || undefined,
        month: debitMonth || undefined,
        year: debitYear || undefined,
        holderName: debitHolder || undefined,
        village: debitVillage || undefined,
        group: debitGroup || undefined,
        policyType: debitPolicyType || undefined,
        cdAccountUsed: debitCdAccount || undefined,
        cdAmount: debitCdAmount || undefined,
        remark: debitRemark || undefined,
        particulars: debitRemark || undefined,
        allowNegative: allowNegative || undefined,
      });
      toast.success("Amount deducted");
      resetDebitForm();
      setNegativeConfirmOpen(false);
      await refreshAll();
    } catch (e) {
      if (getSvkkErrorCode(e) === "WALLET_INSUFFICIENT" && !allowNegative) {
        setNegativeConfirmOpen(true);
      } else {
        toast.error(getSvkkErrorMessage(e, "Deduction failed"));
      }
    } finally {
      setDebitBusy(false);
    }
  }

  async function submitAdjustment(allowNegative: boolean) {
    setAdjBusy(true);
    try {
      await backendApi.post("/wallet/adjustment", {
        amount: adjAmount,
        direction: adjDirection,
        remark: adjRemark || undefined,
        category: adjCategory || undefined,
        allowNegative: allowNegative || undefined,
      });
      toast.success("Adjustment saved");
      setAdjAmount("");
      setAdjRemark("");
      setAdjCategory("");
      setAdjNegativeOpen(false);
      await refreshAll();
    } catch (e) {
      if (
        getSvkkErrorCode(e) === "WALLET_INSUFFICIENT" &&
        !allowNegative &&
        adjDirection === "DEBIT"
      ) {
        setAdjNegativeOpen(true);
      } else {
        toast.error(getSvkkErrorMessage(e, "Adjustment failed"));
      }
    } finally {
      setAdjBusy(false);
    }
  }

  async function submitCsv() {
    if (!csvFile) {
      toast.error("Please select a CSV file");
      return;
    }
    setCsvBusy(true);
    setCsvResult(null);
    try {
      const fd = new FormData();
      fd.append("file", csvFile);
      const res = await backendApi.post<{ success: boolean; data: WalletCsvImportResult }>(
        "/wallet/import-csv",
        fd,
      );
      setCsvResult(res.data.data);
      toast.success("CSV processed");
      setCsvFile(null);
      await refreshAll();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "CSV import failed"));
    } finally {
      setCsvBusy(false);
    }
  }

  async function downloadSample() {
    setSampleBusy(true);
    try {
      const res = await backendApi.get("/wallet/export-sample.csv", { responseType: "blob" });
      downloadBlob(res.data as Blob, "sample_wallet_usage_with_category.csv");
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Sample download failed"));
    } finally {
      setSampleBusy(false);
    }
  }

  async function exportTransactions() {
    setExportBusy(true);
    try {
      const params = new URLSearchParams();
      appendWalletTxnFilters(params, {
        q: search,
        dateFrom,
        dateTo,
        categories: filterCategories,
        villages: filterVillages,
        groups: filterGroups,
        months: filterMonths,
        years: filterYears,
        policyTypes: filterPolicyTypes,
        areas: filterAreas,
        sumInsureds: filterSumInsureds,
      });
      const res = await backendApi.get(`/wallet/transactions/export.csv?${params}`, {
        responseType: "blob",
      });
      downloadBlob(res.data as Blob, "wallet_transactions.csv");
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Export failed"));
    } finally {
      setExportBusy(false);
    }
  }

  function resetTxnFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo(todayFormDate());
    setFilterYears([]);
    setFilterCategories([]);
    setFilterPolicyTypes([]);
    setFilterMonths([]);
    setFilterAreas([]);
    setFilterVillages([]);
    setFilterSumInsureds([]);
    setFilterGroups([]);
    setPage(1);
  }

  async function exportMis(dimension: WalletMisDimension, filename: string) {
    setExportBusy(true);
    try {
      const res = await backendApi.get(`/wallet/mis/export.csv?dimension=${dimension}`, {
        responseType: "blob",
      });
      downloadBlob(res.data as Blob, filename);
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "MIS export failed"));
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadBackup() {
    setExportBusy(true);
    try {
      const res = await backendApi.get("/wallet/backup.json", { responseType: "blob" });
      downloadBlob(res.data as Blob, "puja_cd_account_wallet_backup.json");
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Backup failed"));
    } finally {
      setExportBusy(false);
    }
  }

  async function onRestoreFileSelected(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        wallet_balance?: unknown;
        wallet_last_updated?: unknown;
        wallet_transactions?: unknown;
      };
      if (!Array.isArray(parsed.wallet_transactions)) {
        toast.error("Invalid backup file: missing wallet_transactions array");
        return;
      }
      setRestorePayload({
        wallet_balance: parsed.wallet_balance,
        wallet_last_updated: parsed.wallet_last_updated,
        wallet_transactions: parsed.wallet_transactions as Array<Record<string, unknown>>,
      });
      setRestoreConfirmOpen(true);
    } catch {
      toast.error("Could not read backup JSON");
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  async function submitRestore() {
    if (!restorePayload) return;
    setRestoreBusy(true);
    try {
      await backendApi.post("/wallet/restore", { confirm: true, backup: restorePayload });
      toast.success("Wallet restored from backup");
      setRestoreConfirmOpen(false);
      setRestorePayload(null);
      setPage(1);
      await refreshAll();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Restore failed"));
    } finally {
      setRestoreBusy(false);
    }
  }

  function openClearConfirm() {
    setClearConfirmStep(1);
    setClearConfirmOpen(true);
  }

  function closeClearConfirm() {
    if (clearBusy) return;
    setClearConfirmOpen(false);
    setClearConfirmStep(1);
  }

  async function submitClearWallet() {
    setClearBusy(true);
    try {
      await backendApi.post("/wallet/clear", { confirm: true });
      toast.success("Wallet balance and all entries have been reset");
      setClearConfirmOpen(false);
      setClearConfirmStep(1);
      setPage(1);
      await refreshAll();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Reset failed"));
    } finally {
      setClearBusy(false);
    }
  }

  if (missingUrl) {
    return (
      <Alert variant="destructive">
        <AlertTitle>API not configured</AlertTitle>
        <AlertDescription>Set NEXT_PUBLIC_API_URL to use the Wallet / CD module.</AlertDescription>
      </Alert>
    );
  }

  const categoryMis = useMemo(() => {
    const byKey = new Map(
      (summary?.mis ?? []).map((row) => [row.category, row] as const),
    );
    const keys = [
      ...new Set([
        ...categoryOptions,
        ...(summary?.mis ?? []).map((r) => r.category).filter(Boolean),
      ]),
    ];
    if (keys.length === 0) return [];
    return keys.map((category) => byKey.get(category) ?? { category, count: 0, amount: "0" });
  }, [categoryOptions, summary?.mis]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Wallet className="size-6" />
          Wallet / CD Account Manager
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wallet top-up, CD usage deduction, and MIS by category, village, group, and policy type
        </p>
      </div>

      {summaryErr ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load wallet</AlertTitle>
          <AlertDescription>{summaryErr}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-l-4 border-l-primary bg-gradient-to-br from-white to-blue-50/60 dark:from-card dark:to-blue-950/20">
          <CardHeader className="pb-2">
            <CardDescription>Current Wallet Balance</CardDescription>
            <CardTitle className="text-3xl text-primary">
              {summaryLoading ? <Skeleton className="h-9 w-40" /> : formatWalletInr(summary?.currentBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm space-y-2">
            <div>Last updated: {summaryLoading ? "…" : formatWalletDateTime(summary?.lastUpdatedAt)}</div>
            {canWalletClear(perms) ? (
              <Button
                variant="destructive"
                size="sm"
                className="mt-2.5"
                disabled={clearBusy || summaryLoading}
                onClick={openClearConfirm}
              >
                <Trash2 className="size-4 mr-1" />
                Reset Wallet & All Entries
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Top-Up</CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : formatWalletInr(summary?.totalTopUp)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Used / Deducted</CardDescription>
            <CardTitle className="text-2xl text-red-600 dark:text-red-400">
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : formatWalletInr(summary?.totalUsed)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Refund / Credit</CardDescription>
            <CardTitle className="text-2xl text-amber-600 dark:text-amber-400">
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : formatWalletInr(summary?.totalRefund)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today Usage</CardDescription>
            <CardTitle className="text-2xl">
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : formatWalletInr(summary?.todayUsage)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This Month Usage</CardDescription>
            <CardTitle className="text-2xl">
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : formatWalletInr(summary?.thisMonthUsage)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
          <div>
            <CardTitle>Category-wise MIS</CardTitle>
            <CardDescription>Debit usage only — categories from Admin</CardDescription>
          </div>
          {canWalletExport(perms) ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={exportBusy}
              onClick={() => void exportMis("category", "wallet_category_mis.csv")}
            >
              <Download className="size-4 mr-1" />
              Export MIS CSV
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
            {categoryMis.length === 0 ? (
              <p className="text-muted-foreground text-sm">No categories in Admin yet</p>
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {categoryMis.map((row) => (
                  <div
                    key={row.category}
                    className="rounded-lg border border-violet-100 bg-gradient-to-br from-white to-violet-50/80 p-3 border-l-4 border-l-violet-600"
                  >
                    <div className="text-muted-foreground text-xs truncate" title={row.category}>
                      {row.category}
                    </div>
                    <div className="font-semibold text-lg mt-1 text-violet-900">{formatWalletInr(row.amount)}</div>
                    <div className="text-muted-foreground text-xs mt-1">{row.count} entries</div>
                  </div>
                ))}
              </div>
            )}
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">No. of Entries</TableHead>
                  <TableHead className="text-right">Wallet Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryMis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No usage yet
                    </TableCell>
                  </TableRow>
                ) : (
                  categoryMis.map((row) => (
                    <TableRow key={`mis-t-${row.category}`}>
                      <TableCell>
                        <Badge variant="secondary">{row.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right font-medium">{formatWalletInr(row.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <MisSection
        title="Village-wise MIS"
        rows={summary?.misVillage ?? []}
        labelHeader="Village"
        canExport={canWalletExport(perms)}
        exportBusy={exportBusy}
        onExport={() => void exportMis("village", "wallet_village_mis.csv")}
      />
      <MisSection
        title="Group-wise MIS"
        rows={summary?.misGroup ?? []}
        labelHeader="Group"
        canExport={canWalletExport(perms)}
        exportBusy={exportBusy}
        onExport={() => void exportMis("group", "wallet_group_mis.csv")}
      />
      <MisSection
        title="Policy Type-wise MIS"
        rows={summary?.misPolicyType ?? []}
        labelHeader="Policy Type"
        canExport={canWalletExport(perms)}
        exportBusy={exportBusy}
        onExport={() => void exportMis("policyType", "wallet_policy_type_mis.csv")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Set / Top-Up Wallet</CardTitle>
            <CardDescription>
              Opening balance can only be set when the ledger is empty. Top-up adds to the current
              balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canWalletOpening(perms) ? (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="opening-amount">Opening balance</Label>
                    <Input
                      id="opening-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 5000"
                      value={openingAmount}
                      onChange={(e) => setOpeningAmount(e.target.value)}
                      disabled={openingBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="opening-date">Date</Label>
                    <Input
                      id="opening-date"
                      type="date"
                      value={openingDate}
                      onChange={(e) => setOpeningDate(e.target.value)}
                      disabled={openingBusy}
                    />
                  </div>
                </div>
                <Button
                  disabled={openingBusy || !openingAmount}
                  onClick={() => void submitOpening()}
                >
                  Set Opening Balance
                </Button>
              </div>
            ) : null}

            {canWalletTopup(perms) ? (
              <div className="space-y-2 border-t pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="topup-amount">Top-up amount</Label>
                    <Input
                      id="topup-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 1000"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      disabled={topupBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="topup-date">Date</Label>
                    <Input
                      id="topup-date"
                      type="date"
                      value={topupDate}
                      onChange={(e) => setTopupDate(e.target.value)}
                      disabled={topupBusy}
                    />
                  </div>
                </div>
                <Label htmlFor="topup-remark">Remark</Label>
                <Input
                  id="topup-remark"
                  placeholder="Cash top-up / UPI top-up"
                  value={topupRemark}
                  onChange={(e) => setTopupRemark(e.target.value)}
                  disabled={topupBusy}
                />
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={topupBusy || !topupAmount}
                  onClick={() => void submitTopup()}
                >
                  Add Top-Up
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload Usage CSV</CardTitle>
            <CardDescription>
              Columns: Date of Submission, Month, Year, Type, Holder&apos;s Name, Village, Category,
              Group, Policy Type, CD Account Used, CD Amount, Remark, Deposited/Deducted Amount.
              Required: Amount (or Deposited/Deducted Amount) and Category.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canWalletImport(perms) ? (
              <>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={csvBusy}
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={csvBusy || !csvFile} onClick={() => void submitCsv()}>
                    <Upload className="size-4 mr-1" />
                    {csvBusy ? "Uploading…" : "Upload & Deduct"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={sampleBusy}
                    onClick={() => void downloadSample()}
                  >
                    <FileSpreadsheet className="size-4 mr-1" />
                    Download Sample CSV
                  </Button>
                </div>
                {csvResult ? (
                  <Alert>
                    <AlertTitle>CSV processed</AlertTitle>
                    <AlertDescription className="space-y-1">
                      <div>
                        Rows deducted: <b>{csvResult.rowsDeducted}</b>
                      </div>
                      <div>
                        Skipped rows: <b>{csvResult.skippedRows}</b>
                      </div>
                      <div>
                        Invalid category rows: <b>{csvResult.invalidCategoryRows}</b>
                      </div>
                      <div>
                        Total deducted: <b>{formatWalletInr(csvResult.totalDeducted)}</b>
                      </div>
                      <div>
                        Remaining balance: <b>{formatWalletInr(csvResult.remainingBalance)}</b>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">You do not have permission to import CSV.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {canWalletDebit(perms) ? (
        <Card>
          <CardHeader>
            <CardTitle>Manual Usage Deduction</CardTitle>
            <CardDescription>
              Always records a Debit (usage) entry. Use Top-Up for credits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="debit-date">Date of Submission</Label>
                <Input
                  id="debit-date"
                  type="date"
                  value={debitDate}
                  onChange={(e) => setDebitDate(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={debitMonth || undefined}
                  onValueChange={setDebitMonth}
                  disabled={debitBusy}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-year">Year</Label>
                <Input
                  id="debit-year"
                  type="number"
                  placeholder="e.g. 2026"
                  value={debitYear}
                  onChange={(e) => setDebitYear(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={debitCategory || undefined}
                  onValueChange={setDebitCategory}
                  disabled={debitBusy}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-holder">Holder&apos;s Name</Label>
                <Input
                  id="debit-holder"
                  placeholder="Holder's Name"
                  value={debitHolder}
                  onChange={(e) => setDebitHolder(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
              <div className="space-y-2">
                <Label>Village</Label>
                {villageOptions.length ? (
                  <Select
                    value={debitVillage || undefined}
                    onValueChange={setDebitVillage}
                    disabled={debitBusy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Village" />
                    </SelectTrigger>
                    <SelectContent>
                      {villageOptions.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Village"
                    value={debitVillage}
                    onChange={(e) => setDebitVillage(e.target.value)}
                    disabled={debitBusy}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Group</Label>
                {groupOptions.length ? (
                  <Select
                    value={debitGroup || undefined}
                    onValueChange={setDebitGroup}
                    disabled={debitBusy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Group"
                    value={debitGroup}
                    onChange={(e) => setDebitGroup(e.target.value)}
                    disabled={debitBusy}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Policy Type</Label>
                {policyTypeOptions.length ? (
                  <Select
                    value={debitPolicyType || undefined}
                    onValueChange={setDebitPolicyType}
                    disabled={debitBusy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Policy Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {policyTypeOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Policy Type"
                    value={debitPolicyType}
                    onChange={(e) => setDebitPolicyType(e.target.value)}
                    disabled={debitBusy}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-cd-account">CD Account Used</Label>
                <Input
                  id="debit-cd-account"
                  placeholder="CD Account Used"
                  value={debitCdAccount}
                  onChange={(e) => setDebitCdAccount(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-cd-amount">CD Amount</Label>
                <Input
                  id="debit-cd-amount"
                  type="number"
                  step="0.01"
                  placeholder="CD Amount"
                  value={debitCdAmount}
                  onChange={(e) => setDebitCdAmount(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-remark">Remark</Label>
                <Input
                  id="debit-remark"
                  placeholder="e.g. Printing Charge"
                  value={debitRemark}
                  onChange={(e) => setDebitRemark(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-amount">Deposited / Deducted Amount</Label>
                <Input
                  id="debit-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 250"
                  value={debitAmount}
                  onChange={(e) => setDebitAmount(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
            </div>
            <Button
              variant="destructive"
              disabled={debitBusy || !debitCategory || !debitAmount}
              onClick={() => void submitDebit(false)}
            >
              Deduct Manually
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canWalletDebit(perms) ? (
        <Card>
          <CardHeader>
            <CardTitle>Manual Adjustment</CardTitle>
            <CardDescription>Credit or debit a one-off adjustment to the wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select
                  value={adjDirection}
                  onValueChange={(v) => setAdjDirection(v as "CREDIT" | "DEBIT")}
                  disabled={adjBusy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adj-amount">Amount</Label>
                <Input
                  id="adj-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 100"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  disabled={adjBusy}
                />
              </div>
              <div className="space-y-2">
                <Label>Category (optional)</Label>
                <Select
                  value={adjCategory || "none"}
                  onValueChange={(v) => setAdjCategory(v === "none" ? "" : v)}
                  disabled={adjBusy}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adj-remark">Remark</Label>
                <Input
                  id="adj-remark"
                  placeholder="Adjustment remark"
                  value={adjRemark}
                  onChange={(e) => setAdjRemark(e.target.value)}
                  disabled={adjBusy}
                />
              </div>
            </div>
            <Button
              disabled={adjBusy || !adjAmount}
              onClick={() => void submitAdjustment(false)}
              className={adjDirection === "DEBIT" ? undefined : "bg-emerald-600 hover:bg-emerald-700"}
              variant={adjDirection === "DEBIT" ? "destructive" : "default"}
            >
              Apply Adjustment
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>Search and filter the ledger</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWalletExport(perms) ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={exportBusy}
                onClick={() => void downloadBackup()}
              >
                Backup Wallet Data
              </Button>
            ) : null}
            {canWalletClear(perms) ? (
              <>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => void onRestoreFileSelected(e.target.files?.[0] ?? null)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={restoreBusy}
                  onClick={() => restoreInputRef.current?.click()}
                >
                  <RotateCcw className="size-4 mr-1" />
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={clearBusy}
                  onClick={openClearConfirm}
                >
                  <Trash2 className="size-4 mr-1" />
                  Clear All Data
                </Button>
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search transaction…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border-2 border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
              <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                From date
              </Label>
              <PolicyDateInput
                value={dateFrom}
                onValueChange={(v) => {
                  setDateFrom(v);
                  setPage(1);
                }}
                className="h-10 bg-background/90 font-bold"
              />
            </div>
            <div className="rounded-xl border-2 border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-card p-3 shadow-sm dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card">
              <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
                To date
              </Label>
              <PolicyDateInput
                value={dateTo}
                onValueChange={(v) => {
                  setDateTo(v);
                  setPage(1);
                }}
                className="h-10 bg-background/90 font-bold"
              />
            </div>
            <PolicyFilterMulti
              label="Year"
              placeholder="All years"
              options={yearFilterOptions}
              selected={filterYears}
              onChange={(next) => {
                setFilterYears(next);
                setPage(1);
              }}
              accentClassName="border-amber-200/90 from-amber-50/95 to-card dark:border-amber-900/50 dark:from-amber-950/35 dark:to-card"
            />
            <PolicyFilterMulti
              label="Category"
              placeholder="All categories"
              options={categoryFilterOptions}
              selected={filterCategories}
              onChange={(next) => {
                setFilterCategories(next);
                setPage(1);
              }}
              accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
            />
            <PolicyFilterMulti
              label="Policy type (product)"
              placeholder="All types"
              options={policyTypeFilterOptions}
              selected={filterPolicyTypes}
              onChange={(next) => {
                setFilterPolicyTypes(next);
                setPage(1);
              }}
              accentClassName="border-rose-200/90 from-rose-50/95 to-card dark:border-rose-900/50 dark:from-rose-950/35 dark:to-card"
            />
            <PolicyFilterMulti
              label="Month"
              placeholder="All months"
              options={monthFilterOptions}
              selected={filterMonths}
              onChange={(next) => {
                setFilterMonths(next);
                setPage(1);
              }}
              accentClassName="border-sky-200/90 from-sky-50/95 to-card dark:border-sky-900/50 dark:from-sky-950/35 dark:to-card"
              popoverContentClassName="max-h-[min(22rem,70vh)]"
            />
            <PolicyFilterMulti
              label="Area"
              placeholder="All areas"
              options={areaFilterOptions}
              selected={filterAreas}
              onChange={(next) => {
                setFilterAreas(next);
                setPage(1);
              }}
              accentClassName="border-teal-200/90 from-teal-50/95 to-card dark:border-teal-900/50 dark:from-teal-950/35 dark:to-card"
            />
            <PolicyFilterMulti
              label="Village"
              placeholder="All villages"
              options={villageFilterOptions}
              selected={filterVillages}
              onChange={(next) => {
                setFilterVillages(next);
                setPage(1);
              }}
              accentClassName="border-emerald-200/90 from-emerald-50/95 to-card dark:border-emerald-900/50 dark:from-emerald-950/35 dark:to-card"
            />
            <PolicyFilterMulti
              label="Sum insured"
              placeholder="All SI"
              options={sumInsuredFilterOptions}
              selected={filterSumInsureds}
              onChange={(next) => {
                setFilterSumInsureds(next);
                setPage(1);
              }}
              accentClassName="border-orange-200/90 from-orange-50/95 to-card dark:border-orange-900/50 dark:from-orange-950/35 dark:to-card"
            />
            <PolicyFilterMulti
              label="Group"
              placeholder="All groups"
              options={groupFilterOptions}
              selected={filterGroups}
              onChange={(next) => {
                setFilterGroups(next);
                setPage(1);
              }}
              accentClassName="border-indigo-200/90 from-indigo-50/95 to-card dark:border-indigo-900/50 dark:from-indigo-950/35 dark:to-card"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWalletExport(perms) ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="gap-1.5"
                disabled={exportBusy}
                onClick={() => void exportTransactions()}
              >
                <Download className="size-3.5" />
                Export CSV
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={resetTxnFilters}>
              <RotateCcw className="size-3.5" />
              Reset filters
            </Button>
          </div>

          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date of Submission</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Holder&apos;s Name</TableHead>
                  <TableHead>Village</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Policy Type</TableHead>
                  <TableHead>CD Account Used</TableHead>
                  <TableHead className="text-right">CD Amount</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead className="text-right">Deposited / Deducted</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txnLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={14}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : !txnPage?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  txnPage.items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatWalletDate(t.dateOfSubmission ?? t.date)}
                      </TableCell>
                      <TableCell>{t.month || "—"}</TableCell>
                      <TableCell>{t.year || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            String(t.type).toUpperCase().includes("DEBIT")
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800",
                          )}
                        >
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.holderName || "—"}</TableCell>
                      <TableCell>{t.village || "—"}</TableCell>
                      <TableCell>
                        {t.category ? <Badge variant="secondary">{t.category}</Badge> : "—"}
                      </TableCell>
                      <TableCell>{t.group || "—"}</TableCell>
                      <TableCell>{t.policyType || "—"}</TableCell>
                      <TableCell>{t.cdAccountUsed || "—"}</TableCell>
                      <TableCell className="text-right">
                        {t.cdAmount != null ? formatWalletInr(t.cdAmount) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate" title={t.remark || t.particulars || ""}>
                        {t.remark || t.particulars || "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatWalletInr(t.amount)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatWalletInr(t.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {txnPage && txnPage.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {txnPage.page} of {txnPage.totalPages} ({txnPage.total} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || txnLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= txnPage.totalPages || txnLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={negativeConfirmOpen} onOpenChange={setNegativeConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet will go negative</DialogTitle>
            <DialogDescription>
              Amount is greater than the current wallet balance. Continue and allow a negative
              balance?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={debitBusy} onClick={() => setNegativeConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={debitBusy} onClick={() => void submitDebit(true)}>
              {debitBusy ? "Deducting…" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjNegativeOpen} onOpenChange={setAdjNegativeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet will go negative</DialogTitle>
            <DialogDescription>
              This debit adjustment exceeds the current balance. Continue anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={adjBusy} onClick={() => setAdjNegativeOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={adjBusy} onClick={() => void submitAdjustment(true)}>
              {adjBusy ? "Saving…" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore wallet from backup?</DialogTitle>
            <DialogDescription>
              This clears the current ledger and replays{" "}
              {restorePayload?.wallet_transactions.length ?? 0} transaction(s) from the backup file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={restoreBusy}
              onClick={() => {
                setRestoreConfirmOpen(false);
                setRestorePayload(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={restoreBusy} onClick={() => void submitRestore()}>
              {restoreBusy ? "Restoring…" : "Confirm restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clearConfirmOpen}
        onOpenChange={(open) => {
          if (!open) closeClearConfirm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {clearConfirmStep === 1 ? "Reset wallet & all entries?" : "Are you absolutely sure?"}
            </DialogTitle>
            <DialogDescription>
              {clearConfirmStep === 1
                ? "This will permanently delete the wallet balance and ALL transaction entries. This cannot be undone."
                : "Consider using Backup Wallet Data first if you have not already. After reset the balance will be ₹0.00 and you can set a new opening balance."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={clearBusy} onClick={closeClearConfirm}>
              Cancel
            </Button>
            {clearConfirmStep === 1 ? (
              <Button variant="destructive" disabled={clearBusy} onClick={() => setClearConfirmStep(2)}>
                Continue
              </Button>
            ) : (
              <Button variant="destructive" disabled={clearBusy} onClick={() => void submitClearWallet()}>
                {clearBusy ? "Resetting…" : "Reset Wallet & All Entries"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
