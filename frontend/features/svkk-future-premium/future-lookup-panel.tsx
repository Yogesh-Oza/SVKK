"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Download, Loader2, Search, Settings2 } from "lucide-react";

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
import { getv } from "./future-csv-utils";
import {
  FUTURE_DISCOUNT_OPTIONS,
  formatPolicyName,
  FUTURE_POLICY_TYPE_OPTIONS,
  FUTURE_SI_OPTIONS,
  FUTURE_YEAR_OPTIONS,
} from "./future-premium-engine";
import { downloadCsv } from "./future-premium-export";
import type { FuturePremiumResult } from "./future-premium-types";
import { LookupSuggestionsList } from "./lookup-suggestions-list";
import { resolveLookupFromPolicyApi } from "./policy-lookup-api";
import { fetchApiLookupSuggestions } from "./policy-lookup-suggestions";
import type { LookupSuggestion } from "./policy-lookup-csv-search";
import { lookupMinQueryLength } from "./policy-lookup-search";
import { FuturePremiumPolicyFilters, useFuturePremiumPolicyFilters } from "./future-premium-policy-filters";
import { useFuturePremiumData } from "./use-future-premium-data";

function LookupField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value || "—"} disabled />
    </div>
  );
}

function riskLabel(pct: number): "Low" | "Medium" | "High" {
  if (pct > 15) return "High";
  if (pct >= 5) return "Medium";
  return "Low";
}

function riskTone(pct: number): string {
  if (pct > 15) return "bg-destructive/10 text-destructive border-destructive/30";
  if (pct >= 5) return "bg-amber-500/10 text-amber-700 border-amber-500/30";
  return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
}

function lookupStatusMessage(opts: {
  busy: boolean;
  searched: boolean;
  lookupNo: string;
  result: FuturePremiumResult | null;
}): { text: string; tone: "idle" | "loading" | "success" | "error" } {
  if (opts.busy) {
    return { text: "Looking up policy…", tone: "loading" };
  }
  if (opts.result) {
    return { text: "Policy found. Full details are shown below.", tone: "success" };
  }
  if (opts.searched && opts.lookupNo.trim()) {
    return { text: "Policy not found in policy database.", tone: "error" };
  }
  return { text: "Type a name or ID, pick a suggestion, or click Generate.", tone: "idle" };
}

