"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { getSvkkErrorMessage } from "@/lib/svkk/api-error";
import { backendApi } from "@/lib/svkk/api";
import { AlertTriangle, Download, FileSpreadsheet } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type MatchStatus = "MATCHED_EXACT" | "UNLINKED" | "CONFLICT";
type Disposition = "WILL_CREATE" | "WILL_UPDATE" | "WILL_REJECT";
type EventClassification = "NEW" | "SAME_EVENT" | "DIFFERENT_EVENT" | "WEAK_IDENTITY" | "N/A";

type PreviewRow = {
  rowNumber: number;
  claimNo: string;
  policyNo: string;
  matchStatus: MatchStatus;
  matchReason?: string;
  alreadyExists?: boolean;
  verificationWarnings?: string[];
  policyHolderName?: string;
  claimAmount?: number | null;
  disposition?: Disposition;
  dispositionReason?: string;
  eventClassification?: EventClassification;
};

type MatchSummary = {
  totalRows: number;
  matchedExact: number;
  unlinked: number;
  conflicts: number;
  verificationWarnings: number;
  willCreate?: number;
  willUpdate?: number;
  willReject?: number;
  differentEventBlocked?: number;
};

type DuplicateImportInfo = {
  jobId: string;
  completedAt: string;
  fileName?: string;
};

type ImportResult = {
  jobId: string;
  created: number;
  updated: number;
  failed: number;
  matchStats: MatchSummary;
  errorReportUrl?: string;
};

function warningLabel(code: string): string {
  const labels: Record<string, string> = {
    svkk: "SVKK mismatch",
    policy_type: "Policy type",
    policy_dates: "Policy dates",
    policy_year_ambiguous: "Year ambiguous",
    holder_name: "Holder name",
    sum_insured: "Sum insured",
    insurance_company: "Insurer",
    event_identity_weak: "Weak event identity",
  };
  return labels[code] ?? code;
}

function dispositionBadge(row: PreviewRow): { label: string; className: string } {
  if (row.disposition === "WILL_UPDATE") {
    return { label: "Will update", className: "text-sky-700" };
  }
  if (row.disposition === "WILL_CREATE") {
    return { label: "Will create", className: "text-emerald-600" };
  }
  if (row.dispositionReason === "different_event" || row.eventClassification === "DIFFERENT_EVENT") {
    return { label: "Duplicate event", className: "text-amber-700" };
  }
  if (row.matchStatus === "CONFLICT" || row.dispositionReason === "conflict") {
    return { label: "Conflict", className: "text-amber-600" };
  }
  if (row.matchStatus === "UNLINKED" || row.dispositionReason === "unlinked") {
    return { label: "Unlinked", className: "text-destructive" };
  }
  return { label: "Will reject", className: "text-destructive" };
}

function formatImportTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function duplicateImportDescription(info: DuplicateImportInfo): string {
  const when = formatImportTimestamp(info.completedAt);
  const file = info.fileName ? ` (${info.fileName})` : "";
  return `This file was already imported on ${when}${file}. Job ${info.jobId.slice(0, 8)}…`;
}

const CLAIM_IMPORT_MODE = "CREATE_ONLY" as const;

type ClaimCsvImportInlineProps = {
  disabled?: boolean;
  onImported?: () => void;
};

