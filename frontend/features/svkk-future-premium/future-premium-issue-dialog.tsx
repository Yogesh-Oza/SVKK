"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { listFuturePremiumIssues } from "./future-premium-issues";
import type { FuturePremiumResult } from "./future-premium-types";

type Props = {
  result: FuturePremiumResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

function PremiumSummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-md border border-primary/30 bg-primary px-3 py-2 text-primary-foreground"
          : "rounded-md border bg-muted/30 px-3 py-2"
      }
    >
      <p
        className={
          highlight
            ? "text-primary-foreground/80 text-xs font-semibold uppercase"
            : "text-muted-foreground text-xs font-semibold uppercase"
        }
      >
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Policy row detail popup — Ready and Issue statuses. */
export function FuturePremiumIssueDialog({ result, open, onOpenChange }: Props) {
  if (!result) return null;

  const issues = listFuturePremiumIssues(result);
  const hasIssues = result.status === "Issue" && issues.length > 0;
  const details = result.details ?? {};
  const detailVal = (keys: string[]) => getv(details, keys) || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,1100px)] max-w-[min(96vw,1100px)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1100px)]!">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>
            {hasIssues ? "Premium calculation issue" : "Policy premium details"} —{" "}
            {result.policyNo || result.svkkId}
          </DialogTitle>
          <DialogDescription>
            {result.holder} · {result.policy.replace(/_/g, " ")} · ₹{rs(result.si)} ·{" "}
            {result.memberCount} member(s) · {result.status}
          </DialogDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="text-primary text-sm font-medium hover:underline" onClick={() => window.print()}>
              Print details
            </button>
            <button type="button" className="text-primary text-sm font-medium hover:underline" onClick={() => navigator.clipboard.writeText(result.policyNo || "")}>
              Copy policy
            </button>
            <button type="button" className="text-primary text-sm font-medium hover:underline" onClick={() => navigator.clipboard.writeText(result.customerId || "")}>
              Copy customer ID
            </button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {hasIssues ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>
                {issues.length} issue{issues.length === 1 ? "" : "s"} found
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                  {issues.map((issue, idx) => (
                    <li key={`${issue.scope}-${issue.memberName ?? "policy"}-${idx}`}>
                      {issue.scope === "member" && issue.memberName ? (
                        <span className="font-medium">{issue.memberName}: </span>
                      ) : null}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>Premium calculated successfully</AlertTitle>
              <AlertDescription>
                All members have valid ages and chart rates for sum insured ₹{rs(result.si)}.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <PremiumSummaryCard label="Current Net" value={`₹${rs(result.currentPremium)}`} />
            <PremiumSummaryCard label="Future Net" value={`₹${rs(result.futurePremium)}`} />
            <PremiumSummaryCard label="Difference" value={`${result.premiumDiff >= 0 ? "+" : ""}₹${rs(result.premiumDiff)}`} />
            <PremiumSummaryCard label="Increase %" value={`${result.premiumIncreasePct.toFixed(2)}%`} highlight />
            <PremiumSummaryCard label="Status" value={result.status} />
          </div>
          <div className="rounded-md border bg-muted/20 p-4 text-sm">
            <p className="mb-2 font-semibold">Changes Summary</p>
            <p>{result.reasons.includes("Age Increased") ? "✓" : "•"} Age Increased</p>
            <p>✓ {result.memberTimeline.filter((m) => m.bandChanged).length} member(s) changed age band</p>
            <p>✓ Premium changed by {result.premiumDiff >= 0 ? "+" : ""}₹{rs(result.premiumDiff)}</p>
            <p>{result.currentSi === result.futureSi ? "✓ No SI change" : `✓ SI changed to ₹${rs(result.futureSi)}`}</p>
            <p>{result.currentPolicy === result.futurePolicy ? "✓ No Product change" : `✓ Product changed to ${result.futurePolicy}`}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <PremiumSummaryCard label="Base Premium" value={`₹${rs(result.quote.basic)}`} />
            <PremiumSummaryCard label="Rider" value={`₹${rs(result.quote.rider)}`} />
            <PremiumSummaryCard label="Gross" value={`₹${rs(result.quote.gross)}`} />
            <PremiumSummaryCard label={`Discount (${result.quote.gross ? Math.round((result.quote.disc / result.quote.gross) * 100) : 0}%)`} value={`₹${rs(result.quote.disc)}`} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField label="SVKK ID" value={result.svkkId} />
            <DetailField label="Customer ID" value={result.customerId} />
            <DetailField label="Policy No" value={result.policyNo} />
            <DetailField label="Source" value={result.source} />
            <DetailField label="Calculation year" value={String(result.calcYear)} />
            <DetailField label="Calculation date" value={result.calcDate} />
            <DetailField label="Current policy year" value={result.context.currentPolicyYear} />
            <DetailField label="Future renewal year" value={result.context.futurePolicyYear} />
            <DetailField label="Current start date" value={result.context.currentStartDate} />
            <DetailField label="Future start date" value={result.context.futureStartDate} />
            <DetailField label="Current end date" value={result.context.currentEndDate} />
            <DetailField label="Future end date" value={result.context.futureEndDate} />
            <DetailField label="Current SI" value={`₹${rs(result.currentSi)}`} />
            <DetailField label="Future SI" value={`₹${rs(result.futureSi)}`} />
            <DetailField label="Reasons" value={result.reasons.join(", ") || "—"} />
            <DetailField label="Category" value={detailVal(["category", "Category"])} />
            <DetailField label="Area" value={detailVal(["area", "Area"])} />
            <DetailField label="Village" value={detailVal(["village", "Village"])} />
            <DetailField label="Group" value={detailVal(["grouping", "group", "Grouping"])} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Member timeline comparison</h3>
            <div className="overflow-x-auto rounded-md border">
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
                      className={m.issue ? "bg-destructive/5" : m.bandChanged || m.deltaNet !== 0 ? "bg-amber-500/5" : undefined}
                    >
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.role}</TableCell>
                      <TableCell>{m.relationship || "—"}</TableCell>
                      <TableCell>{m.gender || "—"}</TableCell>
                      <TableCell>{m.dob || "—"}</TableCell>
                      <TableCell>{m.currentAge ?? "—"}</TableCell>
                      <TableCell>{m.futureAge ?? "—"}</TableCell>
                      <TableCell>{m.currentBand || "—"}</TableCell>
                      <TableCell>{m.futureBand || "—"}</TableCell>
                      <TableCell>₹{rs(m.currentNet)}</TableCell>
                      <TableCell>₹{rs(m.futureNet)}</TableCell>
                      <TableCell>{m.deltaNet >= 0 ? "+" : ""}₹{rs(m.deltaNet)}</TableCell>
                      <TableCell>{m.deltaPct.toFixed(2)}%</TableCell>
                      <TableCell
                        className={
                          m.issue ? "text-destructive font-medium" : "text-primary font-medium"
                        }
                      >
                        {m.issue || "Ready"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
