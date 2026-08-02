import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { parseCsv } from "../policy/policy-csv-parse.js";
import {
  normalizeWalletCategory,
  parseWalletAmount,
  parseWalletCsvDate,
  resolveWalletCsvHeader,
  WALLET_CSV_MAX_ROWS,
  WALLET_USAGE_CSV_HEADERS,
  type WalletUsageCsvHeader,
} from "./wallet-csv-format.js";
import { decimalToString, ensureAndLockWallet } from "./wallet.service.js";

export type WalletCsvImportResult = {
  rowsDeducted: number;
  skippedRows: number;
  invalidCategoryRows: number;
  totalDeducted: string;
  remainingBalance: string;
};

type PreparedDebit = {
  txnDate: Date;
  category: string;
  particulars: string;
  reference: string | null;
  amount: Prisma.Decimal;
};

/**
 * Parse + validate CSV outside the DB transaction, then apply all accepted
 * DEBIT rows atomically with the wallet row locked.
 */
export async function importWalletUsageCsv(
  buffer: Buffer,
  userId: string | undefined,
): Promise<WalletCsvImportResult> {
  if (!buffer.length) {
    throw new AppError("FILE_REQUIRED", "CSV file is empty.", 400);
  }

  const text = buffer.toString("utf8");
  const rows = parseCsv(text);
  if (rows.length < 1) {
    throw new AppError("VALIDATION_ERROR", "CSV should contain a header row.", 400);
  }

  const headerRow = rows[0]!;
  const colIndex = new Map<WalletUsageCsvHeader, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const canonical = resolveWalletCsvHeader(headerRow[i] ?? "");
    if (canonical && !colIndex.has(canonical)) {
      colIndex.set(canonical, i);
    }
  }

  if (!colIndex.has("Amount")) {
    throw new AppError("VALIDATION_ERROR", "Amount column is required in CSV.", 400);
  }
  if (!colIndex.has("Category")) {
    throw new AppError("VALIDATION_ERROR", "Category column is required in CSV.", 400);
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "CSV should contain header and at least one data row.",
      400,
    );
  }
  if (dataRows.length > WALLET_CSV_MAX_ROWS) {
    throw new AppError(
      "TOO_MANY_ROWS",
      `CSV exceeds maximum of ${WALLET_CSV_MAX_ROWS} data rows.`,
      400,
    );
  }

  const prepared: PreparedDebit[] = [];
  let skippedRows = 0;
  let invalidCategoryRows = 0;
  const now = new Date();

  for (const row of dataRows) {
    const get = (h: WalletUsageCsvHeader) => {
      const idx = colIndex.get(h);
      return idx == null ? "" : (row[idx] ?? "");
    };

    const category = normalizeWalletCategory(get("Category"));
    if (!category) {
      invalidCategoryRows++;
      skippedRows++;
      continue;
    }

    const amount = parseWalletAmount(get("Amount"));
    if (!amount || amount.lte(0)) {
      skippedRows++;
      continue;
    }

    const dateParsed = parseWalletCsvDate(get("Date"));
    if (dateParsed === "invalid") {
      skippedRows++;
      continue;
    }

    prepared.push({
      txnDate: dateParsed ?? now,
      category,
      particulars: (get("Particulars").trim() || "CSV Wallet Usage").slice(0, 500),
      reference: (get("Reference").trim() || "").slice(0, 255) || null,
      amount,
    });
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    let balance = wallet.currentBalance;
    let totalDeducted = new Prisma.Decimal(0);
    const createData: Prisma.WalletTransactionCreateManyInput[] = [];

    for (const row of prepared) {
      balance = balance.minus(row.amount);
      totalDeducted = totalDeducted.plus(row.amount);
      createData.push({
        walletId: wallet.id,
        txnDate: row.txnDate,
        type: "DEBIT",
        category: row.category,
        particulars: row.particulars,
        reference: row.reference,
        amount: row.amount,
        balanceAfter: balance,
        source: "CSV",
        createdById: userId ?? null,
      });
    }

    if (createData.length) {
      await tx.walletTransaction.createMany({ data: createData });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { currentBalance: balance, lastUpdatedAt: now },
      });
    }

    return {
      rowsDeducted: createData.length,
      skippedRows,
      invalidCategoryRows,
      totalDeducted: decimalToString(totalDeducted),
      remainingBalance: decimalToString(balance),
    };
  });
}

/** Exported for tests — header validation only. */
export function assertWalletCsvHeaders(headers: string[]) {
  const resolved = headers.map(resolveWalletCsvHeader);
  if (!resolved.includes("Amount")) {
    throw new AppError("VALIDATION_ERROR", "Amount column is required in CSV.", 400);
  }
  if (!resolved.includes("Category")) {
    throw new AppError("VALIDATION_ERROR", "Category column is required in CSV.", 400);
  }
  return true;
}

export { WALLET_USAGE_CSV_HEADERS };
