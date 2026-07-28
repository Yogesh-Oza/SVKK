import type { FuturePremiumResult } from "./future-premium-types";

export type FuturePremiumIssue = {
  scope: "policy" | "member";
  memberName?: string;
  message: string;
};

/** Collect policy- and member-level reasons a future premium row is marked Issue. */
export function listFuturePremiumIssues(result: FuturePremiumResult): FuturePremiumIssue[] {
  const issues: FuturePremiumIssue[] = [];

  if (!result.end?.trim()) {
    issues.push({
      scope: "policy",
      message: "Policy end date is missing or invalid — premium age is calculated as of this date.",
    });
  }
  if (!result.start?.trim()) {
    issues.push({
      scope: "policy",
      message: "Policy start date is missing or invalid.",
    });
  }
  if (!result.si) {
    issues.push({
      scope: "policy",
      message: "Sum insured is missing or zero — check the policy export / CSV row.",
    });
  }
  if (!result.policy?.trim()) {
    issues.push({
      scope: "policy",
      message: "Policy type could not be resolved from the source data.",
    });
  }

  for (const row of result.quote.rows) {
    if (row.error) {
      const message = row.error.includes("No premium found for SI")
        ? `${row.error}. Unsupported SI or missing chart configuration for this policy/product.`
        : row.error.includes("No age band found")
          ? `${row.error}. No premium slab matches this member age.`
          : row.error;
      issues.push({
        scope: "member",
        memberName: row.name,
        message,
      });
      continue;
    }
    if (!row.dob?.trim()) {
      issues.push({
        scope: "member",
        memberName: row.name,
        message: "Date of birth is missing — age cannot be calculated.",
      });
    }
  }

  if (!issues.length && result.status === "Issue") {
    issues.push({
      scope: "policy",
      message: "Premium could not be calculated for one or more members.",
    });
  }

  return issues;
}
