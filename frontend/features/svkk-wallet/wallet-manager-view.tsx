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
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { getSvkkErrorCode, getSvkkErrorMessage } from "@/lib/svkk/api-error";
import { getSvkkApiBase } from "@/lib/svkk/config";
import {
  canWalletClear,
  canWalletDebit,
  canWalletExport,
  canWalletImport,
  canWalletOpening,
  canWalletTopup,
} from "@/lib/svkk/permissions";
import { cn } from "@/lib/utils";
import {
  Download,
  FileSpreadsheet,
  Search,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  formatWalletDateTime,
  formatWalletInr,
  WALLET_CATEGORIES,
  type WalletCsvImportResult,
  type WalletSummary,
  type WalletTxnPage,
} from "./wallet-types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WalletManagerView() {
  const { user } = useSvkkAuth();
  const perms = user?.permissions ?? [];
  const missingUrl = !getSvkkApiBase();

  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const [openingAmount, setOpeningAmount] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openingConfirmOpen, setOpeningConfirmOpen] = useState(false);

  const [topupAmount, setTopupAmount] = useState("");
  const [topupRemark, setTopupRemark] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);

  const [debitCategory, setDebitCategory] = useState("");
  const [debitAmount, setDebitAmount] = useState("");
  const [debitParticulars, setDebitParticulars] = useState("");
  const [debitReference, setDebitReference] = useState("");
  const [debitBusy, setDebitBusy] = useState(false);
  const [negativeConfirmOpen, setNegativeConfirmOpen] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<WalletCsvImportResult | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [txnPage, setTxnPage] = useState<WalletTxnPage | null>(null);
  const [txnLoading, setTxnLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

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

  const loadTransactions = useCallback(async () => {
    if (missingUrl) return;
    setTxnLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("q", search.trim());
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await svkkJson<{ success: boolean; data: WalletTxnPage }>(
        `/wallet/transactions?${params}`,
      );
      setTxnPage(res.data);
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Failed to load transactions"));
    } finally {
      setTxnLoading(false);
    }
  }, [missingUrl, page, pageSize, search, categoryFilter]);

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

  async function submitOpening() {
    setOpeningBusy(true);
    try {
      await backendApi.post("/wallet/opening", { amount: openingAmount });
      toast.success("Opening balance set");
      setOpeningAmount("");
      setOpeningConfirmOpen(false);
      setPage(1);
      await refreshAll();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Failed to set opening balance"));
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
      });
      toast.success("Top-up added");
      setTopupAmount("");
      setTopupRemark("");
      await refreshAll();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Top-up failed"));
    } finally {
      setTopupBusy(false);
    }
  }

  async function submitDebit(allowNegative: boolean) {
    setDebitBusy(true);
    try {
      await backendApi.post("/wallet/debit", {
        category: debitCategory,
        amount: debitAmount,
        particulars: debitParticulars || undefined,
        reference: debitReference || undefined,
        allowNegative: allowNegative || undefined,
      });
      toast.success("Amount deducted");
      setDebitCategory("");
      setDebitAmount("");
      setDebitParticulars("");
      setDebitReference("");
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
      if (search.trim()) params.set("q", search.trim());
      if (categoryFilter) params.set("category", categoryFilter);
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

  async function exportMis() {
    setExportBusy(true);
    try {
      const res = await backendApi.get("/wallet/mis/export.csv", { responseType: "blob" });
      downloadBlob(res.data as Blob, "wallet_category_mis.csv");
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

  async function submitClear() {
    setClearBusy(true);
    try {
      await backendApi.post("/wallet/clear", { confirm: true });
      toast.success("Wallet data cleared");
      setClearConfirmOpen(false);
      setPage(1);
      await refreshAll();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Clear failed"));
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

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Wallet className="size-6" />
          Wallet / CD Account Manager
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wallet top-up, usage deduction, and category-wise MIS
        </p>
      </div>

      {summaryErr ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load wallet</AlertTitle>
          <AlertDescription>{summaryErr}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current Wallet Balance</CardDescription>
            <CardTitle className="text-3xl text-primary">
              {summaryLoading ? <Skeleton className="h-9 w-40" /> : formatWalletInr(summary?.currentBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Last updated: {summaryLoading ? "…" : formatWalletDateTime(summary?.lastUpdatedAt)}
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
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
          <div>
            <CardTitle>Category-wise MIS</CardTitle>
            <CardDescription>Debit usage only (A, B, C, D, Staff, SVGA)</CardDescription>
          </div>
          {canWalletExport(perms) ? (
            <Button variant="secondary" size="sm" disabled={exportBusy} onClick={() => void exportMis()}>
              <Download className="size-4 mr-1" />
              Export MIS CSV
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {(summary?.mis ?? WALLET_CATEGORIES.map((c) => ({ category: c, count: 0, amount: "0" }))).map(
              (row) => (
                <div key={row.category} className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-muted-foreground text-xs">Category {row.category}</div>
                  <div className="font-semibold text-lg mt-1">{formatWalletInr(row.amount)}</div>
                  <div className="text-muted-foreground text-xs mt-1">{row.count} entries</div>
                </div>
              ),
            )}
          </div>
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
                {(summary?.mis ?? []).map((row) => (
                  <TableRow key={`mis-t-${row.category}`}>
                    <TableCell>
                      <Badge variant="secondary">{row.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right font-medium">{formatWalletInr(row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Set / Top-Up Wallet</CardTitle>
            <CardDescription>
              Opening balance resets history after confirmation. Top-up adds to the current balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canWalletOpening(perms) ? (
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
                <Button
                  disabled={openingBusy || !openingAmount}
                  onClick={() => setOpeningConfirmOpen(true)}
                >
                  Set Opening Balance
                </Button>
              </div>
            ) : null}

            {canWalletTopup(perms) ? (
              <div className="space-y-2 border-t pt-4">
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
              Columns: Date, Category, Particulars, Amount, Reference. Required: Category, Amount.
              Dates: YYYY-MM-DD or DD-MM-YYYY (empty date uses now).
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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
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
                    {WALLET_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-amount">Amount</Label>
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
              <div className="space-y-2">
                <Label htmlFor="debit-part">Particulars</Label>
                <Input
                  id="debit-part"
                  placeholder="Printing Charge"
                  value={debitParticulars}
                  onChange={(e) => setDebitParticulars(e.target.value)}
                  disabled={debitBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debit-ref">Reference / Bill No.</Label>
                <Input
                  id="debit-ref"
                  placeholder="Optional"
                  value={debitReference}
                  onChange={(e) => setDebitReference(e.target.value)}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>Search and filter the ledger</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWalletExport(perms) ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={exportBusy}
                  onClick={() => void exportTransactions()}
                >
                  Export Transactions CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={exportBusy}
                  onClick={() => void downloadBackup()}
                >
                  Backup Wallet Data
                </Button>
              </>
            ) : null}
            {canWalletClear(perms) ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={clearBusy}
                onClick={() => setClearConfirmOpen(true)}
              >
                <Trash2 className="size-4 mr-1" />
                Clear All Data
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search particulars, reference, category, type…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={categoryFilter || "all"}
              onValueChange={(v) => {
                setCategoryFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {WALLET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txnLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : !txnPage?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  txnPage.items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{formatWalletDateTime(t.date)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            t.type === "DEBIT"
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800",
                          )}
                        >
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.category ? <Badge variant="secondary">{t.category}</Badge> : "—"}
                      </TableCell>
                      <TableCell>{t.particulars || "—"}</TableCell>
                      <TableCell>{t.reference || "—"}</TableCell>
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

      <Dialog open={openingConfirmOpen} onOpenChange={setOpeningConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset wallet with opening balance?</DialogTitle>
            <DialogDescription>
              This will delete all existing wallet transactions and set the balance to{" "}
              {formatWalletInr(openingAmount)}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={openingBusy} onClick={() => setOpeningConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={openingBusy} onClick={() => void submitOpening()}>
              {openingBusy ? "Saving…" : "Confirm reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all wallet data?</DialogTitle>
            <DialogDescription>
              This permanently deletes all transactions and resets the balance to zero.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={clearBusy} onClick={() => setClearConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={clearBusy} onClick={() => void submitClear()}>
              {clearBusy ? "Clearing…" : "Clear all data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
