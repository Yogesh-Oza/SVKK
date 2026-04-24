"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import Link from "next/link";
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
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  const canSeeMis = user
    ? user.role === "SUPERVISOR" || user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    : false;

  const load = useCallback(async () => {
    if (!canSeeMis) {
      return;
    }
    const s = await svkkJson<MisSummary>("/mis/summary");
    setSummary(s);
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      {canSeeMis && summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-muted/40 rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Policies (scoped)</p>
            <p className="text-2xl font-semibold">{summary.totalPolicies}</p>
          </div>
          <div className="bg-muted/40 rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Claims (scoped)</p>
            <p className="text-2xl font-semibold">{summary.totalClaims}</p>
          </div>
          <div className="bg-muted/40 rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Claim amount</p>
            <p className="text-2xl font-semibold">{String(summary.totalClaimAmount)}</p>
          </div>
          <div className="bg-muted/40 rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Approved</p>
            <p className="text-2xl font-semibold">{String(summary.totalApprovedAmount)}</p>
          </div>
        </div>
      ) : null}
      {canSeeMis && err ? <p className="text-destructive text-sm">{err}</p> : null}
      {user?.role === "USER" ? (
        <p className="text-muted-foreground text-sm max-w-prose">
          You can create policies, run the premium calculator, and review policies in your scope. MIS
          summary is available to supervisors and admins.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/calculator">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle>Premium calculator</CardTitle>
              <CardDescription>Live chart-based premium for members</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/policies">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle>Policies</CardTitle>
              <CardDescription>Create and search policies by SVKK ID or mobile</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {canSeeMis ? (
          <Link href="/mis">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader>
                <CardTitle>MIS</CardTitle>
                <CardDescription>Summary and policy rows for your villages</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : null}
        {canSeeMis ? (
          <Link href="/claims">
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader>
                <CardTitle>Claims</CardTitle>
                <CardDescription>List and manage claims in scope</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
