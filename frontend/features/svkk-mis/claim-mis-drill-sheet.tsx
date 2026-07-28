"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { formatInr } from "@/features/svkk-dashboard/currency";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { MisCsvExportDialog } from "./mis-csv-export-dialog";

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
  const [exportBusy, setExportBusy] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [detail, setDetail] = useState<DrillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !village) {
      setDetail(null);
      setError(null);
      setExportError(null);
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

  async function exportDrillCsv(columns: string[]) {
    if (!village) return;
    setExportBusy(true);
    setExportError(null);
    try {
      const q = new URLSearchParams(reportQueryString);
      q.set("drillVillage", village);
      columns.forEach((column) => q.append("fields", column));
      const res = await backendApi.get(`/mis/export/claim-report-detail.csv?${q.toString()}`, {
        responseType: "blob",
      });
      const slug = village
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claim-mis-village-${slug || "detail"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDialogOpen(false);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,640px)] w-[min(98vw,900px)] max-w-[min(98vw,900px)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(98vw,900px)]!">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle>Village: {village}</DialogTitle>
              <DialogDescription>
                Claim breakdown by category for this village. Uses the same date and filters as the
                main Claim MIS report.
              </DialogDescription>
              {exportError ? <p className="text-destructive text-sm">{exportError}</p> : null}
            </div>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={loading || exportBusy || !village}
              onClick={() => setExportDialogOpen(true)}
            >
              <Download className="size-3.5" />
              {exportBusy ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
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
      <MisCsvExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={exportDrillCsv}
        exporting={exportBusy}
        report="claim-report-detail"
        title="Export Claim MIS detail CSV"
        description="Choose which fields to include. Current table filters still apply to exported rows."
      />
    </Dialog>
  );
}
