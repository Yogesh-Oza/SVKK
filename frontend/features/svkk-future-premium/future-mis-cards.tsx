import { Card, CardContent } from "@/components/ui/card";
import { rs } from "@/lib/svkk/premium";
import type { FutureMisGroup } from "./future-premium-types";

type FutureMisCardsProps = {
  groups: Record<string, FutureMisGroup>;
  formatLabel: (key: string) => string;
};

export function FutureMisCards({ groups, formatLabel }: FutureMisCardsProps) {
  const entries = Object.entries(groups);
  if (!entries.length) {
    return <p className="text-muted-foreground text-sm">No data yet.</p>;
  }

  const maxPolicies = Math.max(...entries.map(([, v]) => v.policies), 1);
  const maxNet = Math.max(...entries.map(([, v]) => v.net), 1);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {entries.map(([key, val]) => (
        <Card key={key} className="border-border/80">
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{formatLabel(key)}</p>
              <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold">
                {val.policies} Policies
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="from-primary to-teal-600 h-full rounded-full bg-gradient-to-r"
                style={{ width: `${Math.max(8, (val.policies / maxPolicies) * 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Members</p>
                <p className="font-semibold">{val.members}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Gross</p>
                <p className="font-semibold">₹{rs(val.gross)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Discount</p>
                <p className="font-semibold">₹{rs(val.disc)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Net</p>
                <p className="font-semibold">₹{rs(val.net)}</p>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Net share</p>
              <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-600 to-blue-600"
                  style={{ width: `${Math.max(8, (val.net / maxNet) * 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
