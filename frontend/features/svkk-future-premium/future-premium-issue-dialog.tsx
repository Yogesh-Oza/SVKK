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
            <PremiumSummaryCard label="Basic" value={`₹${rs(result.quote.basic)}`} />
            <PremiumSummaryCard label="Gross" value={`₹${rs(result.quote.gross)}`} />
            <PremiumSummaryCard label="Discount" value={`₹${rs(result.quote.disc)}`} />
            <PremiumSummaryCard label="Net" value={`₹${rs(result.quote.net)}`} highlight />
            <PremiumSummaryCard label="Status" value={result.status} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField label="SVKK ID" value={result.svkkId} />
            <DetailField label="Customer ID" value={result.customerId} />
            <DetailField label="Policy No" value={result.policyNo} />
            <DetailField label="Source" value={result.source} />
            <DetailField label="Calculation year" value={String(result.calcYear)} />
            <DetailField label="Calculation date" value={result.calcDate} />
            <DetailField label="Start date" value={result.start} />
            <DetailField label="End date" value={result.end} />
            <DetailField label="Category" value={detailVal(["category", "Category"])} />
            <DetailField label="Area" value={detailVal(["area", "Area"])} />
            <DetailField label="Village" value={detailVal(["village", "Village"])} />
            <DetailField label="Group" value={detailVal(["grouping", "group", "Grouping"])} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Member premium breakdown</h3>
            <div className="overflow-x-auto rounded-md border">
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
                    <TableHead>Disc %</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.quote.rows.map((m) => (
                    <TableRow
                      key={`${m.name}-${m.dob}`}
                      className={m.error ? "bg-destructive/5" : undefined}
                    >
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.role}</TableCell>
                      <TableCell>{m.relationship || "—"}</TableCell>
                      <TableCell>{m.gender || "—"}</TableCell>
                      <TableCell>{m.dob || "—"}</TableCell>
                      <TableCell>{m.age ?? "—"}</TableCell>
                      <TableCell>{m.band || "—"}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.basic ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.rider ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.gross ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `${m.pct ?? 0}%`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.disc ?? 0)}`}</TableCell>
                      <TableCell>{m.error ? "—" : `₹${rs(m.net ?? 0)}`}</TableCell>
                      <TableCell
                        className={
                          m.error ? "text-destructive font-medium" : "text-primary font-medium"
                        }
                      >
                        {m.error || "Ready"}
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
