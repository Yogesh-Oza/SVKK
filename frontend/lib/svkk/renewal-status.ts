export type PolicyRenewalStatus = "renewed" | "expired" | "active" | "no_end_date";

const LABELS: Record<PolicyRenewalStatus, string> = {
  renewed: "Renewed",
  expired: "Expired",
  active: "Active",
  no_end_date: "No End Date",
};

const BADGE_CLASS: Record<PolicyRenewalStatus, string> = {
  renewed: "border-slate-200 bg-slate-50 text-slate-700",
  expired: "border-amber-200 bg-amber-50 text-amber-800",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  no_end_date: "border-sky-200 bg-sky-50 text-sky-800",
};

/** Presentation-only mapping; status comes from the API. */
export function renewalStatusPresentation(status: PolicyRenewalStatus | null | undefined): {
  label: string;
  className: string;
} {
  if (!status || !(status in LABELS)) {
    return {
      label: "—",
      className: "border-muted bg-muted/40 text-muted-foreground",
    };
  }
  return { label: LABELS[status], className: BADGE_CLASS[status] };
}
