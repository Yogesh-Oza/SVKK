import { ClaimLinkMode, ClaimPolicyMatchStatus, CsvImportMode } from "@prisma/client";
import { normalizePolicyNo } from "./claim-csv-normalize.js";

/**
 * Same-event identity for hybrid CCN handling (Phase 1).
 * Policy linking still uses Policy Number only; this identity is only used to
 * decide CREATE vs UPDATE vs REJECT when claimNo already exists.
 */
export type ClaimEventIdentity = {
  claimNo: string;
  policyId?: string | null;
  policyNo: string;
  admissionDate: Date | null;
  lodgeDate: Date | null;
  claimReceivedDate: Date | null;
  actualLodgeType: string | null;
  claimType: string | null;
};

export type ClaimEventClassification =
  | "NEW"
  | "SAME_EVENT"
  | "DIFFERENT_EVENT"
  | "WEAK_IDENTITY"
  | "N/A";

export type ClaimImportDisposition = "WILL_CREATE" | "WILL_UPDATE" | "WILL_REJECT";

export type ClaimImportDecision = {
  disposition: ClaimImportDisposition;
  dispositionReason: string;
  eventClassification: ClaimEventClassification;
  extraWarnings: string[];
};

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Admission UTC day: admission → else lodge → else received. */
export function claimEventDay(input: Pick<ClaimEventIdentity, "admissionDate" | "lodgeDate" | "claimReceivedDate">): string | null {
  const d = input.admissionDate ?? input.lodgeDate ?? input.claimReceivedDate ?? null;
  return d ? utcDayKey(d) : null;
}

/** Normalize lodge type to cashless / reimbursement / other (empty if blank). */
export function normalizeLodgeTypeBucket(
  actualLodgeType: string | null | undefined,
  claimType?: string | null | undefined,
): "cashless" | "reimbursement" | "other" | "" {
  const raw = (actualLodgeType ?? "").trim() || (claimType ?? "").trim();
  if (!raw) return "";
  const v = raw.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (v.includes("non cash") || v.includes("reimburs")) return "reimbursement";
  if (v.includes("cashless") || v.includes("cash less") || v === "cashless") return "cashless";
  if (v.includes("cash")) return "cashless";
  return "other";
}

function policyIdentityKey(row: ClaimEventIdentity): string {
  if (row.policyId?.trim()) return `id:${row.policyId.trim()}`;
  const no = normalizePolicyNo(row.policyNo);
  return no ? `no:${no}` : "";
}

function isWeakIdentity(row: ClaimEventIdentity): boolean {
  return !claimEventDay(row) && !normalizeLodgeTypeBucket(row.actualLodgeType, row.claimType);
}

/** TPA payment/status stages of an existing CCN — not a new hospital event. */
export function isTpaFollowOnLodgeType(
  actualLodgeType: string | null | undefined,
  claimType?: string | null | undefined,
): boolean {
  const raw = `${actualLodgeType ?? ""} ${claimType ?? ""}`.toLowerCase().replace(/[-_]/g, " ");
  return (
    raw.includes("additional") ||
    raw.includes("deduction") ||
    raw.includes("reconsider") ||
    raw.includes("ci received") ||
    raw.includes("ral lodged") ||
    raw.includes("al issued")
  );
}

/** Classify an incoming CCN against an existing claim (if any). */
export function classifyClaimEvent(
  incoming: ClaimEventIdentity,
  existing: ClaimEventIdentity | null,
): ClaimEventClassification {
  if (!existing) return "NEW";
  if (isWeakIdentity(incoming) || isWeakIdentity(existing)) return "WEAK_IDENTITY";

  const samePolicy = policyIdentityKey(incoming) !== "" && policyIdentityKey(incoming) === policyIdentityKey(existing);
  const followOn =
    isTpaFollowOnLodgeType(incoming.actualLodgeType, incoming.claimType) ||
    isTpaFollowOnLodgeType(existing.actualLodgeType, existing.claimType);
  if (samePolicy && followOn) return "SAME_EVENT";

  const sameDay = claimEventDay(incoming) === claimEventDay(existing);
  const sameLodge =
    normalizeLodgeTypeBucket(incoming.actualLodgeType, incoming.claimType) ===
    normalizeLodgeTypeBucket(existing.actualLodgeType, existing.claimType);

  if (samePolicy && sameDay && sameLodge) return "SAME_EVENT";
  return "DIFFERENT_EVENT";
}

function reject(
  reason: string,
  eventClassification: ClaimEventClassification,
  extraWarnings: string[] = [],
): ClaimImportDecision {
  return {
    disposition: "WILL_REJECT",
    dispositionReason: reason,
    eventClassification,
    extraWarnings,
  };
}

/**
 * Preview/import disposition: match gates first, then same-event UPDATE.
 * A different admission/event on an existing CCN updates the claim record in place
 * without overwriting identity fields; the source row is retained as a flagged event.
 */
export function decideClaimImportAction(opts: {
  matchStatus: ClaimPolicyMatchStatus;
  linkMode: ClaimLinkMode;
  existing: ClaimEventIdentity | null;
  incoming: ClaimEventIdentity;
  importMode?: CsvImportMode;
  validationError?: string | null;
}): ClaimImportDecision {
  const eventClassification = classifyClaimEvent(opts.incoming, opts.existing);

  if (opts.validationError) {
    return reject("validation", eventClassification);
  }
  if (opts.matchStatus === ClaimPolicyMatchStatus.CONFLICT) {
    return reject("conflict", eventClassification);
  }
  if (opts.matchStatus === ClaimPolicyMatchStatus.UNLINKED && opts.linkMode === ClaimLinkMode.STRICT_MATCH) {
    return reject("unlinked", eventClassification);
  }
  if (opts.importMode === CsvImportMode.UPDATE_ONLY && !opts.existing) {
    return reject("not_found", eventClassification);
  }
  if (opts.existing && eventClassification === "DIFFERENT_EVENT") {
    return {
      disposition: "WILL_UPDATE",
      dispositionReason: "different_event_retained",
      eventClassification,
      extraWarnings: ["different_event"],
    };
  }
  if (opts.existing) {
    return {
      disposition: "WILL_UPDATE",
      dispositionReason: eventClassification === "WEAK_IDENTITY" ? "weak_identity" : "same_event",
      eventClassification,
      extraWarnings: eventClassification === "WEAK_IDENTITY" ? ["event_identity_weak"] : [],
    };
  }
  return {
    disposition: "WILL_CREATE",
    dispositionReason: "new",
    eventClassification: "NEW",
    extraWarnings: [],
  };
}
