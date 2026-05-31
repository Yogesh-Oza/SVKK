"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClaimReportRowClient } from "@/features/svkk-dashboard/aggregate-claim-rows";
import {
  buildDashboardHref,
  claimMisQueryFromRange,
  claimsQueryFromRange,
} from "@/lib/svkk/dashboard-navigation";
import type { DashboardDateRange } from "@/lib/svkk/dashboard-date-presets";
import { formatInr } from "./currency";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type DashboardClaimMetrics = {
  dateFrom: string | null;
  dateTo: string;
  claimCount: number;
  sumClaimAmount: number;
  sumApprovedAmount: number;
  sumDeductionAmount: number;
  byVillage: ClaimReportRowClient[];
  byPolicyType: ClaimReportRowClient[];
};

type CardDef = {
  title: string;
  value: string;
  sub: string;
  href: string;
  trendLabel: string;
};

function buildClaimCards(range: DashboardDateRange, claims: DashboardClaimMetrics): CardDef[] {
  const claimsQ = claimsQueryFromRange(range);
  const claimMisQ = claimMisQueryFromRange(range);

  return [
    {
      title: "Claims",
      value: String(claims.claimCount),
      sub: "In selected period (claim scope)",
      href: buildDashboardHref({ pathname: "/claims", query: claimsQ }),
      trendLabel: "View register",
    },
    {
      title: "Claim amount",
      value: formatInr(claims.sumClaimAmount),
      sub: "Same basis as Claim MIS",
      href: buildDashboardHref({ pathname: "/mis", query: claimMisQ }),
      trendLabel: "Claim MIS",
    },
    {
      title: "Approved amount",
      value: formatInr(claims.sumApprovedAmount),
      sub: "Approved total in period",
      href: buildDashboardHref({ pathname: "/mis", query: claimMisQ }),
      trendLabel: "Claim MIS",
    },
    {
      title: "Deductions",
      value: formatInr(claims.sumDeductionAmount),
      sub: "Deduction total in period",
      href: buildDashboardHref({ pathname: "/mis", query: claimMisQ }),
      trendLabel: "Claim MIS",
    },
  ];
}

function MetricCardSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-3 w-full max-w-48" />
        <Skeleton className="mt-2 h-3 w-16" />
      </CardContent>
    </Card>
  );
}

function ClickableMetricCard({ card }: { card: CardDef }) {
  return (
    <Link href={card.href} className="group block cursor-pointer">
      <Card className="shadow-sm transition-shadow hover:shadow-md hover:border-primary/30 h-full">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium">{card.title}</CardTitle>
          <ChevronRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{card.value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{card.sub}</p>
          <div className="mt-2">
            <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 text-xs font-medium">
              <ArrowUpRight className="size-3" />
              {card.trendLabel}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DashboardClaimMetricCards({
  range,
  claims,
  loading,
}: {
  range: DashboardDateRange;
  claims: DashboardClaimMetrics | null;
  loading: boolean;
}) {
  const router = useRouter();

  const goClaimMis = (extra?: Record<string, string | string[] | undefined>) => {
    router.push(
      buildDashboardHref({
        pathname: "/mis",
        query: claimMisQueryFromRange(range, extra),
      }),
    );
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Claims</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!claims) {
    return null;
  }

  const cards = buildClaimCards(range, claims);
  const productCounts = claims.byPolicyType
    .filter((r) => r.claimCount > 0)
    .sort((a, b) => b.claimCount - a.claimCount);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Claims</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <ClickableMetricCard key={c.title} card={c} />
          ))}
        </div>
      </div>

      {productCounts.length > 0 ? (
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => goClaimMis({ groupBy: "policy_type" })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") goClaimMis({ groupBy: "policy_type" });
          }}
        >
          <CardHeader>
            <CardTitle className="text-base">Claim count by product</CardTitle>
            <p className="text-muted-foreground text-sm">
              Number of claims in the selected period (by linked policy type)
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {productCounts.map((row) => (
              <button
                key={row.label}
                type="button"
                className="hover:bg-muted/60 rounded-lg border p-3 text-left transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  goClaimMis({ groupBy: "policy_type" });
                }}
              >
                <p className="text-muted-foreground text-xs">{row.label}</p>
                <p className="text-xl font-semibold tabular-nums">
                  {row.claimCount.toLocaleString("en-IN")}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
