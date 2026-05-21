"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { PieSlice } from "@/features/svkk-dashboard/aggregate-mis-rows";
import type { DashboardChartsPayload } from "@/features/svkk-dashboard/dashboard-metric-cards";
import { RenewalPendingPie } from "@/features/svkk-dashboard/renewal-pending-pie";
import {
  buildDashboardHref,
  misQueryFromPolicyStartMonth,
  misQueryFromRange,
  policiesQueryFromRange,
  productVariantFromLabel,
} from "@/lib/svkk/dashboard-navigation";
import type { DashboardDateRange } from "@/lib/svkk/dashboard-date-presets";
import { formatInrShort } from "./currency";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(210 40% 55%)",
  "hsl(160 35% 45%)",
  "hsl(30 70% 50%)",
];

const barConfig = {
  premium: { label: "Co premium", color: "hsl(var(--chart-1))" },
} satisfies import("@/components/ui/chart").ChartConfig;

const pieConfig = {
  value: { label: "Amount" },
} satisfies import("@/components/ui/chart").ChartConfig;

type Props = {
  loading: boolean;
  range: DashboardDateRange;
  charts: DashboardChartsPayload | null;
  productPie: PieSlice[];
  villagePie: PieSlice[];
  agePie: PieSlice[];
  productCounts: { label: string; count: number }[];
};

function PiePanel({
  title,
  description,
  data,
  onSliceClick,
}: {
  title: string;
  description: string;
  data: PieSlice[];
  onSliceClick?: (name: string) => void;
}) {
  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-12 text-center text-sm">No data in this period.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="cursor-pointer">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={pieConfig} className="mx-auto h-56 w-full max-w-sm">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
              onClick={(_, index) => {
                const row = data[index];
                if (row?.name) onSliceClick?.(row.name);
              }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="cursor-pointer" />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="name" />} />
          </PieChart>
        </ChartContainer>
        <ul className="mt-3 space-y-1 text-xs">
          {data.slice(0, 5).map((row) => (
            <li key={row.name} className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground truncate">{row.name}</span>
              <span>
                {row.percent}% · {formatInrShort(row.value)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PremiumTrendAndBreakdown({
  loading,
  range,
  charts,
  productPie,
  villagePie,
  agePie,
  productCounts,
}: Props) {
  const router = useRouter();
  const misQ = misQueryFromRange(range);
  const polQ = policiesQueryFromRange(range);

  const goMis = (extra?: Record<string, string | string[]>) => {
    router.push(buildDashboardHref({ pathname: "/mis", query: { ...misQ, ...extra } }));
  };

  const goPolicies = (extra?: Record<string, string | string[]>) => {
    router.push(buildDashboardHref({ pathname: "/policies", query: { ...polQ, ...extra } }));
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const chartData =
    charts?.monthly.map((row) => ({
      month: row.monthLabel,
      premium: row.premium,
      year: row.year,
      monthNum: row.month,
    })) ?? [];

  return (
    <div className="space-y-4">
      <Card className="transition-shadow">
        <CardHeader>
          <CardTitle className="text-base">Premium by policy start month</CardTitle>
          <CardDescription>
            Co premium by policy-year start month (12 months ending at to-date). Click a bar to open MIS for that month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.every((d) => d.premium === 0) ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              No premium in this window for the selected scope.
            </p>
          ) : (
            <ChartContainer config={barConfig} className="h-72 w-full">
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
                    <ChartTooltipContent formatter={(value, name) => [formatInrShort(Number(value)), name]} />
                  }
                />
                <Bar
                  dataKey="premium"
                  fill="var(--color-premium)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  className="cursor-pointer"
                  onClick={(data, _index, event) => {
                    event?.stopPropagation();
                    const payload = data as { monthNum?: number; year?: number };
                    if (payload.monthNum && payload.year) {
                      router.push(
                        buildDashboardHref({
                          pathname: "/mis",
                          query: misQueryFromPolicyStartMonth(payload.year, payload.monthNum, {
                            groupBy: "village",
                          }),
                        }),
                      );
                    }
                  }}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RenewalPendingPie range={range} renewal={charts?.renewal} />
        <PiePanel
          title="Premium by product"
          description="Share of co premium by policy type. Click a slice for policies or MIS."
          data={productPie}
          onSliceClick={(name) => {
            const variant = productVariantFromLabel(name);
            if (variant) {
              goPolicies({ adProductVariants: variant });
            } else {
              goMis({ groupBy: "policy_type" });
            }
          }}
        />
        <PiePanel
          title="Premium by village"
          description="Top villages by co premium in period."
          data={villagePie}
          onSliceClick={(name) => {
            if (name === "Other") {
              goMis({ groupBy: "village" });
            } else {
              goMis({ groupBy: "village", villages: name });
            }
          }}
        />
        <PiePanel
          title="Members by age band"
          description="Member count by age band (MIS age grouping)."
          data={agePie}
          onSliceClick={() => goMis({ groupBy: "age" })}
        />
      </div>

      {productCounts.length > 0 ? (
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => goMis({ groupBy: "policy_type" })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") goMis({ groupBy: "policy_type" });
          }}
        >
          <CardHeader>
            <CardTitle className="text-base">Policy count by product</CardTitle>
            <CardDescription>Number of policies in the selected period</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {productCounts.map((row) => (
              <button
                key={row.label}
                type="button"
                className="hover:bg-muted/60 rounded-lg border p-3 text-left transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  const variant = productVariantFromLabel(row.label);
                  if (variant) goPolicies({ adProductVariants: variant });
                  else goMis({ groupBy: "policy_type" });
                }}
              >
                <p className="text-muted-foreground text-xs">{row.label}</p>
                <p className="text-xl font-semibold tabular-nums">{row.count.toLocaleString("en-IN")}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
