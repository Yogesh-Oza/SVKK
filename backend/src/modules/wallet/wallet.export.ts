import { csvCell } from "../policy/policy-csv-utils.js";
import { getOrCreateWallet, getWalletSummary, decimalToString } from "./wallet.service.js";
import { prisma } from "../../lib/prisma.js";
import { formatWalletTxnType } from "./wallet-csv-format.js";
import { queryWalletTransactionsForExport, type WalletTxnListQuery } from "./wallet.list.js";

export function buildWalletTransactionsExportCsv(
  rows: {
    date: string;
    type: string;
    category: string;
    particulars: string;
    reference: string;
    amount: string;
    balanceAfter: string;
  }[],
): string {
  const header = ["Date", "Type", "Category", "Particulars", "Reference", "Amount", "Balance After"]
    .map(csvCell)
    .join(",");
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [r.date, r.type, r.category, r.particulars, r.reference, r.amount, r.balanceAfter]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function buildWalletMisExportCsv(): Promise<string> {
  const summary = await getWalletSummary();
  const header = ["Category", "No. of Entries", "Wallet Used"].map(csvCell).join(",");
  const lines = [header];
  for (const row of summary.mis) {
    lines.push([row.category, String(row.count), row.amount].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function buildWalletBackupJson() {
  const wallet = await getOrCreateWallet();
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
  });
  return {
    wallet_balance: decimalToString(wallet.currentBalance),
    wallet_last_updated: wallet.lastUpdatedAt?.toISOString() ?? null,
    wallet_transactions: transactions.map((t) => ({
      date: t.txnDate.toISOString(),
      type: formatWalletTxnType(t.type),
      category: t.category ?? "-",
      particulars: t.particulars ?? "-",
      reference: t.reference ?? "-",
      amount: decimalToString(t.amount),
      balanceAfter: decimalToString(t.balanceAfter),
      source: t.source,
    })),
  };
}

export async function exportWalletTransactionsCsv(query: WalletTxnListQuery) {
  const { rows, truncated } = await queryWalletTransactionsForExport(query);
  return { csv: buildWalletTransactionsExportCsv(rows), truncated };
}
