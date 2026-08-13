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
import { formatDateCell, formatInrRupee, StatusBadge } from "@/features/svkk-claims/claim-register-badges";
import { getSvkkErrorMessage } from "@/lib/svkk/api-error";
import { backendApi } from "@/lib/svkk/api";
import { AlertTriangle, Download, FileSpreadsheet, Search } from "lucide-react";
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
  svkkPublicId?: string;
  policyHolderName?: string;
  patientName?: string | null;
  hospitalName?: string | null;
  hospitalArea?: string | null;
  insuranceCompany?: string | null;
  statusText?: string | null;
  lodgeType?: string | null;
  claimAmount?: number | null;
  paidAmount?: number | null;
  admissionDate?: string | null;
  policyYear?: string | null;
  disposition?: Disposition;
  dispositionReason?: string;
  eventClassification?: EventClassification;
  sourceRowRole?: "canonical" | "same_claim" | "different_event";
  sourceRowCount?: number;
};

type PreviewFilter =
  | "all"
  | "attention"
  | "create"
  | "update"
  | "reject"
  | "unlinked"
  | "conflict"
  | "warnings";

type MatchSummary = {
  totalRows: number;
  uniqueClaims?: number;
  sameCcnExtraRows?: number;
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
    svkk: "SVKK ID differs",
    policy_type: "Policy type differs",
    policy_dates: "Policy dates differ",
    policy_year_ambiguous: "Policy year unclear",
    holder_name: "Holder name differs",
    sum_insured: "Sum insured differs",
    insurance_company: "Insurer name differs",
    event_identity_weak: "Weak event identity",
    policy_number_shared: "Shared policy number",
  };
  return labels[code] ?? code;
}

function warningHint(code: string): string {
  const hints: Record<string, string> = {
    svkk: "SVKK ID in the file does not match the linked policy. The claim still links by Policy Number.",
    policy_type: "Product/type in the file does not match the linked policy.",
    policy_dates: "Start/end dates in the file do not match the linked policy.",
    policy_year_ambiguous: "Could not pick a single policy year from admission/lodge dates.",
    holder_name: "Holder name in the file does not match the policy holder. The claim still links by Policy Number.",
    sum_insured: "Sum insured in the file does not match the linked policy year.",
    insurance_company: "Insurer name in the file does not match the linked policy. The claim still links by Policy Number.",
    event_identity_weak: "Admission/lodge details are thin, so same-claim vs new-event is uncertain.",
    policy_number_shared:
      "More than one live policy uses this Policy Number. Linked to the record whose year covers the admission date.",
  };
  return hints[code] ?? "Verification difference vs the linked policy. Import can still proceed.";
}

function dispositionExplain(row: PreviewRow): string {
  if (row.dispositionReason === "same_ccn_source_row" || row.sourceRowRole === "same_claim") {
    const n = row.sourceRowCount && row.sourceRowCount > 1 ? ` (${row.sourceRowCount} rows for this CCN)` : "";
    return `Same Claim Number — payment/event row, not a new claim${n}.`;
  }
  if (row.disposition === "WILL_UPDATE") {
    return row.dispositionReason === "weak_identity"
      ? "Claim number already exists. Identity is weak, so the existing claim will be updated."
      : "Claim number already exists for the same event. The existing claim will be updated.";
  }
  if (row.disposition === "WILL_CREATE") {
    if (row.matchStatus === "UNLINKED") {
      return "Will add as a new claim without linking to a policy (Allow unlinked).";
    }
    const extra =
      row.sourceRowCount && row.sourceRowCount > 1
        ? ` ${row.sourceRowCount} CSV rows belong to this Claim Number.`
        : "";
    return row.policyYear
      ? `Will add as a new claim, linked to this policy (${row.policyYear}).${extra}`
      : `Will add as a new claim, linked to this policy.${extra}`;
  }
  if (row.dispositionReason === "different_event" || row.eventClassification === "DIFFERENT_EVENT") {
    return "Claim Number already exists with a different admission/event.";
  }
  if (row.matchStatus === "CONFLICT" || row.dispositionReason === "conflict") {
    return "Policy Number matches multiple live policies. Claim cannot be linked safely.";
  }
  if (row.matchStatus === "UNLINKED" || row.dispositionReason === "unlinked") {
    return "No policy found for this Policy Number.";
  }
  if (row.dispositionReason === "validation") {
    return "Claim Number is missing or invalid.";
  }
  return row.matchReason || "This row will be skipped.";
}

