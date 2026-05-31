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
import {
  DashboardClaimMetricCards,
  type DashboardClaimMetrics,
} from "@/features/svkk-dashboard/dashboard-claim-metric-cards";
import { claimRowsToPieSlices } from "@/features/svkk-dashboard/aggregate-claim-rows";
import { PremiumTrendAndBreakdown } from "@/features/svkk-dashboard/premium-trend-and-breakdown";
import type { PolicyMemberRow } from "@/features/svkk-mis/policy-member-report-section";
import { canAccessDashboardMis, canAccessMis } from "@/lib/svkk/permissions";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import {
  resolveDashboardDateRange,
  type DashboardDatePreset,
  type DashboardDateRange,
} from "@/lib/svkk/dashboard-date-presets";
import { todayFormDate } from "@/lib/svkk/form-date";
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
  const [customTo, setCustomTo] = useState(todayFormDate);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [charts, setCharts] = useState<DashboardChartsPayload | null>(null);
  const [misTotals, setMisTotals] = useState<PolicyMemberRow | null>(null);
  const [productPie, setProductPie] = useState<ReturnType<typeof rowsToPieSlices>>([]);
  const [villagePie, setVillagePie] = useState<ReturnType<typeof rowsToPieSlices>>([]);
  const [agePie, setAgePie] = useState<ReturnType<typeof rowsToPieSlices>>([]);
  const [claimMetrics, setClaimMetrics] = useState<DashboardClaimMetrics | null>(null);
  const [claimVillagePie, setClaimVillagePie] = useState<ReturnType<typeof claimRowsToPieSlices>>([]);
  const [claimProductPie, setClaimProductPie] = useState<ReturnType<typeof claimRowsToPieSlices>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [misLoading, setMisLoading] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const canLoadDashboardMis = user ? canAccessDashboardMis(user.permissions) : false;
  const canOpenFullMis = user ? canAccessMis(user.permissions) : false;
  // Back-compat alias: older renders referenced `canSeeMis`.
  const canSeeMis = canLoadDashboardMis;

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
    if (!canLoadDashboardMis) return;

    const asOfQ = "?asOfDate=" + encodeURIComponent(range.dateTo);
    const vQ = buildMisQuery(range, "village");
    const pQ = buildMisQuery(range, "policy_type");
    const aQ = buildMisQuery(range, "age");

    const claimQ = new URLSearchParams();
    if (range.dateFrom) claimQ.set("dateFrom", range.dateFrom);
    if (range.dateTo) claimQ.set("dateTo", range.dateTo);
    const claimQs = claimQ.toString();

    const [villageReport, productReport, ageReport, d, c, claims] = await Promise.all([
      svkkJson<MisReport>("/mis/policy-member-report?" + vQ),
      svkkJson<MisReport>("/mis/policy-member-report?" + pQ),
      svkkJson<MisReport>("/mis/policy-member-report?" + aQ),
      svkkJson<DashboardMetrics>("/mis/dashboard" + asOfQ),
      svkkJson<DashboardChartsPayload>("/mis/dashboard-charts" + asOfQ),
      svkkJson<DashboardClaimMetrics>("/mis/dashboard-claims" + (claimQs ? "?" + claimQs : "")),
    ]);

    const totals = aggregateMisRows(villageReport.rows);
    setMisTotals(totals);
    setProductPie(rowsToPieSlices(productReport.rows, "sumCo"));
    setVillagePie(rowsToPieSlices(villageReport.rows, "sumCo"));
    setAgePie(rowsToPieSlices(ageReport.rows, "membersPlusPolicies"));
    setDashboard(d);
    setCharts(c);
    setClaimMetrics(claims);
    setClaimVillagePie(claimRowsToPieSlices(claims.byVillage, "sumClaimAmount"));
    setClaimProductPie(claimRowsToPieSlices(claims.byPolicyType, "sumClaimAmount"));
  }, [canLoadDashboardMis, range]);

  useEffect(() => {
    if (missingUrl) return;
    if (!canLoadDashboardMis) {
      setMisLoading(false);
      setDashboard(null);
      setCharts(null);
      setMisTotals(null);
      setClaimMetrics(null);
      setClaimVillagePie([]);
      setClaimProductPie([]);
      return;
    }
    void (async () => {
      setMisLoading(true);
      setErr(null);
      setMisTotals(null);
      setClaimMetrics(null);
      try {
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load dashboard");
        setDashboard(null);
        setCharts(null);
        setMisTotals(null);
        setClaimMetrics(null);
      } finally {
        setMisLoading(false);
      }
    })();
  }, [missingUrl, canLoadDashboardMis, load]);

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
            MIS metrics for your date range, filtered the same way as the Policy &amp; Member and Claim
            MIS reports (village/area scope from your role). Use presets, then open Policies, Claims,
            or MIS with the same filters from the cards.
          </p>
        </div>
        {canOpenFullMis ? (
          <Button variant="outline" size="sm" className="cursor-pointer shrink-0" asChild>
            <Link href={misHref}>
              <ExternalLink className="mr-2 size-4" />
              Full MIS report
            </Link>
          </Button>
        ) : null}
      </div>

      {canLoadDashboardMis ? (
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
        canSeeMis={canLoadDashboardMis}
        loading={misLoading}
      />

      <DashboardClaimMetricCards range={range} claims={claimMetrics} loading={misLoading} />

      {canLoadDashboardMis && err ? <p className="text-destructive text-sm">{err}</p> : null}

      {canLoadDashboardMis && !err ? (
        <PremiumTrendAndBreakdown
          loading={misLoading}
          range={range}
          charts={charts}
          productPie={productPie}
          villagePie={villagePie}
          agePie={agePie}
          productCounts={productCounts}
          claimVillagePie={claimVillagePie}
          claimProductPie={claimProductPie}
        />
      ) : null}

      {canLoadDashboardMis && !canOpenFullMis ? (
        <p className="text-muted-foreground max-w-prose text-sm">
          Charts and totals follow your role&apos;s{" "}
          <strong className="text-foreground">MIS village/area scope</strong> (same as the Policy
          &amp; Member report). To open the full MIS screen and exports, add{" "}
          <code className="text-xs">mis:read</code> to this role.
        </p>
      ) : null}
    </div>
  );
}
