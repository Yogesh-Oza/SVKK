"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rs } from "@/lib/svkk/premium";
import type { Quote } from "@/lib/svkk/premium/types";
import {
  categoryBcHelperBaseSiLabel,
  categoryBcHelperFieldHint,
  type CategoryBcHelperPolicyType,
} from "./category-bc-base-premium-helper";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyTypeLabel: string;
  policyType: CategoryBcHelperPolicyType;
  categoryLabel: string;
  actualSi: number;
  baseSi: number;
  quote: Quote | null;
  onApply: (premiumValue: string) => void;
};

export function CategoryBcBasePremiumDialog({
  open,
  onOpenChange,
  policyTypeLabel,
  policyType,
  categoryLabel,
  actualSi,
  baseSi,
  quote,
  onApply,
}: Props) {
  const hasRows = Boolean(quote?.rows.length);
  const hasErrors = Boolean(quote?.rows.some((row) => row.error));
  const canApply = Boolean(quote && hasRows && !hasErrors && quote.net >= 0);
  const baseLabel = categoryBcHelperBaseSiLabel(policyType);
  const applyHint = categoryBcHelperFieldHint(policyType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,820px)] w-[min(96vw,960px)] max-w-[min(96vw,960px)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,960px)]!">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Base premium helper (Category {categoryLabel.toUpperCase()})</DialogTitle>
          <DialogDescription className="text-foreground pt-1 text-sm leading-relaxed">
            For Category B/C policies with higher sum insured, settle using the chart premium at the
            base SI slab ({baseLabel}). This does not change your policy SI.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Policy Type" value={policyTypeLabel || "—"} />
            <Detail label="Actual Policy SI" value={actualSi > 0 ? `₹${rs(actualSi)}` : "—"} />
            <Detail label="Base SI for calculation" value={`₹${rs(baseSi)}`} />
            <Detail
              label="Calculated base premium (net)"
              value={quote && !hasErrors ? `₹${rs(quote.net)}` : "—"}
              highlight
            />
          </div>

          {quote ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Basic" value={quote.basic} />
              <Metric label="Add-on Rider" value={quote.rider} />
              <Metric label="Gross" value={quote.gross} />
              <Metric label="Discount" value={quote.disc} />
              <Metric label="Net" value={quote.net} highlight />
            </div>
          ) : null}

          {hasRows ? (
            <div className="overflow-x-auto rounded border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Person</th>
                    <th className="p-2 text-left">Role</th>
                    <th className="p-2 text-left">Age</th>
                    <th className="p-2 text-left">Relationship</th>
                    <th className="p-2 text-right">Sum Insured</th>
                    <th className="p-2 text-left">Band</th>
                    <th className="p-2 text-right">Basic</th>
                    <th className="p-2 text-right">Gross</th>
                    <th className="p-2 text-right">Discount</th>
                    <th className="p-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {quote!.rows.map((row, idx) => {
                    if ("error" in row && row.error) {
                      return (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{row.name || `Person ${idx + 1}`}</td>
                          <td className="text-destructive p-2" colSpan={9}>
                            {row.error}
                          </td>
                        </tr>
                      );
                    }
                    const ok = row as {
                      name: string;
                      role: string;
                      age: number;
                      relationship: string;
                      band: string;
                      basic: number;
                      gross: number;
                      disc: number;
                      net: number;
                    };
                    return (
                      <tr key={idx} className="border-t">
                        <td className="p-2">{ok.name}</td>
                        <td className="p-2 capitalize">{ok.role}</td>
                        <td className="p-2 tabular-nums">{ok.age}</td>
                        <td className="p-2 capitalize">{ok.relationship}</td>
                        <td className="p-2 text-right tabular-nums">₹{rs(baseSi)}</td>
                        <td className="p-2">{ok.band}</td>
                        <td className="p-2 text-right tabular-nums">₹{rs(ok.basic)}</td>
                        <td className="p-2 text-right tabular-nums">₹{rs(ok.gross)}</td>
                        <td className="p-2 text-right tabular-nums">₹{rs(ok.disc)}</td>
                        <td className="p-2 text-right tabular-nums">₹{rs(ok.net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Add policy holder DOB (and members if needed) so the chart can calculate the base
              premium.
            </p>
          )}

          <p className="text-muted-foreground text-xs">
            Apply fills <span className="font-medium text-foreground">{applyHint}</span> into{" "}
            <span className="font-medium text-foreground">
              Premium (1 Lakh Individual / 2 Lakh Floater)
            </span>
            . Category B/C settlement fields then recalculate automatically. You can dismiss without
            applying.
          </p>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Dismiss
          </Button>
          <Button
            type="button"
            disabled={!canApply}
            onClick={() => {
              if (!quote || !canApply) return;
              onApply(String(quote.net));
            }}
          >
            Apply Premium
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
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
          ? "rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
          : "rounded-md border bg-muted/30 px-3 py-2"
      }
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
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
      <p className="mt-1 text-lg font-bold tabular-nums">₹{rs(value)}</p>
    </div>
  );
}
