"use client";

import Link from "next/link";
import { useState } from "react";
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
  FUTURE_SOURCE_OPTIONS,
  FUTURE_YEAR_OPTIONS,
  resolveFutureRawRows,
} from "./future-premium-engine";
import { downloadCsv } from "./future-premium-export";
import type { FuturePremiumResult, FutureSourceKey } from "./future-premium-types";
import { useFuturePremiumData } from "./use-future-premium-data";

function LookupField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value || "—"} disabled />
    </div>
  );
}

export function FutureLookupPanel() {
  const {
    premiumState,
    uploadedRows,
    loadingCharts,
    ingestCsvFile,
    fetchPolicyExportRows,
  } = useFuturePremiumData();

  const [lookupNo, setLookupNo] = useState("");
  const [source, setSource] = useState<FutureSourceKey>("linked_upload");
  const [yearOffset, setYearOffset] = useState("0");
  const [result, setResult] = useState<FuturePremiumResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleGenerate = async () => {
    if (!premiumState) return;
    setBusy(true);
    setSearched(true);
    try {
      const raw = await resolveFutureRawRows(source, uploadedRows, fetchPolicyExportRows);
      const found = findLookupResult(lookupNo, raw, source, yearOffset, premiumState);
      setResult(found);
    } finally {
      setBusy(false);
    }
  };

  const details = result?.details ?? {};
  const detailVal = (keys: string[]) => getv(details, keys) || "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lookup</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Search by Policy Number, SVKK ID or Customer ID. Full details are shown below.
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
            Uses the same uploaded CSV session as Future Premium, or the live policy export when selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Policy / SVKK / Customer No.</Label>
              <Input
                value={lookupNo}
                onChange={(e) => setLookupNo(e.target.value)}
                placeholder="Enter policy no, SVKK ID or Customer ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as FutureSourceKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUTURE_SOURCE_OPTIONS.map((o) => (
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
              <Label>Actions</Label>
              <Button onClick={() => void handleGenerate()} disabled={busy || loadingCharts}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
                Generate
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Refresh uploaded CSV (optional)</Label>
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void ingestCsvFile(file);
              }}
            />
          </div>

          <p
            className={
              searched && lookupNo && !result
                ? "text-destructive bg-destructive/10 rounded-md border px-3 py-2 text-sm"
                : "bg-muted/60 text-primary rounded-md border px-3 py-2 text-sm font-medium"
            }
          >
            {result
              ? "Policy found. Full details are shown below."
              : searched && lookupNo
                ? "Policy not found in uploaded future data or Policy List."
                : "Enter number and click Generate."}
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
              <LookupField label="Source" value={result.source} />
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
                      <TableCell>{m.error ? m.error : `₹${rs(m.basic)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.rider)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.gross)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `${m.pct}%`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.disc)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.net)}`}</TableCell>
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
