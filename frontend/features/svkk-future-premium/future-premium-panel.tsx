"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Download, Loader2, Settings2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { rs } from "@/lib/svkk/premium";
import { FutureMisCards } from "./future-mis-cards";
import {
  buildFutureResults,
  computeFutureMis,
  filterFutureResults,
  formatPolicyName,
  FUTURE_DISCOUNT_OPTIONS,
  FUTURE_POLICY_TYPE_OPTIONS,
  FUTURE_PREMIUM_SOURCE_OPTIONS,
  FUTURE_SI_OPTIONS,
  FUTURE_YEAR_OPTIONS,
  sourceLabel,
  yearOffsetLabel,
} from "./future-premium-engine";
import { filterFutureCsvRows } from "./future-policy-filters";
import {
  FutureControlSelect,
  FuturePremiumPolicyFilters,
  useFuturePremiumPolicyFilters,
} from "./future-premium-policy-filters";
import {
  detailExportRows,
  downloadCsv,
  futurePremiumSampleCsvRows,
  FUTURE_PREMIUM_SAMPLE_ROWS,
  summaryExportRows,
} from "./future-premium-export";
import { FuturePremiumIssueDialog } from "./future-premium-issue-dialog";
import { FuturePremiumListPagination } from "./future-premium-list-pagination";
import type { FuturePremiumResult, FutureSourceKey } from "./future-premium-types";
import { fetchFuturePremiumResultsFromBulkApi } from "./policy-lookup-api";
import { useFuturePremiumData } from "./use-future-premium-data";

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30 bg-primary text-primary-foreground" : undefined}>
      <CardContent className="pt-4">
        <p className={`text-xs font-semibold tracking-wide uppercase ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function riskLabel(pct: number): "Low" | "Medium" | "High" {
  if (pct > 15) return "High";
  if (pct >= 5) return "Medium";
  return "Low";
}

export function FuturePremiumPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    premiumState,
    uploadedRows,
    loadingCharts,
    chartsLoadError,
    loadingPolicies,
    ingestCsvFile,
    loadPremiumCharts,
    persistUploadedRows,
  } = useFuturePremiumData();

  const policyFilters = useFuturePremiumPolicyFilters();
  const [source, setSource] = useState<FutureSourceKey>("policy_list_only");
  const [yearOffset, setYearOffset] = useState("0");
  const [results, setResults] = useState<FuturePremiumResult[]>([]);
  const [generated, setGenerated] = useState(false);
  const [message, setMessage] = useState(
    "Use filters to narrow policies, then click Generate to build future premium records and MIS.",
  );
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [siFilter, setSiFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  const [selectedDetail, setSelectedDetail] = useState<FuturePremiumResult | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [futureSiMode, setFutureSiMode] = useState<"existing" | "change">("existing");
  const [futureSiValue, setFutureSiValue] = useState(String(FUTURE_SI_OPTIONS[0]));
  const [bulkSiUpgrade, setBulkSiUpgrade] = useState(false);
  const [futurePolicyMode, setFuturePolicyMode] = useState<"existing" | "change">("existing");
  const [futurePolicyType, setFuturePolicyType] = useState("family_floater");
  const [discountMode, setDiscountMode] = useState<"existing" | "chart" | "custom">("chart");
  const [customDiscountPct, setCustomDiscountPct] = useState(String(FUTURE_DISCOUNT_OPTIONS[1]));
  const [progressText, setProgressText] = useState("");
  const cancelGenerationRef = useRef(false);

  const isDbSource = source === "policy_list_only";

  const mis = useMemo(() => computeFutureMis(generated ? results : []), [generated, results]);
  const visibleRows = useMemo(() => {
    const filtered = filterFutureResults(results, search, policyFilter, siFilter, statusFilter);
    if (sortBy === "highest_increase") return [...filtered].sort((a, b) => b.premiumDiff - a.premiumDiff);
    if (sortBy === "highest_percent") {
      return [...filtered].sort((a, b) => b.premiumIncreasePct - a.premiumIncreasePct);
    }
    return filtered;
  }, [results, search, policyFilter, siFilter, statusFilter, sortBy]);
  const tableRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleRows.slice(start, start + pageSize);
  }, [visibleRows, page, pageSize]);
  const displayTotal = visibleRows.length;
  const displayTotalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize) || 1);
  const comparisonMetrics = useMemo(() => {
    const deltas = visibleRows.map((r) => r.premiumDiff);
    const totalIncrease = deltas.reduce((sum, d) => sum + d, 0);
    const increases = deltas.filter((d) => d > 0);
    const avgIncrease = increases.length ? totalIncrease / increases.length : 0;
    const highestIncrease = Math.max(0, ...deltas);
    const highestDiscount = Math.max(0, ...visibleRows.map((r) => r.quote.disc));
    const bandCrossings = visibleRows.filter((r) => r.memberTimeline.some((m) => m.bandChanged)).length;
    const siChanges = visibleRows.filter((r) => r.currentSi !== r.futureSi).length;
    const productChanges = visibleRows.filter((r) => r.currentPolicy !== r.futurePolicy).length;
    const ready = visibleRows.filter((r) => r.status === "Ready").length;
    const renewalSuccessProjection = visibleRows.length ? (ready / visibleRows.length) * 100 : 0;
    return {
      totalIncrease,
      avgIncrease,
      highestIncrease,
      highestDiscount,
      bandCrossings,
      siChanges,
      productChanges,
      renewalSuccessProjection,
    };
  }, [visibleRows]);
  const chartBuckets = useMemo(() => {
    const ageBand = new Map<string, number>();
    const premiumIncrease = { noChange: 0, low: 0, medium: 0, high: 0 };
    const futureSi = new Map<string, number>();
    const policyType = new Map<string, number>();
    const renewalMonth = new Map<string, number>();
    for (const row of visibleRows) {
      policyType.set(row.futurePolicy, (policyType.get(row.futurePolicy) ?? 0) + 1);
      futureSi.set(`₹${rs(row.futureSi)}`, (futureSi.get(`₹${rs(row.futureSi)}`) ?? 0) + 1);
      const month = row.context.futureEndDate?.slice(5, 7) || "—";
      renewalMonth.set(month, (renewalMonth.get(month) ?? 0) + 1);
      for (const m of row.memberTimeline) {
        const band = m.futureBand || "—";
        ageBand.set(band, (ageBand.get(band) ?? 0) + 1);
      }
      if (row.premiumDiff <= 0) premiumIncrease.noChange += 1;
      else if (row.premiumIncreasePct < 10) premiumIncrease.low += 1;
      else if (row.premiumIncreasePct < 20) premiumIncrease.medium += 1;
      else premiumIncrease.high += 1;
    }
    return { ageBand, premiumIncrease, futureSi, policyType, renewalMonth };
  }, [visibleRows]);
  const histogramBars = useMemo(() => {
    const buckets = [
      { label: "<=0%", count: visibleRows.filter((row) => row.premiumIncreasePct <= 0).length },
      { label: "0-5%", count: visibleRows.filter((row) => row.premiumIncreasePct > 0 && row.premiumIncreasePct < 5).length },
      { label: "5-15%", count: visibleRows.filter((row) => row.premiumIncreasePct >= 5 && row.premiumIncreasePct <= 15).length },
      { label: ">15%", count: visibleRows.filter((row) => row.premiumIncreasePct > 15).length },
    ];
    const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
    return buckets.map((bucket) => ({ ...bucket, width: `${(bucket.count / max) * 100}%` }));
  }, [visibleRows]);

  const policyTypeOptions = useMemo(
    () => [...new Set(results.map((r) => r.policy).filter(Boolean))],
    [results],
  );
  const siOptions = useMemo(
    () =>
      [...new Set(results.map((r) => String(r.si)).filter(Boolean))].sort(
        (a, b) => Number(a) - Number(b),
      ),
    [results],
  );

  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    const count = await ingestCsvFile(file);
    setResults([]);
    setGenerated(false);
    showMessage(
      count
        ? `CSV uploaded (${count} row(s)). Click Generate to create Future Premium and MIS.`
        : "CSV had no data rows.",
      !count,
    );
  };

  const handleLoadSample = () => {
    const rows = futurePremiumSampleCsvRows();
    persistUploadedRows(rows);
    setResults([]);
    setGenerated(false);
    if (fileRef.current) fileRef.current.value = "";
    showMessage(
      `Sample data loaded (${rows.length} row(s)). Click Generate to preview Future Premium and MIS.`,
    );
  };

  const futureGenerationOptions = useMemo(
    () => ({
      futureSiMode,
      selectedFutureSi: Number(futureSiValue || 0),
      bulkSiUpgrade,
      futurePolicyMode,
      selectedFuturePolicy: futurePolicyType,
      discountMode,
      customDiscountPct: Number(customDiscountPct || 0),
    }),
    [
      futureSiMode,
      futureSiValue,
      bulkSiUpgrade,
      futurePolicyMode,
      futurePolicyType,
      discountMode,
      customDiscountPct,
    ],
  );

  const loadAllPolicyResults = async () => {
    if (!premiumState) {
      showMessage(
        chartsLoadError ??
          "Premium charts could not be loaded. Check Charts & discounts or retry loading charts.",
        true,
      );
      return;
    }
    setBusy(true);
    cancelGenerationRef.current = false;
    setProgressText("Loading policies...");
    try {
      const { results: next, total, truncated } = await fetchFuturePremiumResultsFromBulkApi(
        policyFilters.filterQuery,
        yearOffset,
        premiumState,
        futureGenerationOptions,
        {
          onProgress: (done, policyTotal) => {
            setProgressText(
              done === 0
                ? "Loading policies..."
                : `Computing ${done.toLocaleString("en-IN")} / ${policyTotal.toLocaleString("en-IN")} policies...`,
            );
          },
          shouldCancel: () => cancelGenerationRef.current,
        },
      );
      if (cancelGenerationRef.current) {
        showMessage("Generation cancelled by user.", true);
        return;
      }
      if (!next.length) {
        setResults([]);
        setGenerated(false);
        setPage(1);
        showMessage("No policies matched the selected filters in the database.", true);
        return;
      }
      setResults(next);
      setGenerated(true);
      setPage(1);
      showMessage(
        truncated
          ? `Generated ${next.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} matching policies (list capped at server limit).`
          : `Generated ${next.length.toLocaleString("en-IN")} record(s) for ${yearOffsetLabel(yearOffset)} from policy list.`,
      );
    } catch (e) {
      setResults([]);
      setGenerated(false);
      showMessage(e instanceof Error ? e.message : "Failed to load policies. Please try again.", true);
    } finally {
      setBusy(false);
      setProgressText("");
    }
  };

  const handleGenerate = async () => {
    if (loadingCharts) {
      showMessage("Premium charts are still loading. Please wait a moment and try again.");
      return;
    }
    if (!premiumState) {
      showMessage(
        chartsLoadError ??
          "Premium charts could not be loaded. Check Charts & discounts or retry loading charts.",
        true,
      );
      return;
    }
    if (isDbSource) {
      await loadAllPolicyResults();
      return;
    }
    setBusy(true);
    cancelGenerationRef.current = false;
    setProgressText("Preparing generation...");
    try {
      const raw = filterFutureCsvRows(
        uploadedRows,
        policyFilters.filters,
        policyFilters.csvFilterContext,
      );
      if (!raw.length) {
        setResults([]);
        setGenerated(false);
        setPage(1);
        showMessage(
          uploadedRows.length
            ? "No rows in the uploaded CSV matched the selected filters. Try Reset filters."
            : "No CSV data loaded. Upload a CSV or click Load sample, then click Generate.",
          true,
        );
        return;
      }
      const chunkSize = 400;
      const chunks = Math.max(1, Math.ceil(raw.length / chunkSize));
      const next: FuturePremiumResult[] = [];
      for (let i = 0; i < chunks; i += 1) {
        if (cancelGenerationRef.current) {
          showMessage("Generation cancelled by user.", true);
          break;
        }
        const start = i * chunkSize;
        const chunkRows = raw.slice(start, start + chunkSize);
        next.push(
          ...buildFutureResults(chunkRows, source, yearOffset, premiumState, {
            futureSiMode,
            selectedFutureSi: Number(futureSiValue || 0),
            bulkSiUpgrade,
            futurePolicyMode,
            selectedFuturePolicy: futurePolicyType,
            discountMode,
            customDiscountPct: Number(customDiscountPct || 0),
          }),
        );
        setProgressText(`Processing ${Math.min(raw.length, start + chunkRows.length)} / ${raw.length} policies...`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setResults(next);
      setGenerated(true);
      setPage(1);
      showMessage(
        `Generated ${next.length} record(s) for ${yearOffsetLabel(yearOffset)} using ${sourceLabel(source)}.`,
      );
    } catch (e) {
      setResults([]);
      setGenerated(false);
      showMessage(e instanceof Error ? e.message : "Generate failed. Please try again.", true);
    } finally {
      setBusy(false);
      setProgressText("");
    }
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  };

  const highestNet = (groups: Record<string, { net: number }>) =>
    Math.max(0, ...Object.values(groups).map((g) => g.net));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Future Premium</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate future premiums from CSV data with MIS, policy-type analysis and export-ready reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Future Premium MIS</Badge>
          <Button variant="outline" size="sm" asChild>
            <Link href="/calculator/admin">
              <Settings2 className="mr-2 size-4" />
              Charts & discounts
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controls</CardTitle>
          <CardDescription>
            Choose uploaded CSV or policy list from the database. Use filters to narrow by year, category, type, and
            location. Charts come from the admin panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {source === "uploaded_csv_only" ? (
            <div className="space-y-2">
              <Label>Upload CSV</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
              {uploadedRows.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  {uploadedRows.length} row(s) loaded — ready to Generate.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Upload a CSV or load sample data, set options below, then Generate.
                </p>
              )}
            </div>
          ) : null}
          <FuturePremiumPolicyFilters
            filters={policyFilters.filters}
            onChange={policyFilters.setFilters}
            activeCount={policyFilters.activeCount}
            onReset={policyFilters.resetFilters}
            options={policyFilters.filterOptions}
            scenarioControls={
              <>
                <FutureControlSelect
                  label="Source"
                  value={source}
                  onValueChange={(v) => {
                    setSource(v as FutureSourceKey);
                    setPage(1);
                    setResults([]);
                    setGenerated(false);
                  }}
                  accentClassName="border-slate-200/90 from-slate-50/95 to-card dark:border-slate-800/50 dark:from-slate-950/35 dark:to-card"
                >
                  {FUTURE_PREMIUM_SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </FutureControlSelect>
                <FutureControlSelect
                  label="Future Year"
                  value={yearOffset}
                  onValueChange={setYearOffset}
                  accentClassName="border-cyan-200/90 from-cyan-50/95 to-card dark:border-cyan-900/50 dark:from-cyan-950/35 dark:to-card"
                >
                  {FUTURE_YEAR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </FutureControlSelect>
                <FutureControlSelect
                  label="Future Sum Insured"
                  value={futureSiMode}
                  onValueChange={(v) => setFutureSiMode(v as "existing" | "change")}
                  accentClassName="border-lime-200/90 from-lime-50/95 to-card dark:border-lime-900/50 dark:from-lime-950/35 dark:to-card"
                >
                  <SelectItem value="existing">Keep Existing Sum Insured</SelectItem>
                  <SelectItem value="change">Change Sum Insured</SelectItem>
                </FutureControlSelect>
                <FutureControlSelect
                  label="Future SI Value"
                  value={futureSiValue}
                  onValueChange={setFutureSiValue}
                  disabled={futureSiMode !== "change"}
                  accentClassName="border-yellow-200/90 from-yellow-50/95 to-card dark:border-yellow-900/50 dark:from-yellow-950/35 dark:to-card"
                >
                  {FUTURE_SI_OPTIONS.map((si) => (
                    <SelectItem key={si} value={String(si)}>
                      ₹{rs(si)}
                    </SelectItem>
                  ))}
                </FutureControlSelect>
                <FutureControlSelect
                  label="Bulk SI Upgrade Rules"
                  value={bulkSiUpgrade ? "yes" : "no"}
                  onValueChange={(v) => setBulkSiUpgrade(v === "yes")}
                  accentClassName="border-fuchsia-200/90 from-fuchsia-50/95 to-card dark:border-fuchsia-900/50 dark:from-fuchsia-950/35 dark:to-card"
                >
                  <SelectItem value="no">Disabled</SelectItem>
                  <SelectItem value="yes">Enabled (1L→2L→3L→5L→10L)</SelectItem>
                </FutureControlSelect>
                <FutureControlSelect
                  label="Future Policy Type"
                  value={futurePolicyMode}
                  onValueChange={(v) => setFuturePolicyMode(v as "existing" | "change")}
                  accentClassName="border-pink-200/90 from-pink-50/95 to-card dark:border-pink-900/50 dark:from-pink-950/35 dark:to-card"
                >
                  <SelectItem value="existing">Keep Existing Product</SelectItem>
                  <SelectItem value="change">Change Product</SelectItem>
                </FutureControlSelect>
                <FutureControlSelect
                  label="Future Product Selection"
                  value={futurePolicyType}
                  onValueChange={setFuturePolicyType}
                  disabled={futurePolicyMode !== "change"}
                  accentClassName="border-purple-200/90 from-purple-50/95 to-card dark:border-purple-900/50 dark:from-purple-950/35 dark:to-card"
                >
                  {FUTURE_POLICY_TYPE_OPTIONS.map((policy) => (
                    <SelectItem key={policy} value={policy}>
                      {formatPolicyName(policy)}
                    </SelectItem>
                  ))}
                </FutureControlSelect>
                <FutureControlSelect
                  label="Future Discount"
                  value={discountMode}
                  onValueChange={(v) => setDiscountMode(v as "existing" | "chart" | "custom")}
                  accentClassName="border-blue-200/90 from-blue-50/95 to-card dark:border-blue-900/50 dark:from-blue-950/35 dark:to-card"
                >
                  <SelectItem value="existing">Use Existing Discount</SelectItem>
                  <SelectItem value="chart">Apply Chart Discount</SelectItem>
                  <SelectItem value="custom">Custom Discount %</SelectItem>
                </FutureControlSelect>
                <FutureControlSelect
                  label="Custom Discount %"
                  value={customDiscountPct}
                  onValueChange={setCustomDiscountPct}
                  disabled={discountMode !== "custom"}
                  accentClassName="border-stone-200/90 from-stone-50/95 to-card dark:border-stone-800/50 dark:from-stone-950/35 dark:to-card"
                >
                  {FUTURE_DISCOUNT_OPTIONS.map((pct) => (
                    <SelectItem key={pct} value={String(pct)}>
                      {pct}%
                    </SelectItem>
                  ))}
                </FutureControlSelect>
              </>
            }
          />
          {isDbSource ? (
            <p className="text-muted-foreground text-xs">
              Policies are loaded from live policy records (same data as Add Policy) using the filters above.
            </p>
          ) : null}
          {chartsLoadError && !loadingCharts ? (
            <div className="space-y-2">
              <p className="text-destructive bg-destructive/10 rounded-md border border-destructive/30 px-3 py-2 text-sm">
                {chartsLoadError}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadPremiumCharts()}>
                Retry loading charts
              </Button>
            </div>
          ) : null}
          <p
            className={
              messageIsError
                ? "text-destructive bg-destructive/10 rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium"
                : "bg-muted/60 text-primary rounded-md border px-3 py-2 text-sm font-medium"
            }
          >
            {message}
          </p>
          {progressText ? <p className="text-muted-foreground text-sm">{progressText}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleGenerate()} disabled={busy || loadingCharts}>
              {busy || loadingPolicies || loadingCharts ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Generate
            </Button>
            {source === "uploaded_csv_only" ? (
              <Button type="button" variant="outline" onClick={handleLoadSample}>
                Load sample
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => downloadCsv("future-premium-sample.csv", FUTURE_PREMIUM_SAMPLE_ROWS)}
            >
              Download sample CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!busy}
              onClick={() => {
                cancelGenerationRef.current = true;
              }}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Future Assumptions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7 text-sm">
          <div><p className="text-muted-foreground text-xs">Future Year</p><p className="font-semibold">{yearOffsetLabel(yearOffset)}</p></div>
          <div><p className="text-muted-foreground text-xs">Calculation Date</p><p className="font-semibold">{results[0]?.calcDate || "—"}</p></div>
          <div><p className="text-muted-foreground text-xs">Calculation Year</p><p className="font-semibold">{results[0]?.calcYear || "—"}</p></div>
          <div><p className="text-muted-foreground text-xs">Selected SI</p><p className="font-semibold">{futureSiMode === "change" ? `Change to ₹${rs(futureSiValue)}` : "Keep Existing"}</p></div>
          <div><p className="text-muted-foreground text-xs">Selected Discount</p><p className="font-semibold">{discountMode === "custom" ? `Custom ${customDiscountPct}%` : discountMode === "chart" ? "Apply Chart Discount" : "Use Existing Discount"}</p></div>
          <div><p className="text-muted-foreground text-xs">Selected Product</p><p className="font-semibold">{futurePolicyMode === "change" ? formatPolicyName(futurePolicyType) : "Keep Existing Product"}</p></div>
          <div><p className="text-muted-foreground text-xs">Chart Version</p><p className="font-semibold">Live Admin Chart</p></div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Policies" value={mis.policies} />
        <StatCard label="Total Members" value={mis.members} />
        <StatCard label="Basic Premium" value={`₹${rs(mis.basic)}`} />
        <StatCard label="Gross Premium" value={`₹${rs(mis.gross)}`} />
        <StatCard label="Net Premium" value={`₹${rs(mis.net)}`} highlight />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overall MIS Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Discount Total</p>
              <p className="font-semibold">₹{rs(mis.disc)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Average Net / Policy</p>
              <p className="font-semibold">₹{rs(mis.policies ? Math.round(mis.net / mis.policies) : 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Average Members / Policy</p>
              <p className="font-semibold">
                {mis.policies ? (mis.members / mis.policies).toFixed(2) : "0.00"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Average Gross / Policy</p>
              <p className="font-semibold">₹{rs(mis.policies ? Math.round(mis.gross / mis.policies) : 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MIS Coverage</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Policy Types</p>
              <p className="font-semibold">{Object.keys(mis.byType).length}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">SI Buckets</p>
              <p className="font-semibold">{Object.keys(mis.bySI).length}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Highest SI Net</p>
              <p className="font-semibold">₹{rs(highestNet(mis.bySI))}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Highest Type Net</p>
              <p className="font-semibold">₹{rs(highestNet(mis.byType))}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Increase" value={`₹${rs(comparisonMetrics.totalIncrease)}`} />
        <StatCard label="Avg Increase" value={`₹${rs(Math.round(comparisonMetrics.avgIncrease))}`} />
        <StatCard label="Highest Increase" value={`₹${rs(comparisonMetrics.highestIncrease)}`} />
        <StatCard label="Highest Discount" value={`₹${rs(comparisonMetrics.highestDiscount)}`} />
        <StatCard label="Band Crossings" value={comparisonMetrics.bandCrossings} />
        <StatCard label="SI Changes" value={comparisonMetrics.siChanges} />
        <StatCard label="Product Changes" value={comparisonMetrics.productChanges} />
        <StatCard
          label="Renewal Success Projection"
          value={`${comparisonMetrics.renewalSuccessProjection.toFixed(1)}%`}
          highlight
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribution Charts</CardTitle>
          <CardDescription>
            Age band distribution, premium increase buckets, future SI, policy type, and renewal month.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <p className="font-semibold">Age Band Distribution</p>
            {[...chartBuckets.ageBand.entries()].slice(0, 8).map(([k, v]) => (
              <p key={k} className="text-muted-foreground">{k}: {v}</p>
            ))}
          </div>
          <div>
            <p className="font-semibold">Premium Increase Distribution</p>
            <p className="text-muted-foreground">No Change: {chartBuckets.premiumIncrease.noChange}</p>
            <p className="text-muted-foreground">&lt;10%: {chartBuckets.premiumIncrease.low}</p>
            <p className="text-muted-foreground">10-20%: {chartBuckets.premiumIncrease.medium}</p>
            <p className="text-muted-foreground">&gt;=20%: {chartBuckets.premiumIncrease.high}</p>
          </div>
          <div>
            <p className="font-semibold">Future SI Distribution</p>
            {[...chartBuckets.futureSi.entries()].map(([k, v]) => (
              <p key={k} className="text-muted-foreground">{k}: {v}</p>
            ))}
          </div>
          <div>
            <p className="font-semibold">Policy Type Distribution</p>
            {[...chartBuckets.policyType.entries()].map(([k, v]) => (
              <p key={k} className="text-muted-foreground">{formatPolicyName(k)}: {v}</p>
            ))}
          </div>
          <div>
            <p className="font-semibold">Renewal Month Distribution</p>
            {[...chartBuckets.renewalMonth.entries()].map(([k, v]) => (
              <p key={k} className="text-muted-foreground">{k}: {v}</p>
            ))}
          </div>
          <div>
            <p className="font-semibold">Premium Difference Histogram</p>
            <div className="mt-2 space-y-2">
              {histogramBars.map((bucket) => (
                <div key={bucket.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span>{bucket.label}</span>
                    <span>{bucket.count}</span>
                  </div>
                  <div className="bg-muted h-2 rounded-full">
                    <div className="bg-primary h-2 rounded-full" style={{ width: bucket.width }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy Type Wise MIS</CardTitle>
          <CardDescription>
            Policy count, members, gross premium, discount, and net premium by policy type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FutureMisCards
            groups={mis.byType}
            formatLabel={(k) => formatPolicyName(k)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sum Insured Wise MIS</CardTitle>
          <CardDescription>
            Policy count, members, gross premium, discount, and net premium by sum insured bucket.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FutureMisCards groups={mis.bySI} formatLabel={(k) => `₹${rs(k)}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">List Search and Filters</CardTitle>
          <CardDescription>
            Regular search works across the full row. Filters narrow the list quickly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SVKK ID, customer ID, holder, policy no, policy type"
              />
            </div>
            <div className="space-y-2">
              <Label>Policy Type Filter</Label>
              <Select value={policyFilter} onValueChange={setPolicyFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Policy Types</SelectItem>
                  {policyTypeOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {formatPolicyName(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SI Filter</Label>
              <Select value={siFilter} onValueChange={setSiFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All SI</SelectItem>
                  {siOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      ₹{rs(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status Filter</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Ready">Ready</SelectItem>
                  <SelectItem value="Issue">Issue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="highest_increase">Highest Premium Increase</SelectItem>
                  <SelectItem value="highest_percent">Highest Increase %</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>SVKK ID</TableHead>
                  <TableHead>Policy No</TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Current Policy</TableHead>
                  <TableHead>Future Policy</TableHead>
                  <TableHead>Current SI</TableHead>
                  <TableHead>Future SI</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Calculation Year</TableHead>
                  <TableHead>Calculation Date</TableHead>
                  <TableHead>Current Premium</TableHead>
                  <TableHead>Future Premium</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead>Increase %</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Reasons</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.length ? (
                  tableRows.map((r) => (
                    <TableRow
                      key={`${r.policyNo}-${r.svkkId}-${r.calcYear}`}
                      className={
                        r.status === "Issue"
                          ? "cursor-pointer hover:bg-destructive/5"
                          : "cursor-pointer hover:bg-muted/50"
                      }
                      onClick={() => {
                        setSelectedDetail(r);
                        setDetailDialogOpen(true);
                      }}
                    >
                      <TableCell className="max-w-[140px] truncate">{r.source}</TableCell>
                      <TableCell>{r.svkkId}</TableCell>
                      <TableCell className="max-w-[180px] truncate font-mono text-xs">{r.policyNo || "—"}</TableCell>
                      <TableCell>{r.customerId}</TableCell>
                      <TableCell>{r.holder}</TableCell>
                      <TableCell>{r.currentPolicy}</TableCell>
                      <TableCell>{r.futurePolicy}</TableCell>
                      <TableCell>₹{rs(r.currentSi)}</TableCell>
                      <TableCell>₹{rs(r.futureSi)}</TableCell>
                      <TableCell>{r.memberCount}</TableCell>
                      <TableCell>{r.calcYear}</TableCell>
                      <TableCell>{r.calcDate}</TableCell>
                      <TableCell>₹{rs(r.currentPremium)}</TableCell>
                      <TableCell>₹{rs(r.futurePremium)}</TableCell>
                      <TableCell>{r.premiumDiff >= 0 ? "+" : ""}₹{rs(r.premiumDiff)}</TableCell>
                      <TableCell>{r.premiumIncreasePct.toFixed(2)}%</TableCell>
                      <TableCell>{riskLabel(r.premiumIncreasePct)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.reasons.join(", ") || "—"}</TableCell>
                      <TableCell>
                        {r.status === "Issue" ? (
                          <span className="text-destructive font-semibold">Issue — view details</span>
                        ) : (
                          <span className="text-primary font-semibold">Ready — view details</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={20} className="text-muted-foreground text-center">
                      {generated ? "No rows match the current filters." : "Generate to see results."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {generated && displayTotal > 0 ? (
            <FuturePremiumListPagination
              page={page}
              pageSize={pageSize}
              total={displayTotal}
              totalPages={displayTotalPages}
              loading={busy || loadingPolicies}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!results.length}
              onClick={() => downloadCsv("future-premium-summary.csv", summaryExportRows(results))}
            >
              <Download className="mr-2 size-4" />
              Export Lump Sum CSV
            </Button>
            <Button
              variant="outline"
              disabled={!results.length}
              onClick={() => downloadCsv("future-premium-individual.csv", detailExportRows(results))}
            >
              <Download className="mr-2 size-4" />
              Export Individual CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <FuturePremiumIssueDialog
        result={selectedDetail}
        open={detailDialogOpen}
        onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) setSelectedDetail(null);
        }}
      />
    </div>
  );
}
