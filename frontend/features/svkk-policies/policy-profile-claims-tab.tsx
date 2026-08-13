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

const LINKED_CLAIMS_PAGE_SIZE = 500;

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
  policyTypeText?: string | null;
  policy?: {
    policyNo: string | null;
    policyType?: { id: string; key: string; name: string } | null;
  } | null;
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

function policyTypeLabel(c: PolicyClaimRow): string {
  return c.policy?.policyType?.name || c.policyTypeText || "—";
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const svkkSearch = svkkPublicId?.trim() ?? "";
  const claimsRegisterHref = svkkSearch
    ? `/claims?search=${encodeURIComponent(svkkSearch)}`
    : "/claims";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: String(LINKED_CLAIMS_PAGE_SIZE),
          sort: "createdAt",
          policyId,
        });

        const res = await svkkJson<PageListRes>(`/claims?${params.toString()}`);
        if (!cancelled) {
          setRows(res.items ?? []);
          setTotal(res.total ?? res.items?.length ?? 0);
        }
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError(e instanceof Error ? e.message : "Failed to load claims");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [policyId]);

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
        <Link href={claimsRegisterHref} className="text-[#2563EB] underline">
          View claims register
        </Link>
      </p>
    );
  }

  const shown = rows.length;
  const extra = total > shown ? ` (showing ${shown})` : "";

  return (
    <div className="space-y-3">
      <p className={cn("text-sm", subtextClassName)}>
        {total} claim{total === 1 ? "" : "s"} for this policy{extra}.{" "}
        <Link href={claimsRegisterHref} className="text-[#2563EB] underline">
          Open full register
        </Link>
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Claim #</TableHead>
              <TableHead className="text-xs">Year</TableHead>
              <TableHead className="text-xs">Policy type</TableHead>
              <TableHead className="text-xs">Lodge type</TableHead>
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
                <TableCell className="text-sm">{policyTypeLabel(c)}</TableCell>
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
