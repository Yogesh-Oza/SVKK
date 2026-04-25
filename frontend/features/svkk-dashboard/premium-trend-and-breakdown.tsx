"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatInrShort } from "./currency";
import { DUMMY_MONTHLY_PREMIUM, DUMMY_PREMIUM_BREAKDOWN } from "./dummy-data";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartConfig = {
  target: { label: "Target", color: "hsl(var(--chart-2))" },
  premium: { label: "Premium (sample)", color: "hsl(var(--chart-1))" },
} satisfies import("@/components/ui/chart").ChartConfig;

export function PremiumTrendAndBreakdown() {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Premium vs target</CardTitle>
            <CardDescription>Monthly new premium in scope (sample data)</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled>
            Last 12 months
          </Button>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-72 w-full">
            <BarChart data={DUMMY_MONTHLY_PREMIUM} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              <Bar dataKey="target" fill="var(--color-target)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="premium" fill="var(--color-premium)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Premium mix (sample)</CardTitle>
          <CardDescription>By product / channel in pilot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DUMMY_PREMIUM_BREAKDOWN.map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground max-w-[70%] truncate" title={row.label}>
                  {row.label}
                </span>
                <span className="font-medium tabular-nums">{row.value}%</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${row.value}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatInrShort(row.amount)} annualized (sample)
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
