"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { svkkJson } from "@/lib/svkk/api";
import { formatInr } from "@/features/svkk-dashboard/currency";
import { useEffect, useState } from "react";

type ClaimDrillRow = {
  label: string;
  claimCount: number;
  sumClaimAmount: number;
  sumApprovedAmount: number;
  sumDeductionAmount: number;
};

type DrillResponse = {
  drillVillage: string;
  rows: ClaimDrillRow[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  village: string | null;
  reportQueryString: string;
};

export function ClaimMisDrillSheet({ open, onOpenChange, village, reportQueryString }: Props) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DrillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !village) {
      setDetail(null);
      setError(null);
      return;
    }

    const q = new URLSearchParams(reportQueryString);
    q.set("drillVillage", village);

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await svkkJson<DrillResponse>(`/mis/claim-report/detail?${q.toString()}`);
        setDetail(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load claim detail");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, village, reportQueryString]);

  const totals = detail?.rows.reduce(
    (acc, r) => ({
      claimCount: acc.claimCount + r.claimCount,
      sumClaimAmount: acc.sumClaimAmount + r.sumClaimAmount,
      sumApprovedAmount: acc.sumApprovedAmount + r.sumApprovedAmount,
      sumDeductionAmount: acc.sumDeductionAmount + r.sumDeductionAmount,
    }),
    { claimCount: 0, sumClaimAmount: 0, sumApprovedAmount: 0, sumDeductionAmount: 0 },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,640px)] w-[min(98vw,900px)] max-w-[min(98vw,900px)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(98vw,900px)]!">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Village: {village}</DialogTitle>
          <DialogDescription>
            Claim breakdown by category for this village. Uses the same date and filters as the
            main Claim MIS report.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : !detail || !detail.rows.length ? (
            <p className="text-muted-foreground text-sm">No claims for this village.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="bg-muted/40 text-xs font-semibold">Category</TableHead>
                    <TableHead className="bg-muted/40 text-right text-xs font-semibold">
                      Claims
                    </TableHead>
                    <TableHead className="bg-muted/40 text-right text-xs font-semibold">
                      Claim amount
                    </TableHead>
                    <TableHead className="bg-muted/40 text-right text-xs font-semibold">
                      Approved amt
                    </TableHead>
                    <TableHead className="bg-muted/40 text-right text-xs font-semibold">
                      Deduction amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.rows.map((r) => (
                    <TableRow key={r.label} className="text-sm">
                      <TableCell className="font-medium uppercase">{r.label || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.claimCount.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInr(r.sumClaimAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInr(r.sumApprovedAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInr(r.sumDeductionAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {totals ? (
                    <TableRow className="border-t-2 border-t-foreground/10 bg-muted/30 font-medium">
                      <TableCell className="py-2 text-sm">TOTAL</TableCell>
                      <TableCell className="py-2 text-right text-sm tabular-nums">
                        {totals.claimCount.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm tabular-nums">
                        {formatInr(totals.sumClaimAmount)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm tabular-nums">
                        {formatInr(totals.sumApprovedAmount)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm tabular-nums">
                        {formatInr(totals.sumDeductionAmount)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
