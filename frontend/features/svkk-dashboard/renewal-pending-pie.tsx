"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { DashboardRenewalPayload } from "@/features/svkk-dashboard/dashboard-metric-cards";
import { buildDashboardHref, policiesPendingRenewalQuery } from "@/lib/svkk/dashboard-navigation";
import type { DashboardDateRange } from "@/lib/svkk/dashboard-date-presets";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart } from "recharts";

const PIE_COLORS = [
  "hsl(var(--chart-4))",
  "hsl(0 72% 51%)",
  "hsl(25 85% 52%)",
  "hsl(38 80% 48%)",
  "hsl(45 75% 45%)",
  "hsl(160 35% 45%)",
];

const pieConfig = {
  count: { label: "Policies" },
} satisfies import("@/components/ui/chart").ChartConfig;

type Props = {
  range: DashboardDateRange;
  renewal: DashboardRenewalPayload | null | undefined;
};

export function RenewalPendingPie({ range, renewal }: Props) {
  const router = useRouter();
  const data =
    renewal?.buckets
      .filter((b) => b.count > 0)
      .map((b) => ({ name: b.label, value: b.count, key: b.key })) ?? [];

  const goPolicies = (bucketKey?: string) => {
    const q = policiesPendingRenewalQuery(range, bucketKey);
    router.push(buildDashboardHref({ pathname: "/policies", query: q }));
  };

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Renewal status</CardTitle>
          <CardDescription>
            Policies by latest policy end date (as of {range.dateTo}). Click a slice to open the
            filtered policy list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-12 text-center text-sm">No policies in scope.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => goPolicies()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") goPolicies();
      }}
    >
      <CardHeader>
        <CardTitle className="text-base">Renewal status</CardTitle>
        <CardDescription>
          Latest policy end date per SVKK ID (as of {range.dateTo}). Click a slice to filter the
          policy register.
        </CardDescription>
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
                if (row?.key) goPolicies(row.key);
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
          {data.map((row) => (
            <li key={row.key} className="flex justify-between gap-2 tabular-nums">
              <button
                type="button"
                className="text-muted-foreground hover:text-primary truncate text-left underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  goPolicies(row.key);
                }}
              >
                {row.name}
              </button>
              <span>{row.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
