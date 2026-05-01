"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatInr } from "./currency";

type MisSummary = {
  asOfDate?: string;
  totalPolicies: number;
  totalClaims: number;
  totalClaimAmount: string | number;
  totalApprovedAmount: string | number;
};

export type DashboardMetrics = {
  asOfDate: string;
  totalPolicies: number;
  policyYearRowsInWindow: number;
  totalExpectedPremium: number;
  totalPaidCompleted: number;
  paymentGap: number;
};

export type DashboardChartsPayload = {
  asOfDate: string;
  monthly: Array<{ year: number; month: number; monthLabel: string; premium: number }>;
  productMix: Array<{ label: string; premium: number; percent: number }>;
};

type CardDef = {
  title: string;
  value: string;
  sub: string;
  trend: { label: string; positive?: boolean; negative?: boolean };
};

function claimAmountNum(v: string | number): number {
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function Trend({ trend }: { trend: CardDef["trend"] }) {
  if (trend.negative) {
    return (
      <span className="text-destructive inline-flex items-center gap-0.5 text-xs font-medium">
        <ArrowDownRight className="size-3" />
        {trend.label}
      </span>
    );
  }
  if (trend.positive) {
    return (
      <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 text-xs font-medium">
        <ArrowUpRight className="size-3" />
        {trend.label}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
      <Minus className="size-3" />
      {trend.label}
    </span>
  );
}

function liveCardsFrom(summary: MisSummary, dashboard: DashboardMetrics | null): CardDef[] {
  if (dashboard) {
    return [
      {
        title: "Policies (scoped)",
        value: String(dashboard.totalPolicies),
        sub: "Active window per as-of",
        trend: { label: "Live", positive: true },
      },
      {
        title: "Expected premium",
        value: formatInr(dashboard.totalExpectedPremium),
        sub: "Policy year expectations",
        trend: { label: "Live" },
      },
      {
        title: "Paid (completed)",
        value: formatInr(dashboard.totalPaidCompleted),
        sub: "Payment rows",
        trend: { label: "Live", positive: true },
      },
      {
        title: "Gap (expected − paid)",
        value: formatInr(dashboard.paymentGap),
        sub: "As of " + new Date(dashboard.asOfDate).toLocaleDateString("en-IN"),
        trend: { label: "Live" },
      },
    ];
  }
  return [
    {
      title: "Policies (scoped)",
      value: String(summary.totalPolicies),
      sub: "From your MIS feed",
      trend: { label: "Live", positive: true },
    },
    {
      title: "Claims (scoped)",
      value: String(summary.totalClaims),
      sub: "In your villages",
      trend: { label: "Live", positive: true },
    },
    {
      title: "Claim amount",
      value: formatInr(claimAmountNum(summary.totalClaimAmount)),
      sub: "Reported total",
      trend: { label: "Live" },
    },
    {
      title: "Approved",
      value: formatInr(claimAmountNum(summary.totalApprovedAmount)),
      sub: "Settled in scope",
      trend: { label: "Live" },
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

export function DashboardMetricCards({
  live,
  dashboard,
  canSeeMis,
  loading,
}: {
  live: MisSummary | null;
  dashboard: DashboardMetrics | null;
  canSeeMis: boolean;
  loading: boolean;
}) {
  if (!canSeeMis) {
    return null;
  }

  if (loading || !live) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const cards = liveCardsFrom(live, dashboard);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title} className="shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">{c.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{c.value}</p>
            <p className="text-muted-foreground mt-1 text-xs">{c.sub}</p>
            <div className="mt-2">
              <Trend trend={c.trend} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