export function FutureLookupPanel() {
  const { premiumState, loadingCharts } = useFuturePremiumData();

  const { filters, setFilters, resetFilters, activeCount, filterQuery, filterOptions } =
    useFuturePremiumPolicyFilters();

  const [lookupNo, setLookupNo] = useState("");
  const [yearOffset, setYearOffset] = useState("0");
  const [result, setResult] = useState<FuturePremiumResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<LookupSuggestion[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);
  const [futureSiMode, setFutureSiMode] = useState<"existing" | "change">("existing");
  const [futureSi, setFutureSi] = useState(String(FUTURE_SI_OPTIONS[0]));
  const [futurePolicyMode, setFuturePolicyMode] = useState<"existing" | "change">("existing");
  const [futurePolicyType, setFuturePolicyType] = useState("family_floater");
  const [discountMode, setDiscountMode] = useState<"existing" | "chart" | "custom">("chart");
  const [customDiscountPct, setCustomDiscountPct] = useState(String(FUTURE_DISCOUNT_OPTIONS[1]));
  const [lookupHistory, setLookupHistory] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem("future_lookup_history_v1") || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 8).map((v) => String(v)) : [];
    } catch {
      return [];
    }
  });
  const lookupRequestRef = useRef(0);
  const suggestRequestRef = useRef(0);

  const runLookup = useCallback(
    async (token: string, preferredYearLabel?: string) => {
      if (!premiumState || !token.trim()) return;
      const requestId = ++lookupRequestRef.current;
      setBusy(true);
      setSearched(true);
      setResult(null);
      try {
        const next = await resolveLookupFromPolicyApi(
          token,
          filterQuery,
          yearOffset,
          premiumState,
          preferredYearLabel,
          {
            futureSiMode,
            selectedFutureSi: Number(futureSi || 0),
            futurePolicyMode,
            selectedFuturePolicy: futurePolicyType,
            discountMode,
            customDiscountPct: Number(customDiscountPct || 0),
          },
        );
        if (requestId !== lookupRequestRef.current) return;
        setResult(next);
        if (next) {
          setLookupHistory((prev) => {
            const normalized = [token.trim(), ...prev.filter((v) => v.toLowerCase() !== token.trim().toLowerCase())];
            const trimmed = normalized.slice(0, 8);
            if (typeof window !== "undefined") {
              window.localStorage.setItem("future_lookup_history_v1", JSON.stringify(trimmed));
            }
            return trimmed;
          });
        }
      } finally {
        if (requestId === lookupRequestRef.current) setBusy(false);
      }
    },
    [
      premiumState,
      filterQuery,
      yearOffset,
      futureSiMode,
      futureSi,
      futurePolicyMode,
      futurePolicyType,
      discountMode,
      customDiscountPct,
    ],
  );

  const handleGenerate = () => void runLookup(lookupNo);

  const selectSuggestion = useCallback(
    (suggestion: LookupSuggestion) => {
      setSuppressSuggestions(true);
      setLookupNo(suggestion.lookupValue);
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      void runLookup(
        suggestion.lookupValue,
        suggestion.yearLabel !== "—" ? suggestion.yearLabel : undefined,
      );
    },
    [runLookup],
  );

  useEffect(() => {
    if (suppressSuggestions) return;
    const query = lookupNo.trim();
    if (query.length < lookupMinQueryLength(query)) {
      return;
    }
    const timer = setTimeout(() => {
      const requestId = ++suggestRequestRef.current;
      setSuggestBusy(true);
      void fetchApiLookupSuggestions(query, filterQuery)
        .then((items) => {
          if (requestId !== suggestRequestRef.current) return;
          setSuggestions(items);
          setActiveSuggestionIndex(-1);
        })
        .catch(() => {
          if (requestId !== suggestRequestRef.current) return;
          setSuggestions([]);
          setActiveSuggestionIndex(-1);
        })
        .finally(() => {
          if (requestId === suggestRequestRef.current) setSuggestBusy(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [lookupNo, suppressSuggestions, filterQuery]);

  const handleSuggestionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }
    if (e.key === "Enter" && suggestions.length) {
      e.preventDefault();
      const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
      const suggestion = suggestions[idx];
      if (suggestion) selectSuggestion(suggestion);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
    }
  };

  const details = result?.details ?? {};
  const detailVal = (keys: string[]) => getv(details, keys) || "—";
  const status = lookupStatusMessage({ busy, searched, lookupNo, result });
  const renewalReason = result?.reasons[0] || "No significant change";
  const canDownload = Boolean(result);
  const changeSeverity = (pct: number) => (pct >= 20 ? "text-destructive" : pct >= 10 ? "text-amber-600" : "text-emerald-600");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lookup</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Search by policy number, SVKK ID, customer ID, or holder name. Suggestions appear as you type.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Policy detail lookup</Badge>
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
            Data is fetched from the policy database only. Type at least 2 characters to see suggestions, then click Generate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 md:col-span-2 xl:col-span-1">
              <Label>Policy / SVKK / Customer No.</Label>
              <Input
                value={lookupNo}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSuppressSuggestions(false);
                  setLookupNo(nextValue);
                  setResult(null);
                  setSearched(false);
                  if (nextValue.trim().length < lookupMinQueryLength(nextValue)) {
                    setSuggestions([]);
                    setActiveSuggestionIndex(-1);
                  }
                }}
                onKeyDown={handleSuggestionKeyDown}
                placeholder="Type holder name, SVKK ID, policy or customer no."
                autoComplete="off"
              />
              <LookupSuggestionsList
                suggestions={suggestions}
                busy={suggestBusy}
                activeIndex={activeSuggestionIndex}
                onSelect={selectSuggestion}
                open={!suppressSuggestions && lookupNo.trim().length >= lookupMinQueryLength(lookupNo)}
              />
            </div>
            <div className="space-y-2">
              <Label>Future Year</Label>
              <Select value={yearOffset} onValueChange={setYearOffset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUTURE_YEAR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Actions</Label>
              <Button onClick={handleGenerate} disabled={busy || loadingCharts || !lookupNo.trim()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
                Generate
              </Button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Future Sum Insured</Label>
              <Select value={futureSiMode} onValueChange={(v) => setFutureSiMode(v as "existing" | "change")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Keep Existing Sum Insured</SelectItem>
                  <SelectItem value="change">Change Sum Insured</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Future SI Value</Label>
              <Select value={futureSi} onValueChange={setFutureSi} disabled={futureSiMode !== "change"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUTURE_SI_OPTIONS.map((si) => (
                    <SelectItem key={si} value={String(si)}>
                      ₹{rs(si)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Future Product</Label>
              <Select value={futurePolicyMode} onValueChange={(v) => setFuturePolicyMode(v as "existing" | "change")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Keep Existing Product</SelectItem>
                  <SelectItem value="change">Change Product</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Future Product Type</Label>
              <Select value={futurePolicyType} onValueChange={setFuturePolicyType} disabled={futurePolicyMode !== "change"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUTURE_POLICY_TYPE_OPTIONS.map((policy) => (
                    <SelectItem key={policy} value={policy}>
                      {formatPolicyName(policy)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Discount Mode</Label>
              <Select value={discountMode} onValueChange={(v) => setDiscountMode(v as "existing" | "chart" | "custom")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Use Existing Discount</SelectItem>
                  <SelectItem value="chart">Apply Chart Discount</SelectItem>
                  <SelectItem value="custom">Custom Discount %</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Custom Discount %</Label>
              <Select value={customDiscountPct} onValueChange={setCustomDiscountPct} disabled={discountMode !== "custom"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUTURE_DISCOUNT_OPTIONS.map((pct) => (
                    <SelectItem key={pct} value={String(pct)}>
                      {pct}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recent Lookups</Label>
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {lookupHistory.length ? (
                  lookupHistory.map((item) => (
                    <Button key={item} variant="outline" size="sm" onClick={() => void runLookup(item)}>
                      {item}
                    </Button>
                  ))
                ) : (
                  <span className="text-muted-foreground text-xs">No recent lookups</span>
                )}
              </div>
            </div>
          </div>

          <FuturePremiumPolicyFilters
            filters={filters}
            onChange={setFilters}
            options={filterOptions}
            activeCount={activeCount}
            onReset={resetFilters}
          />

          <p
            className={
              status.tone === "error"
                ? "text-destructive bg-destructive/10 rounded-md border px-3 py-2 text-sm"
                : status.tone === "loading"
                  ? "bg-muted/60 text-muted-foreground rounded-md border px-3 py-2 text-sm"
                  : "bg-muted/60 text-primary rounded-md border px-3 py-2 text-sm font-medium"
            }
          >
            {status.text}
          </p>
        </CardContent>
      </Card>

      {result ? (
        <>
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-base">Renewal Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              <div>
                <p className="text-muted-foreground text-xs">Current Premium</p>
                <p className="font-semibold">₹{rs(result.currentPremium)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Future Premium</p>
                <p className="font-semibold">₹{rs(result.futurePremium)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Difference</p>
                <p className={`font-semibold ${changeSeverity(result.premiumIncreasePct)}`}>
                  {result.premiumDiff >= 0 ? "+" : ""}₹{rs(result.premiumDiff)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Increase %</p>
                <p className={`font-semibold ${changeSeverity(result.premiumIncreasePct)}`}>
                  {result.premiumIncreasePct.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Reason</p>
                <p className="font-semibold">{renewalReason}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Renewal Risk</p>
                <Badge variant="outline" className={riskTone(result.premiumIncreasePct)}>{riskLabel(result.premiumIncreasePct)}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">View Changes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{result.reasons.includes("Age Increased") ? "✓" : "•"} Age Increased</p>
              <p>✓ {result.memberTimeline.filter((m) => m.bandChanged).length} member(s) changed age band</p>
              <p>✓ Premium changed by {result.premiumDiff >= 0 ? "+" : ""}₹{rs(result.premiumDiff)}</p>
              <p>{result.currentSi === result.futureSi ? "✓ No SI change" : `✓ SI changed to ₹${rs(result.futureSi)}`}</p>
              <p>{result.currentPolicy === result.futurePolicy ? "✓ No Product change" : `✓ Product changed to ${result.futurePolicy}`}</p>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Policy No</p>
                <p className="mt-1 font-semibold">{result.policyNo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">SVKK ID</p>
                <p className="mt-1 font-semibold">{result.svkkId}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Customer ID</p>
                <p className="mt-1 font-semibold">{result.customerId}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Policy Type</p>
                <p className="mt-1 font-semibold">{formatPolicyName(result.policy)}</p>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary text-primary-foreground">
              <CardContent className="pt-4">
                <p className="text-primary-foreground/80 text-xs font-semibold uppercase">Members</p>
                <p className="mt-1 font-semibold">{result.memberCount}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Holder</p>
                <p className="mt-1 font-semibold">{result.holder}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Current SI</p>
                <p className="mt-1 font-semibold">₹{rs(result.currentSi)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Future SI</p>
                <p className="mt-1 font-semibold">₹{rs(result.futureSi)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Gross</p>
                <p className="mt-1 font-semibold">₹{rs(result.quote.gross)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-muted-foreground text-xs font-semibold uppercase">Discount</p>
                <p className="mt-1 font-semibold">₹{rs(result.quote.disc)}</p>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary text-primary-foreground">
              <CardContent className="pt-4">
                <p className="text-primary-foreground/80 text-xs font-semibold uppercase">Net</p>
                <p className="mt-1 font-semibold">₹{rs(result.quote.net)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <LookupField label="Current Policy Year" value={result.context.currentPolicyYear} />
              <LookupField label="Future Renewal Year" value={result.context.futurePolicyYear} />
              <LookupField label="Current Start Date" value={result.context.currentStartDate} />
              <LookupField label="Future Start Date" value={result.context.futureStartDate} />
              <LookupField label="Current End Date" value={result.context.currentEndDate} />
              <LookupField label="Future End Date" value={result.context.futureEndDate} />
              <LookupField label="Future Year" value={result.context.futureYearLabel} />
              <LookupField label="Calculation Date" value={result.calcDate} />
              <LookupField label="Calculation Year" value={String(result.calcYear)} />
              <LookupField label="Status" value={result.status} />
              <LookupField label="Category" value={detailVal(["category", "Category"])} />
              <LookupField label="Area" value={detailVal(["area"])} />
              <LookupField label="Village" value={detailVal(["village", "Village"])} />
              <LookupField label="Group" value={detailVal(["grouping", "group", "Grouping"])} />
              <LookupField label="Reference No." value={detailVal(["reference_no", "ref_no"])} />
              <LookupField label="Previous Policy No." value={detailVal(["previous_policy_no", "previous policy no"])} />
              <LookupField label="PAN No." value={detailVal(["holder_pan", "Holder PAN", "pan_no"])} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact & Payment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <LookupField label="Mobile" value={detailVal(["mobile", "Primary Mobile Number", "primary mobile number"])} />
              <LookupField label="Email" value={detailVal(["email"])} />
              <LookupField label="Payment Mode" value={detailVal(["payment_mode", "mode_of_payment"])} />
              <LookupField label="Nominee Name" value={detailVal(["nominee_name"])} />
              <LookupField label="Nominee Relation" value={detailVal(["nominee_relation"])} />
              <LookupField label="Nominee DOB" value={detailVal(["nominee_dob"])} />
              <LookupField label="Courier" value={detailVal(["courier_status", "Courier Status"])} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Premium Breakdown</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  Print details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const rows = result.memberTimeline.map((m) => ({
                      svkk_id: result.svkkId,
                      customer_id: result.customerId,
                      policy_number: result.policyNo,
                      holder_name: result.holder,
                      current_policy_type: result.currentPolicy,
                      future_policy_type: result.futurePolicy,
                      current_sum_insured: result.currentSi,
                      future_sum_insured: result.futureSi,
                      member_count: result.memberCount,
                      person_name: m.name,
                      role: m.role,
                      dob: m.dob,
                      current_age: m.currentAge ?? "",
                      future_age: m.futureAge ?? "",
                      current_band: m.currentBand,
                      future_band: m.futureBand,
                      current_premium: m.currentNet,
                      future_premium: m.futureNet,
                      difference: m.deltaNet,
                      increase_percent: m.deltaPct,
                      status: m.issue || "Ready",
                    }));
                    downloadCsv(`policy-${result.policyNo}-detail.csv`, rows);
                  }}
                >
                  <Download className="mr-2 size-4" />
                  Export detail CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Base Premium</p><p className="font-semibold">₹{rs(result.quote.basic)}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Rider</p><p className="font-semibold">₹{rs(result.quote.rider)}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Gross</p><p className="font-semibold">₹{rs(result.quote.gross)}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Discount</p><p className="font-semibold">₹{rs(result.quote.disc)}</p></CardContent></Card>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Relationship</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Current Age</TableHead>
                    <TableHead>Future Age</TableHead>
                    <TableHead>Current Band</TableHead>
                    <TableHead>Future Band</TableHead>
                    <TableHead>Current Net</TableHead>
                    <TableHead>Future Net</TableHead>
                    <TableHead>Difference</TableHead>
                    <TableHead>Increase %</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.memberTimeline.map((m) => (
                    <TableRow
                      key={m.key}
                      className={m.bandChanged || m.deltaNet !== 0 ? "bg-amber-500/5" : undefined}
                    >
                      <TableCell>{m.name}</TableCell>
                      <TableCell>{m.role}</TableCell>
                      <TableCell>{m.relationship || "—"}</TableCell>
                      <TableCell>{m.gender || "—"}</TableCell>
                      <TableCell>{m.dob || "—"}</TableCell>
                      <TableCell>{m.currentAge ?? "—"}</TableCell>
                      <TableCell>{m.futureAge ?? "—"}</TableCell>
                      <TableCell>{m.currentBand || "—"}</TableCell>
                      <TableCell>
                        <span
                          className={
                            m.bandChanged ? "text-destructive font-semibold" : m.nearBandChange ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"
                          }
                        >
                          {m.futureBand || "—"}
                        </span>
                      </TableCell>
                      <TableCell>₹{rs(m.currentNet)}</TableCell>
                      <TableCell>₹{rs(m.futureNet)}</TableCell>
                      <TableCell>{m.deltaNet >= 0 ? "+" : ""}₹{rs(m.deltaNet)}</TableCell>
                      <TableCell>{m.deltaPct.toFixed(2)}%</TableCell>
                      <TableCell>{m.issue || "Ready"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/policies?search=${encodeURIComponent(result.policyNo)}`}>Open Policy</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/policies?search=${encodeURIComponent(result.policyNo)}`}>Edit Policy</Link>
              </Button>
              <Button variant="outline" onClick={() => void runLookup(result.policyNo)}>
                Generate Future Premium
              </Button>
              <Button
                variant="outline"
                onClick={async () => navigator.clipboard.writeText(result.policyNo)}
              >
                Copy Policy
              </Button>
              <Button
                variant="outline"
                onClick={async () => navigator.clipboard.writeText(result.customerId)}
              >
                Copy Customer ID
              </Button>
              <Button
                variant="outline"
                disabled={!canDownload}
                onClick={() => {
                  const rows = result.memberTimeline.map((m) => ({
                    policy_number: result.policyNo,
                    holder_name: result.holder,
                    person_name: m.name,
                    current_age: m.currentAge ?? "",
                    future_age: m.futureAge ?? "",
                    current_band: m.currentBand,
                    future_band: m.futureBand,
                    current_premium: m.currentNet,
                    future_premium: m.futureNet,
                    difference: m.deltaNet,
                    increase_percent: m.deltaPct,
                  }));
                  downloadCsv(`policy-${result.policyNo}-comparison.csv`, rows);
                }}
              >
                Download CSV
              </Button>
              <Button variant="outline" disabled={!canDownload} onClick={() => window.print()}>
                Download PDF
              </Button>
              <Button variant="outline" disabled={!canDownload} onClick={() => window.print()}>
                Print
              </Button>
              <Button
                variant="outline"
                onClick={async () =>
                  navigator.clipboard.writeText(
                    `${result.holder} | ${result.policyNo} | ${result.svkkId} | ${result.customerId}`,
                  )
                }
              >
                Copy Customer Details
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