function rowNeedsAttention(row: PreviewRow): boolean {
  return (
    row.disposition === "WILL_REJECT" ||
    row.matchStatus === "UNLINKED" ||
    row.matchStatus === "CONFLICT"
  );
}

function uniqueClaimCount(rows: PreviewRow[]): number {
  const nos = new Set<string>();
  for (const row of rows) {
    const no = row.claimNo.trim();
    if (no) nos.add(no);
  }
  return nos.size;
}

function rowMatchesFilter(row: PreviewRow, filter: PreviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return rowNeedsAttention(row);
  if (filter === "create") return row.disposition === "WILL_CREATE";
  if (filter === "update") {
    return row.disposition === "WILL_UPDATE" && row.dispositionReason !== "same_ccn_source_row";
  }
  if (filter === "reject") return row.disposition === "WILL_REJECT";
  if (filter === "unlinked") return row.matchStatus === "UNLINKED";
  if (filter === "conflict") return row.matchStatus === "CONFLICT";
  if (filter === "warnings") return (row.verificationWarnings?.length ?? 0) > 0;
  return true;
}

function rowSearchHaystack(row: PreviewRow): string {
  return [
    row.claimNo,
    row.policyNo,
    row.svkkPublicId,
    row.policyHolderName,
    row.patientName,
    row.hospitalName,
    row.hospitalArea,
    row.insuranceCompany,
    row.statusText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function dispositionBadge(row: PreviewRow): { label: string; className: string } {
  if (row.dispositionReason === "same_ccn_source_row" || row.sourceRowRole === "same_claim") {
    return { label: "Same claim", className: "text-sky-700" };
  }
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
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [previewSearch, setPreviewSearch] = useState("");

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
      setPreviewFilter("all");
      setPreviewSearch("");
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
    summary != null && (summary.willCreate ?? 0) + (summary.willUpdate ?? 0) === 0;

  const blockConfirm = Boolean(duplicateImport) && !confirmDisabled;

  const attentionCount = uniqueClaimCount(previewRows.filter(rowNeedsAttention));
  const searchNeedle = previewSearch.trim().toLowerCase();
  const visibleRows = previewRows.filter((row) => {
    if (!rowMatchesFilter(row, previewFilter)) return false;
    if (!searchNeedle) return true;
    return rowSearchHaystack(row).includes(searchNeedle);
  });
  const visibleUniqueClaims = uniqueClaimCount(visibleRows);

  const filterChips: { id: PreviewFilter; label: string; count: number }[] = [
    { id: "all", label: "CSV rows", count: summary?.totalRows ?? previewRows.length },
    { id: "attention", label: "Needs attention", count: attentionCount },
    { id: "create", label: "Will create", count: summary?.willCreate ?? 0 },
    { id: "update", label: "Will update", count: summary?.willUpdate ?? 0 },
    { id: "reject", label: "Will reject", count: summary?.willReject ?? 0 },
    { id: "unlinked", label: "Unlinked", count: summary?.unlinked ?? 0 },
    { id: "conflict", label: "Conflicts", count: summary?.conflicts ?? 0 },
    { id: "warnings", label: "Warnings", count: summary?.verificationWarnings ?? 0 },
  ];

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
        <DialogContent className="flex h-[min(92vh,920px)] max-h-[92vh] w-[min(98vw,1280px)] max-w-[min(98vw,1280px)] flex-col gap-3 overflow-hidden sm:max-w-[min(98vw,1280px)]">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
            <DialogDescription>
              {summary
                ? `${summary.totalRows.toLocaleString("en-IN")} CSV rows · ${(summary.uniqueClaims ?? previewRows.length).toLocaleString("en-IN")} unique claims. Multiple rows can belong to the same Claim Number (TPA payments/events).`
                : `${previewRows.length.toLocaleString("en-IN")} rows from the file.`}{" "}
              Warnings do not block import — only Unlinked and Conflicts do in Strict match.
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
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <Button
                  key={chip.id}
                  type="button"
                  size="sm"
                  variant={previewFilter === chip.id ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs font-bold"
                  onClick={() => setPreviewFilter(chip.id)}
                >
                  {chip.label} {chip.count}
                </Button>
              ))}
            </div>
          ) : null}

          {summary && (summary.differentEventBlocked ?? 0) > 0 ? (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="text-amber-600" />
              <AlertTitle>Duplicate claim events</AlertTitle>
              <AlertDescription>
                {summary.differentEventBlocked} row{summary.differentEventBlocked === 1 ? "" : "s"}{" "}
                reuse a Claim Number with a different admission/event and will be rejected. Same
                Claim Number with Additional / Deduction payments is one claim, not a conflict.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              placeholder="Search claim #, policy #, holder, patient, hospital…"
              className="h-8 pl-8 text-sm"
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Showing {visibleRows.length.toLocaleString("en-IN")} of{" "}
            {previewRows.length.toLocaleString("en-IN")} CSV rows
            {previewFilter === "all" && summary?.uniqueClaims != null
              ? ` · ${summary.uniqueClaims.toLocaleString("en-IN")} unique claims`
              : previewFilter !== "all"
                ? ` · ${visibleUniqueClaims.toLocaleString("en-IN")} unique claim${visibleUniqueClaims === 1 ? "" : "s"} in this filter`
                : ""}
            {previewFilter !== "all" ? ` · filter: ${previewFilter}` : ""}
          </p>

          <div className="min-h-0 flex-1 overflow-auto rounded border">
            <Table>
              <TableHeader className="bg-background sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead>Claim / Patient</TableHead>
                  <TableHead>Policy / Holder</TableHead>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Admission</TableHead>
                  <TableHead>Lodge amt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>What happens</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-muted-foreground py-8 text-center text-sm">
                      No claims match this filter or search.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => {
                    const badge = dispositionBadge(row);
                    return (
                      <TableRow
                        key={row.rowNumber}
                        className="[content-visibility:auto] [contain-intrinsic-size:auto_56px]"
                      >
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {row.rowNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{row.claimNo || "—"}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {row.patientName || "No patient name"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{row.policyNo || "—"}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {row.policyHolderName || "—"}
                            {row.svkkPublicId ? ` · ${row.svkkPublicId}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[160px] text-xs">
                          <div className="truncate" title={row.hospitalName ?? undefined}>
                            {row.hospitalName || "—"}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {row.hospitalArea || row.insuranceCompany || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateCell(row.admissionDate)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatInrRupee(row.claimAmount)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <StatusBadge value={row.statusText} />
                          {row.lodgeType ? (
                            <div className="text-muted-foreground mt-0.5 text-[11px]">{row.lodgeType}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className={`text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </TableCell>
                        <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                          {dispositionExplain(row)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.verificationWarnings?.length ? (
                            <span className="flex flex-wrap gap-1">
                              {row.verificationWarnings.map((w) => (
                                <Badge
                                  key={w}
                                  variant="outline"
                                  className="text-[10px] font-normal"
                                  title={warningHint(w)}
                                >
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
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {(summary?.unlinked ?? 0) > 0 || (summary?.conflicts ?? 0) > 0 ? (
            <p className="text-destructive text-xs">
              {linkMode === "ALLOW_UNLINKED"
                ? `${summary?.unlinked ?? 0} unlinked claim${(summary?.unlinked ?? 0) === 1 ? "" : "s"} will be created without a policy. ${summary?.conflicts ?? 0} conflict claim${(summary?.conflicts ?? 0) === 1 ? "" : "s"} still cannot be linked.`
                : `Strict match will skip ${summary?.unlinked ?? 0} unlinked and ${summary?.conflicts ?? 0} conflict claim${(summary?.conflicts ?? 0) === 1 ? "" : "s"}. Other claims can still import.`}{" "}
              Unlinked/Conflict chips count unique Claim Numbers — the table still lists every CSV
              payment row for those claims.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Holder / insurer warnings mean the file text differs from the policy register. The
              claim still links by Policy Number. One policy can have many claims; repeated Claim
              Numbers are payment/event rows of the same claim.
            </p>
          )}

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
