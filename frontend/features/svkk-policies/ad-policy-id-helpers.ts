/** Reference No: `{group}{YYYY}{MMM}{seq4}` e.g. OTHER2025JUN3001 */
const REFERENCE_NO_PATTERN = /^([A-Za-z]+)(\d{4})([A-Za-z]{3})(\d{4})$/;

/** SVKK Public ID: `{group}{MMM}{seq4}` e.g. OTHERJUN3001 */
const SVKK_PUBLIC_ID_PATTERN = /^([A-Za-z]+)([A-Za-z]{3})(\d{4})$/;

export function normalizeGroupingToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "OTHER";
}

export function extractPolicyGroupingFromReferenceNo(refNo: string): string {
  const trimmed = refNo.trim();
  if (!trimmed) {
    return "";
  }
  const match = trimmed.match(REFERENCE_NO_PATTERN);
  return match ? normalizeGroupingToken(match[1]) : "";
}

export function extractPolicyGroupingFromSvkkPublicId(svkkPublicId: string): string {
  const trimmed = svkkPublicId.trim();
  if (!trimmed) {
    return "";
  }
  const match = trimmed.match(SVKK_PUBLIC_ID_PATTERN);
  return match ? normalizeGroupingToken(match[1]) : "";
}

export type PolicyGroupingSource = {
  policyGroup?: string;
  policyGrouping?: string;
  refNo?: string;
  svkkPublicId?: string;
};

/** Resolve policy grouping for auto-id APIs when the form field is blank. */
export function resolvePolicyGroupingForAutoId(source: PolicyGroupingSource): string {
  const fromForm = (source.policyGroup ?? "").trim() || (source.policyGrouping ?? "").trim();
  if (fromForm) {
    return normalizeGroupingToken(fromForm);
  }
  const fromRef = extractPolicyGroupingFromReferenceNo(source.refNo ?? "");
  if (fromRef) {
    return fromRef;
  }
  const fromSvkk = extractPolicyGroupingFromSvkkPublicId(source.svkkPublicId ?? "");
  if (fromSvkk) {
    return fromSvkk;
  }
  return "OTHER";
}
