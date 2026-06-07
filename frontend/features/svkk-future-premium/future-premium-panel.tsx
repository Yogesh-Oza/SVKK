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
  FUTURE_SOURCE_OPTIONS,
  FUTURE_YEAR_OPTIONS,
  resolveFutureRawRows,
  sourceLabel,
  yearOffsetLabel,
} from "./future-premium-engine";
import {
  detailExportRows,
  downloadCsv,
  FUTURE_PREMIUM_SAMPLE_ROWS,
  summaryExportRows,
} from "./future-premium-export";
import type { FuturePremiumResult, FutureSourceKey } from "./future-premium-types";
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

export function FuturePremiumPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    premiumState,
    uploadedRows,
    loadingCharts,
    loadingPolicies,
    ingestCsvFile,
    fetchPolicyExportRows,
  } = useFuturePremiumData();

  const [source, setSource] = useState<FutureSourceKey>("uploaded_csv_policy_list");
  const [yearOffset, setYearOffset] = useState("0");
  const [results, setResults] = useState<FuturePremiumResult[]>([]);
  const [generated, setGenerated] = useState(false);
  const [message, setMessage] = useState("Upload CSV to generate future premium records and MIS.");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [siFilter, setSiFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const mis = useMemo(() => computeFutureMis(generated ? results : []), [generated, results]);
  const visibleRows = useMemo(
    () => filterFutureResults(results, search, policyFilter, siFilter, statusFilter),
    [results, search, policyFilter, siFilter, statusFilter],
  );

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

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    const count = await ingestCsvFile(file);
    setResults([]);
    setGenerated(false);
    setMessage(
      count
        ? `CSV uploaded (${count} row(s)). Click Generate to create Future Premium and MIS.`
        : "CSV had no data rows.",
    );
  };

  const handleGenerate = async () => {
    if (!premiumState) {
      setMessage("Premium charts are still loading. Try again shortly.");
      return;
    }
    setBusy(true);
    try {
      const raw = await resolveFutureRawRows(source, uploadedRows, fetchPolicyExportRows);
      if (!raw.length) {
        setResults([]);
        setGenerated(false);
        setMessage(
          source === "policy_list_only"
            ? "No policies found in the system export."
            : "Please upload CSV first, then click Generate.",
        );
        return;
      }
      const next = buildFutureResults(raw, source, yearOffset, premiumState);
      setResults(next);
      setGenerated(true);
      setMessage(
        `Generated ${next.length} record(s) for ${yearOffsetLabel(yearOffset)} using ${sourceLabel(source)}.`,
      );
    } finally {
      setBusy(false);
    }
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
            Upload uses the same flexible CSV columns as the policy list (Format v2). Charts come from the admin panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as FutureSourceKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUTURE_SOURCE_OPTIONS.filter((o) => !o.lookup).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Upload CSV</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
            </div>
            <div className="space-y-2">
              <Label>Actions</Label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleGenerate()} disabled={busy || loadingCharts}>
                  {busy || loadingPolicies ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  Generate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadCsv("future-premium-sample.csv", FUTURE_PREMIUM_SAMPLE_ROWS)}
                >
                  Sample CSV
                </Button>
              </div>
            </div>
          </div>
          <p className="bg-muted/60 text-primary rounded-md border px-3 py-2 text-sm font-medium">{message}</p>
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
            formatLabel={(k) => k.replace(/_/g, " ").toUpperCase()}
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
                      {v.replace(/_/g, " ").toUpperCase()}
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
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>SVKK ID</TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>SI</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Calculation Year</TableHead>
                  <TableHead>Calculation Date</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length ? (
                  visibleRows.map((r) => (
                    <TableRow key={`${r.policyNo}-${r.svkkId}-${r.calcYear}`}>
                      <TableCell className="max-w-[140px] truncate">{r.source}</TableCell>
                      <TableCell>{r.svkkId}</TableCell>
                      <TableCell>{r.customerId}</TableCell>
                      <TableCell>{r.holder}</TableCell>
                      <TableCell>{r.policy}</TableCell>
                      <TableCell>₹{rs(r.si)}</TableCell>
                      <TableCell>{r.memberCount}</TableCell>
                      <TableCell>{r.calcYear}</TableCell>
                      <TableCell>{r.calcDate}</TableCell>
                      <TableCell>₹{rs(r.quote.gross)}</TableCell>
                      <TableCell>₹{rs(r.quote.disc)}</TableCell>
                      <TableCell>₹{rs(r.quote.net)}</TableCell>
                      <TableCell>{r.status}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={13} className="text-muted-foreground text-center">
                      {generated ? "No rows match the current filters." : "Generate to see results."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

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
    </div>
  );
}
