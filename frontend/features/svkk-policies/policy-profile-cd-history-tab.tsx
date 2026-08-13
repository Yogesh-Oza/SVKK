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
import { Badge } from "@/components/ui/badge";
import { svkkJson } from "@/lib/svkk/api";
import { cn } from "@/lib/utils";
import {
  formatWalletDate,
  formatWalletInr,
  isWalletCreditType,
  isWalletDebitType,
  type WalletTxn,
  type WalletTxnPage,
} from "@/features/svkk-wallet/wallet-types";
import { useEffect, useState } from "react";

export function PolicyProfileCdHistoryTab({
  policyId,
  subtextClassName,
}: {
  policyId: string;
  subtextClassName?: string;
}) {
  const [rows, setRows] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          policyId,
          page: "1",
          pageSize: "100",
        });
        const res = await svkkJson<{ success?: boolean; data: WalletTxnPage }>(
          `/wallet/transactions?${params}`,
        );
        if (!cancelled) {
          setRows(res.data?.items ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load CD account history");
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
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className={cn("text-sm text-destructive", subtextClassName)}>{error}</p>;
  }

  if (!rows.length) {
    return (
      <p className={cn("text-sm", subtextClassName)}>No CD wallet transactions for this policy.</p>
    );
  }

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>CD Account</TableHead>
            <TableHead className="text-right">CD Amount</TableHead>
            <TableHead className="text-right">Debit</TableHead>
            <TableHead className="text-right">Credit</TableHead>
            <TableHead className="text-right">Balance After</TableHead>
            <TableHead>Remark</TableHead>
            <TableHead>User</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const debit = isWalletDebitType(t.type);
            const credit = isWalletCreditType(t.type) || (!debit && !String(t.type).toUpperCase().includes("DEBIT"));
            return (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">
                  {formatWalletDate(t.dateOfSubmission ?? t.date)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t.type}</Badge>
                </TableCell>
                <TableCell>{t.cdAccountUsed || "—"}</TableCell>
                <TableCell className="text-right">
                  {t.cdAmount != null ? formatWalletInr(t.cdAmount) : "—"}
                </TableCell>
                <TableCell className="text-right text-red-700">
                  {debit ? formatWalletInr(t.amount) : "—"}
                </TableCell>
                <TableCell className="text-right text-emerald-700">
                  {credit && !debit ? formatWalletInr(t.amount) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatWalletInr(t.balanceAfter)}
                </TableCell>
                <TableCell className="max-w-[200px] truncate" title={t.remark || t.particulars || ""}>
                  {t.remark || t.particulars || "—"}
                </TableCell>
                <TableCell>{t.createdByName || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
