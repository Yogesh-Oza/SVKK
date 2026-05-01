"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInrShort } from "./currency";
import type { DashboardChartsPayload } from "./dashboard-metric-cards";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartConfig = {
  premium: { label: "Expected premium", color: "hsl(var(--chart-1))" },
} satisfies import("@/components/ui/chart").ChartConfig;

type Props = {
  loading: boolean;
  charts: DashboardChartsPayload | null;
};

export function PremiumTrendAndBreakdown({ loading, charts }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-28" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!charts) {
    return null;
  }

  const chartData = charts.monthly.map((row) => ({
    month: row.monthLabel,
    premium: row.premium,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Premium by policy start month</CardTitle>
            <CardDescription>
              Expected net premium in your scope (12 months ending at as-of), grouped by policy-year
              start date
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled>
            Last 12 months
          </Button>
        </CardHeader>
        <CardContent>
          {chartData.every((d) => d.premium === 0) ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              No premium in this window for the selected scope.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)}
                  width={48}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => [formatInrShort(Number(value)), name]}
                    />
                  }
                />
                <Bar dataKey="premium" fill="var(--color-premium)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Premium mix by product</CardTitle>
          <CardDescription>Share of expected net premium by policy type in scope</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {charts.productMix.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No product mix data in scope.</p>
          ) : (
            charts.productMix.map((row) => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground max-w-[70%] truncate" title={row.label}>
                    {row.label}
                  </span>
                  <span className="font-medium tabular-nums">{row.percent}%</span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, row.percent)}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-xs tabular-nums">{formatInrShort(row.premium)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
