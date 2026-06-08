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
  findLookupResult,
  FUTURE_YEAR_OPTIONS,
} from "./future-premium-engine";
import { downloadCsv } from "./future-premium-export";
import type { FuturePremiumResult, FutureSourceKey } from "./future-premium-types";
import { LookupSuggestionsList } from "./lookup-suggestions-list";
import { fetchDbLookupExportRows, loadDbLookupSuggestions } from "./policy-lookup-db";
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
  const {
    premiumState,
    loadingCharts,
    fetchPolicyExportRows,
  } = useFuturePremiumData();

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
  const lookupRequestRef = useRef(0);
  const suggestRequestRef = useRef(0);

  const runLookup = useCallback(
    async (token: string) => {
      if (!premiumState || !token.trim()) return;
      const requestId = ++lookupRequestRef.current;
      const lookupSource: FutureSourceKey = "policy_list_only";
      setBusy(true);
      setSearched(true);
      setResult(null);
      try {
        const raw = await fetchDbLookupExportRows(token, filterQuery, fetchPolicyExportRows);
        if (requestId !== lookupRequestRef.current) return;
        setResult(findLookupResult(token, raw, lookupSource, yearOffset, premiumState));
      } finally {
        if (requestId === lookupRequestRef.current) setBusy(false);
      }
    },
    [premiumState, fetchPolicyExportRows, filterQuery, yearOffset],
  );

  const handleGenerate = () => void runLookup(lookupNo);

  const selectSuggestion = useCallback(
    (suggestion: LookupSuggestion) => {
      setSuppressSuggestions(true);
      setLookupNo(suggestion.lookupValue);
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      void runLookup(suggestion.lookupValue);
    },
    [runLookup],
  );

  useEffect(() => {
    if (suppressSuggestions) return;
    const query = lookupNo.trim();
    if (query.length < lookupMinQueryLength(query)) {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      return;
    }
    const timer = setTimeout(() => {
      const requestId = ++suggestRequestRef.current;
      setSuggestBusy(true);
      void loadDbLookupSuggestions(query, filterQuery, fetchPolicyExportRows)
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
  }, [lookupNo, suppressSuggestions, filterQuery, fetchPolicyExportRows]);

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
                  setSuppressSuggestions(false);
                  setLookupNo(e.target.value);
                  setResult(null);
                  setSearched(false);
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
                <p className="mt-1 font-semibold">{result.policy}</p>
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
                <p className="text-muted-foreground text-xs font-semibold uppercase">Sum Insured</p>
                <p className="mt-1 font-semibold">₹{rs(result.si)}</p>
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
              <LookupField label="Policy Year" value={detailVal(["year", "policy_year", "policy year"])} />
              <LookupField label="Start Date" value={result.start} />
              <LookupField label="End Date" value={result.end} />
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
              <LookupField label="Courier" value={detailVal(["courier_status", "Courier Status"])} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Premium Breakdown</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rows = result.quote.rows.map((m) => ({
                    svkk_id: result.svkkId,
                    customer_id: result.customerId,
                    policy_number: result.policyNo,
                    holder_name: result.holder,
                    policy_type: result.policy,
                    sum_insured: result.si,
                    member_count: result.memberCount,
                    person_name: m.name,
                    role: m.role,
                    dob: m.dob,
                    age: m.age ?? "",
                    band: m.band || "",
                    basic_premium: m.basic || 0,
                    add_on_rider: m.rider || 0,
                    gross_premium: m.gross || 0,
                    discount_percent: m.pct || 0,
                    discount_amount: m.disc || 0,
                    net_premium: m.net || 0,
                    status: m.error || "Ready",
                  }));
                  downloadCsv(`policy-${result.policyNo}-detail.csv`, rows);
                }}
              >
                <Download className="mr-2 size-4" />
                Export detail CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Relationship</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead>Basic</TableHead>
                    <TableHead>Rider</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Discount %</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.quote.rows.map((m) => (
                    <TableRow key={`${m.name}-${m.dob}`}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell>{m.role}</TableCell>
                      <TableCell>{m.relationship || "—"}</TableCell>
                      <TableCell>{m.gender || "—"}</TableCell>
                      <TableCell>{m.dob || "—"}</TableCell>
                      <TableCell>{m.age ?? "—"}</TableCell>
                      <TableCell>{m.band || "—"}</TableCell>
                      <TableCell>{m.error ? m.error : `₹${rs(m.basic ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.rider ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.gross ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `${m.pct ?? 0}%`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.disc ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.net ?? 0)}`}</TableCell>
                      <TableCell>{m.error || "Ready"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
