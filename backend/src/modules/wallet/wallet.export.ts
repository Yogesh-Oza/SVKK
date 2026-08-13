import { Prisma } from "@prisma/client";
import { csvCell } from "../policy/policy-csv-utils.js";
import { getOrCreateWallet, getWalletSummary, decimalToString } from "./wallet.service.js";
import {
  formatWalletTxnType,
  isWalletCreditLedgerType,
  WALLET_TXN_EXPORT_HEADERS,
} from "./wallet-csv-format.js";
import { prisma } from "../../lib/prisma.js";
import { queryWalletTransactionsForExport, type WalletTxnListQuery, type WalletTxnExportRow } from "./wallet.list.js";

export const WALLET_MIS_DIMENSIONS = ["category", "village", "group", "policyType"] as const;
export type WalletMisDimension = (typeof WALLET_MIS_DIMENSIONS)[number];

export function buildWalletTransactionsExportCsv(rows: WalletTxnExportRow[]): string {
  const header = WALLET_TXN_EXPORT_HEADERS.map(csvCell).join(",");
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.dateOfSubmission,
        r.month,
        r.year,
        r.type,
        r.holderName,
        r.village,
        r.category,
        r.group,
        r.policyType,
        r.cdAccountUsed,
        r.cdAmount,
        r.remark,
        r.amount,
        r.balanceAfter,
        r.policyId,
        r.policyNumber,
        r.createdBy,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function walletMisExportFilename(dimension: WalletMisDimension): string {
  if (dimension === "village") return "wallet_village_mis.csv";
  if (dimension === "group") return "wallet_group_mis.csv";
  if (dimension === "policyType") return "wallet_policy_type_mis.csv";
  return "wallet_category_mis.csv";
}

function misColumnLabel(dimension: WalletMisDimension): string {
  if (dimension === "village") return "Village";
  if (dimension === "group") return "Group";
  if (dimension === "policyType") return "Policy Type";
  return "Category";
}

export async function buildWalletMisExportCsv(
  dimension: WalletMisDimension = "category",
): Promise<string> {
  const summary = await getWalletSummary();
  const label = misColumnLabel(dimension);
  const header = [label, "No. of Entries", "Wallet Used"].map(csvCell).join(",");
  const lines = [header];

  const rows =
    dimension === "village"
      ? summary.misVillage
      : dimension === "group"
        ? summary.misGroup
        : dimension === "policyType"
          ? summary.misPolicyType
          : summary.mis.map((row) => ({
              key: row.category,
              count: row.count,
              amount: row.amount,
            }));

  for (const row of rows) {
    lines.push([row.key, String(row.count), row.amount].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function isoDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export async function buildWalletBackupJson() {
  const wallet = await getOrCreateWallet();
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });

  let running = new Prisma.Decimal(0);
  const withDirection = transactions.map((t) => {
    let direction: "CREDIT" | "DEBIT";
    if (t.type === "ADJUSTMENT") {
      const asCredit = running.plus(t.amount);
      direction = t.balanceAfter.equals(asCredit) ? "CREDIT" : "DEBIT";
    } else {
      direction = isWalletCreditLedgerType(t.type) ? "CREDIT" : "DEBIT";
    }
    running = t.balanceAfter;
    return { t, direction };
  });

  const newestFirst = withDirection.slice().reverse();

  return {
    wallet_balance: decimalToString(wallet.currentBalance),
    wallet_last_updated: wallet.lastUpdatedAt?.toISOString() ?? null,
    wallet_transactions: newestFirst.map(({ t, direction }) => ({
      id: t.id,
      date: t.txnDate.toISOString(),
      type: formatWalletTxnType(t.type),
      direction,
      category: t.category ?? "-",
      particulars: t.particulars ?? "-",
      reference: t.reference ?? "-",
      amount: decimalToString(t.amount),
      balanceAfter: decimalToString(t.balanceAfter),
      source: t.source,
      policyId: t.policyId ?? null,
      policyNumber: t.policyNumber ?? null,
      dateOfSubmission: isoDateOnly(t.dateOfSubmission) ?? t.txnDate.toISOString(),
      month: t.monthText ?? null,
      year: t.yearText ?? null,
      holderName: t.holderName ?? null,
      village: t.village ?? null,
      group: t.groupName ?? null,
      policyType: t.policyTypeName ?? null,
      cdAccountUsed: t.cdAccountUsed ?? null,
      cdAmount: t.cdAmount != null ? decimalToString(t.cdAmount) : null,
      remark: t.remark ?? t.particulars ?? null,
      createdById: t.createdById ?? null,
      createdByName: t.createdBy?.name ?? null,
    })),
  };
}

export async function exportWalletTransactionsCsv(query: WalletTxnListQuery) {
  const { rows, truncated } = await queryWalletTransactionsForExport(query);
  return { csv: buildWalletTransactionsExportCsv(rows), truncated };
}
