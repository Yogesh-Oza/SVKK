"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { svkkJson } from "@/lib/svkk/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

type PolicyClaimRow = {
  id: string;
  claimNo: string;
  policyYear: string;
  status: string;
  statusText?: string | null;
  claimType?: string | null;
  claimAmount: string | null;
  approvedAmount: string | null;
  matchStatus?: string | null;
  policy?: { policyNo: string | null } | null;
};

type PageListRes = {
  items: PolicyClaimRow[];
  total: number;
};

function formatInrRupee(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
}

function matchLabel(status: string | null | undefined): string {
  if (status === "MATCHED_EXACT") return "Matched";
  if (status === "CONFLICT") return "Conflict";
  if (status === "UNLINKED") return "Unlinked";
  return status ?? "—";
}

export function PolicyProfileClaimsTab({
  policyId,
  svkkPublicId,
  subtextClassName,
}: {
  policyId: string;
  svkkPublicId?: string | null;
  subtextClassName?: string;
}) {
  const [rows, setRows] = useState<PolicyClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "100",
          sort: "createdAt",
          policyId,
        });
        const svkk = svkkPublicId?.trim();
        if (svkk) params.set("svkkPublicId", svkk);

        const res = await svkkJson<PageListRes>(`/claims?${params.toString()}`);
        if (!cancelled) setRows(res.items ?? []);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load claims");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [policyId, svkkPublicId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className={cn("text-sm text-destructive", subtextClassName)}>{error}</p>;
  }

  if (!rows.length) {
    return (
      <p className={cn("text-sm", subtextClassName)}>
        No claims linked to this policy yet.{" "}
        <Link href="/claims" className="text-[#2563EB] underline">
          View claims register
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className={cn("text-sm", subtextClassName)}>
        {rows.length} claim{rows.length === 1 ? "" : "s"} for this policy / SVKK ID.{" "}
        <Link
          href={
            svkk
              ? `/claims?search=${encodeURIComponent(svkk)}`
              : "/claims"
          }
          className="text-[#2563EB] underline"
        >
          Open full register
        </Link>
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Claim #</TableHead>
              <TableHead className="text-xs">Year</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Match</TableHead>
              <TableHead className="text-xs">Amount</TableHead>
              <TableHead className="text-xs">Approved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/claims?search=${encodeURIComponent(c.claimNo)}`} className="text-[#2563EB] hover:underline">
                    {c.claimNo}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{c.policyYear}</TableCell>
                <TableCell className="text-sm">{c.claimType ?? "—"}</TableCell>
                <TableCell className="text-sm">{c.statusText ?? c.status}</TableCell>
                <TableCell className="text-xs">{matchLabel(c.matchStatus)}</TableCell>
                <TableCell className="text-sm tabular-nums">{formatInrRupee(c.claimAmount)}</TableCell>
                <TableCell className="text-sm tabular-nums">{formatInrRupee(c.approvedAmount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
