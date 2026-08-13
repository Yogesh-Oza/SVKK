import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { parseCsv } from "../policy/policy-csv-parse.js";
import {
  normalizeWalletCategory,
  normalizeWalletMonth,
  parseWalletAmount,
  parseWalletCsvDate,
  parseWalletCsvType,
  resolveWalletCsvHeader,
  WALLET_CSV_MAX_ROWS,
  WALLET_USAGE_CSV_HEADERS,
  type WalletCsvCanonicalField,
} from "./wallet-csv-format.js";
import { decimalToString, ensureAndLockWallet, monthYearFromDate } from "./wallet.service.js";

export type WalletCsvImportResult = {
  rowsDeducted: number;
  rowsCredited: number;
  skippedRows: number;
  invalidCategoryRows: number;
  totalDeducted: string;
  totalDeposited: string;
  remainingBalance: string;
};

type PreparedRow = {
  txnDate: Date;
  type: "DEBIT" | "CREDIT";
  category: string;
  particulars: string;
  reference: string | null;
  amount: Prisma.Decimal;
  dateOfSubmission: Date | null;
  monthText: string | null;
  yearText: string | null;
  holderName: string | null;
  village: string | null;
  groupName: string | null;
  policyTypeName: string | null;
  cdAccountUsed: string | null;
  cdAmount: Prisma.Decimal | null;
  remark: string | null;
};

function sliceOrNull(raw: string, max: number): string | null {
  const t = raw.trim();
  if (!t || t === "-") return null;
  return t.slice(0, max);
}

/**
 * Parse + validate CSV outside the DB transaction, then apply all accepted
 * DEBIT/CREDIT rows atomically with the wallet row locked.
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
  const colIndex = new Map<WalletCsvCanonicalField, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const canonical = resolveWalletCsvHeader(headerRow[i] ?? "");
    if (canonical && !colIndex.has(canonical)) {
      colIndex.set(canonical, i);
    }
  }

  if (!colIndex.has("Deposited/Deducted Amount")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Deposited/Deducted Amount (or Amount) column is required in CSV.",
      400,
    );
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

  const prepared: PreparedRow[] = [];
  let skippedRows = 0;
  let invalidCategoryRows = 0;
  const now = new Date();

  for (const row of dataRows) {
    const get = (h: WalletCsvCanonicalField) => {
      const idx = colIndex.get(h);
      return idx == null ? "" : (row[idx] ?? "");
    };

    const category = normalizeWalletCategory(get("Category"));
    if (!category) {
      invalidCategoryRows++;
      skippedRows++;
      continue;
    }

    const amount = parseWalletAmount(get("Deposited/Deducted Amount"));
    if (!amount || amount.lte(0)) {
      skippedRows++;
      continue;
    }

    const dateParsed = parseWalletCsvDate(get("Date of Submission"));
    if (dateParsed === "invalid") {
      skippedRows++;
      continue;
    }

    const dateOfSubmission = dateParsed;
    const derived = monthYearFromDate(dateOfSubmission);
    const monthText = normalizeWalletMonth(get("Month")) || derived.monthText;
    const yearText = sliceOrNull(get("Year"), 8) ?? derived.yearText;
    const remark =
      sliceOrNull(get("Remark"), 500) ?? "CSV Wallet Usage";
    const type = parseWalletCsvType(get("Type"));
    const cdAmount = parseWalletAmount(get("CD Amount"));

    prepared.push({
      txnDate: dateOfSubmission ?? now,
      type,
      category,
      particulars: remark,
      reference: sliceOrNull(get("Reference"), 255),
      amount,
      dateOfSubmission,
      monthText: monthText ? monthText.slice(0, 20) : null,
      yearText,
      holderName: sliceOrNull(get("Holder's Name"), 200),
      village: sliceOrNull(get("Village"), 200),
      groupName: sliceOrNull(get("Group"), 64),
      policyTypeName: sliceOrNull(get("Policy Type"), 120),
      cdAccountUsed: sliceOrNull(get("CD Account Used"), 16),
      cdAmount: cdAmount && cdAmount.gt(0) ? cdAmount : null,
      remark,
    });
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    let balance = wallet.currentBalance;
    let totalDeducted = new Prisma.Decimal(0);
    let totalDeposited = new Prisma.Decimal(0);
    let rowsDeducted = 0;
    let rowsCredited = 0;
    const createData: Prisma.WalletTransactionCreateManyInput[] = [];

    for (const row of prepared) {
      if (row.type === "CREDIT") {
        balance = balance.plus(row.amount);
        totalDeposited = totalDeposited.plus(row.amount);
        rowsCredited++;
      } else {
        balance = balance.minus(row.amount);
        totalDeducted = totalDeducted.plus(row.amount);
        rowsDeducted++;
      }
      createData.push({
        walletId: wallet.id,
        txnDate: row.txnDate,
        type: row.type,
        category: row.category,
        particulars: row.particulars,
        reference: row.reference,
        amount: row.amount,
        balanceAfter: balance,
        source: "CSV",
        createdById: userId ?? null,
        dateOfSubmission: row.dateOfSubmission,
        monthText: row.monthText,
        yearText: row.yearText,
        holderName: row.holderName,
        village: row.village,
        groupName: row.groupName,
        policyTypeName: row.policyTypeName,
        cdAccountUsed: row.cdAccountUsed,
        cdAmount: row.cdAmount,
        remark: row.remark,
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
      rowsDeducted,
      rowsCredited,
      skippedRows,
      invalidCategoryRows,
      totalDeducted: decimalToString(totalDeducted),
      totalDeposited: decimalToString(totalDeposited),
      remainingBalance: decimalToString(balance),
    };
  });
}

/** Exported for tests — header validation only. */
export function assertWalletCsvHeaders(headers: string[]) {
  const resolved = headers.map(resolveWalletCsvHeader);
  if (!resolved.includes("Deposited/Deducted Amount")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Deposited/Deducted Amount (or Amount) column is required in CSV.",
      400,
    );
  }
  if (!resolved.includes("Category")) {
    throw new AppError("VALIDATION_ERROR", "Category column is required in CSV.", 400);
  }
  return true;
}

export { WALLET_USAGE_CSV_HEADERS };