export function ClaimCsvImportInline({ disabled = false, onImported }: ClaimCsvImportInlineProps) {
  const [file, setFile] = useState<File | null>(null);
  const [linkMode, setLinkMode] = useState<"STRICT_MATCH" | "ALLOW_UNLINKED">("STRICT_MATCH");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [duplicateImport, setDuplicateImport] = useState<DuplicateImportInfo | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [importMsg, setImportMsg] = useState("");

  const downloadSample = useCallback(async () => {
    try {
      const res = await backendApi.get("/claims/export-sample.csv", { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SVKK_Claim_Sample_Template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Download failed"));
    }
  }, []);

  const runPreview = useCallback(async () => {
    if (!file) {
      toast.error("Choose a CSV or XLSX file first");
      return;
    }
    setPreviewBusy(true);
    setLastResult(null);
    setImportMsg("");
    setDuplicateImport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("linkMode", linkMode);
      fd.append("importMode", CLAIM_IMPORT_MODE);
      const { data } = await backendApi.post<{
        previewToken: string;
        previewRows: PreviewRow[];
        summary: MatchSummary;
        duplicateImport?: DuplicateImportInfo | null;
      }>("/upload/claim-csv/preview", fd);
      setPreviewToken(data.previewToken);
      setPreviewRows(data.previewRows);
      setSummary(data.summary);
      setDuplicateImport(data.duplicateImport ?? null);
      setPreviewOpen(true);
      if (data.duplicateImport) {
        toast.warning("This file was imported before", {
          description: duplicateImportDescription(data.duplicateImport),
        });
      }
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Preview failed"));
    } finally {
      setPreviewBusy(false);
    }
  }, [file, linkMode]);

  const confirmImport = useCallback(
    async (force = false) => {
      if (!previewToken) return;
      setConfirmBusy(true);
      try {
        const { data } = await backendApi.post<ImportResult>("/upload/claim-csv/confirm", {
          previewToken,
          force,
        });
        setLastResult(data);
        setDuplicateImport(null);
        setPreviewOpen(false);
        setImportMsg(
          `Import job ${data.jobId.slice(0, 8)}… — ${data.created} created, ${data.updated} updated, ${data.failed} failed`,
        );
        toast.success(`Import complete: ${data.created} created, ${data.updated} updated`);
        onImported?.();
      } catch (e) {
        toast.error(getSvkkErrorMessage(e, "Import failed"));
      } finally {
        setConfirmBusy(false);
      }
    },
    [onImported, previewToken],
  );

  const confirmDisabled =
    linkMode === "STRICT_MATCH" && summary != null && (summary.conflicts > 0 || summary.unlinked > 0);

  const blockConfirm = Boolean(duplicateImport) && !confirmDisabled;

  return (
    <>
      <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
        Upload CSV / XLSX
        <span className="text-muted-foreground ml-2 font-normal">
          Same claim event updates; a different event with the same CCN is rejected
        </span>
      </Label>
      <div className="border-primary/20 bg-muted/20 rounded-xl border border-dashed p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FileSpreadsheet className="text-muted-foreground size-5 shrink-0" />
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                disabled={disabled}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setLastResult(null);
                  setImportMsg("");
                  setDuplicateImport(null);
                }}
                className="text-foreground w-full cursor-pointer text-sm font-bold file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-xs file:font-bold disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Badge variant="secondary" className="shrink-0 font-bold">
              Same-event update
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Link mode</Label>
              <Select
                value={linkMode}
                disabled={disabled}
                onValueChange={(v) => setLinkMode(v as typeof linkMode)}
              >
                <SelectTrigger className="h-9 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRICT_MATCH">Strict match</SelectItem>
                  <SelectItem value="ALLOW_UNLINKED">Allow unlinked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 font-bold"
              disabled={disabled}
              onClick={() => void downloadSample()}
            >
              <Download className="size-3.5" />
              Sample CSV
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 font-bold"
              disabled={disabled || !file || previewBusy}
              onClick={() => void runPreview()}
            >
              {previewBusy ? "Analyzing…" : "Preview import"}
            </Button>
          </div>
        </div>
      </div>
      {importMsg ? <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{importMsg}</p> : null}
      {lastResult ? (
        <div className="text-muted-foreground mt-2 space-y-1 text-xs leading-relaxed">
          <p>
            Matched {lastResult.matchStats.matchedExact} · Unlinked {lastResult.matchStats.unlinked} ·
            Conflicts {lastResult.matchStats.conflicts} · Created {lastResult.created} · Updated{" "}
            {lastResult.updated}
          </p>
          {lastResult.errorReportUrl ? (
            <a className="text-primary font-bold underline" href={lastResult.errorReportUrl}>
              Download error report
            </a>
          ) : null}
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
            <DialogDescription>
              First 20 rows shown. Review match status before confirming.
            </DialogDescription>
          </DialogHeader>

          {duplicateImport ? (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="text-amber-600" />
              <AlertTitle>File already imported</AlertTitle>
              <AlertDescription>{duplicateImportDescription(duplicateImport)}</AlertDescription>
            </Alert>
          ) : null}

          {summary ? (
            <p className="text-muted-foreground text-sm">
              {summary.willCreate ?? 0} will create · {summary.willUpdate ?? 0} will update ·{" "}
              {summary.willReject ?? 0} will reject · {summary.matchedExact} matched ·{" "}
              {summary.unlinked} unlinked · {summary.conflicts} conflicts ·{" "}
              {summary.verificationWarnings} verification warnings · {summary.totalRows} total rows
            </p>
          ) : null}

          {summary && (summary.differentEventBlocked ?? 0) > 0 ? (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="text-amber-600" />
              <AlertTitle>Duplicate claim events</AlertTitle>
              <AlertDescription>
                {summary.differentEventBlocked} row{summary.differentEventBlocked === 1 ? "" : "s"}{" "}
                have the same Claim Number as a different event and will be rejected. Other rows can
                still import.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Policy #</TableHead>
                  <TableHead>Disposition</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => {
                  const badge = dispositionBadge(row);
                  return (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="font-mono text-xs">{row.claimNo}</TableCell>
                      <TableCell className="font-mono text-xs">{row.policyNo || "—"}</TableCell>
                      <TableCell className={badge.className}>{badge.label}</TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                        {row.matchReason || row.dispositionReason || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.verificationWarnings?.length ? (
                          <span className="flex flex-wrap gap-1">
                            {row.verificationWarnings.map((w) => (
                              <Badge key={w} variant="outline" className="text-[10px] font-normal">
                                {warningLabel(w)}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {confirmDisabled ? (
            <p className="text-destructive text-xs">
              Strict match mode: resolve unlinked/conflict rows or switch to Allow unlinked before
              importing.
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            {blockConfirm ? (
              <Button
                type="button"
                variant="outline"
                disabled={confirmBusy}
                onClick={() => void confirmImport(true)}
              >
                {confirmBusy ? "Importing…" : "Import anyway"}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={confirmBusy || confirmDisabled || blockConfirm}
              onClick={() => void confirmImport(false)}
            >
              {confirmBusy ? "Importing…" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** @deprecated Use ClaimCsvImportInline inside the filters card. */
export function ClaimCsvImportPanel({ onImported }: { onImported?: () => void }) {
  return (
    <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Import claims (CSV / XLSX)</h2>
      <ClaimCsvImportInline onImported={onImported} />
    </div>
  );
}
