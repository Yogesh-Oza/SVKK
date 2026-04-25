"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatInr } from "./currency";
import { DUMMY_FOOTPRINT } from "./dummy-data";

type MisSummary = {
  totalPolicies: number;
  totalClaims: number;
  totalClaimAmount: string | number;
  totalApprovedAmount: string | number;
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

function liveCardsFrom(summary: MisSummary): CardDef[] {
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

const demoCards: CardDef[] = (() => {
  const d = DUMMY_FOOTPRINT;
  return [
    {
      title: "Active policies (sample)",
      value: d.activePolicies.toLocaleString("en-IN"),
      sub: "Across pilot villages",
      trend: { label: "+12% vs last quarter", positive: true },
    },
    {
      title: "Premium (YTD) — sample",
      value: "₹2.34 Cr",
      sub: "Illustrative; connect MIS for real totals",
      trend: { label: "+5.2% vs prior year", positive: true },
    },
    {
      title: "Villages on MediClaim (sample)",
      value: String(d.villagesCovered),
      sub: "Mapped clusters",
      trend: { label: "3 new this month", positive: true },
    },
    {
      title: "Renewals (30d) — sample",
      value: d.renewalsMonth.toLocaleString("en-IN"),
      sub: "Follow-ups queued",
      trend: { label: "−2.1% vs last month", negative: true },
    },
  ];
})();

export function DashboardMetricCards({
  live,
  canSeeMis,
}: {
  live: MisSummary | null;
  canSeeMis: boolean;
}) {
  const cards = canSeeMis && live ? liveCardsFrom(live) : demoCards;

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
