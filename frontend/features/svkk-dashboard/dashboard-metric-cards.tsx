"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PolicyMemberRow } from "@/features/svkk-mis/policy-member-report-section";
import { buildDashboardHref, misQueryFromRange, policiesQueryFromRange } from "@/lib/svkk/dashboard-navigation";
import type { DashboardDateRange } from "@/lib/svkk/dashboard-date-presets";
import { formatInr } from "./currency";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import Link from "next/link";

export type RenewalBucketPayload = {
  key: string;
  label: string;
  count: number;
};

export type DashboardRenewalPayload = {
  asOfDate: string;
  buckets: RenewalBucketPayload[];
};

export type DashboardChartsPayload = {
  asOfDate: string;
  monthly: Array<{ year: number; month: number; monthLabel: string; premium: number }>;
  productMix: Array<{ label: string; premium: number; percent: number }>;
  renewal?: DashboardRenewalPayload;
};

type CardDef = {
  title: string;
  value: string;
  sub: string;
  href: string;
  trend: { label: string; positive?: boolean; negative?: boolean };
};

function Trend({ trend: trendData }: { trend: CardDef["trend"] }) {
  if (trendData.negative) {
    return (
      <span className="text-destructive inline-flex items-center gap-0.5 text-xs font-medium">
        <ArrowDownRight className="size-3" />
        {trendData.label}
      </span>
    );
  }
  if (trendData.positive) {
    return (
      <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 text-xs font-medium">
        <ArrowUpRight className="size-3" />
        {trendData.label}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
      <Minus className="size-3" />
      {trendData.label}
    </span>
  );
}

function buildCards(range: DashboardDateRange, mis: PolicyMemberRow | null): CardDef[] {
  const misQ = misQueryFromRange(range);
  const polQ = policiesQueryFromRange(range);

  if (!mis) {
    return [];
  }

  return [
    {
      title: "Policies",
      value: String(mis.totalPolicies),
      sub: "In selected period (MIS scope)",
      href: buildDashboardHref({ pathname: "/policies", query: polQ }),
      trend: { label: "View list", positive: true },
    },
    {
      title: "Members + policies",
      value: String(mis.membersPlusPolicies),
      sub: "Insured rows in period",
      href: buildDashboardHref({ pathname: "/mis", query: { ...misQ, groupBy: "village" } }),
      trend: { label: "Open MIS", positive: true },
    },
    {
      title: "Co premium",
      value: formatInr(mis.sumCo),
      sub: "Same basis as MIS report",
      href: buildDashboardHref({ pathname: "/mis", query: misQ }),
      trend: { label: "MIS breakdown", positive: true },
    },
    {
      title: "Gross premium",
      value: formatInr(mis.sumGross),
      sub: "Gross in scope",
      href: buildDashboardHref({ pathname: "/mis", query: misQ }),
      trend: { label: "MIS breakdown" },
    },
    {
      title: "VKK premium",
      value: formatInr(mis.sumVkk),
      sub: "Total VKK column",
      href: buildDashboardHref({ pathname: "/mis", query: misQ }),
      trend: { label: "MIS breakdown" },
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
            <Trend trend={card.trend} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DashboardMetricCards({
  range,
  misTotals,
  canSeeMis,
  loading,
}: {
  range: DashboardDateRange;
  misTotals: PolicyMemberRow | null;
  canSeeMis: boolean;
  loading: boolean;
}) {
  if (!canSeeMis) {
    return null;
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 5 }, (_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const cards = buildCards(range, misTotals);
  if (!cards.length) {
    return (
      <p className="text-muted-foreground text-sm">No metrics for this period. Try another date range.</p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <ClickableMetricCard key={c.title} card={c} />
      ))}
    </div>
  );
}
