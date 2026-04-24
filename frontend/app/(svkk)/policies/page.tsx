"use client";

import { Button } from "@/components/ui/button";
import { svkkFetch } from "@/lib/svkk-api";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type PolicyRow = {
  id: string;
  policyNo: string | null;
  insuredParty: { svkkPublicId: string; name: string };
  policyType: { name: string };
};

export default function SvkkPoliciesPage() {
  const [items, setItems] = useState<PolicyRow[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("svkk_access_token");
    if (!token) {
      toast.message("Sign in to load policies");
      return;
    }
    svkkFetch<{ items: PolicyRow[] }>("/policies?limit=50", { accessToken: token })
      .then((r) => setItems(r.items))
      .catch((e: Error & { traceId?: string }) => toast.error(e.message, { description: e.traceId }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Policies</h1>
        <Button variant="outline" asChild>
          <Link href="/svkk/dashboard">Dashboard</Link>
        </Button>
      </div>
      <div className="bg-card overflow-hidden rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium">SVKK ID</th>
              <th className="px-4 py-3 font-medium">Holder</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Policy No</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-muted-foreground px-4 py-8 text-center">
                  No policies yet — create via API{" "}
                  <code className="text-xs">POST /api/v1/policies</code>
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{p.insuredParty.svkkPublicId}</td>
                  <td className="px-4 py-3">{p.insuredParty.name}</td>
                  <td className="px-4 py-3">{p.policyType.name}</td>
                  <td className="px-4 py-3">{p.policyNo ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
