import { ClaimLinkMode, ClaimPolicyMatchStatus, CsvImportMode } from "@prisma/client";
import {
  classifyClaimEvent,
  decideClaimImportAction,
  type ClaimEventIdentity,
  type ClaimImportDecision,
} from "./claim-duplicate.js";
import type { ParsedClaimRow } from "./claim-csv-import.js";
import { emptyMatchStats, type ClaimImportMatchStats } from "./claim-csv-preview.js";
import type { ClaimMatchResult } from "./claim-policy-match.js";

export type ClaimSourceRowRole = "canonical" | "same_claim" | "different_event";

export type ClaimRowGroup = {
  claimNo: string;
  rows: ParsedClaimRow[];
  canonical: ParsedClaimRow;
  sameEventRows: ParsedClaimRow[];
  differentEventRows: ParsedClaimRow[];
};

export type GroupedClaimPreviewRow = {
  row: ParsedClaimRow;
  match: ClaimMatchResult;
  decision: ClaimImportDecision;
  sourceRowRole: ClaimSourceRowRole;
  sourceRowCount: number;
};

export type ExistingClaimIdentity = ClaimEventIdentity & { claimNo: string };

/** Trim Claim Number for grouping. Blank CCNs stay unique per row. */
export function normalizeClaimNo(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

/**
 * Prefer the original Cashless / Non Cash Less lodge over later TPA payment stages
 * (Additional / Deduction / Reconsideration / CI Received).
 */
export function primaryLodgePriority(claimType: string | null | undefined): number {
  const v = (claimType ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (!v) return 8;
  if (v.includes("non cash") || v.includes("reimburs")) return 0;
  if (v.includes("cashless") || v.includes("cash less") || v === "cash less" || v === "cashless") {
    return 0;
  }
  if (v.includes("additional")) return 2;
  if (v.includes("deduction")) return 3;
  if (v.includes("reconsider")) return 4;
  if (v.includes("ci received")) return 5;
  if (v.includes("ral")) return 6;
  if (v.includes("al issued")) return 7;
  return 1;
}

function rowTime(d: Date | null | undefined): number {
  return d ? d.getTime() : 0;
}

/** Pick the source row that should create/update the claim record. */
export function pickCanonicalClaimRow(rows: ParsedClaimRow[]): ParsedClaimRow {
  if (rows.length === 0) {
    throw new Error("pickCanonicalClaimRow requires at least one row");
  }
  return rows.reduce((best, row) => {
    const pBest = primaryLodgePriority(best.claimType);
    const pRow = primaryLodgePriority(row.claimType);
    if (pRow !== pBest) return pRow < pBest ? row : best;
    const amtBest = best.claimAmount ?? -1;
    const amtRow = row.claimAmount ?? -1;
    if (amtRow !== amtBest) return amtRow > amtBest ? row : best;
    const tBest = rowTime(best.lodgeDate);
    const tRow = rowTime(row.lodgeDate);
    if (tRow !== tBest) return tRow > tBest ? row : best;
    return row.rowNumber < best.rowNumber ? row : best;
  });
}

function identityFromParsed(
  row: ParsedClaimRow,
  policyId?: string | null,
): ClaimEventIdentity {
  return {
    claimNo: row.claimNo,
    policyId: policyId ?? null,
    policyNo: row.policyNo,
    admissionDate: row.admissionDate,
    lodgeDate: row.lodgeDate,
    claimReceivedDate: row.claimReceivedDate,
    actualLodgeType: row.actualLodgeType,
    claimType: row.claimType,
  };
}

/** Group TPA dump rows by Claim Number; extra rows are same-claim payment/events. */
export function groupParsedClaimRows(rows: ParsedClaimRow[]): ClaimRowGroup[] {
  const buckets = new Map<string, ParsedClaimRow[]>();
  for (const row of rows) {
    const ccn = normalizeClaimNo(row.claimNo);
    const key = ccn || `__blank__:${row.rowNumber}`;
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  const groups: ClaimRowGroup[] = [];
  for (const [key, list] of buckets) {
    const canonical = pickCanonicalClaimRow(list);
    const sameEventRows: ParsedClaimRow[] = [];
    const differentEventRows: ParsedClaimRow[] = [];
    const canonicalId = identityFromParsed(canonical);
    for (const row of list) {
      if (row === canonical) continue;
      const followOn = primaryLodgePriority(row.claimType) >= 2;
      const classification = classifyClaimEvent(identityFromParsed(row), canonicalId);
      if (!followOn && classification === "DIFFERENT_EVENT") differentEventRows.push(row);
      else sameEventRows.push(row);
    }
    groups.push({
      claimNo: normalizeClaimNo(canonical.claimNo) || key,
      rows: list,
      canonical,
      sameEventRows,
      differentEventRows,
    });
  }
  return groups;
}

function sameClaimDecision(canonical: ClaimImportDecision): ClaimImportDecision {
  if (canonical.disposition === "WILL_REJECT") return canonical;
  return {
    disposition: "WILL_UPDATE",
    dispositionReason: "same_ccn_source_row",
    eventClassification: "SAME_EVENT",
    extraWarnings: [],
  };
}

function differentEventDecision(): ClaimImportDecision {
  return {
    disposition: "WILL_REJECT",
    dispositionReason: "different_event",
    eventClassification: "DIFFERENT_EVENT",
    extraWarnings: [],
  };
}

/**
 * Preview/import decisions for every CSV row, with summary counted per unique CCN.
 * Extra same-CCN payment rows are not counted as extra creates.
 */
export function decideGroupedClaimPreview(opts: {
  groups: ClaimRowGroup[];
  matchByCanonicalRow: Map<number, ClaimMatchResult>;
  existingByNo: Map<string, ExistingClaimIdentity>;
  linkMode: ClaimLinkMode;
  importMode?: CsvImportMode;
  validateRow: (row: ParsedClaimRow) => string | null;
  identityFromRow: (row: ParsedClaimRow, match?: { policyId?: string }) => ClaimEventIdentity;
}): { preview: GroupedClaimPreviewRow[]; stats: ClaimImportMatchStats } {
  const stats = emptyMatchStats();
  const preview: GroupedClaimPreviewRow[] = [];
  let csvRows = 0;

  for (const group of opts.groups) {
    csvRows += group.rows.length;
    const match = opts.matchByCanonicalRow.get(group.canonical.rowNumber);
    if (!match) {
      throw new Error(`Missing policy match for canonical row ${group.canonical.rowNumber}`);
    }

    const existing = opts.existingByNo.get(normalizeClaimNo(group.canonical.claimNo));
    const canonicalDecision = decideClaimImportAction({
      matchStatus: match.matchStatus,
      linkMode: opts.linkMode,
      existing: existing ?? null,
      incoming: opts.identityFromRow(group.canonical, match),
      importMode: opts.importMode,
      validationError: opts.validateRow(group.canonical),
    });

    stats.uniqueClaims++;
    if (canonicalDecision.disposition === "WILL_CREATE") stats.willCreate++;
    else if (canonicalDecision.disposition === "WILL_UPDATE") stats.willUpdate++;
    else stats.willReject++;

    if (match.matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT) stats.matchedExact++;
    else if (match.matchStatus === ClaimPolicyMatchStatus.UNLINKED) stats.unlinked++;
    else if (match.matchStatus === ClaimPolicyMatchStatus.CONFLICT) stats.conflicts++;

    const canonicalWarnings = [...match.verificationWarnings, ...canonicalDecision.extraWarnings];
    if (canonicalWarnings.length > 0) stats.verificationWarnings++;

    if (canonicalDecision.dispositionReason === "different_event") {
      stats.differentEventBlocked++;
    }
    stats.sameCcnExtraRows += group.sameEventRows.length;
    if (group.differentEventRows.length > 0) {
      stats.differentEventBlocked += group.differentEventRows.length;
    }

    preview.push({
      row: group.canonical,
      match,
      decision: canonicalDecision,
      sourceRowRole: "canonical",
      sourceRowCount: group.rows.length,
    });
    for (const row of group.sameEventRows) {
      preview.push({
        row,
        match,
        decision: sameClaimDecision(canonicalDecision),
        sourceRowRole: "same_claim",
        sourceRowCount: group.rows.length,
      });
    }
    for (const row of group.differentEventRows) {
      preview.push({
        row,
        match,
        decision: differentEventDecision(),
        sourceRowRole: "different_event",
        sourceRowCount: group.rows.length,
      });
    }
  }

  stats.totalRows = csvRows;
  preview.sort((a, b) => a.row.rowNumber - b.row.rowNumber);
  return { preview, stats };
}
