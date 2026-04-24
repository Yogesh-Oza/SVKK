"use client";

import { Button } from "@/components/ui/button";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PolicyDetail = {
  id: string;
  policyNo: string | null;
  village: string | null;
  insuredParty: { svkkPublicId: string; name: string; mobile: string; email: string | null };
  policyType: { name: string };
  years: {
    id: string;
    yearLabel: string;
    sumInsured: unknown;
    policyStart: string | null;
    policyEnd: string | null;
    members: { name: string; relationship: string; dob: string }[];
  }[];
};

export default function SvkkPolicyDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [row, setRow] = useState<PolicyDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      try {
        const p = await svkkJson<PolicyDetail>(`/policies/${id}`);
        setRow(p);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Not found");
      }
    })();
  }, [id, missingUrl]);

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }
  if (err) {
    return <p className="text-destructive text-sm">{err}</p>;
  }
  if (!row) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/policies">Back</Link>
        </Button>
        <h1 className="text-2xl font-semibold">Policy</h1>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">SVKK ID: </span>
          <span className="font-mono">{row.insuredParty.svkkPublicId}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Name: </span>
          {row.insuredParty.name}
        </p>
        <p>
          <span className="text-muted-foreground">Type: </span>
          {row.policyType.name}
        </p>
        <p>
          <span className="text-muted-foreground">Village: </span>
          {row.village ?? "—"}
        </p>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Years</h2>
        {row.years.map((y) => (
          <div key={y.id} className="bg-muted/40 rounded-md border p-3 text-sm">
            <p className="font-medium">{y.yearLabel}</p>
            <p className="text-muted-foreground">Members: {y.members.length}</p>
            <ul className="mt-1 list-inside list-disc">
              {y.members.map((m) => (
                <li key={m.name + m.dob}>
                  {m.name} — {m.relationship}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
