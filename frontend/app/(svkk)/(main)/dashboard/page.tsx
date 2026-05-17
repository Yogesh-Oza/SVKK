"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  aggregateMisRows,
  rowsToPieSlices,
} from "@/features/svkk-dashboard/aggregate-mis-rows";
import { DashboardDateToolbar } from "@/features/svkk-dashboard/dashboard-date-toolbar";
import {
  DashboardMetricCards,
  type DashboardChartsPayload,
  type DashboardMetrics,
} from "@/features/svkk-dashboard/dashboard-metric-cards";
import { PremiumTrendAndBreakdown } from "@/features/svkk-dashboard/premium-trend-and-breakdown";
import type { PolicyMemberRow } from "@/features/svkk-mis/policy-member-report-section";
import { canAccessMis } from "@/lib/svkk/permissions";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import {
  resolveDashboardDateRange,
  todayIsoDate,
  type DashboardDatePreset,
  type DashboardDateRange,
} from "@/lib/svkk/dashboard-date-presets";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { buildDashboardHref, misQueryFromRange } from "@/lib/svkk/dashboard-navigation";

type MisReport = { rows: PolicyMemberRow[] };

function buildMisQuery(range: DashboardDateRange, groupBy: string): string {
  const q = new URLSearchParams();
  if (range.dateFrom) q.set("dateFrom", range.dateFrom);
  q.set("dateTo", range.dateTo);
  q.set("groupBy", groupBy);
  return q.toString();
}

export default function SvkkDashboardPage() {
  const { user } = useSvkkAuth();
  const [preset, setPreset] = useState<DashboardDatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(todayIsoDate());
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [charts, setCharts] = useState<DashboardChartsPayload | null>(null);
  const [misTotals, setMisTotals] = useState<PolicyMemberRow | null>(null);
  const [productPie, setProductPie] = useState<ReturnType<typeof rowsToPieSlices>>([]);
  const [villagePie, setVillagePie] = useState<ReturnType<typeof rowsToPieSlices>>([]);
  const [agePie, setAgePie] = useState<ReturnType<typeof rowsToPieSlices>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [misLoading, setMisLoading] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const canSeeMis = user ? canAccessMis(user.permissions) : false;

  const range = useMemo(
    () => resolveDashboardDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const productCounts = useMemo(() => {
    if (!misTotals) return [];
    return [
      { label: "Asha Kiran", count: misTotals.cntAshaKiran },
      { label: "Family Floater", count: misTotals.cntFamilyFloater },
      { label: "Individual", count: misTotals.cntIndividual },
    ].filter((x) => x.count > 0);
  }, [misTotals]);

  const load = useCallback(async () => {
    if (!canSeeMis) return;

    const asOfQ = "?asOfDate=" + encodeURIComponent(range.dateTo);
    const vQ = buildMisQuery(range, "village");
    const pQ = buildMisQuery(range, "policy_type");
    const aQ = buildMisQuery(range, "age");

    const [villageReport, productReport, ageReport, d, c] = await Promise.all([
      svkkJson<MisReport>("/mis/policy-member-report?" + vQ),
      svkkJson<MisReport>("/mis/policy-member-report?" + pQ),
      svkkJson<MisReport>("/mis/policy-member-report?" + aQ),
      svkkJson<DashboardMetrics>("/mis/dashboard" + asOfQ),
      svkkJson<DashboardChartsPayload>("/mis/dashboard-charts" + asOfQ),
    ]);

    const totals = aggregateMisRows(villageReport.rows);
    setMisTotals(totals);
    setProductPie(rowsToPieSlices(productReport.rows, "sumCo"));
    setVillagePie(rowsToPieSlices(villageReport.rows, "sumCo"));
    setAgePie(rowsToPieSlices(ageReport.rows, "membersPlusPolicies"));
    setDashboard(d);
    setCharts(c);
  }, [canSeeMis, range]);

  useEffect(() => {
    if (missingUrl) return;
    if (!canSeeMis) {
      setMisLoading(false);
      setDashboard(null);
      setCharts(null);
      setMisTotals(null);
      return;
    }
    void (async () => {
      setMisLoading(true);
      setErr(null);
      setMisTotals(null);
      try {
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load dashboard");
        setDashboard(null);
        setCharts(null);
        setMisTotals(null);
      } finally {
        setMisLoading(false);
      }
    })();
  }, [missingUrl, canSeeMis, load]);

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL in .env.</p>;
  }

  const misHref = buildDashboardHref({ pathname: "/mis", query: misQueryFromRange(range) });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Policy dashboard</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Live MIS scope metrics aligned with the Policy &amp; Member report. Use date presets, then
            click any card or chart to open Policies or MIS with the same filters.
          </p>
        </div>
        {canSeeMis ? (
          <Button variant="outline" size="sm" className="cursor-pointer shrink-0" asChild>
            <Link href={misHref}>
              <ExternalLink className="mr-2 size-4" />
              Full MIS report
            </Link>
          </Button>
        ) : null}
      </div>

      {canSeeMis ? (
        <DashboardDateToolbar
          preset={preset}
          range={range}
          customFrom={customFrom}
          customTo={customTo}
          onPresetChange={setPreset}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      ) : null}

      <DashboardMetricCards
        range={range}
        misTotals={misTotals}
        dashboard={dashboard}
        canSeeMis={canSeeMis}
        loading={misLoading}
      />
      {canSeeMis && err ? <p className="text-destructive text-sm">{err}</p> : null}

      {canSeeMis && !err ? (
        <PremiumTrendAndBreakdown
          loading={misLoading}
          range={range}
          charts={charts}
          productPie={productPie}
          villagePie={villagePie}
          agePie={agePie}
          productCounts={productCounts}
        />
      ) : null}

      {user?.role === "USER" ? (
        <p className="text-muted-foreground text-sm max-w-prose">
          You can create policies and review policies in your scope. Supervisors and admins see
          additional scope metrics and exports.
        </p>
      ) : null}
    </div>
  );
}
