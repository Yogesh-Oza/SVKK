"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { DashboardMetricCards } from "@/features/svkk-dashboard/dashboard-metric-cards";
import { PremiumReceiptsTable } from "@/features/svkk-dashboard/premium-receipts-table";
import { PremiumTrendAndBreakdown } from "@/features/svkk-dashboard/premium-trend-and-breakdown";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import type { DashboardMetrics } from "@/features/svkk-dashboard/dashboard-metric-cards";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, LayoutList, ListChecks, Sparkles } from "lucide-react";

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
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  const canSeeMis = user
    ? user.role === "SUPERVISOR" || user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    : false;

  const load = useCallback(async () => {
    if (!canSeeMis) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    const [s, d] = await Promise.all([
      svkkJson<MisSummary>("/mis/summary?asOfDate=" + encodeURIComponent(asOf)),
      svkkJson<DashboardMetrics>("/mis/dashboard?asOfDate=" + encodeURIComponent(asOf)),
    ]);
    setSummary(s);
    setDashboard(d);
  }, [canSeeMis]);

  useEffect(() => {
    if (missingUrl || !canSeeMis) {
      return;
    }
    void (async () => {
      try {
        setErr(null);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load summary");
      }
    })();
  }, [missingUrl, canSeeMis, load]);

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL in .env.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Policy dashboard</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Supervisors and admins see live MIS scope metrics and premium reconciliation. Charts and
            the sample receipt table are illustrative.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" asChild className="cursor-pointer">
            <Link href="/calculator">
              <Calculator className="size-4" />
              Premium calculator
            </Link>
          </Button>
          {canSeeMis ? (
            <Button type="button" asChild variant="outline" className="cursor-pointer">
              <Link href="/mis">MIS</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <DashboardMetricCards live={summary} dashboard={dashboard} canSeeMis={canSeeMis} />
      {canSeeMis && err ? <p className="text-destructive text-sm">{err}</p> : null}

      <PremiumTrendAndBreakdown />

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Recent premium receipts (sample)</h2>
          <p className="text-muted-foreground text-sm">
            Same list pattern for policies, claims, and settlements: search, filters, pagination,
            row actions. Replace with your API when ready.
          </p>
        </div>
        <PremiumReceiptsTable />
      </div>

      {user?.role === "USER" ? (
        <p className="text-muted-foreground text-sm max-w-prose">
          You can create policies, run the premium calculator, and review policies in your scope. The
          MIS-style summary and exports are available to supervisors and admins.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/calculator" className="block">
          <Card className="hover:bg-muted/50 h-full transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="size-4" />
                Premium calculator
              </CardTitle>
              <CardDescription>Chart-based live premium for members</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/policies" className="block">
          <Card className="hover:bg-muted/50 h-full transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" />
                Policies
              </CardTitle>
              <CardDescription>Search and manage policies by SVKK ID or mobile</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {canSeeMis ? (
          <Link href="/mis" className="block sm:col-span-2 lg:col-span-1">
            <Card className="hover:bg-muted/50 h-full transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutList className="size-4" />
                  MIS
                </CardTitle>
                <CardDescription>Real summary and policy rows in your villages</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : null}
        {canSeeMis ? (
          <Link href="/claims" className="block">
            <Card className="hover:bg-muted/50 h-full transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="size-4" />
                  Claims
                </CardTitle>
                <CardDescription>List and work claims in scope</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : null}
        <Link href="/tasks" className="block">
          <Card className="hover:bg-muted/50 h-full border-dashed">
            <CardContent className="flex items-center gap-3 pt-6">
              <Sparkles className="text-muted-foreground size-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Tasks & workflow</p>
                <p className="text-muted-foreground text-xs">CRM lists use the same table pattern</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
