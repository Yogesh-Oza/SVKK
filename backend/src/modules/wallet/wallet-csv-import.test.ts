import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { buildWalletSampleCsv } from "./wallet-csv-format.js";
import { importWalletUsageCsv } from "./wallet-csv-import.js";

const walletState = {
  id: "wallet-1",
  currentBalance: new Prisma.Decimal(1000),
  lastUpdatedAt: new Date("2026-01-01"),
};

const txMock = {
  wallet: {
    upsert: vi.fn(async () => walletState),
    findUniqueOrThrow: vi.fn(async () => ({ ...walletState })),
    update: vi.fn(async ({ data }: { data: { currentBalance: Prisma.Decimal } }) => {
      walletState.currentBalance = data.currentBalance;
      return walletState;
    }),
  },
  walletTransaction: {
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
  },
  $executeRaw: vi.fn(async () => 1),
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  },
}));

describe("wallet CSV import", () => {
  beforeEach(() => {
    walletState.currentBalance = new Prisma.Decimal(1000);
    vi.clearAllMocks();
  });

  it("imports sample CSV and deducts sequentially", async () => {
    const buf = Buffer.from(buildWalletSampleCsv(), "utf8");
    const result = await importWalletUsageCsv(buf, "user-1");
    // Sample totals: 250+100+75+50+120+500 = 1095
    expect(result.rowsDeducted).toBe(6);
    expect(result.skippedRows).toBe(0);
    expect(result.invalidCategoryRows).toBe(0);
    expect(result.totalDeducted).toBe("1095.00");
    expect(result.remainingBalance).toBe("-95.00");
    expect(txMock.walletTransaction.createMany).toHaveBeenCalled();
    const created = txMock.walletTransaction.createMany.mock.calls[0]![0].data as {
      balanceAfter: Prisma.Decimal;
      amount: Prisma.Decimal;
    }[];
    expect(created).toHaveLength(6);
    let bal = new Prisma.Decimal(1000);
    for (const row of created) {
      bal = bal.minus(row.amount);
      expect(row.balanceAfter.toString()).toBe(bal.toString());
    }
  });

  it("skips invalid category and non-positive amounts", async () => {
    const csv =
      "Date,Category,Particulars,Amount,Reference\n" +
      "2026-06-16,A,Ok,100,R1\n" +
      "2026-06-16,ZZZ,Bad cat,50,R2\n" +
      "2026-06-16,B,Zero,0,R3\n" +
      "2026-06-16,C,Neg,-5,R4\n";
    const result = await importWalletUsageCsv(Buffer.from(csv, "utf8"), undefined);
    expect(result.rowsDeducted).toBe(1);
    expect(result.invalidCategoryRows).toBe(1);
    expect(result.skippedRows).toBe(3);
    expect(result.totalDeducted).toBe("100.00");
    expect(result.remainingBalance).toBe("900.00");
  });

  it("rejects missing headers", async () => {
    await expect(
      importWalletUsageCsv(Buffer.from("Foo,Bar\n1,2\n", "utf8"), undefined),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
