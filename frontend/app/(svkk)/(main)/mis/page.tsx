"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { canAccessMis } from "@/lib/svkk/permissions";
import Link from "next/link";
import { useCallback, useState } from "react";

type Summary = {
  totalPolicies: number;
  totalClaims: number;
  totalClaimAmount: string | number;
  totalApprovedAmount: string | number;
};

type MisPolicyRow = {
  id: string;
  policyNo: string | null;
  village: string | null;
  createdAt: string;
  insuredParty: { svkkPublicId: string; name: string; mobile: string };
  policyType: { name: string };
};

export default function SvkkMisPage() {
  const { user } = useSvkkAuth();
  const [village, setVillage] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<MisPolicyRow[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const runSummary = useCallback(async () => {
    const q = new URLSearchParams();
    if (village.trim()) {
      q.set("village", village.trim());
    }
    const s = await svkkJson<Summary>(`/mis/summary?${q.toString()}`);
    setSummary(s);
  }, [village]);

  const runPolicies = useCallback(
    async (mode: "reset" | "more") => {
      const q = new URLSearchParams({ limit: "20" });
      if (village.trim()) {
        q.set("village", village.trim());
      }
      if (mode === "more" && cursor) {
        q.set("cursor", cursor);
      }
      const res = await svkkJson<{ items: MisPolicyRow[]; nextCursor?: string }>(
        `/mis/policies?${q.toString()}`,
      );
      if (mode === "reset") {
        setRows(res.items);
        setCursor(res.nextCursor);
      } else {
        setRows((prev) => [...prev, ...res.items]);
        setCursor(res.nextCursor);
      }
    },
    [village, cursor],
  );

  if (user && !canAccessMis(user.role)) {
    return <p className="text-muted-foreground text-sm">You do not have access to MIS.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">MIS</h1>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          setCursor(undefined);
          void (async () => {
            setLoading(true);
            try {
              await runSummary();
              await runPolicies("reset");
            } catch (err2) {
              setErr(err2 instanceof Error ? err2.message : "Request failed");
            } finally {
              setLoading(false);
            }
          })();
        }}
      >
        <div>
          <p className="text-muted-foreground mb-1 text-xs">Village (optional)</p>
          <Input value={village} onChange={(e) => setVillage(e.target.value)} className="max-w-xs" />
        </div>
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? "Loading…" : "Load summary &amp; table"}
        </Button>
      </form>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      {summary ? (
        <ul className="grid gap-2 text-sm sm:grid-cols-2 md:grid-cols-4">
          <li className="bg-muted/40 rounded-md border px-3 py-2">Policies: {summary.totalPolicies}</li>
          <li className="bg-muted/40 rounded-md border px-3 py-2">Claims: {summary.totalClaims}</li>
          <li className="bg-muted/40 rounded-md border px-3 py-2">
            Claim amount: {String(summary.totalClaimAmount)}
          </li>
          <li className="bg-muted/40 rounded-md border px-3 py-2">
            Approved: {String(summary.totalApprovedAmount)}
          </li>
        </ul>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Policy rows (scoped)</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SVKK ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Village</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.insuredParty.svkkPublicId}</TableCell>
                  <TableCell>{p.insuredParty.name}</TableCell>
                  <TableCell>{p.policyType.name}</TableCell>
                  <TableCell>{p.village ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="link" className="h-auto p-0" asChild>
                      <Link href={`/policies/${p.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {cursor ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void (async () => {
                  try {
                    const q = new URLSearchParams({ limit: "20" });
                    if (village.trim()) {
                      q.set("village", village.trim());
                    }
                    q.set("cursor", cursor);
                    const res = await svkkJson<{ items: MisPolicyRow[]; nextCursor?: string }>(
                      `/mis/policies?${q.toString()}`,
                    );
                    setRows((prev) => [...prev, ...res.items]);
                    setCursor(res.nextCursor);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Load more failed");
                  } finally {
                    setLoadingMore(false);
                  }
                })();
              }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
