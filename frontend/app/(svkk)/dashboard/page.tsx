"use client";

import { Button } from "@/components/ui/button";
import { svkkFetch } from "@/lib/svkk-api";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SvkkDashboardPage() {
  const [summary, setSummary] = useState<{
    totalPolicies: number;
    totalClaims: number;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("svkk_access_token");
    if (!token) return;
    svkkFetch<{
      totalPolicies: number;
      totalClaims: number;
    }>("/mis/summary?limit=1", { accessToken: token })
      .then(setSummary)
      .catch((e: Error & { traceId?: string }) => {
        toast.error(e.message, { description: e.traceId });
      });
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overview of policies and claims.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-card rounded-xl border p-6">
          <p className="text-muted-foreground text-sm">Policies</p>
          <p className="text-3xl font-semibold tabular-nums">
            {summary?.totalPolicies ?? "—"}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-6">
          <p className="text-muted-foreground text-sm">Claims</p>
          <p className="text-3xl font-semibold tabular-nums">
            {summary?.totalClaims ?? "—"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/policies">Policies</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/login">Login</Link>
        </Button>
      </div>
    </div>
  );
}
