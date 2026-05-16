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
import { backendApi } from "@/lib/api/svkk-client";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { canAccessMis } from "@/lib/svkk/permissions";
import { PolicyMemberReportSection } from "@/features/svkk-mis/policy-member-report-section";
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

type VillageReport = {
  asOfDate: string;
  villages: {
    village: string | null;
    totalPolicies: number;
    totalMembers: number;
    sumExpectedPremium: number;
    totalPaid: number;
  }[];
  ageBuckets: { bucket: string; count: number }[];
};

export default function SvkkMisPage() {
  const { user } = useSvkkAuth();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [village, setVillage] = useState("");
  const [villageReport, setVillageReport] = useState<VillageReport | null>(null);
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
    q.set("asOfDate", asOf);
    const s = await svkkJson<Summary>(`/mis/summary?${q.toString()}`);
    setSummary(s);
  }, [village, asOf]);

  const runVillageReport = useCallback(async () => {
    const q = new URLSearchParams();
    q.set("asOfDate", asOf);
    if (village.trim()) {
      q.set("village", village.trim());
    }
    const r = await svkkJson<VillageReport>(`/mis/village-report?${q.toString()}`);
    setVillageReport(r);
  }, [asOf, village]);

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

  if (user && !canAccessMis(user.permissions)) {
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
              await runVillageReport();
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
          <p className="text-muted-foreground mb-1 text-xs">As-of date</p>
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div>
          <p className="text-muted-foreground mb-1 text-xs">Village (optional)</p>
          <Input value={village} onChange={(e) => setVillage(e.target.value)} className="max-w-xs" />
        </div>
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? "Loading…" : "Load summary & table"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void (async () => {
              try {
                const q = new URLSearchParams();
                q.set("asOfDate", asOf);
                if (village.trim()) {
                  q.set("village", village.trim());
                }
                const res = await backendApi.get(`/mis/export/villages.csv?${q.toString()}`, {
                  responseType: "blob",
                });
                const blob = new Blob([res.data], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "mis-villages.csv";
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Export failed");
              }
            })();
          }}
        >
          Export villages CSV
        </Button>
      </form>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}

      <PolicyMemberReportSection
        asOf={asOf}
        village={village}
        onError={(m) => setErr(m || null)}
      />

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

      {villageReport ? (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Village report (as-of {villageReport.asOfDate})</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Village</TableHead>
                <TableHead>Policies</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Expected ₹</TableHead>
                <TableHead>Paid ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {villageReport.villages.map((v, i) => (
                <TableRow key={`${v.village ?? "null"}-${i}`}>
                  <TableCell>{v.village ?? "—"}</TableCell>
                  <TableCell>{v.totalPolicies}</TableCell>
                  <TableCell>{v.totalMembers}</TableCell>
                  <TableCell>{v.sumExpectedPremium.toFixed(2)}</TableCell>
                  <TableCell>{v.totalPaid.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {villageReport.ageBuckets.length ? (
            <div className="text-muted-foreground text-sm">
              Age bands:{" "}
              {villageReport.ageBuckets.map((b) => `${b.bucket}: ${b.count}`).join(" · ")}
            </div>
          ) : null}
        </div>
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
