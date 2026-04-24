"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useCallback, useState } from "react";

type Summary = {
  totalPolicies: number;
  totalClaims: number;
  totalClaimAmount: string | number;
  totalApprovedAmount: string | number;
};

export default function SvkkMisPage() {
  const { user } = useSvkkAuth();
  const [village, setVillage] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (village.trim()) {
      q.set("village", village.trim());
    }
    const s = await svkkJson<Summary>(`/mis/summary?${q.toString()}`);
    setSummary(s);
  }, [village]);

  if (user && user.role === "USER") {
    return <p className="text-muted-foreground text-sm">You do not have access to MIS.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">MIS summary</h1>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          void (async () => {
            try {
              await load();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Request failed");
            }
          })();
        }}
      >
        <div>
          <p className="text-muted-foreground mb-1 text-xs">Village (optional)</p>
          <Input value={village} onChange={(e) => setVillage(e.target.value)} className="max-w-xs" />
        </div>
        <Button type="submit" variant="secondary">
          Load
        </Button>
      </form>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      {summary ? (
        <ul className="text-sm">
          <li>Policies: {summary.totalPolicies}</li>
          <li>Claims: {summary.totalClaims}</li>
          <li>Claim amount: {String(summary.totalClaimAmount)}</li>
          <li>Approved: {String(summary.totalApprovedAmount)}</li>
        </ul>
      ) : null}
    </div>
  );
}
