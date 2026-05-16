"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  DashboardMetricCards,
  type DashboardChartsPayload,
  type DashboardMetrics,
} from "@/features/svkk-dashboard/dashboard-metric-cards";
import { PremiumTrendAndBreakdown } from "@/features/svkk-dashboard/premium-trend-and-breakdown";
import { canAccessMis } from "@/lib/svkk/permissions";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useCallback, useEffect, useState } from "react";

type MisSummary = {
  totalPolicies: number;
  totalClaims: number;
  totalClaimAmount: string | number;
  totalApprovedAmount: string | number;
};

export default function SvkkDashboardPage() {
  const { user } = useSvkkAuth();
  const [summary, setSummary] = useState<MisSummary | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [charts, setCharts] = useState<DashboardChartsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [misLoading, setMisLoading] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const canSeeMis = user ? canAccessMis(user.permissions) : false;

  const load = useCallback(async () => {
    if (!canSeeMis) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    const q = "?asOfDate=" + encodeURIComponent(asOf);
    const [s, d, c] = await Promise.all([
      svkkJson<MisSummary>("/mis/summary" + q),
      svkkJson<DashboardMetrics>("/mis/dashboard" + q),
      svkkJson<DashboardChartsPayload>("/mis/dashboard-charts" + q),
    ]);
    setSummary(s);
    setDashboard(d);
    setCharts(c);
  }, [canSeeMis]);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    if (!canSeeMis) {
      setMisLoading(false);
      setSummary(null);
      setDashboard(null);
      setCharts(null);
      return;
    }
    void (async () => {
      setMisLoading(true);
      setErr(null);
      setSummary(null);
      setDashboard(null);
      setCharts(null);
      try {
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load summary");
        setSummary(null);
        setDashboard(null);
        setCharts(null);
      } finally {
        setMisLoading(false);
      }
    })();
  }, [missingUrl, canSeeMis, load]);

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL in .env.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Policy dashboard</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Supervisors and admins see live MIS scope metrics and premium reconciliation. Charts use the
          same scope and as-of date as the summary APIs.
        </p>
      </div>

      <DashboardMetricCards
        live={summary}
        dashboard={dashboard}
        canSeeMis={canSeeMis}
        loading={misLoading}
      />
      {canSeeMis && err ? <p className="text-destructive text-sm">{err}</p> : null}

      {canSeeMis && !err ? (
        <PremiumTrendAndBreakdown loading={misLoading} charts={charts} />
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
